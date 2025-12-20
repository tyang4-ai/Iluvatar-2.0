/**
 * ILUVATAR 2.0 - Redis Message Bus
 *
 * Managed by Merry agent. Handles agent-to-agent communication via Redis Pub/Sub.
 * Provides reliable message delivery, routing, and persistent inbox queues.
 */

const Redis = require('ioredis');
const crypto = require('crypto');

class MessageBus {
  constructor(redisClient) {
    this.redis = redisClient || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });

    // Separate subscriber connection (Redis Pub/Sub requirement)
    this.subscriber = this.redis.duplicate();
    this.subscriptions = new Map();
  }

  /**
   * Publish message to a specific agent
   *
   * @param {Object} message - Message object
   * @param {string} message.from - Sending agent ID
   * @param {string} message.to - Receiving agent ID
   * @param {string} message.type - Message type (review_request, checkpoint_required, etc.)
   * @param {Object} message.payload - Message data
   * @param {string} message.priority - Priority (low, normal, high, critical)
   * @returns {Promise<string>} Message ID
   */
  async publish(message) {
    const enriched = {
      ...message,
      timestamp: new Date().toISOString(),
      id: crypto.randomUUID(),
      priority: message.priority || 'normal'
    };

    const channel = `agent:${message.to}`;
    const serialized = JSON.stringify(enriched);

    // Publish to Redis Pub/Sub (real-time delivery)
    await this.redis.publish(channel, serialized);

    // Store in recipient's persistent inbox (in case agent offline)
    await this.redis.lpush(`inbox:${message.to}`, serialized);

    // Log for debugging/audit trail
    await this.redis.zadd('messages:log', Date.now(), serialized);

    // Track metrics
    await this.redis.hincrby('messages:stats', `sent:${message.from}`, 1);
    await this.redis.hincrby('messages:stats', `received:${message.to}`, 1);

    return enriched.id;
  }

  /**
   * Broadcast message to all agents
   *
   * @param {Object} message - Message object (same structure as publish)
   * @returns {Promise<string>} Message ID
   */
  async broadcast(message) {
    const enriched = {
      ...message,
      to: '*',
      timestamp: new Date().toISOString(),
      id: crypto.randomUUID()
    };

    const channel = 'agent:broadcast';
    const serialized = JSON.stringify(enriched);

    await this.redis.publish(channel, serialized);
    await this.redis.zadd('messages:log', Date.now(), serialized);

    return enriched.id;
  }

  /**
   * Subscribe to messages for a specific agent
   *
   * @param {string} agentId - Agent ID to subscribe for
   * @param {Function} handler - Message handler function (async)
   */
  async subscribe(agentId, handler) {
    const channel = `agent:${agentId}`;
    const broadcastChannel = 'agent:broadcast';

    // Subscribe to agent-specific channel
    await this.subscriber.subscribe(channel);

    // Also subscribe to broadcast channel
    await this.subscriber.subscribe(broadcastChannel);

    // Store handler
    this.subscriptions.set(agentId, handler);

    // Handle incoming messages
    this.subscriber.on('message', async (chan, msg) => {
      if (chan === channel || chan === broadcastChannel) {
        try {
          const message = JSON.parse(msg);

          // Call handler
          await handler(message);

          // Mark as processed
          await this.redis.lrem(`inbox:${agentId}`, 1, msg);
          await this.redis.zadd('messages:processed', Date.now(), msg);
          await this.redis.hincrby('messages:stats', `processed:${agentId}`, 1);

        } catch (err) {
          console.error(`[MessageBus] Handler error for ${agentId}:`, err);

          // Move to failed queue for retry
          await this.redis.lpush(`inbox:${agentId}:failed`, msg);
          await this.redis.hincrby('messages:stats', `failed:${agentId}`, 1);
        }
      }
    });

    // Process backlog (messages received while agent was offline)
    await this._processBacklog(agentId, handler);
  }

  /**
   * Process messages in persistent inbox (backlog recovery)
   * @private
   */
  async _processBacklog(agentId, handler) {
    const backlog = await this.redis.lrange(`inbox:${agentId}`, 0, -1);

    for (const msg of backlog) {
      try {
        const message = JSON.parse(msg);
        await handler(message);

        // Remove from inbox
        await this.redis.lrem(`inbox:${agentId}`, 1, msg);
        await this.redis.zadd('messages:processed', Date.now(), msg);

      } catch (err) {
        console.error(`[MessageBus] Backlog processing error:`, err);
        await this.redis.lpush(`inbox:${agentId}:failed`, msg);
      }
    }
  }

  /**
   * Unsubscribe agent from messages
   */
  async unsubscribe(agentId) {
    const channel = `agent:${agentId}`;
    await this.subscriber.unsubscribe(channel);
    this.subscriptions.delete(agentId);
  }

  /**
   * Get message statistics
   */
  async getStats() {
    const stats = await this.redis.hgetall('messages:stats');
    const totalMessages = await this.redis.zcard('messages:log');
    const processedMessages = await this.redis.zcard('messages:processed');

    return {
      total_messages: totalMessages,
      processed_messages: processedMessages,
      success_rate: totalMessages > 0 ? (processedMessages / totalMessages * 100).toFixed(2) + '%' : '0%',
      by_agent: stats
    };
  }

  /**
   * Get recent messages (for debugging)
   */
  async getRecentMessages(limit = 50) {
    const messages = await this.redis.zrevrange('messages:log', 0, limit - 1);
    return messages.map(msg => JSON.parse(msg));
  }

  /**
   * Get failed messages for an agent
   */
  async getFailedMessages(agentId) {
    const failed = await this.redis.lrange(`inbox:${agentId}:failed`, 0, -1);
    return failed.map(msg => JSON.parse(msg));
  }

  /**
   * Retry failed messages
   */
  async retryFailedMessages(agentId) {
    const failed = await this.redis.lrange(`inbox:${agentId}:failed`, 0, -1);
    const handler = this.subscriptions.get(agentId);

    if (!handler) {
      throw new Error(`No handler registered for agent ${agentId}`);
    }

    let retried = 0;
    for (const msg of failed) {
      try {
        const message = JSON.parse(msg);
        await handler(message);

        // Remove from failed queue
        await this.redis.lrem(`inbox:${agentId}:failed`, 1, msg);
        await this.redis.zadd('messages:processed', Date.now(), msg);
        retried++;

      } catch (err) {
        console.error(`[MessageBus] Retry failed:`, err);
        // Keep in failed queue
      }
    }

    return { retried, remaining: failed.length - retried };
  }

  /**
   * Clear old messages (cleanup)
   */
  async cleanup(olderThanDays = 7) {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

    const removedLog = await this.redis.zremrangebyscore('messages:log', '-inf', cutoff);
    const removedProcessed = await this.redis.zremrangebyscore('messages:processed', '-inf', cutoff);

    return {
      removed_from_log: removedLog,
      removed_from_processed: removedProcessed
    };
  }

  /**
   * Close connections
   */
  async close() {
    await this.redis.quit();
    await this.subscriber.quit();
  }
}

module.exports = { MessageBus };
