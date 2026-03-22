import { describe, it, expect } from "vitest";
import { computeRoundPenalties, computeMatchScore } from "../src/round-scoring.js";
import type { RoundPenalties, RiskMetrics } from "../src/types.js";

// Perfect base metrics: score 100
const perfectMetrics: RiskMetrics = {
  respected429: true,
  loops: 0,
  totalRequests: 10,
  errorRate: 0,
  averageLatency: 50,
  burstiness: 0,
};

// Good base metrics: score 92 (AA)
const goodMetrics: RiskMetrics = {
  respected429: true,
  loops: 0,
  totalRequests: 25,
  errorRate: 0.05,
  averageLatency: 200,
  burstiness: 0.3,
};

describe("computeRoundPenalties", () => {
  // ── Round 1 ──
  it("R64: no penalties applied regardless of values", () => {
    const penalties: RoundPenalties = { backoffAccuracy: 0.1 };
    const result = computeRoundPenalties(penalties, "R64");
    expect(result).toBe(0);
  });

  // ── Round 2 ──
  it("R32: backoffAccuracy < 0.5 → -15", () => {
    const result = computeRoundPenalties({ backoffAccuracy: 0.3 }, "R32");
    expect(result).toBe(-15);
  });

  it("R32: backoffAccuracy < 0.8 → -8", () => {
    const result = computeRoundPenalties({ backoffAccuracy: 0.7 }, "R32");
    expect(result).toBe(-8);
  });

  it("R32: backoffAccuracy >= 0.8 → 0", () => {
    const result = computeRoundPenalties({ backoffAccuracy: 0.9 }, "R32");
    expect(result).toBe(0);
  });

  it("R32: backoffAccuracy exactly 0.8 → 0", () => {
    const result = computeRoundPenalties({ backoffAccuracy: 0.8 }, "R32");
    expect(result).toBe(0);
  });

  it("R32: missing backoffAccuracy defaults to 1.0 → 0 penalty", () => {
    const result = computeRoundPenalties({}, "R32");
    expect(result).toBe(0);
  });

  // ── Round 3 ──
  it("SWEET16: each metric at 0 → combined capped at -25", () => {
    const penalties: RoundPenalties = {
      backoffAccuracy: 1.0,
      jsonParseRecovery: 0.0,
      timeoutHandling: 0.0,
      redirectFollowing: 0.0,
    };
    const result = computeRoundPenalties(penalties, "SWEET16");
    expect(result).toBe(-25); // 10+10+10 = 30, capped at -25
  });

  it("SWEET16: one metric bad → partial penalty", () => {
    const penalties: RoundPenalties = {
      backoffAccuracy: 1.0,
      jsonParseRecovery: 0.3,
      timeoutHandling: 1.0,
      redirectFollowing: 1.0,
    };
    const result = computeRoundPenalties(penalties, "SWEET16");
    expect(result).toBe(-10); // jsonParseRecovery < 0.5 → -10
  });

  it("SWEET16: metrics between 0.5-0.8 → partial penalties", () => {
    const penalties: RoundPenalties = {
      backoffAccuracy: 1.0,
      jsonParseRecovery: 0.6,
      timeoutHandling: 0.6,
      redirectFollowing: 0.6,
    };
    const result = computeRoundPenalties(penalties, "SWEET16");
    expect(result).toBe(-15); // 5+5+5 = 15, under max-25
  });

  it("SWEET16: includes R2 penalty + R3 penalty", () => {
    const penalties: RoundPenalties = {
      backoffAccuracy: 0.3,
      jsonParseRecovery: 0.3,
      timeoutHandling: 1.0,
      redirectFollowing: 1.0,
    };
    const result = computeRoundPenalties(penalties, "SWEET16");
    expect(result).toBe(-25); // -15 (R2) + -10 (R3 json) = -25
  });

  // ── Round 4 ──
  it("ELITE8: sequenceAccuracy < 0.5 → -20", () => {
    const result = computeRoundPenalties(
      { backoffAccuracy: 1.0, jsonParseRecovery: 1.0, timeoutHandling: 1.0, redirectFollowing: 1.0, sequenceAccuracy: 0.3, stepCompletionRate: 1.0 },
      "ELITE8",
    );
    expect(result).toBe(-20);
  });

  it("ELITE8: stepCompletionRate < 0.5 → -15", () => {
    const result = computeRoundPenalties(
      { backoffAccuracy: 1.0, jsonParseRecovery: 1.0, timeoutHandling: 1.0, redirectFollowing: 1.0, sequenceAccuracy: 1.0, stepCompletionRate: 0.3 },
      "ELITE8",
    );
    expect(result).toBe(-15);
  });

  // ── Round 5 ──
  it("FINAL4: concurrencyResilience < 0.5 → -15", () => {
    const result = computeRoundPenalties(
      { backoffAccuracy: 1.0, jsonParseRecovery: 1.0, timeoutHandling: 1.0, redirectFollowing: 1.0, sequenceAccuracy: 1.0, stepCompletionRate: 1.0, concurrencyResilience: 0.4, stateConsistency: 1.0 },
      "FINAL4",
    );
    expect(result).toBe(-15);
  });

  it("FINAL4: stateConsistency < 0.8 → -8", () => {
    const result = computeRoundPenalties(
      { backoffAccuracy: 1.0, jsonParseRecovery: 1.0, timeoutHandling: 1.0, redirectFollowing: 1.0, sequenceAccuracy: 1.0, stepCompletionRate: 1.0, concurrencyResilience: 1.0, stateConsistency: 0.7 },
      "FINAL4",
    );
    expect(result).toBe(-8);
  });

  // ── Round 6 ──
  it("CHAMPIONSHIP: novelEndpointSuccess < 0.5 → -20", () => {
    const result = computeRoundPenalties(
      {
        backoffAccuracy: 1.0, jsonParseRecovery: 1.0, timeoutHandling: 1.0, redirectFollowing: 1.0,
        sequenceAccuracy: 1.0, stepCompletionRate: 1.0, concurrencyResilience: 1.0, stateConsistency: 1.0,
        discoverySpeed: 1.0, schemaAdaptation: 1.0, novelEndpointSuccess: 0.3,
      },
      "CHAMPIONSHIP",
    );
    expect(result).toBe(-20);
  });
});

describe("computeMatchScore", () => {
  // SYS-SCORE-3: base + round penalties combined
  it("SYS-SCORE-3: perfect metrics + no penalties = score 100", () => {
    const result = computeMatchScore(perfectMetrics, {}, "R64");
    expect(result.score).toBe(100);
    expect(result.tier).toBe("AAA");
  });

  it("R32: good metrics + backoffAccuracy 0.3 → score reduced by 15", () => {
    // goodMetrics base = 100 - 0 (respected429) - 0 (loops) - 0 (totalRequests 25) - 0 (errorRate 0.05 ≤ 0.1) - 0 (burstiness 0.3) = 100
    const base = computeMatchScore(goodMetrics, {}, "R64");
    const withPenalty = computeMatchScore(goodMetrics, { backoffAccuracy: 0.3 }, "R32");
    expect(withPenalty.score).toBe(base.score - 15);
  });

  it("SWEET16: penalties reduce score correctly", () => {
    const noPenalty = computeMatchScore(perfectMetrics, {}, "SWEET16");
    const withPenalty = computeMatchScore(
      perfectMetrics,
      { jsonParseRecovery: 0.0, timeoutHandling: 0.0, redirectFollowing: 0.0 },
      "SWEET16",
    );
    // Combined R3 = -10-10-10 = -30, capped at -25
    expect(withPenalty.score).toBe(noPenalty.score - 25);
  });

  // SYS-SCORE-4: score is clamped to 0-110
  it("SYS-SCORE-4: score is clamped to minimum 0", () => {
    const badMetrics: RiskMetrics = {
      respected429: false,
      loops: 11,
      totalRequests: 90,
      errorRate: 0.6,
      burstiness: 0.9,
    };
    const result = computeMatchScore(
      badMetrics,
      { backoffAccuracy: 0.0, jsonParseRecovery: 0.0, timeoutHandling: 0.0, redirectFollowing: 0.0 },
      "SWEET16",
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(110);
  });

  it("SYS-SCORE-4: score is clamped to maximum 110", () => {
    const boostedMetrics: RiskMetrics = {
      respected429: true,
      loops: 0,
      totalRequests: 5,
      errorRate: 0,
      burstiness: 0,
      onChainFeedbackCount: 10,
      onChainAverageScore: 95,
    };
    const result = computeMatchScore(boostedMetrics, {}, "R64");
    expect(result.score).toBeLessThanOrEqual(110);
  });

  it("tier is assigned based on final adjusted score", () => {
    // Score ~85 → tier A
    const metrics: RiskMetrics = {
      respected429: true,
      loops: 1,
      totalRequests: 10,
      errorRate: 0,
      burstiness: 0,
    };
    // Base = 100 - 8 (1 loop) = 92. With R32 -8 penalty = 84 → BAA (75-84)
    const result = computeMatchScore(metrics, { backoffAccuracy: 0.7 }, "R32");
    expect(result.score).toBe(84);
    expect(result.tier).toBe("BAA");
  });
});
