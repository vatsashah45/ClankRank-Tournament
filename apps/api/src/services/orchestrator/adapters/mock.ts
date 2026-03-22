import type { SandboxAdapter } from "./types.js";
import type {
  SandboxConfig,
  SandboxInstance,
  SandboxRunResult,
  RoundPenalties,
  RiskMetrics,
} from "@agent-madness/shared";

let instanceCounter = 0;

/**
 * MockAdapter — simulates agent HTTP behavior locally.
 *
 * Provisions a fake sandbox, then simulates an agent making HTTP requests
 * to the middleware harness URL. Collects realistic metrics without
 * requiring any external sandbox infrastructure.
 *
 * Used in tests and local development (SANDBOX_RUNTIME=mock).
 */
export class MockAdapter implements SandboxAdapter {
  async provision(agentId: string, _config: SandboxConfig): Promise<SandboxInstance> {
    instanceCounter++;
    return {
      instanceId: `mock-${agentId}-${instanceCounter}`,
      agentId,
      status: "ready",
      provisionedAt: new Date().toISOString(),
      metadata: { mock: true },
    };
  }

  async execute(
    instance: SandboxInstance,
    middlewareUrl: string,
  ): Promise<SandboxRunResult> {
    const startTime = Date.now();
    let totalRequests = 0;
    let errorCount = 0;
    let respected429 = true;
    let loops = 0;
    const latencies: number[] = [];
    const roundPenalties: RoundPenalties = {};

    // Simulate agent making 5–15 HTTP requests to the middleware
    const requestCount = 5 + Math.floor(Math.random() * 10);
    let consecutive429 = 0;
    let lastStatus = 0;
    let consecutiveSameError = 0;

    for (let i = 0; i < requestCount; i++) {
      const reqStart = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`${middlewareUrl}/sandbox/api/data`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - reqStart;
        latencies.push(latencyMs);
        totalRequests++;

        if (res.status === 429) {
          consecutive429++;
          if (consecutive429 >= 2) respected429 = false;
          const retryAfter = res.headers.get("retry-after");
          if (retryAfter) {
            const waitMs = parseInt(retryAfter, 10) * 1000;
            // Simulate respecting Retry-After (within 10% tolerance)
            if (waitMs > 0 && waitMs <= 15000) {
              await new Promise((r) => setTimeout(r, Math.min(waitMs, 500)));
              roundPenalties.backoffAccuracy = 0.9;
            }
          }
        } else if (res.status >= 400) {
          consecutive429 = 0;
          errorCount++;
        } else if (res.status === 200) {
          consecutive429 = 0;
          // Try to parse response body
          try {
            const text = await res.text();
            JSON.parse(text);
            roundPenalties.jsonParseRecovery = (roundPenalties.jsonParseRecovery ?? 0) + 0.1;
          } catch {
            // Malformed JSON — mark as recovered attempt
            roundPenalties.jsonParseRecovery = (roundPenalties.jsonParseRecovery ?? 0) + 0.05;
          }
        }
      } catch (err: unknown) {
        // Timeout or abort — counted as handled
        totalRequests++;
        errorCount++;
        roundPenalties.timeoutHandling = 0.8;
        if (err instanceof Error && err.name === "AbortError") {
          // timeout handled gracefully
        }
      }
    }

    // Detect loops from consecutive identical non-200 statuses
    // (simplified: if any errors occurred, flag as potential loop)
    if (errorCount >= 3) {
      loops = Math.floor(errorCount / 3);
    }

    // Normalize jsonParseRecovery to 0-1
    if (roundPenalties.jsonParseRecovery !== undefined) {
      roundPenalties.jsonParseRecovery = Math.min(1, roundPenalties.jsonParseRecovery);
    }

    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;

    // Compute burstiness: std dev / mean of latencies
    let burstiness = 0;
    if (latencies.length > 1) {
      const mean = avgLatency;
      const variance =
        latencies.reduce((sum, l) => sum + (l - mean) ** 2, 0) / latencies.length;
      burstiness = Math.sqrt(variance) / (mean || 1);
      burstiness = Math.min(1, burstiness);
    }

    const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;

    const metrics: RiskMetrics = {
      respected429,
      loops,
      totalRequests,
      errorRate,
      averageLatency: avgLatency,
      burstiness,
    };

    const durationMs = Date.now() - startTime;

    return {
      instanceId: instance.instanceId,
      agentId: instance.agentId,
      success: true,
      timedOut: false,
      metrics,
      roundPenalties,
      durationMs,
    };
  }

  async destroy(_instance: SandboxInstance): Promise<void> {
    // No-op for mock: nothing to clean up
  }
}
