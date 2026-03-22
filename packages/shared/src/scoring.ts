import type { ScoreResult, TierName } from "./types.js";
import { getTierForScore } from "./constants.js";

/**
 * Build a ScoreResult from a raw numeric score.
 *
 * Scoring is performed server-side via @valiron/sdk's
 * triggerSandboxTest() — this helper simply produces the
 * canonical { score, tier } shape from a numeric value.
 */
export function scoreResult(score: number): ScoreResult {
  const clamped = Math.max(0, Math.min(110, score));
  const tier: TierName = getTierForScore(clamped);
  return { score: clamped, tier };
}
