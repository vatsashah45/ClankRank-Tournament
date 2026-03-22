/**
 * Resilience Tests — Phase 5 (SYS-RES-6)
 *
 * Tests MockQueue processing, drain, factory, and queue health checks.
 */

import { describe, it, expect } from "vitest";
import { MockQueue, BullMQQueue, createQueue } from "../src/services/orchestrator/queue.js";
import type { MatchJob } from "@agent-madness/shared";

const sampleJob: MatchJob = {
  matchId: 10,
  roundNumber: "R64",
  agentAId: "resilience-agent-a",
  agentBId: "resilience-agent-b",
  entryAId: 10,
  entryBId: 20,
};

// ── MockQueue: basic enqueue/process ──

describe("MockQueue: basic enqueue/process", () => {
  it("enqueues a job and returns a string job ID", async () => {
    const queue = new MockQueue();
    const id = await queue.enqueue(sampleJob);
    expect(typeof id).toBe("string");
    expect(id.startsWith("mock-job-")).toBe(true);
  });

  it("jobs queue up when no handler is registered", async () => {
    const queue = new MockQueue();
    await queue.enqueue(sampleJob);
    await queue.enqueue({ ...sampleJob, matchId: 11 });
    expect(await queue.size()).toBe(2);
  });

  it("jobs are processed immediately when handler is registered first", async () => {
    const queue = new MockQueue();
    const processed: number[] = [];

    queue.process(async (job) => {
      processed.push(job.matchId);
    });

    await queue.enqueue(sampleJob);
    await queue.enqueue({ ...sampleJob, matchId: 12 });

    expect(processed).toContain(sampleJob.matchId);
    expect(processed).toContain(12);
  });

  it("size() returns 0 when jobs are processed immediately", async () => {
    const queue = new MockQueue();
    queue.process(async () => {});
    await queue.enqueue(sampleJob);
    expect(await queue.size()).toBe(0);
  });

  it("close() clears the handler so new enqueues are queued", async () => {
    const queue = new MockQueue();
    const processed: number[] = [];
    queue.process(async (job) => processed.push(job.matchId));

    await queue.close();
    await queue.enqueue(sampleJob);

    // Handler was cleared, so job should be queued, not processed
    expect(processed).toHaveLength(0);
    expect(await queue.size()).toBe(1);
  });
});

// ── MockQueue: drain ──

describe("MockQueue: drain", () => {
  it("drain() processes all queued jobs with the registered handler", async () => {
    const queue = new MockQueue();

    // Queue jobs before registering handler (they get stored)
    await queue.enqueue(sampleJob);
    await queue.enqueue({ ...sampleJob, matchId: 21 });
    await queue.enqueue({ ...sampleJob, matchId: 22 });

    const processed: number[] = [];
    queue.process(async (job) => {
      processed.push(job.matchId);
    });

    // process() already drains pre-queued jobs — all 3 should be processed
    // (drain via process() starts immediately)
    await queue.drain(); // any remaining

    // All 3 were queued before process() — they get drained in process() call
    expect(processed.length).toBe(3);
    expect(processed).toContain(10);
    expect(processed).toContain(21);
    expect(processed).toContain(22);
    // The jobs were already queued, process should have taken them
    expect(await queue.size()).toBe(0);
  });

  it("drain() does nothing when no handler is registered", async () => {
    const queue = new MockQueue();
    await queue.enqueue(sampleJob);
    await queue.drain(); // no handler — no-op
    expect(await queue.size()).toBe(1); // job still queued
  });

  it("drain() processes jobs in FIFO order", async () => {
    const queue = new MockQueue();
    const order: number[] = [];

    // First queue jobs (no handler yet)
    await queue.enqueue({ ...sampleJob, matchId: 100 });
    await queue.enqueue({ ...sampleJob, matchId: 101 });
    await queue.enqueue({ ...sampleJob, matchId: 102 });

    // Now register handler and let process() drain them
    queue.process(async (job) => {
      order.push(job.matchId);
    });

    // process() drains synchronously
    expect(order[0]).toBe(100);
    expect(order[1]).toBe(101);
    expect(order[2]).toBe(102);
  });
});

// ── createQueue factory ──

describe("createQueue: returns correct queue type", () => {
  it("returns MockQueue when redisUrl is 'mock'", () => {
    const queue = createQueue("mock");
    expect(queue).toBeInstanceOf(MockQueue);
  });

  it("returns BullMQQueue when redisUrl is a real Redis URL", () => {
    const queue = createQueue("redis://localhost:6379", "test-queue");
    expect(queue).toBeInstanceOf(BullMQQueue);
    // Don't actually connect — just verify type and close gracefully
    queue.close().catch(() => {});
  });

  it("returns MockQueue for custom queue name when redisUrl is 'mock'", () => {
    const queue = createQueue("mock", "custom-queue-name");
    expect(queue).toBeInstanceOf(MockQueue);
  });
});

// ── Queue health check ──

describe("Queue health check: getQueueHealth()", () => {
  it("MockQueue.getQueueHealth() returns status=mock", async () => {
    const queue = new MockQueue();
    const health = await queue.getQueueHealth();
    expect(health.status).toBe("mock");
    expect(typeof health.size).toBe("number");
  });

  it("MockQueue.getQueueHealth() reflects current queue size", async () => {
    const queue = new MockQueue();
    await queue.enqueue(sampleJob);
    await queue.enqueue({ ...sampleJob, matchId: 999 });
    const health = await queue.getQueueHealth();
    expect(health.size).toBe(2);
  });

  it("MockQueue.getQueueHealth() shows 0 size after processing", async () => {
    const queue = new MockQueue();
    queue.process(async () => {}); // register handler to process immediately
    await queue.enqueue(sampleJob);
    const health = await queue.getQueueHealth();
    expect(health.size).toBe(0);
  });

  it("BullMQQueue.getQueueHealth() returns health object without connecting", async () => {
    const queue = new BullMQQueue("health-test-queue", "redis://localhost:6379");
    // Without connecting, size() returns 0
    const health = await queue.getQueueHealth();
    // Should either be ok (size 0) or error — not throw
    expect(["ok", "error"]).toContain(health.status);
    expect(typeof health.size).toBe("number");
    await queue.close().catch(() => {});
  });
});
