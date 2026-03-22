import { describe, it, expect } from "vitest";
import { resolveTiebreak } from "../src/tiebreaker.js";
import type { MatchMetrics } from "../src/types.js";

function makeMetrics(overrides: Partial<MatchMetrics> = {}): MatchMetrics {
  return {
    agentId: "agent-test",
    matchId: 1,
    round: "R64",
    respected429: true,
    loops: 0,
    totalRequests: 10,
    errorRate: 0,
    averageLatency: 100,
    burstiness: 0.1,
    roundPenalties: {},
    baseScore: 90,
    adjustedScore: 90,
    tier: "A",
    durationMs: 500,
    timedOut: false,
    rawJson: "{}",
    onChainAverageScore: 80,
    ...overrides,
  };
}

describe("resolveTiebreak (SYS-SCORE-5)", () => {
  it("lower averageLatency wins", () => {
    const metricsA = makeMetrics({ averageLatency: 50 });
    const metricsB = makeMetrics({ averageLatency: 150 });
    const winner = resolveTiebreak(metricsA, 1, metricsB, 2);
    expect(winner).toBe(1); // A wins (lower latency)
  });

  it("higher averageLatency loses", () => {
    const metricsA = makeMetrics({ averageLatency: 200 });
    const metricsB = makeMetrics({ averageLatency: 80 });
    const winner = resolveTiebreak(metricsA, 1, metricsB, 2);
    expect(winner).toBe(2); // B wins (lower latency)
  });

  it("higher on-chain score wins when latency tied", () => {
    const metricsA = makeMetrics({ averageLatency: 100, onChainAverageScore: 95 });
    const metricsB = makeMetrics({ averageLatency: 100, onChainAverageScore: 70 });
    const winner = resolveTiebreak(metricsA, 1, metricsB, 2);
    expect(winner).toBe(1); // A wins (higher on-chain score)
  });

  it("lower on-chain score loses when latency tied", () => {
    const metricsA = makeMetrics({ averageLatency: 100, onChainAverageScore: 50 });
    const metricsB = makeMetrics({ averageLatency: 100, onChainAverageScore: 90 });
    const winner = resolveTiebreak(metricsA, 1, metricsB, 2);
    expect(winner).toBe(2); // B wins (higher on-chain score)
  });

  it("lower totalRequests wins when latency + on-chain tied", () => {
    const metricsA = makeMetrics({
      averageLatency: 100,
      onChainAverageScore: 80,
      totalRequests: 5,
    });
    const metricsB = makeMetrics({
      averageLatency: 100,
      onChainAverageScore: 80,
      totalRequests: 15,
    });
    const winner = resolveTiebreak(metricsA, 1, metricsB, 2);
    expect(winner).toBe(1); // A wins (lower requests)
  });

  it("entryA wins when all metrics are tied (deterministic fallback)", () => {
    const metricsA = makeMetrics({
      averageLatency: 100,
      onChainAverageScore: 80,
      totalRequests: 10,
    });
    const metricsB = makeMetrics({
      averageLatency: 100,
      onChainAverageScore: 80,
      totalRequests: 10,
    });
    const winner = resolveTiebreak(metricsA, 1, metricsB, 2);
    expect(winner).toBe(1); // A wins (deterministic fallback)
  });

  it("tiebreaker priority: latency checked before on-chain score", () => {
    // A has worse latency but better on-chain score — latency wins
    const metricsA = makeMetrics({ averageLatency: 200, onChainAverageScore: 99 });
    const metricsB = makeMetrics({ averageLatency: 100, onChainAverageScore: 50 });
    const winner = resolveTiebreak(metricsA, 1, metricsB, 2);
    expect(winner).toBe(2); // B wins (lower latency takes priority)
  });

  it("works with extreme values (0 latency)", () => {
    const metricsA = makeMetrics({ averageLatency: 0 });
    const metricsB = makeMetrics({ averageLatency: 1 });
    const winner = resolveTiebreak(metricsA, 10, metricsB, 20);
    expect(winner).toBe(10); // A wins (0 latency)
  });

  it("tiebreaker priority: on-chain checked before requests", () => {
    // A has worse on-chain but fewer requests — on-chain wins
    const metricsA = makeMetrics({
      averageLatency: 100,
      onChainAverageScore: 40,
      totalRequests: 3,
    });
    const metricsB = makeMetrics({
      averageLatency: 100,
      onChainAverageScore: 90,
      totalRequests: 50,
    });
    const winner = resolveTiebreak(metricsA, 1, metricsB, 2);
    expect(winner).toBe(2); // B wins (higher on-chain takes priority over lower requests)
  });
});
