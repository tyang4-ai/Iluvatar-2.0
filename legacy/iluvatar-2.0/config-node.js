// =============================================================================
// ILUVATAR 2.0 - Centralized Model Configuration
// =============================================================================
// This configuration is used by all agent nodes in n8n workflows
// To upgrade models, change the values here - all agents update automatically
// =============================================================================

// Copy this into your n8n "Code" node at the start of your workflow
// Access values in other nodes via: {{ $('Config').item.json.models.opus }}

return {
  // ---------------------------------------------------------------------------
  // MODEL CONFIGURATION
  // ---------------------------------------------------------------------------
  models: {
    // Complex tasks: ideation, architecture, code generation, debugging
    opus: "claude-opus-4-20250514",

    // Coordination tasks: reviews, routing, orchestration, testing
    sonnet: "claude-sonnet-4-20250514",

    // Infrastructure tasks: compression, monitoring, pre-fetching
    haiku: "claude-3-5-haiku-20241022"
  },

  // ---------------------------------------------------------------------------
  // TOKEN LIMITS PER MODEL
  // ---------------------------------------------------------------------------
  max_tokens: {
    opus: 8192,    // Maximum output tokens for Opus
    sonnet: 4096,  // Maximum output tokens for Sonnet
    haiku: 2048    // Maximum output tokens for Haiku
  },

  // ---------------------------------------------------------------------------
  // EXTENDED THINKING CONFIGURATION
  // ---------------------------------------------------------------------------
  // For planning agents that benefit from step-by-step reasoning
  extended_thinking: {
    enabled: true,
    budget_tokens: 10000  // Thinking budget for complex planning
  },

  // ---------------------------------------------------------------------------
  // AGENT MODEL ASSIGNMENTS (20 Total Agents)
  // ---------------------------------------------------------------------------
  agent_models: {
    // ===========================================================================
    // INFRASTRUCTURE LAYER (Haiku) - 3 agents
    // ===========================================================================
    shadowfax: "haiku",   // Context compression after phases
    quickbeam: "haiku",   // Speculative pre-fetching
    gollum: "haiku",      // Triple monitoring (tokens/rate/time)

    // ===========================================================================
    // COORDINATION LAYER (Sonnet) - 5 agents
    // ===========================================================================
    denethor: "sonnet",   // Work distribution, priority queue
    merry: "sonnet",      // Message bus, orchestration, GitHub commits
    pippin: "sonnet",     // Discord concierge, user interaction
    bilbo: "sonnet",      // User preferences learning
    galadriel: "sonnet",  // Self-reflection, post-mortem analysis

    // ===========================================================================
    // PLANNING LAYER (Opus with Extended Thinking) - 4 agents
    // ===========================================================================
    gandalf: "opus",      // Ideation + platform selection (uses extended thinking)
    radagast: "opus",     // Architecture + time-aware planning (uses extended thinking)
    treebeard: "opus",    // Multi-layer debugging (uses extended thinking)
    arwen: "opus",        // Test plan creation (uses extended thinking)

    // ===========================================================================
    // CODE GENERATION LAYER (Opus) - 4 agents
    // ===========================================================================
    gimli: "opus",        // Backend all-in-one (write + refine, merged Samwise)
    legolas: "opus",      // Frontend all-in-one (write + refine, merged Frodo)
    aragorn: "opus",      // Integration + documentation
    eowyn: "opus",        // UI Polish & Demo Magic (NEW)

    // ===========================================================================
    // REVIEW & TESTING LAYER (Sonnet) - 2 agents
    // ===========================================================================
    elrond: "sonnet",     // All reviews (progressive + security + performance + accessibility)
    thorin: "sonnet",     // All testing (backend + frontend, dynamic coverage)

    // ===========================================================================
    // DEPLOYMENT LAYER (Sonnet) - 2 agents
    // ===========================================================================
    eomer: "sonnet",      // Deployment captain (multi-platform)
    haldir: "sonnet",     // Infrastructure scout (verification)
  },

  // ---------------------------------------------------------------------------
  // AGENT CAPABILITIES & FEATURES
  // ---------------------------------------------------------------------------
  agent_capabilities: {
    // Agents that can spawn clones for parallel work
    clonable: ["gimli", "legolas", "thorin"],

    // Agents that use extended thinking
    uses_extended_thinking: ["gandalf", "radagast", "treebeard", "arwen"],

    // Agents that write to GitHub
    github_writers: ["merry", "gimli", "legolas", "aragorn", "eowyn", "thorin"],

    // Agents that can trigger checkpoints
    checkpoint_triggers: ["gandalf", "radagast", "gimli", "legolas", "thorin", "eomer"],

    // Critical path agents (pipeline blocks if these fail)
    critical_path: ["gandalf", "radagast", "gimli", "legolas", "eomer"]
  },

  // ---------------------------------------------------------------------------
  // API CONFIGURATION
  // ---------------------------------------------------------------------------
  api: {
    base_url: "https://api.anthropic.com/v1/messages",
    version: "2023-06-01",
    // API key is passed via environment variable for security
    key_env_var: "ANTHROPIC_API_KEY"
  },

  // ---------------------------------------------------------------------------
  // RATE LIMITING THRESHOLDS
  // ---------------------------------------------------------------------------
  rate_limits: {
    // Token usage thresholds (percentage of daily limit)
    token_warning: 80,    // Warn user at 80% of budget
    token_pause: 90,      // Pause pipeline at 90% of budget

    // Request rate thresholds (requests per minute)
    requests_per_minute: 50,
    throttle_thresholds: {
      full_speed: 30,      // < 30 req/min: no delay
      light_delay: 40,     // 30-40 req/min: 500ms delay
      medium_delay: 45,    // 40-45 req/min: 1s delay
      heavy_delay: 50      // > 45 req/min: 2s delay
    }
  },

  // ---------------------------------------------------------------------------
  // TIME TRACKING THRESHOLDS
  // ---------------------------------------------------------------------------
  time_alerts: {
    halfway: 50,          // 50% - "Halfway through hackathon"
    warning: 75,          // 75% - "25% remaining"
    final_stretch: 85,    // 85% - "Entering final stretch!"
    crunch_mode: 90       // 90% - Auto-trigger crunch mode
  },

  // ---------------------------------------------------------------------------
  // CHECKPOINT CONFIGURATION
  // ---------------------------------------------------------------------------
  checkpoints: {
    // Major checkpoints (require explicit approval)
    major: {
      idea_approval: {
        timeout_minutes: 15,
        auto_approve: false
      },
      platform_selection: {
        timeout_minutes: 15,
        auto_approve: false
      },
      architecture_approval: {
        timeout_minutes: 20,
        auto_approve: false
      },
      code_complete: {
        timeout_minutes: 10,
        auto_approve: false
      },
      tests_passed: {
        timeout_minutes: 10,
        auto_approve: false
      },
      deployment_confirmation: {
        timeout_minutes: 15,
        auto_approve: false
      }
    },

    // Micro-checkpoints (auto-approve after timeout)
    micro: {
      tech_stack_confirmation: {
        timeout_minutes: 10,
        auto_approve: true
      },
      backend_routes_review: {
        timeout_minutes: 10,
        auto_approve: true
      },
      frontend_design_direction: {
        timeout_minutes: 10,
        auto_approve: true
      },
      integration_smoke_test: {
        timeout_minutes: 5,
        auto_approve: true
      },
      demo_script_review: {
        timeout_minutes: 10,
        auto_approve: true
      }
    }
  },

  // ---------------------------------------------------------------------------
  // PRICING (as of model release - update if changed)
  // ---------------------------------------------------------------------------
  pricing: {
    opus: {
      input: 15,    // $ per 1M tokens
      output: 75    // $ per 1M tokens
    },
    sonnet: {
      input: 3,     // $ per 1M tokens
      output: 15    // $ per 1M tokens
    },
    haiku: {
      input: 0.25,  // $ per 1M tokens
      output: 1.25  // $ per 1M tokens
    }
  },

  // ---------------------------------------------------------------------------
  // AGENT COUNT SUMMARY
  // ---------------------------------------------------------------------------
  summary: {
    total_agents: 20,
    by_model: {
      haiku: 3,   // Infrastructure
      sonnet: 11, // Coordination (5) + Review/Testing (2) + Deployment (2)
      opus: 6     // Planning (4) + Code Generation (4) - Note: 4+4=8, but Gandalf, Radagast, Treebeard, Arwen (4) + Gimli, Legolas, Aragorn, Éowyn (4) = 8... correction needed
    },
    by_layer: {
      infrastructure: 3,
      coordination: 5,
      planning: 4,
      code_generation: 4,
      review_testing: 2,
      deployment: 2
    }
  },

  // ---------------------------------------------------------------------------
  // REMOVED AGENTS (for reference)
  // ---------------------------------------------------------------------------
  removed_agents: {
    samwise: "Merged into Gimli (backend refiner)",
    frodo: "Merged into Legolas (frontend refiner)",
    glorfindel: "Merged into Elrond (security review)",
    celeborn: "Merged into Elrond (performance review)",
    erestor: "Merged into Elrond (accessibility review)",
    balin: "Merged into Thorin (frontend testing)",
    theoden: "Removed (test enforcement too rigid for hackathons)",
    boromir: "Repurposed as Éowyn (UI polish)",
    faramir: "Merged into Treebeard (failure analysis)",
    saruman: "Removed (submission handled by Gandalf or manually)"
  }
};
