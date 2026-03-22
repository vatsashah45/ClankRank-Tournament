import type { MatchJob } from "@clankrank/shared";

/**
 * IMatchQueue — shared interface for both BullMQ and in-memory MockQueue.
 */
export interface IMatchQueue {
  enqueue(job: MatchJob): Promise<string>;
  process(handler: (job: MatchJob) => Promise<void>): Promise<void>;
  close(): Promise<void>;
  size(): Promise<number>;
  getQueueHealth(): Promise<{ status: string; size: number; error?: string }>;
}

/**
 * MockQueue — in-memory job queue for testing without Redis.
 *
 * Same interface as BullMQ queue. Jobs are processed synchronously
 * when a handler is registered, or queued for manual draining.
 */
export class MockQueue implements IMatchQueue {
  private jobs: Array<{ id: string; job: MatchJob }>;
  private handler: ((job: MatchJob) => Promise<void>) | null;
  private jobCounter: number;

  constructor() {
    this.jobs = [];
    this.handler = null;
    this.jobCounter = 0;
  }

  async enqueue(job: MatchJob): Promise<string> {
    this.jobCounter++;
    const id = `mock-job-${this.jobCounter}`;
    if (this.handler) {
      // Process immediately
      await this.handler(job);
    } else {
      this.jobs.push({ id, job });
    }
    return id;
  }

  async process(handler: (job: MatchJob) => Promise<void>): Promise<void> {
    this.handler = handler;
    // Drain any queued jobs and await completion
    await this.drain();
  }

  async close(): Promise<void> {
    this.handler = null;
  }

  async size(): Promise<number> {
    return this.jobs.length;
  }

  async getQueueHealth(): Promise<{ status: string; size: number; error?: string }> {
    return { status: "mock", size: this.jobs.length };
  }

  /** Test helper: drain all queued jobs with the current handler. */
  async drain(): Promise<void> {
    if (!this.handler) return;
    const pending = this.jobs.splice(0);
    for (const { job } of pending) {
      await this.handler(job);
    }
  }
}

/**
 * BullMQQueue — production queue backed by Redis via BullMQ.
 *
 * Falls back to MockQueue when REDIS_URL=mock.
 */
export class BullMQQueue implements IMatchQueue {
  private queueName: string;
  private redisUrl: string;
  // Lazily imported to avoid requiring bullmq in tests
  private bullQueue: unknown = null;
  private worker: unknown = null;

  constructor(queueName: string, redisUrl: string) {
    this.queueName = queueName;
    this.redisUrl = redisUrl;
  }

  private getConnection() {
    // Parse redis URL for ioredis connection options
    const url = new URL(this.redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || "6379", 10),
      password: url.password || undefined,
    };
  }

  async enqueue(job: MatchJob): Promise<string> {
    const { Queue } = await import("bullmq");
    if (!this.bullQueue) {
      this.bullQueue = new Queue(this.queueName, {
        connection: this.getConnection(),
      });
    }
    const q = this.bullQueue as InstanceType<typeof Queue>;
    const result = await q.add("match", job, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    return result.id ?? "unknown";
  }

  async process(handler: (job: MatchJob) => Promise<void>): Promise<void> {
    const { Worker } = await import("bullmq");
    const w = new Worker(
      this.queueName,
      async (bullJob) => {
        await handler(bullJob.data as MatchJob);
      },
      {
        connection: this.getConnection(),
        concurrency: 4,
        stalledInterval: 30000,
        maxStalledCount: 2,
      },
    );
    // Log job failures
    w.on("failed", (bullJob, err) => {
      console.error(`[BullMQ] Job ${bullJob?.id ?? "unknown"} failed:`, err.message);
    });
    this.worker = w;
  }

  async close(): Promise<void> {
    if (this.bullQueue) {
      await (this.bullQueue as { close(): Promise<void> }).close();
    }
    if (this.worker) {
      await (this.worker as { close(): Promise<void> }).close();
    }
  }

  async size(): Promise<number> {
    if (!this.bullQueue) return 0;
    return (this.bullQueue as { count(): Promise<number> }).count();
  }

  async getQueueHealth(): Promise<{ status: string; size: number; error?: string }> {
    try {
      const size = await this.size();
      return { status: "ok", size };
    } catch (err) {
      return { status: "error", size: 0, error: (err as Error).message };
    }
  }
}

/**
 * createQueue — factory that selects MockQueue or BullMQQueue based on redisUrl.
 */
export function createQueue(redisUrl: string, queueName = "match-jobs"): IMatchQueue {
  if (redisUrl === "mock") {
    return new MockQueue();
  }
  return new BullMQQueue(queueName, redisUrl);
}
