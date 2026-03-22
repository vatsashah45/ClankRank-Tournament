/**
 * Bracket Prediction Scoring
 *
 * Escalating point system — correct picks in later rounds are worth more:
 *   R64: 1 pt, R32: 2 pts, R16: 4 pts, QF: 8 pts, SF: 16 pts, CHAMPIONSHIP: 32 pts
 *
 * Total possible: 32×1 + 16×2 + 8×4 + 4×8 + 2×16 + 1×32 = 192 points
 */

import type { RoundName, BracketPicks, BracketMatchup } from "./types.js";

export const ROUND_POINTS: Record<RoundName, number> = {
  R64: 1,
  R32: 2,
  R16: 4,
  QF: 8,
  SF: 16,
  CHAMPIONSHIP: 32,
};

export const MAX_PREDICTION_SCORE = 192;

export const MATCHUPS_PER_ROUND: Record<RoundName, number> = {
  R64: 32,
  R32: 16,
  R16: 8,
  QF: 4,
  SF: 2,
  CHAMPIONSHIP: 1,
};

export interface PredictionScoreResult {
  score: number;
  correctPicks: number;
  maxPossibleScore: number;
  roundBreakdown: Record<RoundName, { correct: number; total: number; points: number }>;
}

/**
 * Score a bracket prediction against actual results.
 *
 * @param picks Bracket picks keyed by matchup ID.
 * @param allMatchups All bracket matchups (completed and future), where winnerId may be null for unplayed games.
 */
export function scorePrediction(
  picks: BracketPicks,
  allMatchups: BracketMatchup[],
): PredictionScoreResult {
  let score = 0;
  let correctPicks = 0;
  let maxPossibleScore = MAX_PREDICTION_SCORE;

  const roundBreakdown: Record<string, { correct: number; total: number; points: number }> = {};
  for (const round of Object.keys(ROUND_POINTS) as RoundName[]) {
    roundBreakdown[round] = { correct: 0, total: MATCHUPS_PER_ROUND[round], points: 0 };
  }

  // Collect eliminated entry IDs
  const eliminated = new Set<number>();
  for (const m of allMatchups) {
    if (m.winnerId !== null) {
      if (m.winnerId !== m.entryAId) eliminated.add(m.entryAId);
      if (m.winnerId !== m.entryBId) eliminated.add(m.entryBId);
    }
  }

  // Build lookup map for O(1) matchup access
  const matchupById = new Map<number, BracketMatchup>();
  for (const m of allMatchups) {
    matchupById.set(m.id, m);
  }

  // Score completed matchups
  const completedIds = new Set<number>();
  for (const matchup of allMatchups) {
    if (matchup.winnerId === null) continue;
    completedIds.add(matchup.id);

    const pickKey = String(matchup.id);
    const pickedWinner = picks[pickKey];

    if (pickedWinner === matchup.winnerId) {
      const pts = ROUND_POINTS[matchup.round as RoundName] ?? 0;
      score += pts;
      correctPicks++;
      roundBreakdown[matchup.round].correct++;
      roundBreakdown[matchup.round].points += pts;
    }
  }

  // Subtract impossible future points (picked winner already eliminated)
  for (const [key, pickedEntryId] of Object.entries(picks)) {
    const matchupId = parseInt(key, 10);
    if (isNaN(matchupId) || completedIds.has(matchupId)) continue;

    if (eliminated.has(pickedEntryId)) {
      const matchup = matchupById.get(matchupId);
      if (matchup) {
        maxPossibleScore -= ROUND_POINTS[matchup.round as RoundName] ?? 0;
      }
    }
  }

  return {
    score,
    correctPicks,
    maxPossibleScore: Math.max(score, maxPossibleScore),
    roundBreakdown: roundBreakdown as Record<RoundName, { correct: number; total: number; points: number }>,
  };
}

/**
 * Validate that a bracket prediction has the expected 63 picks.
 */
export function validatePredictionPicks(
  picks: BracketPicks,
  r64Matchups: BracketMatchup[],
): string[] {
  const errors: string[] = [];

  if (!picks || typeof picks !== "object") {
    errors.push("Picks must be a non-null object");
    return errors;
  }

  const totalPicks = Object.keys(picks).length;
  if (totalPicks !== 63) {
    errors.push(`Expected 63 picks, got ${totalPicks}`);
  }

  // Validate R64 picks reference real matchup IDs and valid contestants
  for (const matchup of r64Matchups) {
    const pickKey = String(matchup.id);
    const picked = picks[pickKey];
    if (picked === undefined) {
      errors.push(`Missing pick for R64 matchup ${matchup.id}`);
    } else if (picked !== matchup.entryAId && picked !== matchup.entryBId) {
      errors.push(
        `Invalid pick for matchup ${matchup.id}: entry ${picked} is not a contestant (${matchup.entryAId} vs ${matchup.entryBId})`,
      );
    }
  }

  return errors;
}
