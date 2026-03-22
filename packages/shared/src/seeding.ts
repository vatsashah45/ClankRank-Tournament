import type { ScoredEntry, SeededAgent, RegionName } from "./types.js";
import { REGION_NAMES, AGENTS_PER_REGION, MAX_TOURNAMENT_SIZE } from "./constants.js";

/**
 * Serpentine seeding: distribute top 64 agents across 4 regions.
 *
 * Snake pattern (from spec):
 *   Rank 1 → Monad 1-seed
 *   Rank 2 → Ethereum 1-seed
 *   Rank 3 → Arbitrum 1-seed
 *   Rank 4 → Base 1-seed
 *   Rank 5 → Base 2-seed      (reverse direction)
 *   Rank 6 → Arbitrum 2-seed
 *   Rank 7 → Ethereum 2-seed
 *   Rank 8 → Monad 2-seed
 *   Rank 9 → Monad 3-seed      (forward again)
 *   ...
 *
 * Pure function. Deterministic. No side effects.
 */
export function seedAgents(scoredEntries: ScoredEntry[]): SeededAgent[] {
  // Sort descending by score, tiebreak by lower latency, then lower totalRequests
  const sorted = [...scoredEntries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.averageLatency !== b.averageLatency) return a.averageLatency - b.averageLatency;
    return a.totalRequests - b.totalRequests;
  });

  // Take top 64
  const top = sorted.slice(0, MAX_TOURNAMENT_SIZE);

  if (top.length < MAX_TOURNAMENT_SIZE) {
    throw new Error(
      `Need at least ${MAX_TOURNAMENT_SIZE} qualified agents, got ${top.length}`
    );
  }

  // Initialize region buckets
  const regionBuckets: Map<RegionName, ScoredEntry[]> = new Map();
  for (const r of REGION_NAMES) {
    regionBuckets.set(r, []);
  }

  // Serpentine assignment
  for (let i = 0; i < top.length; i++) {
    const seedRound = Math.floor(i / 4); // which "row" of the snake
    const posInRound = i % 4;

    // Even rows go forward (0,1,2,3), odd rows go backward (3,2,1,0)
    const regionIndex = seedRound % 2 === 0 ? posInRound : 3 - posInRound;
    const region = REGION_NAMES[regionIndex];
    regionBuckets.get(region)!.push(top[i]);
  }

  // Convert to SeededAgent with seed numbers
  const result: SeededAgent[] = [];
  for (const region of REGION_NAMES) {
    const agents = regionBuckets.get(region)!;
    for (let seed = 0; seed < agents.length; seed++) {
      result.push({
        entryId: agents[seed].entryId,
        agentId: agents[seed].agentId,
        region,
        seed: seed + 1, // 1-indexed
        score: agents[seed].score,
      });
    }
  }

  return result;
}

/**
 * Validate seeding output invariants.
 */
export function validateSeeding(seeded: SeededAgent[]): string[] {
  const errors: string[] = [];

  if (seeded.length !== MAX_TOURNAMENT_SIZE) {
    errors.push(`Expected ${MAX_TOURNAMENT_SIZE} seeded agents, got ${seeded.length}`);
  }

  for (const region of REGION_NAMES) {
    const regionAgents = seeded.filter((a) => a.region === region);
    if (regionAgents.length !== AGENTS_PER_REGION) {
      errors.push(`Region ${region}: expected ${AGENTS_PER_REGION} agents, got ${regionAgents.length}`);
    }

    const seeds = regionAgents.map((a) => a.seed).sort((a, b) => a - b);
    const expected = Array.from({ length: AGENTS_PER_REGION }, (_, i) => i + 1);
    if (JSON.stringify(seeds) !== JSON.stringify(expected)) {
      errors.push(`Region ${region}: seeds are not 1–${AGENTS_PER_REGION}`);
    }
  }

  // Check no duplicate entryIds
  const ids = seeded.map((a) => a.entryId);
  if (new Set(ids).size !== ids.length) {
    errors.push("Duplicate entryIds in seeding output");
  }

  return errors;
}
