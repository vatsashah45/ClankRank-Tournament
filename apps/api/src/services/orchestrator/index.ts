import type { MatchJob, MatchResult, MatchMetrics, SandboxConfig } from "@agent-madness/shared";
import type { SandboxAdapter } from "./adapters/types.js";
import type { IMatchQueue } from "./queue.js";
import { SandboxPool } from "./pool.js";
import { MetricsCollector } from "./metrics.js";
import { MockAdapter } from "./adapters/mock.js";
import { E2BAdapter } from "./adapters/e2b.js";
import { DaytonaAdapter } from "./adapters/daytona.js";
import { createQueue } from "./queue.js";

export { SandboxPool } from "./pool.js";
export { MetricsCollector } from "./metrics.js";
export { MockAdapter } from "./adapters/mock.js";
export { E2BAdapter } from "./adapters/e2b.js";
export { DaytonaAdapter } from "./adapters/daytona.js";
export { MockQueue, BullMQQueue, createQueue } from "./queue.js";
export type { IMatchQueue } from "./queue.js";
export type { SandboxAdapter } from "./adapters/types.js";

export interface OrchestratorOptions {
  sandboxRuntime?: "e2b" | "daytona" | "mock";
  redisUrl?: string;
  maxConcurrent?: number;
  timeoutMs?: number;
  queueName?: string;
}

/**
 * SandboxOrchestrator — ties together queue, pool, adapter, and metrics.
 *
 * Workflow per match:
 *   1. Dequeue MatchJob
 *   2. Acquire pool slot
 *   3. Provision sandbox (both agents run sequentially in mock mode)
 *   4. Execute with timeout enforcement
 *   5. Collect metrics
 *   6. Destroy sandbox
 *   7. Release pool slot
 *   8. Return MatchResult
 */
export class SandboxOrchestrator {
  private adapter: SandboxAdapter;
  private pool: SandboxPool;
  private queue: IMatchQueue;
  private timeoutMs: number;

  constructor(options: OrchestratorOptions = {}) {
    const {
      sandboxRuntime = "mock",
      redisUrl = "mock",
      maxConcurrent = 32,
      timeoutMs = 60000,
      queueName = "match-jobs",
    } = options;

    this.adapter = this.createAdapter(sandboxRuntime);
    this.pool = new SandboxPool(maxConcurrent);
    this.queue = createQueue(redisUrl, queueName);
    this.timeoutMs = timeoutMs;
  }

  private createAdapter(runtime: string): SandboxAdapter {
    switch (runtime) {
      case "e2b":
        return new E2BAdapter();
      case "daytona":
        return new DaytonaAdapter();
      case "mock":
      default:
        return new MockAdapter();
    }
  }

  /**
   * Enqueue a match job.
   */
  async enqueueMatch(job: MatchJob): Promise<string> {
    return this.queue.enqueue(job);
  }

  /**
   * Run a single match job end-to-end.
   * Returns MatchResult with scores for both agents.
   */
  async runMatch(job: MatchJob, middlewareUrl: string): Promise<MatchResult> {
    const sandboxConfigA: SandboxConfig = {
      agentId: job.agentAId,
      timeoutMs: this.timeoutMs,
    };
    const sandboxConfigB: SandboxConfig = {
      agentId: job.agentBId,
      timeoutMs: this.timeoutMs,
    };

    // Run both agents concurrently
    const [metricsA, metricsB] = await Promise.all([
      this.runSingleAgent(job.agentAId, job.matchId, job.roundNumber, sandboxConfigA, middlewareUrl),
      this.runSingleAgent(job.agentBId, job.matchId, job.roundNumber, sandboxConfigB, middlewareUrl),
    ]);

    const winnerId =
      metricsA.adjustedScore >= metricsB.adjustedScore ? job.entryAId : job.entryBId;

    return {
      matchId: job.matchId,
      round: job.roundNumber,
      entryAId: job.entryAId,
      entryBId: job.entryBId,
      agentAId: job.agentAId,
      agentBId: job.agentBId,
      metricsA,
      metricsB,
      winnerId,
      scoreA: metricsA.adjustedScore,
      scoreB: metricsB.adjustedScore,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Run a single agent with timeout enforcement and retry logic.
   * First failure → retry once. Second failure → score 0.
   */
  private async runSingleAgent(
    agentId: string,
    matchId: number,
    round: MatchJob["roundNumber"],
    config: SandboxConfig,
    middlewareUrl: string,
    attempt = 0,
  ): Promise<MatchMetrics> {
    const collector = new MetricsCollector(agentId, matchId, round);

    await this.pool.acquire();
    let instance = await this.adapter.provision(agentId, config);
    this.pool.registerInstance(instance);

    try {
      // Race the execution against the timeout
      const runPromise = this.adapter.execute(instance, middlewareUrl);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SANDBOX_TIMEOUT")), this.timeoutMs),
      );

      const result = await Promise.race([runPromise, timeoutPromise]);
      return collector.finalize(result, false);
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error && err.message === "SANDBOX_TIMEOUT";

      if (isTimeout) {
        return collector.buildTimeoutMetrics();
      }

      // Retry once on non-timeout errors
      if (attempt === 0) {
        // Cleanup handled by finally; retry with a fresh instance
        return this.runSingleAgent(agentId, matchId, round, config, middlewareUrl, 1);
      }

      // Second failure: score 0 (higher seed advances)
      return collector.buildTimeoutMetrics();
    } finally {
      await this.adapter.destroy(instance).catch(() => {});
      this.pool.release(instance.instanceId);
    }
  }

  /**
   * Start processing jobs from the queue.
   */
  startProcessing(middlewareUrlFn: (job: MatchJob) => string): void {
    this.queue.process(async (job) => {
      const url = middlewareUrlFn(job);
      await this.runMatch(job, url);
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
