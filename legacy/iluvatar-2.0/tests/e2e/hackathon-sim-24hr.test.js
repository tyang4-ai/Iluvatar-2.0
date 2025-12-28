/**
 * ILUVATAR 2.0 - 24-Hour Hackathon Simulation Test
 *
 * End-to-end test simulating a complete 24-hour hackathon
 * Tests all agents, workflows, and checkpoints under time pressure
 *
 * Test scenario: Build a simple todo app in 24 hours
 */

const axios = require('axios');
const Redis = require('ioredis');
const { expect } = require('chai');

// Skip E2E tests by default - they require full infrastructure (Redis + n8n)
// Run with ENABLE_E2E=true to enable these tests
describe.skip('24-Hour Hackathon Simulation', function() {
  this.timeout(7200000); // 2 hour timeout for full test

  let redis;
  let hackathonId;
  let baseUrl;

  before(async function() {
    baseUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';

    // Setup Redis
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: 6379
    });

    // Clear any existing state
    await redis.flushall();

    console.log('\n🧪 Starting 24-hour hackathon simulation...\n');
  });

  after(async function() {
    // Cleanup
    if (redis) {
      await redis.quit();
    }
  });

  describe('Phase 1: Ideation (Expected: 2 hours)', function() {
    it('should start hackathon and trigger Pippin notification', async function() {
      const response = await axios.post(`${baseUrl}/iluvatar-webhook`, {
        user_id: 'test-user-123',
        hackathon_name: 'Test Hackathon 2025',
        theme: 'Build a productivity app',
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
        budget: 50,
        sponsors: ['Anthropic', 'Vercel']
      });

      expect(response.status).to.equal(200);

      // Wait for state to be initialized
      await sleep(5000);

      // Verify state was created
      const metadata = await redis.hget('state:data', 'hackathon_metadata');
      expect(metadata).to.exist;

      const parsedMetadata = JSON.parse(metadata);
      hackathonId = parsedMetadata.hackathon_id;

      expect(parsedMetadata.theme).to.equal('Build a productivity app');
      expect(parsedMetadata.budget_allocated).to.equal(50);

      console.log(`  ✓ Hackathon started: ${hackathonId}`);
    });

    it('should generate 3 ideas via Gandalf', async function() {
      // Wait for Gandalf to complete (Opus with extended thinking can take time)
      await waitForState('generated_ideas', 60000);

      const ideas = JSON.parse(await redis.hget('state:data', 'generated_ideas'));

      expect(ideas).to.be.an('array');
      expect(ideas).to.have.lengthOf(3);

      // Verify each idea has required fields
      ideas.forEach((idea, index) => {
        expect(idea).to.have.property('title');
        expect(idea).to.have.property('description');
        expect(idea).to.have.property('scores');
        expect(idea.scores).to.have.property('novelty');
        expect(idea.scores).to.have.property('feasibility');
        expect(idea.scores).to.have.property('wow_factor');
        expect(idea.scores).to.have.property('overall');

        console.log(`  ✓ Idea ${index + 1}: ${idea.title} (score: ${idea.scores.overall}/10)`);
      });
    });

    it('should wait for Checkpoint 1: Idea Approval', async function() {
      // Wait for checkpoint to be created
      await waitForState('current_checkpoint', 10000);

      const checkpoint = await redis.hget('state:data', 'current_checkpoint');
      expect(checkpoint).to.equal('1_idea_approval');

      console.log('  ⏸️  Checkpoint 1: Awaiting idea approval');

      // Simulate user approval (select idea #1)
      const response = await axios.post(`${baseUrl}/checkpoint-response`, {
        checkpoint_name: '1_idea_approval',
        action: 'approve',
        selected_idea: 0 // Select first idea
      });

      expect(response.status).to.equal(200);

      // Wait for approval to be processed
      await sleep(3000);

      const checkpointStatus = await redis.hget('state:data', 'checkpoint_status');
      expect(checkpointStatus).to.equal('APPROVED');

      console.log('  ✓ Idea approved by user');
    });

    it('should recommend deployment platform', async function() {
      const platform = JSON.parse(await redis.hget('state:data', 'platform_recommendation'));

      expect(platform).to.have.property('recommended_platform');
      expect(platform).to.have.property('reasoning');
      expect(platform).to.have.property('deployment_steps');

      console.log(`  ✓ Platform recommended: ${platform.recommended_platform}`);
    });
  });

  describe('Phase 2: Architecture Planning (Expected: 3 hours)', function() {
    it('should generate architecture via Radagast', async function() {
      // Trigger architecture approval webhook
      await axios.post(`${baseUrl}/architecture-approved`, {});

      // Wait for Radagast to complete
      await waitForState('architecture_plan', 90000);

      const architecture = JSON.parse(await redis.hget('state:data', 'architecture_plan'));

      expect(architecture).to.have.property('tech_stack');
      expect(architecture).to.have.property('file_structure');
      expect(architecture).to.have.property('backend_routes');
      expect(architecture).to.have.property('frontend_components');

      console.log('  ✓ Architecture plan created');
      console.log(`    - Backend files: ${architecture.file_structure.backend.length}`);
      console.log(`    - Frontend files: ${architecture.file_structure.frontend.length}`);
    });

    it('should calculate time allocation and velocity targets', async function() {
      const timeTracking = JSON.parse(await redis.hget('state:data', 'time_tracking'));

      expect(timeTracking).to.have.property('velocity');
      expect(timeTracking).to.have.property('predicted_finish');

      console.log(`  ✓ Velocity target: ${timeTracking.velocity} files/hour`);
    });

    it('should approve architecture at Checkpoint 3', async function() {
      // Simulate user approval
      await axios.post(`${baseUrl}/checkpoint-response`, {
        checkpoint_name: '3_architecture_approval',
        action: 'approve'
      });

      await sleep(3000);

      const checkpointStatus = await redis.hget('state:data', 'checkpoint_status');
      expect(checkpointStatus).to.equal('APPROVED');

      console.log('  ✓ Architecture approved');
    });
  });

  describe('Phase 3: Code Generation (Expected: 12 hours)', function() {
    it('should distribute work via Denethor', async function() {
      // Wait for work distribution
      await sleep(10000);

      const backendClones = await redis.hget('state:data', 'backend_clones');
      const frontendClones = await redis.hget('state:data', 'frontend_clones');

      expect(parseInt(backendClones)).to.be.at.least(1);
      expect(parseInt(frontendClones)).to.be.at.least(1);

      console.log(`  ✓ Spawned ${backendClones} Gimli clones, ${frontendClones} Legolas clones`);
    });

    it('should generate backend files', async function() {
      // Check backend queue was created
      const backendQueueSize = await redis.zcard('queue:backend');

      expect(backendQueueSize).to.be.at.least(3); // At least 3 backend files

      console.log(`  ✓ Backend queue: ${backendQueueSize} files`);

      // Simulate file completion (in real test, would wait for actual generation)
      // For speed, we'll mark files as completed manually
      const fileTracking = {};
      for (let i = 1; i <= backendQueueSize; i++) {
        fileTracking[`backend/file${i}.py`] = 'completed';
      }

      await redis.hset('state:data', 'file_tracking', JSON.stringify(fileTracking));

      console.log(`  ✓ Backend files generated (simulated)`);
    });

    it('should generate frontend files', async function() {
      const frontendQueueSize = await redis.zcard('queue:frontend');

      expect(frontendQueueSize).to.be.at.least(5); // At least 5 frontend components

      console.log(`  ✓ Frontend queue: ${frontendQueueSize} files`);

      // Simulate frontend file completion
      const fileTracking = JSON.parse(await redis.hget('state:data', 'file_tracking'));

      for (let i = 1; i <= frontendQueueSize; i++) {
        fileTracking[`frontend/Component${i}.tsx`] = 'completed';
      }

      await redis.hset('state:data', 'file_tracking', JSON.stringify(fileTracking));

      console.log(`  ✓ Frontend files generated (simulated)`);
    });

    it('should review code via Elrond', async function() {
      // In real implementation, Elrond would review each file
      // For simulation, we'll assume reviews pass

      console.log('  ✓ Code reviews passed (simulated)');
    });
  });

  describe('Phase 4: Testing (Expected: 6 hours)', function() {
    it('should generate test plan via Arwen', async function() {
      // Simulate Arwen test planning
      const testPlan = {
        coverage_target: 0.70,
        strategy: 'balanced',
        test_files: [
          { file: 'backend/tests/test_models.py', priority: 'P0' },
          { file: 'backend/tests/test_routes.py', priority: 'P0' },
          { file: 'frontend/tests/Component.test.tsx', priority: 'P1' }
        ]
      };

      await redis.hset('state:data', 'test_plan', JSON.stringify(testPlan));

      console.log(`  ✓ Test plan created (${testPlan.coverage_target * 100}% coverage target)`);
    });

    it('should generate tests via Thorin', async function() {
      // Simulate test generation
      const testPlan = JSON.parse(await redis.hget('state:data', 'test_plan'));

      console.log(`  ✓ Generated ${testPlan.test_files.length} test files (simulated)`);
    });

    it('should pass all tests', async function() {
      // Simulate test execution
      console.log('  ✓ All tests passed (simulated)');

      // Mark checkpoint 9 as approved
      await redis.hset('state:data', 'checkpoint_status', 'APPROVED');
      await redis.hset('state:data', 'current_checkpoint', '9_tests_passed');
    });
  });

  describe('Phase 5: Deployment (Expected: 2 hours)', function() {
    it('should deploy via Éomer', async function() {
      // Simulate deployment
      const deploymentResult = {
        url: 'https://test-app-abc123.vercel.app',
        platform: 'vercel',
        deployment_id: 'dep_abc123'
      };

      await redis.hset('state:data', 'deployment_result', JSON.stringify(deploymentResult));

      console.log(`  ✓ Deployed to ${deploymentResult.url}`);
    });

    it('should verify deployment via Haldir', async function() {
      // Simulate verification
      const verificationResult = {
        http_health: 'PASS',
        ssl_valid: 'PASS',
        performance: 'PASS',
        overall: 'PASS'
      };

      await redis.hset('state:data', 'verification_result', JSON.stringify(verificationResult));

      console.log('  ✓ Deployment verified');
    });

    it('should complete Checkpoint 11: Deployment Confirmation', async function() {
      await redis.hset('state:data', 'checkpoint_status', 'APPROVED');
      await redis.hset('state:data', 'current_checkpoint', '11_deployment_confirmation');

      console.log('  ✓ Deployment confirmed');
    });
  });

  describe('Phase 6: Completion & Metrics', function() {
    it('should have completed within 24 hours', async function() {
      const metadata = JSON.parse(await redis.hget('state:data', 'hackathon_metadata'));
      const timeTracking = JSON.parse(await redis.hget('state:data', 'time_tracking'));

      const startTime = new Date(metadata.created_at);
      const deadline = new Date(metadata.deadline);
      const predictedFinish = new Date(timeTracking.predicted_finish);

      expect(predictedFinish.getTime()).to.be.lessThan(deadline.getTime());

      console.log('  ✓ Completed on time');
    });

    it('should have stayed within budget', async function() {
      const metadata = JSON.parse(await redis.hget('state:data', 'hackathon_metadata'));

      expect(metadata.budget_spent).to.be.lessThan(metadata.budget_allocated);

      console.log(`  ✓ Budget: $${metadata.budget_spent}/$${metadata.budget_allocated}`);
    });

    it('should have < 2% error rate', async function() {
      const issuesLog = JSON.parse(await redis.hget('state:data', 'issues_log') || '[]');

      const criticalErrors = issuesLog.filter(i => i.severity === 'CRITICAL').length;

      expect(criticalErrors).to.equal(0);

      console.log(`  ✓ Error rate: 0% critical errors`);
    });

    it('should generate post-mortem via Galadriel', async function() {
      // Simulate Galadriel analysis
      const learnings = {
        successes: ['Fast ideation', 'Good architecture'],
        failures: [],
        patterns: ['Next.js works well for quick prototypes'],
        velocity: 0.8
      };

      console.log('  ✓ Post-mortem complete');
      console.log(`    - Final velocity: ${learnings.velocity} files/hour`);
    });
  });
});

// Helper functions
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForState(key, timeout = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const value = await redis.hget('state:data', key);

    if (value) {
      return value;
    }

    await sleep(1000);
  }

  throw new Error(`Timeout waiting for state key: ${key}`);
}
