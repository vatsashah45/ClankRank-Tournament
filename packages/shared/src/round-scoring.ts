import type { RoundPenalties, ScoreResult } from "./types.js";
import type { RoundName } from "./types.js";
import { getTierForScore } from "./constants.js";

/**
 * computeRoundPenalties — calculate the total round-specific penalty amount.
 *
 * Penalty table (from build plan):
 *   R2: backoffAccuracy < 0.5 → -15; < 0.8 → -8; >= 0.8 → 0
 *   R3: jsonParseRecovery, timeoutHandling, redirectFollowing each up to -10, combined max -25
 *   R4: sequenceAccuracy < 0.5 → -20; < 0.8 → -10; stepCompletionRate < 0.5 → -15; < 0.8 → -8
 *   R5: concurrencyResilience < 0.5 → -15; < 0.8 → -8; stateConsistency < 0.5 → -15; < 0.8 → -8
 *   R6: discoverySpeed < 0.5 → -10; schemaAdaptation < 0.5 → -15; novelEndpointSuccess < 0.5 → -20
 */
export function computeRoundPenalties(
  penalties: RoundPenalties,
  round: RoundName,
): number {
  let totalPenalty = 0;

  // R2 and above: backoff accuracy penalty
  if (round !== "R64") {
    const backoffAccuracy = penalties.backoffAccuracy ?? 1;
    if (backoffAccuracy < 0.5) {
      totalPenalty -= 15;
    } else if (backoffAccuracy < 0.8) {
      totalPenalty -= 8;
    }
  }

  // R3 and above: adversarial payload penalties
  if (round === "R16" || round === "QF" || round === "SF" || round === "CHAMPIONSHIP") {
    let r3Penalty = 0;
    const jsonParseRecovery = penalties.jsonParseRecovery ?? 1;
    const timeoutHandling = penalties.timeoutHandling ?? 1;
    const redirectFollowing = penalties.redirectFollowing ?? 1;

    if (jsonParseRecovery < 0.5) r3Penalty += 10;
    else if (jsonParseRecovery < 0.8) r3Penalty += 5;

    if (timeoutHandling < 0.5) r3Penalty += 10;
    else if (timeoutHandling < 0.8) r3Penalty += 5;

    if (redirectFollowing < 0.5) r3Penalty += 10;
    else if (redirectFollowing < 0.8) r3Penalty += 5;

    // Combined max -25
    totalPenalty -= Math.min(r3Penalty, 25);
  }

  // R4 and above: orchestration penalties
  if (round === "QF" || round === "SF" || round === "CHAMPIONSHIP") {
    const sequenceAccuracy = penalties.sequenceAccuracy ?? 1;
    const stepCompletionRate = penalties.stepCompletionRate ?? 1;

    if (sequenceAccuracy < 0.5) totalPenalty -= 20;
    else if (sequenceAccuracy < 0.8) totalPenalty -= 10;

    if (stepCompletionRate < 0.5) totalPenalty -= 15;
    else if (stepCompletionRate < 0.8) totalPenalty -= 8;
  }

  // R5 and above: concurrent load penalties
  if (round === "SF" || round === "CHAMPIONSHIP") {
    const concurrencyResilience = penalties.concurrencyResilience ?? 1;
    const stateConsistency = penalties.stateConsistency ?? 1;

    if (concurrencyResilience < 0.5) totalPenalty -= 15;
    else if (concurrencyResilience < 0.8) totalPenalty -= 8;

    if (stateConsistency < 0.5) totalPenalty -= 15;
    else if (stateConsistency < 0.8) totalPenalty -= 8;
  }

  // R6: zero-shot adaptation penalties
  if (round === "CHAMPIONSHIP") {
    const discoverySpeed = penalties.discoverySpeed ?? 1;
    const schemaAdaptation = penalties.schemaAdaptation ?? 1;
    const novelEndpointSuccess = penalties.novelEndpointSuccess ?? 1;

    if (discoverySpeed < 0.5) totalPenalty -= 10;
    else if (discoverySpeed < 0.8) totalPenalty -= 5;

    if (schemaAdaptation < 0.5) totalPenalty -= 15;
    else if (schemaAdaptation < 0.8) totalPenalty -= 8;

    if (novelEndpointSuccess < 0.5) totalPenalty -= 20;
    else if (novelEndpointSuccess < 0.8) totalPenalty -= 10;
  }

  return totalPenalty;
}

/**
 * computeMatchScore — compute the final match score for an agent run.
 *
 * Combines a base score (from @valiron/sdk) with round-specific penalties.
 * Score is clamped to 0-110.
 */
export function computeMatchScore(
  baseScore: number,
  penalties: RoundPenalties,
  round: RoundName,
): ScoreResult {
  const roundPenalty = computeRoundPenalties(penalties, round);
  const adjusted = Math.max(0, Math.min(110, baseScore + roundPenalty));
  const tier = getTierForScore(adjusted);
  return { score: adjusted, tier };
}
