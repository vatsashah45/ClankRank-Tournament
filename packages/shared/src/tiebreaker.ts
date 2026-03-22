import type { MatchMetrics } from "./types.js";

/**
 * resolveTiebreak — SYS-SCORE-5
 *
 * Called when adjustedScoreA === adjustedScoreB.
 * Tiebreaker priority:
 *   1. Lower averageLatency wins
 *   2. Higher onChainAverageScore wins
 *   3. Lower totalRequests wins
 *   4. entryAId wins (deterministic fallback)
 *
 * Returns the winning entryId.
 */
export function resolveTiebreak(
  metricsA: MatchMetrics,
  entryAId: number,
  metricsB: MatchMetrics,
  entryBId: number,
): number {
  // 1. Lower latency wins
  if (metricsA.averageLatency !== metricsB.averageLatency) {
    return metricsA.averageLatency < metricsB.averageLatency ? entryAId : entryBId;
  }

  // 2. Higher on-chain average score wins (undefined treated as 0)
  const scoreA = metricsA.onChainAverageScore ?? 0;
  const scoreB = metricsB.onChainAverageScore ?? 0;
  if (scoreA !== scoreB) {
    return scoreA > scoreB ? entryAId : entryBId;
  }

  // 3. Lower totalRequests wins
  if (metricsA.totalRequests !== metricsB.totalRequests) {
    return metricsA.totalRequests < metricsB.totalRequests ? entryAId : entryBId;
  }

  // 4. Deterministic fallback: entryA wins
  return entryAId;
}
