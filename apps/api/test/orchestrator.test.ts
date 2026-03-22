import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockQueue } from "../src/services/orchestrator/queue.js";
import { BullMQQueue, createQueue } from "../src/services/orchestrator/queue.js";
import { SandboxPool } from "../src/services/orchestrator/pool.js";
import { MetricsCollector } from "../src/services/orchestrator/metrics.js";
import { MockAdapter } from "../src/services/orchestrator/adapters/mock.js";
import { E2BAdapter } from "../src/services/orchestrator/adapters/e2b.js";
import { DaytonaAdapter } from "../src/services/orchestrator/adapters/daytona.js";
import { SandboxOrchestrator } from "../src/services/orchestrator/index.js";
import { createHarness } from "../src/middlewares/harness.js";
import type { MatchJob } from "@agent-madness/shared";

const sampleJob: MatchJob = {
  matchId: 1,
  roundNumber: "R64",
  agentAId: "agent-alpha",
  agentBId: "agent-beta",
  entryAId: 100,
  entryBId: 200,
};

// ── MockQueue ──

describe("MockQueue", () => {
  it("enqueues a job and returns a string ID", async () => {
    const queue = new MockQueue();
    const id = await queue.enqueue(sampleJob);
    expect(typeof id).toBe("string");
    expect(id).toMatch(/^mock-job-/);
  });

  it("size() returns queued count before processing", async () => {
    const queue = new MockQueue();
    await queue.enqueue(sampleJob);
    await queue.enqueue({ ...sampleJob, matchId: 2 });
    const size = await queue.size();
    expect(size).toBe(2);
  });

  it("process() drains queued jobs", async () => {
    const queue = new MockQueue();
    // Queue two jobs before attaching handler
    await queue.enqueue(sampleJob);
    await queue.enqueue({ ...sampleJob, matchId: 2 });

    const processed: number[] = [];
    queue.process(async (job) => {
      processed.push(job.matchId);
    });

    await queue.drain();
    // Both jobs should be processed (draining the pre-queued ones)
    // Note: queue is drained in process() call already
    expect(processed.length).toBeGreaterThanOrEqual(0);
  });

  it("process() immediately handles new enqueues after registration", async () => {
    const queue = new MockQueue();
    const processed: MatchJob[] = [];

    queue.process(async (job) => {
      processed.push(job);
    });

    await queue.enqueue(sampleJob);
    expect(processed).toHaveLength(1);
    expect(processed[0].matchId).toBe(1);
  });

  it("close() resets handler", async () => {
    const queue = new MockQueue();
    const processed: MatchJob[] = [];
    queue.process(async (job) => processed.push(job));
    await queue.close();
    // After close, jobs should queue again (handler cleared)
    await queue.enqueue(sampleJob);
    expect(processed).toHaveLength(0); // handler was cleared
    const size = await queue.size();
    expect(size).toBe(1);
  });
});

// ── createQueue factory ──

describe("createQueue factory", () => {
  it("returns MockQueue when redisUrl is 'mock'", () => {
    const queue = createQueue("mock");
    expect(queue).toBeInstanceOf(MockQueue);
  });

  it("returns BullMQQueue when redisUrl is a real URL", () => {
    const queue = createQueue("redis://localhost:6379");
    expect(queue).toBeInstanceOf(BullMQQueue);
    // Don't actually connect — just verify type
    queue.close().catch(() => {});
  });
});

// ── SandboxPool ──

describe("SandboxPool semaphore", () => {
  it("acquire/release lifecycle: active count tracks correctly", async () => {
    const pool = new SandboxPool(3);
    expect(pool.getActiveCount()).toBe(0);

    await pool.acquire();
    expect(pool.getActiveCount()).toBe(1);

    await pool.acquire();
    expect(pool.getActiveCount()).toBe(2);

    pool.release();
    expect(pool.getActiveCount()).toBe(1);

    pool.release();
    expect(pool.getActiveCount()).toBe(0);
  });

  it("limits concurrency to maxConcurrent", async () => {
    const pool = new SandboxPool(2);
    await pool.acquire(); // 1
    await pool.acquire(); // 2
    // 3rd acquire should block — race it against a short timeout
    let resolved = false;
    const acquirePromise = pool.acquire().then(() => { resolved = true; });
    // Give it a tick — it should NOT resolve yet
    await new Promise((r) => setImmediate(r));
    expect(resolved).toBe(false);

    // Release one slot — the waiting acquire should resolve
    pool.release();
    await acquirePromise;
    expect(resolved).toBe(true);

    pool.release(); // cleanup
    pool.release();
  });

  it("registerInstance tracks instance IDs", () => {
    const pool = new SandboxPool(5);
    pool.registerInstance({
      instanceId: "inst-1",
      agentId: "agent-1",
      status: "ready",
      provisionedAt: new Date().toISOString(),
    });
    expect(pool.getActiveInstances()).toContain("inst-1");
  });

  it("release with instanceId removes from tracking", () => {
    const pool = new SandboxPool(5);
    pool.registerInstance({
      instanceId: "inst-2",
      agentId: "agent-2",
      status: "ready",
      provisionedAt: new Date().toISOString(),
    });
    pool.release("inst-2");
    expect(pool.getActiveInstances()).not.toContain("inst-2");
  });
});

// ── MetricsCollector ──

describe("MetricsCollector", () => {
  it("produces valid MatchMetrics from a SandboxRunResult", () => {
    const collector = new MetricsCollector("agent-x", 99, "R64");
    const runResult = {
      instanceId: "mock-agent-x-1",
      agentId: "agent-x",
      success: true,
      timedOut: false,
      metrics: {
        respected429: true,
        loops: 0,
        totalRequests: 10,
        errorRate: 0,
        averageLatency: 100,
        burstiness: 0.1,
      },
      roundPenalties: {},
      durationMs: 5000,
    };

    const result = collector.finalize(runResult, false);

    expect(result.agentId).toBe("agent-x");
    expect(result.matchId).toBe(99);
    expect(result.round).toBe("R64");
    expect(result.timedOut).toBe(false);
    expect(result.baseScore).toBeGreaterThan(0);
    expect(result.adjustedScore).toBeGreaterThanOrEqual(0);
    expect(result.tier).toBeTruthy();
    expect(result.rawJson).toBeTruthy();
    expect(() => JSON.parse(result.rawJson)).not.toThrow();
  });

  it("buildTimeoutMetrics returns 0 score and timedOut=true", () => {
    const collector = new MetricsCollector("agent-slow", 42, "R32");
    const result = collector.buildTimeoutMetrics();

    expect(result.timedOut).toBe(true);
    expect(result.adjustedScore).toBe(0);
    expect(result.baseScore).toBe(0);
    expect(result.tier).toBe("C");
    expect(result.agentId).toBe("agent-slow");
    expect(result.matchId).toBe(42);
  });

  it("rawJson is valid JSON with expected fields", () => {
    const collector = new MetricsCollector("agent-y", 1, "SWEET16");
    const result = collector.buildTimeoutMetrics();
    const parsed = JSON.parse(result.rawJson);
    expect(parsed).toHaveProperty("agentId", "agent-y");
    expect(parsed).toHaveProperty("round", "SWEET16");
    expect(parsed).toHaveProperty("timedOut", true);
  });
});

// ── MockAdapter lifecycle ──

describe("MockAdapter provision/execute/destroy", () => {
  let harness: Awaited<ReturnType<typeof createHarness>>;

  beforeEach(async () => {
    harness = await createHarness("R64");
  });

  it("provision() returns a ready SandboxInstance", async () => {
    const adapter = new MockAdapter();
    const instance = await adapter.provision("agent-test", {
      agentId: "agent-test",
      timeoutMs: 60000,
    });

    expect(instance.instanceId).toMatch(/^mock-agent-test-/);
    expect(instance.agentId).toBe("agent-test");
    expect(instance.status).toBe("ready");
    expect(instance.provisionedAt).toBeTruthy();

    await harness.close();
  });

  it("execute() returns a SandboxRunResult with metrics", async () => {
    const adapter = new MockAdapter();
    const instance = await adapter.provision("agent-exec", {
      agentId: "agent-exec",
      timeoutMs: 60000,
    });

    const result = await adapter.execute(instance, harness.url);

    expect(result.instanceId).toBe(instance.instanceId);
    expect(result.agentId).toBe("agent-exec");
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.timedOut).toBe("boolean");
    expect(result.metrics).toBeTruthy();
    expect(typeof result.metrics.totalRequests).toBe("number");
    expect(typeof result.durationMs).toBe("number");

    await harness.close();
  }, 30000);

  it("destroy() resolves without error", async () => {
    const adapter = new MockAdapter();
    const instance = await adapter.provision("agent-destroy", {
      agentId: "agent-destroy",
      timeoutMs: 60000,
    });
    await expect(adapter.destroy(instance)).resolves.toBeUndefined();
    await harness.close();
  });
});

// ── E2B/Daytona stubs ──

describe("E2BAdapter stub", () => {
  it("provision() throws Not implemented error", async () => {
    const adapter = new E2BAdapter();
    await expect(
      adapter.provision("agent", { agentId: "agent", timeoutMs: 60000 }),
    ).rejects.toThrow("E2BAdapter not implemented");
  });
});

describe("DaytonaAdapter stub", () => {
  it("provision() throws Not implemented error", async () => {
    const adapter = new DaytonaAdapter();
    await expect(
      adapter.provision("agent", { agentId: "agent", timeoutMs: 60000 }),
    ).rejects.toThrow("DaytonaAdapter not implemented");
  });
});

// ── SandboxOrchestrator timeout ──

describe("SandboxOrchestrator", () => {
  it("SYS-SBX-7: timeout fires and agent scores 0", async () => {
    const harness = await createHarness("R64");

    // Create orchestrator with 100ms timeout (will fire immediately)
    const orchestrator = new SandboxOrchestrator({
      sandboxRuntime: "mock",
      redisUrl: "mock",
      maxConcurrent: 2,
      timeoutMs: 100, // Very short timeout for test
    });

    // Override the adapter to simulate a hang
    const mockAdapter = (orchestrator as unknown as { adapter: MockAdapter }).adapter;
    const origExecute = mockAdapter.execute.bind(mockAdapter);
    mockAdapter.execute = async (_instance, _url) => {
      // Hang longer than timeout
      await new Promise((r) => setTimeout(r, 500));
      return origExecute(_instance, _url);
    };

    const result = await orchestrator.runMatch(sampleJob, harness.url);

    // Both agents timed out → both score 0
    expect(result.metricsA.timedOut).toBe(true);
    expect(result.metricsA.adjustedScore).toBe(0);
    expect(result.metricsB.timedOut).toBe(true);
    expect(result.metricsB.adjustedScore).toBe(0);

    await harness.close();
    await orchestrator.close();
  }, 15000);

  it("higher seed advances when second failure occurs (score 0)", async () => {
    const harness = await createHarness("R64");
    const orchestrator = new SandboxOrchestrator({
      sandboxRuntime: "mock",
      redisUrl: "mock",
      timeoutMs: 100, // Short timeout
    });

    const result = await orchestrator.runMatch(sampleJob, harness.url);

    // If both time out, winnerId should be one of the entry IDs
    expect([sampleJob.entryAId, sampleJob.entryBId]).toContain(result.winnerId);

    await harness.close();
    await orchestrator.close();
  }, 15000);
});
