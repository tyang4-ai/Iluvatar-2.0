/**
 * ILUVATAR 3.0 - Prometheus Metrics Exporter
 *
 * Exposes metrics for monitoring hackathon automation system.
 * Provides counters, gauges, and histograms for:
 * - Hackathon lifecycle
 * - Agent performance
 * - Clone activity
 * - Resource utilization
 * - Cost tracking
 */

const express = require('express');
const EventEmitter = require('events');

/**
 * Simple Prometheus metrics implementation
 * (Lightweight alternative to prom-client)
 */

// Metric types
const METRIC_TYPES = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram'
};

/**
 * Counter metric - monotonically increasing value
 */
class Counter {
  constructor(name, help, labelNames = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.values = new Map();
  }

  inc(labels = {}, value = 1) {
    const key = this._labelKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + value);
  }

  _labelKey(labels) {
    if (this.labelNames.length === 0) return '';
    return this.labelNames.map(n => `${n}="${labels[n] || ''}"`).join(',');
  }

  collect() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];

    if (this.values.size === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const [labels, value] of this.values) {
        if (labels) {
          lines.push(`${this.name}{${labels}} ${value}`);
        } else {
          lines.push(`${this.name} ${value}`);
        }
      }
    }

    return lines.join('\n');
  }
}

/**
 * Gauge metric - value that can go up and down
 */
class Gauge {
  constructor(name, help, labelNames = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.values = new Map();
  }

  set(labels = {}, value) {
    const key = this._labelKey(labels);
    this.values.set(key, value);
  }

  inc(labels = {}, value = 1) {
    const key = this._labelKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + value);
  }

  dec(labels = {}, value = 1) {
    const key = this._labelKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current - value);
  }

  _labelKey(labels) {
    if (this.labelNames.length === 0) return '';
    return this.labelNames.map(n => `${n}="${labels[n] || ''}"`).join(',');
  }

  collect() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];

    if (this.values.size === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const [labels, value] of this.values) {
        if (labels) {
          lines.push(`${this.name}{${labels}} ${value}`);
        } else {
          lines.push(`${this.name} ${value}`);
        }
      }
    }

    return lines.join('\n');
  }
}

/**
 * Histogram metric - distribution of values
 */
class Histogram {
  constructor(name, help, labelNames = [], buckets = [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300]) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.buckets = buckets.sort((a, b) => a - b);
    this.observations = new Map(); // key -> { count, sum, buckets: Map }
  }

  observe(labels = {}, value) {
    const key = this._labelKey(labels);

    if (!this.observations.has(key)) {
      const bucketMap = new Map();
      for (const b of this.buckets) {
        bucketMap.set(b, 0);
      }
      this.observations.set(key, { count: 0, sum: 0, buckets: bucketMap });
    }

    const obs = this.observations.get(key);
    obs.count++;
    obs.sum += value;

    for (const b of this.buckets) {
      if (value <= b) {
        obs.buckets.set(b, obs.buckets.get(b) + 1);
      }
    }
  }

  _labelKey(labels) {
    if (this.labelNames.length === 0) return '';
    return this.labelNames.map(n => `${n}="${labels[n] || ''}"`).join(',');
  }

  collect() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];

    for (const [labels, obs] of this.observations) {
      const labelPrefix = labels ? `{${labels},` : '{';
      const labelSuffix = labels ? '}' : '';

      // Bucket lines
      let cumulativeCount = 0;
      for (const b of this.buckets) {
        cumulativeCount += obs.buckets.get(b);
        if (labels) {
          lines.push(`${this.name}_bucket{${labels},le="${b}"} ${cumulativeCount}`);
        } else {
          lines.push(`${this.name}_bucket{le="${b}"} ${cumulativeCount}`);
        }
      }

      // +Inf bucket
      if (labels) {
        lines.push(`${this.name}_bucket{${labels},le="+Inf"} ${obs.count}`);
        lines.push(`${this.name}_sum{${labels}} ${obs.sum}`);
        lines.push(`${this.name}_count{${labels}} ${obs.count}`);
      } else {
        lines.push(`${this.name}_bucket{le="+Inf"} ${obs.count}`);
        lines.push(`${this.name}_sum ${obs.sum}`);
        lines.push(`${this.name}_count ${obs.count}`);
      }
    }

    if (this.observations.size === 0) {
      // Empty histogram
      for (const b of this.buckets) {
        lines.push(`${this.name}_bucket{le="${b}"} 0`);
      }
      lines.push(`${this.name}_bucket{le="+Inf"} 0`);
      lines.push(`${this.name}_sum 0`);
      lines.push(`${this.name}_count 0`);
    }

    return lines.join('\n');
  }
}

/**
 * Metrics Exporter - exposes /metrics endpoint for Prometheus
 */
class MetricsExporter extends EventEmitter {
  constructor(options = {}) {
    super();

    this.port = options.port || 9090;
    this.path = options.path || '/metrics';
    this.app = express();
    this.server = null;

    // Initialize all metrics
    this._initializeMetrics();

    // Setup routes
    this._setupRoutes();
  }

  /**
   * Initialize all ILUVATAR metrics
   */
  _initializeMetrics() {
    // =====================
    // Counters
    // =====================

    // Hackathon lifecycle
    this.hackathonsStarted = new Counter(
      'iluvatar_hackathons_started_total',
      'Total number of hackathons started'
    );

    this.hackathonsCompleted = new Counter(
      'iluvatar_hackathons_completed_total',
      'Total number of hackathons completed successfully'
    );

    this.hackathonsFailed = new Counter(
      'iluvatar_hackathons_failed_total',
      'Total number of hackathons that failed'
    );

    // Agent calls
    this.agentCalls = new Counter(
      'iluvatar_agent_calls_total',
      'Total number of agent API calls',
      ['agent', 'model', 'status']
    );

    // Files generated
    this.filesGenerated = new Counter(
      'iluvatar_files_generated_total',
      'Total number of files generated',
      ['type'] // backend, frontend
    );

    // Circuit breaker trips
    this.circuitBreakerTrips = new Counter(
      'iluvatar_circuit_breaker_trips_total',
      'Total number of circuit breaker trips',
      ['agent']
    );

    // Events processed
    this.eventsProcessed = new Counter(
      'iluvatar_events_processed_total',
      'Total number of events processed',
      ['event_type']
    );

    // Checkpoints
    this.checkpointsCreated = new Counter(
      'iluvatar_checkpoints_created_total',
      'Total number of checkpoints created'
    );

    // =====================
    // Gauges
    // =====================

    // Active hackathons
    this.activeHackathons = new Gauge(
      'iluvatar_active_hackathons',
      'Number of currently active hackathons'
    );

    // Active clones
    this.activeClones = new Gauge(
      'iluvatar_active_clones',
      'Number of currently active clones',
      ['type'] // backend, frontend
    );

    // Queue depth
    this.queueDepth = new Gauge(
      'iluvatar_queue_depth',
      'Current depth of work queues',
      ['queue'] // backend, frontend
    );

    // Context usage
    this.contextUsagePercent = new Gauge(
      'iluvatar_context_usage_percent',
      'Context window usage percentage per agent',
      ['agent']
    );

    // Budget remaining
    this.budgetRemaining = new Gauge(
      'iluvatar_budget_remaining_dollars',
      'Remaining budget in dollars',
      ['hackathon_id']
    );

    // Budget spent
    this.budgetSpent = new Gauge(
      'iluvatar_budget_spent_dollars',
      'Total budget spent in dollars',
      ['hackathon_id']
    );

    // System info
    this.systemInfo = new Gauge(
      'iluvatar_info',
      'ILUVATAR system information',
      ['version', 'node_version']
    );
    this.systemInfo.set({ version: '3.0.0', node_version: process.version }, 1);

    // =====================
    // Histograms
    // =====================

    // Agent response time
    this.agentResponseTime = new Histogram(
      'iluvatar_agent_response_seconds',
      'Agent response time in seconds',
      ['agent'],
      [0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300] // 0.5s to 5min
    );

    // File generation time
    this.fileGenerationTime = new Histogram(
      'iluvatar_file_generation_seconds',
      'Time to generate a file in seconds',
      [],
      [1, 5, 10, 30, 60, 120, 300, 600] // 1s to 10min
    );

    // Hackathon duration
    this.hackathonDuration = new Histogram(
      'iluvatar_hackathon_duration_seconds',
      'Total hackathon duration in seconds',
      [],
      [3600, 7200, 14400, 28800, 43200, 86400] // 1h to 24h
    );

    // Token usage per request
    this.tokenUsage = new Histogram(
      'iluvatar_tokens_per_request',
      'Tokens used per agent request',
      ['agent', 'type'], // type: input, output
      [100, 500, 1000, 2000, 5000, 10000, 20000, 50000]
    );
  }

  /**
   * Setup Express routes
   */
  _setupRoutes() {
    // Metrics endpoint
    this.app.get(this.path, (req, res) => {
      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(this.collect());
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Ready check
    this.app.get('/ready', (req, res) => {
      res.json({ ready: true });
    });
  }

  /**
   * Collect all metrics
   */
  collect() {
    const metrics = [
      // Counters
      this.hackathonsStarted.collect(),
      this.hackathonsCompleted.collect(),
      this.hackathonsFailed.collect(),
      this.agentCalls.collect(),
      this.filesGenerated.collect(),
      this.circuitBreakerTrips.collect(),
      this.eventsProcessed.collect(),
      this.checkpointsCreated.collect(),

      // Gauges
      this.activeHackathons.collect(),
      this.activeClones.collect(),
      this.queueDepth.collect(),
      this.contextUsagePercent.collect(),
      this.budgetRemaining.collect(),
      this.budgetSpent.collect(),
      this.systemInfo.collect(),

      // Histograms
      this.agentResponseTime.collect(),
      this.fileGenerationTime.collect(),
      this.hackathonDuration.collect(),
      this.tokenUsage.collect()
    ];

    return metrics.join('\n\n');
  }

  /**
   * Start the metrics server
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`Metrics exporter listening on port ${this.port}`);
        this.emit('started', { port: this.port, path: this.path });
        resolve();
      });

      this.server.on('error', (err) => {
        console.error('Metrics server error:', err.message);
        reject(err);
      });
    });
  }

  /**
   * Stop the metrics server
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Metrics exporter stopped');
          this.emit('stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // =====================
  // Convenience Methods
  // =====================

  /**
   * Record hackathon started
   */
  recordHackathonStarted(hackathonId) {
    this.hackathonsStarted.inc();
    this.activeHackathons.inc();
    this.emit('hackathon_started', { hackathon_id: hackathonId });
  }

  /**
   * Record hackathon completed
   */
  recordHackathonCompleted(hackathonId, durationSeconds) {
    this.hackathonsCompleted.inc();
    this.activeHackathons.dec();
    this.hackathonDuration.observe({}, durationSeconds);
    this.emit('hackathon_completed', { hackathon_id: hackathonId, duration: durationSeconds });
  }

  /**
   * Record hackathon failed
   */
  recordHackathonFailed(hackathonId) {
    this.hackathonsFailed.inc();
    this.activeHackathons.dec();
    this.emit('hackathon_failed', { hackathon_id: hackathonId });
  }

  /**
   * Record agent call
   */
  recordAgentCall(agent, model, status, responseTimeSeconds, inputTokens, outputTokens) {
    this.agentCalls.inc({ agent, model, status });
    this.agentResponseTime.observe({ agent }, responseTimeSeconds);

    if (inputTokens) {
      this.tokenUsage.observe({ agent, type: 'input' }, inputTokens);
    }
    if (outputTokens) {
      this.tokenUsage.observe({ agent, type: 'output' }, outputTokens);
    }
  }

  /**
   * Record file generated
   */
  recordFileGenerated(type, generationTimeSeconds) {
    this.filesGenerated.inc({ type });
    this.fileGenerationTime.observe({}, generationTimeSeconds);
  }

  /**
   * Record circuit breaker trip
   */
  recordCircuitBreakerTrip(agent) {
    this.circuitBreakerTrips.inc({ agent });
  }

  /**
   * Record event processed
   */
  recordEventProcessed(eventType) {
    this.eventsProcessed.inc({ event_type: eventType });
  }

  /**
   * Update queue depth
   */
  updateQueueDepth(queue, depth) {
    this.queueDepth.set({ queue }, depth);
  }

  /**
   * Update active clones
   */
  updateActiveClones(type, count) {
    this.activeClones.set({ type }, count);
  }

  /**
   * Update context usage
   */
  updateContextUsage(agent, percent) {
    this.contextUsagePercent.set({ agent }, percent);
  }

  /**
   * Update budget
   */
  updateBudget(hackathonId, spent, remaining) {
    this.budgetSpent.set({ hackathon_id: hackathonId }, spent);
    this.budgetRemaining.set({ hackathon_id: hackathonId }, remaining);
  }

  /**
   * Record checkpoint created
   */
  recordCheckpoint() {
    this.checkpointsCreated.inc();
  }

  /**
   * Register with HackathonManager to automatically collect metrics
   */
  registerWithHackathonManager(hackathonManager) {
    // Hackathon lifecycle
    hackathonManager.on('hackathon_started', (data) => {
      this.recordHackathonStarted(data.hackathon_id);
    });

    hackathonManager.on('hackathon_completed', (data) => {
      this.recordHackathonCompleted(data.hackathon_id, data.duration_seconds || 0);
    });

    hackathonManager.on('hackathon_failed', (data) => {
      this.recordHackathonFailed(data.hackathon_id);
    });

    // Budget updates
    hackathonManager.on('budget_updated', (data) => {
      this.updateBudget(data.hackathon_id, data.spent, data.remaining);
    });

    console.log('Metrics exporter registered with HackathonManager');
  }

  /**
   * Register with AIAdapter to automatically collect metrics
   */
  registerWithAIAdapter(aiAdapter) {
    // Usage events
    aiAdapter.on('usage', (data) => {
      this.recordAgentCall(
        data.agent,
        data.model,
        'success',
        0, // Response time would need to be tracked separately
        data.usage?.input_tokens,
        data.usage?.output_tokens
      );
    });

    // Context warnings
    aiAdapter.on('context_warning', (data) => {
      this.updateContextUsage(data.agent, parseFloat(data.usagePercent) || 0);
    });

    // Circuit breaker events
    aiAdapter.circuitBreakers?.on?.('trip', (data) => {
      this.recordCircuitBreakerTrip(data.id);
    });

    console.log('Metrics exporter registered with AIAdapter');
  }

  /**
   * Register with EventDispatcher to automatically collect metrics
   */
  registerWithEventDispatcher(eventDispatcher) {
    eventDispatcher.on('event_processed', (data) => {
      this.recordEventProcessed(data.eventType);
    });

    eventDispatcher.on('agent_triggered', (data) => {
      this.recordAgentCall(data.agent, 'n8n', 'triggered', 0);
    });

    console.log('Metrics exporter registered with EventDispatcher');
  }
}

module.exports = {
  MetricsExporter,
  Counter,
  Gauge,
  Histogram,
  METRIC_TYPES
};
