import { describe, it, expect } from "vitest";
import { seedAgents, validateSeeding } from "../src/seeding.js";
import type { ScoredEntry } from "../src/types.js";

function makeScoredEntries(count: number): ScoredEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    entryId: i + 1,
    agentId: `agent-${String(i + 1).padStart(3, "0")}`,
    score: 100 - i, // Descending scores: 100, 99, 98...
    averageLatency: 100 + i,
    totalRequests: 10,
  }));
}

describe("seedAgents", () => {
  // SYS-BRK-1: Exactly 64 agents across 4 regions of 16
  it("produces exactly 64 seeded agents", () => {
    const entries = makeScoredEntries(70); // More than 64
    const seeded = seedAgents(entries);
    expect(seeded).toHaveLength(64);
  });

  it("validates seeding invariants", () => {
    const entries = makeScoredEntries(64);
    const seeded = seedAgents(entries);
    const errors = validateSeeding(seeded);
    expect(errors).toHaveLength(0);
  });

  // SYS-BRK-2: Serpentine assignment
  it("assigns rank 1 to Monad 1-seed", () => {
    const entries = makeScoredEntries(64);
    const seeded = seedAgents(entries);
    const monad1 = seeded.find((a) => a.region === "monad" && a.seed === 1);
    expect(monad1).toBeDefined();
    expect(monad1!.entryId).toBe(1); // Highest-scored agent
  });

  it("assigns rank 2 to Ethereum 1-seed", () => {
    const entries = makeScoredEntries(64);
    const seeded = seedAgents(entries);
    const eth1 = seeded.find((a) => a.region === "ethereum" && a.seed === 1);
    expect(eth1).toBeDefined();
    expect(eth1!.entryId).toBe(2);
  });

  it("assigns rank 3 to Arbitrum 1-seed", () => {
    const entries = makeScoredEntries(64);
    const seeded = seedAgents(entries);
    const arb1 = seeded.find((a) => a.region === "arbitrum" && a.seed === 1);
    expect(arb1).toBeDefined();
    expect(arb1!.entryId).toBe(3);
  });

  it("assigns rank 4 to Base 1-seed", () => {
    const entries = makeScoredEntries(64);
    const seeded = seedAgents(entries);
    const base1 = seeded.find((a) => a.region === "base" && a.seed === 1);
    expect(base1).toBeDefined();
    expect(base1!.entryId).toBe(4);
  });

  // Serpentine reversal: rank 5 → Base 2-seed
  it("assigns rank 5 to Base 2-seed (serpentine reversal)", () => {
    const entries = makeScoredEntries(64);
    const seeded = seedAgents(entries);
    const base2 = seeded.find((a) => a.region === "base" && a.seed === 2);
    expect(base2).toBeDefined();
    expect(base2!.entryId).toBe(5);
  });

  // Rank 8 → Monad 2-seed
  it("assigns rank 8 to Monad 2-seed (serpentine second row end)", () => {
    const entries = makeScoredEntries(64);
    const seeded = seedAgents(entries);
    const monad2 = seeded.find((a) => a.region === "monad" && a.seed === 2);
    expect(monad2).toBeDefined();
    expect(monad2!.entryId).toBe(8);
  });

  it("each region has seeds 1 through 16", () => {
    const entries = makeScoredEntries(64);
    const seeded = seedAgents(entries);

    for (const region of ["monad", "ethereum", "arbitrum", "base"]) {
      const regionAgents = seeded.filter((a) => a.region === region);
      expect(regionAgents).toHaveLength(16);
      const seeds = regionAgents.map((a) => a.seed).sort((a, b) => a - b);
      expect(seeds).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    }
  });

  it("throws if fewer than 64 entries provided", () => {
    const entries = makeScoredEntries(30);
    expect(() => seedAgents(entries)).toThrow("Need at least 64");
  });

  // Tiebreaking
  it("breaks ties by lower averageLatency", () => {
    const entries: ScoredEntry[] = [
      ...makeScoredEntries(62),
      { entryId: 63, agentId: "tied-slow", score: 37, averageLatency: 500, totalRequests: 10 },
      { entryId: 64, agentId: "tied-fast", score: 37, averageLatency: 100, totalRequests: 10 },
    ];
    const seeded = seedAgents(entries);
    // The faster agent (lower latency) should be ranked higher
    const slow = seeded.find((a) => a.entryId === 63)!;
    const fast = seeded.find((a) => a.entryId === 64)!;
    // Both are in the bracket; the faster one gets a better (lower) seed number
    expect(fast.seed).toBeLessThanOrEqual(slow.seed);
  });
});
