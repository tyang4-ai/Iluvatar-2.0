/**
 * ILUVATAR 3.0 - Agent Schemas
 *
 * JSON Schema definitions for all 26 agents' outputs.
 * Used by the JSON Validator to ensure agent outputs conform to expected structure.
 *
 * Agent Tiers:
 * - Tier 1 (Core): Gandalf, Radagast, Denethor, Gimli, Legolas, Saruman, Sauron
 * - Tier 2 (Event): Shadowfax, Galadriel, Elrond, Faramir
 * - Tier 3 (Situational): Treebeard, Aragorn, Eowyn
 * - Tier 4 (Support): Gollum, Pippin, Merry, Quickbeam, Bilbo, Arwen, Thorin, Eomer, Haldir, Historian, Scribe, Librarian
 */

// =====================
// TIER 1: Core Pipeline Agents
// =====================

const GANDALF_SCHEMA = {
  $id: 'gandalf-output',
  type: 'object',
  description: 'Gandalf (Ideation) output schema',
  required: ['ideas', 'recommended_idea_index', 'platform_recommendation'],
  properties: {
    ideas: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'object',
        required: ['title', 'description'],
        properties: {
          title: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 10 },
          pros: { type: 'array', items: { type: 'string' } },
          cons: { type: 'array', items: { type: 'string' } },
          feasibility: { type: 'string', enum: ['high', 'medium', 'low'] },
          innovation_score: { type: 'number', minimum: 1, maximum: 10 }
        }
      }
    },
    recommended_idea_index: { type: 'number', minimum: 0 },
    platform_recommendation: {
      type: 'object',
      required: ['platform'],
      properties: {
        platform: { type: 'string' },
        reasoning: { type: 'string' }
      }
    },
    hackathon_fit_analysis: { type: 'string' },
    key_differentiators: { type: 'array', items: { type: 'string' } }
  }
};

const RADAGAST_SCHEMA = {
  $id: 'radagast-output',
  type: 'object',
  description: 'Radagast (Architecture) output schema',
  required: ['architecture', 'phase_allocation', 'time_tracking'],
  properties: {
    architecture: {
      type: 'object',
      required: ['tech_stack', 'file_structure'],
      properties: {
        tech_stack: {
          type: 'object',
          properties: {
            frontend: { type: 'array', items: { type: 'string' } },
            backend: { type: 'array', items: { type: 'string' } },
            database: { type: 'array', items: { type: 'string' } },
            deployment: { type: 'array', items: { type: 'string' } }
          }
        },
        file_structure: { type: 'object' },
        dependencies: { type: 'object' },
        api_endpoints: { type: 'array', items: { type: 'object' } },
        database_schema: { type: 'object' }
      }
    },
    phase_allocation: {
      type: 'object',
      properties: {
        backend_percentage: { type: 'number', minimum: 0, maximum: 100 },
        frontend_percentage: { type: 'number', minimum: 0, maximum: 100 }
      }
    },
    time_tracking: {
      type: 'object',
      properties: {
        estimated_hours: { type: 'number', minimum: 0 },
        phases: { type: 'object' }
      }
    },
    crunch_mode_triggers: { type: 'array', items: { type: 'object' } },
    risk_assessment: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          risk: { type: 'string' },
          mitigation: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] }
        }
      }
    }
  }
};

const DENETHOR_SCHEMA = {
  $id: 'denethor-output',
  type: 'object',
  description: 'Denethor (Work Distribution) output schema',
  required: ['backend_work_queue', 'frontend_work_queue', 'backend_clones', 'frontend_clones'],
  properties: {
    backend_work_queue: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file_path', 'priority'],
        properties: {
          file_path: { type: 'string', minLength: 1 },
          priority: { type: 'number', minimum: 1 },
          description: { type: 'string' },
          dependencies: { type: 'array', items: { type: 'string' } },
          estimated_complexity: { type: 'string', enum: ['simple', 'moderate', 'complex'] },
          required_context: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    frontend_work_queue: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file_path', 'priority'],
        properties: {
          file_path: { type: 'string', minLength: 1 },
          priority: { type: 'number', minimum: 1 },
          description: { type: 'string' },
          dependencies: { type: 'array', items: { type: 'string' } },
          component_type: { type: 'string' },
          required_context: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    backend_clones: { type: 'number', minimum: 1, maximum: 10 },
    frontend_clones: { type: 'number', minimum: 1, maximum: 10 },
    critical_path: { type: 'array', items: { type: 'string' } },
    parallelization_strategy: { type: 'string' }
  }
};

const GIMLI_SCHEMA = {
  $id: 'gimli-output',
  type: 'object',
  description: 'Gimli (Backend Development) output schema',
  required: ['file_path', 'content'],
  properties: {
    file_path: { type: 'string', minLength: 1 },
    content: { type: 'string' },
    language: { type: 'string' },
    dependencies: { type: 'array', items: { type: 'string' } },
    exports: { type: 'array', items: { type: 'string' } },
    imports: { type: 'array', items: { type: 'string' } },
    functions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          parameters: { type: 'array' },
          returns: { type: 'string' }
        }
      }
    },
    environment_variables: { type: 'array', items: { type: 'string' } }
  }
};

const LEGOLAS_SCHEMA = {
  $id: 'legolas-output',
  type: 'object',
  description: 'Legolas (Frontend Development) output schema',
  required: ['file_path', 'content'],
  properties: {
    file_path: { type: 'string', minLength: 1 },
    content: { type: 'string' },
    component_type: { type: 'string', enum: ['page', 'component', 'layout', 'hook', 'utility', 'style'] },
    styles_included: { type: 'boolean' },
    dependencies: { type: 'array', items: { type: 'string' } },
    props: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          required: { type: 'boolean' }
        }
      }
    },
    hooks_used: { type: 'array', items: { type: 'string' } },
    accessibility_features: { type: 'array', items: { type: 'string' } }
  }
};

const SARUMAN_SCHEMA = {
  $id: 'saruman-output',
  type: 'object',
  description: 'Saruman (Submission) output schema',
  required: ['readme', 'submission_materials'],
  properties: {
    readme: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string', minLength: 100 },
        sections: { type: 'array', items: { type: 'string' } }
      }
    },
    submission_materials: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        tagline: { type: 'string' },
        description: { type: 'string' },
        tech_stack: { type: 'array', items: { type: 'string' } },
        features: { type: 'array', items: { type: 'string' } },
        installation_steps: { type: 'array', items: { type: 'string' } },
        demo_url: { type: 'string' },
        repository_url: { type: 'string' },
        team_members: { type: 'array', items: { type: 'string' } }
      }
    },
    pitch_script: { type: 'string' },
    demo_script: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step: { type: 'number' },
          action: { type: 'string' },
          narration: { type: 'string' }
        }
      }
    }
  }
};

const SAURON_SCHEMA = {
  $id: 'sauron-output',
  type: 'object',
  description: 'Sauron (Demo Video) output schema',
  required: ['video_script', 'scenes'],
  properties: {
    video_script: { type: 'string', minLength: 50 },
    scenes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['scene_number', 'description'],
        properties: {
          scene_number: { type: 'number', minimum: 1 },
          description: { type: 'string' },
          duration_seconds: { type: 'number', minimum: 1 },
          visuals: { type: 'string' },
          narration: { type: 'string' },
          actions: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    total_duration_seconds: { type: 'number', minimum: 30, maximum: 300 },
    music_suggestion: { type: 'string' },
    thumbnail_description: { type: 'string' }
  }
};

// =====================
// TIER 2: Event-Triggered Agents
// =====================

const SHADOWFAX_SCHEMA = {
  $id: 'shadowfax-output',
  type: 'object',
  description: 'Shadowfax (Context Compression) output schema',
  required: ['compressed_context', 'summary', 'tokens_saved'],
  properties: {
    compressed_context: { type: 'string', minLength: 1 },
    summary: { type: 'string', minLength: 10 },
    tokens_saved: { type: 'number', minimum: 0 },
    original_tokens: { type: 'number', minimum: 0 },
    compression_ratio: { type: 'number', minimum: 0, maximum: 1 },
    key_decisions: { type: 'array', items: { type: 'string' } },
    preserved_context: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          importance: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }
        }
      }
    }
  }
};

const GALADRIEL_SCHEMA = {
  $id: 'galadriel-output',
  type: 'object',
  description: 'Galadriel (Code Review) output schema',
  required: ['quality_score', 'issues', 'approved'],
  properties: {
    quality_score: { type: 'number', minimum: 1, maximum: 10 },
    approved: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'suggestion'] },
          line: { type: 'number' },
          message: { type: 'string' },
          fix_suggestion: { type: 'string' }
        }
      }
    },
    suggestions: { type: 'array', items: { type: 'string' } },
    security_concerns: { type: 'array', items: { type: 'string' } },
    performance_notes: { type: 'array', items: { type: 'string' } },
    best_practices: {
      type: 'object',
      properties: {
        followed: { type: 'array', items: { type: 'string' } },
        violated: { type: 'array', items: { type: 'string' } }
      }
    }
  }
};

const ELROND_SCHEMA = {
  $id: 'elrond-output',
  type: 'object',
  description: 'Elrond (Debug Analysis) output schema',
  required: ['diagnosis', 'fix_proposal', 'confidence'],
  properties: {
    diagnosis: { type: 'string', minLength: 10 },
    root_cause: { type: 'string' },
    fix_proposal: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        changes: { type: 'array', items: { type: 'object' } },
        explanation: { type: 'string' }
      }
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    alternative_causes: { type: 'array', items: { type: 'string' } },
    debugging_steps: { type: 'array', items: { type: 'string' } },
    prevention_recommendations: { type: 'array', items: { type: 'string' } }
  }
};

const FARAMIR_SCHEMA = {
  $id: 'faramir-output',
  type: 'object',
  description: 'Faramir (Quality Scoring) output schema',
  required: ['overall_score', 'go_decision', 'categories'],
  properties: {
    overall_score: { type: 'number', minimum: 1, maximum: 10 },
    go_decision: { type: 'boolean' },
    categories: {
      type: 'object',
      properties: {
        functionality: { type: 'number', minimum: 1, maximum: 10 },
        code_quality: { type: 'number', minimum: 1, maximum: 10 },
        user_experience: { type: 'number', minimum: 1, maximum: 10 },
        innovation: { type: 'number', minimum: 1, maximum: 10 },
        completeness: { type: 'number', minimum: 1, maximum: 10 }
      }
    },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
    blocking_issues: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } }
  }
};

// =====================
// TIER 3: Situational Agents
// =====================

const TREEBEARD_SCHEMA = {
  $id: 'treebeard-output',
  type: 'object',
  description: 'Treebeard (Patience/Waiting) output schema',
  required: ['wait_strategy', 'next_steps'],
  properties: {
    wait_strategy: { type: 'string' },
    estimated_wait_time: { type: 'number', minimum: 0 },
    productive_tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          priority: { type: 'number' },
          can_proceed: { type: 'boolean' }
        }
      }
    },
    next_steps: { type: 'array', items: { type: 'string' } },
    context_to_preserve: { type: 'array', items: { type: 'string' } },
    rate_limit_info: {
      type: 'object',
      properties: {
        current_usage: { type: 'number' },
        limit: { type: 'number' },
        reset_time: { type: 'string' }
      }
    }
  }
};

const ARAGORN_SCHEMA = {
  $id: 'aragorn-output',
  type: 'object',
  description: 'Aragorn (Leadership Decisions) output schema',
  required: ['decision', 'reasoning', 'action_plan'],
  properties: {
    decision: { type: 'string', minLength: 1 },
    reasoning: { type: 'string', minLength: 10 },
    action_plan: {
      type: 'array',
      items: {
        type: 'object',
        required: ['step', 'action'],
        properties: {
          step: { type: 'number' },
          action: { type: 'string' },
          assignee: { type: 'string' },
          deadline: { type: 'string' }
        }
      }
    },
    alternatives_considered: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          option: { type: 'string' },
          pros: { type: 'array', items: { type: 'string' } },
          cons: { type: 'array', items: { type: 'string' } },
          rejected_reason: { type: 'string' }
        }
      }
    },
    risk_assessment: { type: 'string' },
    success_criteria: { type: 'array', items: { type: 'string' } }
  }
};

const EOWYN_SCHEMA = {
  $id: 'eowyn-output',
  type: 'object',
  description: 'Eowyn (Unconventional Solutions) output schema',
  required: ['unconventional_approach', 'implementation'],
  properties: {
    unconventional_approach: { type: 'string', minLength: 10 },
    original_constraint: { type: 'string' },
    how_it_works: { type: 'string' },
    implementation: {
      type: 'object',
      properties: {
        steps: { type: 'array', items: { type: 'string' } },
        code_changes: { type: 'array', items: { type: 'object' } },
        risks: { type: 'array', items: { type: 'string' } }
      }
    },
    why_unconventional: { type: 'string' },
    precedents: { type: 'array', items: { type: 'string' } },
    fallback_plan: { type: 'string' }
  }
};

// =====================
// TIER 4: Support Agents
// =====================

const GOLLUM_SCHEMA = {
  $id: 'gollum-output',
  type: 'object',
  description: 'Gollum (Edge Case Testing) output schema',
  required: ['edge_cases', 'test_results'],
  properties: {
    edge_cases: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'input'],
        properties: {
          description: { type: 'string' },
          input: { type: 'object' },
          expected_behavior: { type: 'string' },
          actual_behavior: { type: 'string' },
          passed: { type: 'boolean' }
        }
      }
    },
    test_results: {
      type: 'object',
      properties: {
        passed: { type: 'number' },
        failed: { type: 'number' },
        skipped: { type: 'number' }
      }
    },
    vulnerabilities_found: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } }
  }
};

const PIPPIN_SCHEMA = {
  $id: 'pippin-output',
  type: 'object',
  description: 'Pippin (Random Exploration) output schema',
  required: ['discovery', 'exploration_path'],
  properties: {
    discovery: { type: 'string' },
    exploration_path: { type: 'array', items: { type: 'string' } },
    interesting_findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          finding: { type: 'string' },
          potential_value: { type: 'string' },
          action_suggested: { type: 'string' }
        }
      }
    },
    serendipity_score: { type: 'number', minimum: 0, maximum: 10 },
    follow_up_ideas: { type: 'array', items: { type: 'string' } }
  }
};

const MERRY_SCHEMA = {
  $id: 'merry-output',
  type: 'object',
  description: 'Merry (Clone Support) output schema',
  required: ['support_type', 'assistance'],
  properties: {
    support_type: { type: 'string', enum: ['stuck', 'error', 'guidance', 'dependency'] },
    clone_id: { type: 'string' },
    issue_analysis: { type: 'string' },
    assistance: {
      type: 'object',
      properties: {
        guidance: { type: 'string' },
        code_fix: { type: 'string' },
        context_provided: { type: 'array', items: { type: 'string' } }
      }
    },
    resolution_steps: { type: 'array', items: { type: 'string' } },
    prevention_advice: { type: 'string' }
  }
};

const QUICKBEAM_SCHEMA = {
  $id: 'quickbeam-output',
  type: 'object',
  description: 'Quickbeam (Speculative Pre-fetching) output schema',
  required: ['prefetched_context', 'predictions'],
  properties: {
    prefetched_context: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          content: { type: 'string' },
          relevance_score: { type: 'number', minimum: 0, maximum: 1 }
        }
      }
    },
    predictions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          predicted_need: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          prepared_response: { type: 'string' }
        }
      }
    },
    cache_recommendations: { type: 'array', items: { type: 'string' } }
  }
};

const BILBO_SCHEMA = {
  $id: 'bilbo-output',
  type: 'object',
  description: 'Bilbo (User Preferences) output schema',
  required: ['preferences_learned', 'profile_update'],
  properties: {
    preferences_learned: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          preference: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          source: { type: 'string' }
        }
      }
    },
    profile_update: {
      type: 'object',
      properties: {
        coding_style: { type: 'object' },
        tech_preferences: { type: 'array', items: { type: 'string' } },
        communication_style: { type: 'string' }
      }
    },
    recommendations: { type: 'array', items: { type: 'string' } }
  }
};

const ARWEN_SCHEMA = {
  $id: 'arwen-output',
  type: 'object',
  description: 'Arwen (Test Planning) output schema',
  required: ['test_plan', 'coverage_targets'],
  properties: {
    test_plan: {
      type: 'array',
      items: {
        type: 'object',
        required: ['category', 'tests'],
        properties: {
          category: { type: 'string' },
          tests: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                type: { type: 'string', enum: ['unit', 'integration', 'e2e', 'performance'] }
              }
            }
          }
        }
      }
    },
    coverage_targets: {
      type: 'object',
      properties: {
        line_coverage: { type: 'number', minimum: 0, maximum: 100 },
        branch_coverage: { type: 'number', minimum: 0, maximum: 100 },
        function_coverage: { type: 'number', minimum: 0, maximum: 100 }
      }
    },
    test_data_requirements: { type: 'array', items: { type: 'string' } },
    mocking_strategy: { type: 'string' }
  }
};

const THORIN_SCHEMA = {
  $id: 'thorin-output',
  type: 'object',
  description: 'Thorin (Test Writing) output schema',
  required: ['test_file', 'tests_written'],
  properties: {
    test_file: {
      type: 'object',
      required: ['path', 'content'],
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      }
    },
    tests_written: { type: 'number', minimum: 1 },
    framework: { type: 'string' },
    coverage_achieved: {
      type: 'object',
      properties: {
        statements: { type: 'number' },
        branches: { type: 'number' },
        functions: { type: 'number' }
      }
    },
    mocks_created: { type: 'array', items: { type: 'string' } },
    fixtures: { type: 'array', items: { type: 'object' } }
  }
};

const EOMER_SCHEMA = {
  $id: 'eomer-output',
  type: 'object',
  description: 'Eomer (Deployment) output schema',
  required: ['deployment_config', 'steps'],
  properties: {
    deployment_config: {
      type: 'object',
      properties: {
        platform: { type: 'string' },
        environment_variables: { type: 'object' },
        build_commands: { type: 'array', items: { type: 'string' } },
        start_command: { type: 'string' }
      }
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['step', 'command'],
        properties: {
          step: { type: 'number' },
          description: { type: 'string' },
          command: { type: 'string' }
        }
      }
    },
    config_files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' }
        }
      }
    },
    estimated_deployment_time: { type: 'number' },
    rollback_plan: { type: 'string' }
  }
};

const HALDIR_SCHEMA = {
  $id: 'haldir-output',
  type: 'object',
  description: 'Haldir (Deployment Verification) output schema',
  required: ['verification_results', 'status'],
  properties: {
    status: { type: 'string', enum: ['success', 'partial', 'failed'] },
    verification_results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['check', 'passed'],
        properties: {
          check: { type: 'string' },
          passed: { type: 'boolean' },
          details: { type: 'string' }
        }
      }
    },
    deployment_url: { type: 'string' },
    health_check_results: {
      type: 'object',
      properties: {
        http_status: { type: 'number' },
        response_time_ms: { type: 'number' },
        endpoints_checked: { type: 'array', items: { type: 'string' } }
      }
    },
    issues_found: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } }
  }
};

const HISTORIAN_SCHEMA = {
  $id: 'historian-output',
  type: 'object',
  description: 'Historian (Archive Q&A) output schema',
  required: ['answer', 'sources'],
  properties: {
    answer: { type: 'string', minLength: 1 },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hackathon_id: { type: 'string' },
          date: { type: 'string' },
          relevance: { type: 'number', minimum: 0, maximum: 1 },
          excerpt: { type: 'string' }
        }
      }
    },
    related_queries: { type: 'array', items: { type: 'string' } },
    patterns_identified: { type: 'array', items: { type: 'string' } }
  }
};

const SCRIBE_SCHEMA = {
  $id: 'scribe-output',
  type: 'object',
  description: 'Scribe (Experience Writer) output schema',
  required: ['experience_summary', 'learnings'],
  properties: {
    experience_summary: {
      type: 'object',
      required: ['hackathon_name', 'outcome', 'narrative'],
      properties: {
        hackathon_name: { type: 'string' },
        outcome: { type: 'string', enum: ['win', 'top3', 'finalist', 'completed', 'incomplete'] },
        narrative: { type: 'string', minLength: 100 },
        highlights: { type: 'array', items: { type: 'string' } },
        challenges: { type: 'array', items: { type: 'string' } }
      }
    },
    learnings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          lesson: { type: 'string' },
          actionable_advice: { type: 'string' }
        }
      }
    },
    statistics: {
      type: 'object',
      properties: {
        duration_hours: { type: 'number' },
        files_generated: { type: 'number' },
        total_cost: { type: 'number' },
        agents_used: { type: 'array', items: { type: 'string' } }
      }
    },
    recommendations_for_future: { type: 'array', items: { type: 'string' } }
  }
};

const LIBRARIAN_SCHEMA = {
  $id: 'librarian-output',
  type: 'object',
  description: 'Librarian (Repository Organization) output schema',
  required: ['structure_analysis', 'organization_suggestions'],
  properties: {
    structure_analysis: {
      type: 'object',
      properties: {
        total_files: { type: 'number' },
        directories: { type: 'array', items: { type: 'string' } },
        file_types: { type: 'object' },
        entry_points: { type: 'array', items: { type: 'string' } }
      }
    },
    organization_suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          suggestion: { type: 'string' },
          reason: { type: 'string' },
          files_affected: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    documentation_map: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          description: { type: 'string' },
          dependencies: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    navigation_guide: { type: 'string' }
  }
};

// =====================
// Export All Schemas
// =====================

const ALL_AGENT_SCHEMAS = {
  // Tier 1: Core
  gandalf: GANDALF_SCHEMA,
  radagast: RADAGAST_SCHEMA,
  denethor: DENETHOR_SCHEMA,
  gimli: GIMLI_SCHEMA,
  legolas: LEGOLAS_SCHEMA,
  saruman: SARUMAN_SCHEMA,
  sauron: SAURON_SCHEMA,

  // Tier 2: Event
  shadowfax: SHADOWFAX_SCHEMA,
  galadriel: GALADRIEL_SCHEMA,
  elrond: ELROND_SCHEMA,
  faramir: FARAMIR_SCHEMA,

  // Tier 3: Situational
  treebeard: TREEBEARD_SCHEMA,
  aragorn: ARAGORN_SCHEMA,
  eowyn: EOWYN_SCHEMA,

  // Tier 4: Support
  gollum: GOLLUM_SCHEMA,
  pippin: PIPPIN_SCHEMA,
  merry: MERRY_SCHEMA,
  quickbeam: QUICKBEAM_SCHEMA,
  bilbo: BILBO_SCHEMA,
  arwen: ARWEN_SCHEMA,
  thorin: THORIN_SCHEMA,
  eomer: EOMER_SCHEMA,
  haldir: HALDIR_SCHEMA,
  historian: HISTORIAN_SCHEMA,
  scribe: SCRIBE_SCHEMA,
  librarian: LIBRARIAN_SCHEMA
};

/**
 * Get schema for a specific agent
 * @param {string} agentName - Agent name (case insensitive)
 * @returns {Object|null} Schema or null if not found
 */
function getAgentSchema(agentName) {
  return ALL_AGENT_SCHEMAS[agentName.toLowerCase()] || null;
}

/**
 * Get all agent names
 * @returns {string[]} Array of agent names
 */
function getAllAgentNames() {
  return Object.keys(ALL_AGENT_SCHEMAS);
}

/**
 * Get agents by tier
 * @param {number} tier - Tier number (1-4)
 * @returns {string[]} Array of agent names in that tier
 */
function getAgentsByTier(tier) {
  const tiers = {
    1: ['gandalf', 'radagast', 'denethor', 'gimli', 'legolas', 'saruman', 'sauron'],
    2: ['shadowfax', 'galadriel', 'elrond', 'faramir'],
    3: ['treebeard', 'aragorn', 'eowyn'],
    4: ['gollum', 'pippin', 'merry', 'quickbeam', 'bilbo', 'arwen', 'thorin', 'eomer', 'haldir', 'historian', 'scribe', 'librarian']
  };
  return tiers[tier] || [];
}

module.exports = {
  ALL_AGENT_SCHEMAS,
  getAgentSchema,
  getAllAgentNames,
  getAgentsByTier,
  // Individual schemas for direct import
  GANDALF_SCHEMA,
  RADAGAST_SCHEMA,
  DENETHOR_SCHEMA,
  GIMLI_SCHEMA,
  LEGOLAS_SCHEMA,
  SARUMAN_SCHEMA,
  SAURON_SCHEMA,
  SHADOWFAX_SCHEMA,
  GALADRIEL_SCHEMA,
  ELROND_SCHEMA,
  FARAMIR_SCHEMA,
  TREEBEARD_SCHEMA,
  ARAGORN_SCHEMA,
  EOWYN_SCHEMA,
  GOLLUM_SCHEMA,
  PIPPIN_SCHEMA,
  MERRY_SCHEMA,
  QUICKBEAM_SCHEMA,
  BILBO_SCHEMA,
  ARWEN_SCHEMA,
  THORIN_SCHEMA,
  EOMER_SCHEMA,
  HALDIR_SCHEMA,
  HISTORIAN_SCHEMA,
  SCRIBE_SCHEMA,
  LIBRARIAN_SCHEMA
};
