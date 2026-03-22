import type { SeededAgent, RegionName, RoundName, BracketMatchup } from "./types.js";
import { NCAA_PAIRINGS, REGION_NAMES, BRACKET_HALVES, ROUND_ORDER } from "./constants.js";

/**
 * A bracket matchup before it's stored in the database.
 * Pure data — no DB IDs yet.
 */
export interface BracketMatchupInput {
  round: RoundName;
  region: RegionName | null;
  seedA: number;
  seedB: number;
  entryAId: number;
  entryBId: number;
}

/**
 * Generate R64 matchups from seeded agents.
 *
 * NCAA-style pairings within each region:
 *   1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
 *
 * Pure function. Deterministic.
 */
export function generateR64Matchups(seededAgents: SeededAgent[]): BracketMatchupInput[] {
  const matchups: BracketMatchupInput[] = [];

  for (const region of REGION_NAMES) {
    const regionAgents = seededAgents.filter((a) => a.region === region);
    const bySeed = new Map<number, SeededAgent>();
    for (const agent of regionAgents) {
      bySeed.set(agent.seed, agent);
    }

    for (const [seedA, seedB] of NCAA_PAIRINGS) {
      const agentA = bySeed.get(seedA);
      const agentB = bySeed.get(seedB);

      if (!agentA || !agentB) {
        throw new Error(
          `Missing agent for region ${region}: seed ${seedA} or ${seedB}`
        );
      }

      matchups.push({
        round: "R64",
        region,
        seedA,
        seedB,
        entryAId: agentA.entryId,
        entryBId: agentB.entryId,
      });
    }
  }

  return matchups;
}

/**
 * Generate next-round matchups from a completed round.
 *
 * For regional rounds (R64→R32, R32→SWEET16, SWEET16→ELITE8):
 *   Winners within the same region are paired by bracket position.
 *   Lower-bracket-position winner (entryA from lower-id matchup) faces the other.
 *
 * For ELITE8→FINAL4:
 *   BRACKET_HALVES: Monad winner vs Ethereum winner, Arbitrum winner vs Base winner.
 *
 * For FINAL4→CHAMPIONSHIP:
 *   The two FINAL4 winners play.
 *
 * Requires ALL matchups in completedRound to have winnerId set.
 * Returns new BracketMatchup[] (id=0 placeholders — caller assigns DB ids).
 */
export function generateNextRoundMatchups(
  completedMatchups: BracketMatchup[],
  completedRound: RoundName,
): BracketMatchup[] {
  // Verify all matchups in this round are completed
  const roundMatchups = completedMatchups.filter((m) => m.round === completedRound);
  if (roundMatchups.some((m) => m.winnerId === null)) {
    throw new Error(`Not all ${completedRound} matchups are completed`);
  }

  const nextRoundIdx = ROUND_ORDER.indexOf(completedRound) + 1;
  if (nextRoundIdx >= ROUND_ORDER.length) {
    return []; // CHAMPIONSHIP is the final round — no next round
  }
  const nextRound = ROUND_ORDER[nextRoundIdx];

  // ── ELITE8 → FINAL4: cross-region pairings from BRACKET_HALVES ──
  if (completedRound === "ELITE8") {
    const newMatchups: BracketMatchup[] = [];
    for (const [regionA, regionB] of BRACKET_HALVES) {
      const matchA = roundMatchups.find((m) => m.region === regionA);
      const matchB = roundMatchups.find((m) => m.region === regionB);
      if (!matchA || !matchB) {
        throw new Error(`Missing ELITE8 matchup for regions ${regionA} or ${regionB}`);
      }
      newMatchups.push({
        id: 0,
        round: "FINAL4",
        region: null,
        seedA: 0,
        seedB: 0,
        entryAId: matchA.winnerId!,
        entryBId: matchB.winnerId!,
        winnerId: null,
        scoreA: null,
        scoreB: null,
        metricsAJson: null,
        metricsBJson: null,
        ipfsCid: null,
        txHash: null,
        startedAt: null,
        completedAt: null,
      });
    }
    return newMatchups;
  }

  // ── FINAL4 → CHAMPIONSHIP ──
  if (completedRound === "FINAL4") {
    if (roundMatchups.length !== 2) {
      throw new Error(`Expected 2 FINAL4 matchups, got ${roundMatchups.length}`);
    }
    return [
      {
        id: 0,
        round: "CHAMPIONSHIP",
        region: null,
        seedA: 0,
        seedB: 0,
        entryAId: roundMatchups[0].winnerId!,
        entryBId: roundMatchups[1].winnerId!,
        winnerId: null,
        scoreA: null,
        scoreB: null,
        metricsAJson: null,
        metricsBJson: null,
        ipfsCid: null,
        txHash: null,
        startedAt: null,
        completedAt: null,
      },
    ];
  }

  // ── Regional rounds: R64→R32, R32→SWEET16, SWEET16→ELITE8 ──
  // Within each region, pair winners by bracket position (sorted by id)
  const newMatchups: BracketMatchup[] = [];

  for (const region of REGION_NAMES) {
    const regionMatchups = roundMatchups
      .filter((m) => m.region === region)
      .sort((a, b) => a.id - b.id); // stable ordering by DB insertion id

    if (regionMatchups.length % 2 !== 0) {
      throw new Error(
        `Region ${region} has odd number of ${completedRound} matchups: ${regionMatchups.length}`,
      );
    }

    // Pair consecutive matchups: [0,1], [2,3], ...
    for (let i = 0; i < regionMatchups.length; i += 2) {
      const mA = regionMatchups[i];
      const mB = regionMatchups[i + 1];
      newMatchups.push({
        id: 0,
        round: nextRound,
        region,
        seedA: 0,
        seedB: 0,
        entryAId: mA.winnerId!,
        entryBId: mB.winnerId!,
        winnerId: null,
        scoreA: null,
        scoreB: null,
        metricsAJson: null,
        metricsBJson: null,
        ipfsCid: null,
        txHash: null,
        startedAt: null,
        completedAt: null,
      });
    }
  }

  return newMatchups;
}

/**
 * Validate bracket invariants.
 */
export function validateBracket(matchups: BracketMatchupInput[]): string[] {
  const errors: string[] = [];

  // R64 should have exactly 32 matchups
  const r64 = matchups.filter((m) => m.round === "R64");
  if (r64.length !== 32) {
    errors.push(`R64 should have 32 matchups, got ${r64.length}`);
  }

  // Each region should have 8 matchups
  for (const region of REGION_NAMES) {
    const regionMatchups = r64.filter((m) => m.region === region);
    if (regionMatchups.length !== 8) {
      errors.push(`Region ${region}: expected 8 R64 matchups, got ${regionMatchups.length}`);
    }
  }

  // No agent should appear twice
  const allEntryIds = r64.flatMap((m) => [m.entryAId, m.entryBId]);
  if (new Set(allEntryIds).size !== allEntryIds.length) {
    errors.push("Duplicate entry IDs in R64 matchups");
  }

  // Total unique agents should be 64
  if (new Set(allEntryIds).size !== 64) {
    errors.push(`Expected 64 unique agents in R64, got ${new Set(allEntryIds).size}`);
  }

  return errors;
}
