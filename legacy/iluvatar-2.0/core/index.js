/**
 * ILUVATAR 2.0 - Core Module Exports
 *
 * Centralized export of all core modules for easy importing.
 */

const { StateManager, ConflictError } = require('./state-manager');
const { MessageBus } = require('./message-bus');
const { BudgetTracker, PRICING } = require('./budget-tracker');
const { TimeTracker } = require('./time-tracker');
const { ErrorHandler, ERROR_TYPES, RETRY_STRATEGIES } = require('./error-handler');
const { Logger, LOG_LEVELS, createLogger, getLogger } = require('./logging');
const { CheckpointSystem, CHECKPOINTS } = require('./checkpoint-system');
const { SessionContextManager } = require('./session-context');
const {
  JSONValidator,
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
  JSONValidationError,
  SchemaValidator,
  CIRCUIT_STATES,
  AGENT_SCHEMAS
} = require('./json-validator');
const {
  checkImports,
  checkMultipleFiles,
  extractJavaScriptImports,
  extractPythonImports
} = require('./import-checker');

module.exports = {
  // State Management
  StateManager,
  ConflictError,

  // Agent Communication
  MessageBus,

  // Budget & Cost Tracking
  BudgetTracker,
  PRICING,

  // Time & Velocity Tracking
  TimeTracker,

  // Error Handling & Retry
  ErrorHandler,
  ERROR_TYPES,
  RETRY_STRATEGIES,

  // Logging
  Logger,
  LOG_LEVELS,
  createLogger,
  getLogger,

  // Checkpoint Management
  CheckpointSystem,
  CHECKPOINTS,

  // Session Context (per-agent-per-hackathon)
  SessionContextManager,

  // JSON Validation & Circuit Breaker
  JSONValidator,
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
  JSONValidationError,
  SchemaValidator,
  CIRCUIT_STATES,
  AGENT_SCHEMAS,

  // Import Resolution Checking
  checkImports,
  checkMultipleFiles,
  extractJavaScriptImports,
  extractPythonImports
};
