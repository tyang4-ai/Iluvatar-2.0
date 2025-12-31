/**
 * ILUVATAR - Bot Entry Point
 *
 * Starts the Discord bot with all dependencies wired up.
 */

// Load environment variables from .env file
require('dotenv').config();

const { IluvatarBot } = require('./discord-bot');
const { StateManager } = require('../core/state-manager');
const { NovelManager } = require('../core/novel-manager');

async function main() {
  console.log('[ILUVATAR] Starting novel writer bot...');

  // Initialize state manager (connects to Redis)
  const stateManager = new StateManager();
  console.log('[ILUVATAR] State manager initialized');

  // Initialize novel manager
  const novelManager = new NovelManager(stateManager, {
    passThreshold: parseInt(process.env.PASS_THRESHOLD) || 70,
    maxRevisions: parseInt(process.env.MAX_REVISIONS) || 3
  });
  console.log('[ILUVATAR] Novel manager initialized');

  // Initialize and start Discord bot
  const bot = new IluvatarBot({
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
    n8nWebhookUrl: process.env.N8N_WEBHOOK_URL,
    novelManager
  });

  await bot.start();
  console.log('[ILUVATAR] Bot is running!');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('[ILUVATAR] Shutting down...');
    await bot.stop();
    await stateManager.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('[ILUVATAR] Shutting down...');
    await bot.stop();
    await stateManager.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[ILUVATAR] Fatal error:', err);
  process.exit(1);
});
