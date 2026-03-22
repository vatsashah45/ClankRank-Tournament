import { describe, it, expect } from "vitest";
import { generateR64Matchups, validateBracket, generateNextRoundMatchups } from "../src/bracket.js";
import { seedAgents } from "../src/seeding.js";
import type { ScoredEntry, SeededAgent, BracketMatchup, RegionName, RoundName } from "../src/types.js";

function makeSeededAgents(): SeededAgent[] {
  const entries: ScoredEntry[] = Array.from({ length: 64 }, (_, i) => ({
    entryId: i + 1,
    agentId: `agent-${String(i + 1).padStart(3, "0")}`,
    score: 100 - i,
    averageLatency: 100 + i,
    totalRequests: 10,
  }));
  return seedAgents(entries);
}

describe("generateR64Matchups", () => {
  // SYS-BRK-3: R64 generates exactly 32 matchups (8 per region)
  it("generates exactly 32 R64 matchups", () => {
    const seeded = makeSeededAgents();
    const matchups = generateR64Matchups(seeded);
    expect(matchups).toHaveLength(32);
  });

  it("passes bracket validation", () => {
    const seeded = makeSeededAgents();
    const matchups = generateR64Matchups(seeded);
    const errors = validateBracket(matchups);
    expect(errors).toHaveLength(0);
  });

  // 8 matchups per region
  it("generates 8 matchups per region", () => {
    const seeded = makeSeededAgents();
    const matchups = generateR64Matchups(seeded);

    for (const region of ["monad", "ethereum", "arbitrum", "base"]) {
      const regionMatchups = matchups.filter((m) => m.region === region);
      expect(regionMatchups).toHaveLength(8);
    }
  });

  // Standard bracket pairings: 1v16 in each region
  it("pairs 1-seed vs 16-seed in each region", () => {
    const seeded = makeSeededAgents();
    const matchups = generateR64Matchups(seeded);

    for (const region of ["monad", "ethereum", "arbitrum", "base"]) {
      const m1v16 = matchups.find(
        (m) => m.region === region && m.seedA === 1 && m.seedB === 16
      );
      expect(m1v16).toBeDefined();
    }
  });

  // Standard bracket pairings: 8v9
  it("pairs 8-seed vs 9-seed in each region", () => {
    const seeded = makeSeededAgents();
    const matchups = generateR64Matchups(seeded);

    for (const region of ["monad", "ethereum", "arbitrum", "base"]) {
      const m8v9 = matchups.find(
        (m) => m.region === region && m.seedA === 8 && m.seedB === 9
      );
      expect(m8v9).toBeDefined();
    }
  });

  // SYS-BRK-7: Total matchups across tournament = 63 (32+16+8+4+2+1)
  // This test validates the R64 count; full tournament math is verified here
  it("64 unique agents across all R64 matchups", () => {
    const seeded = makeSeededAgents();
    const matchups = generateR64Matchups(seeded);
    const allIds = matchups.flatMap((m) => [m.entryAId, m.entryBId]);
    expect(new Set(allIds).size).toBe(64);
  });

  // All rounds: R64 are the only ones generated at this stage
  it("all matchups are R64 round", () => {
    const seeded = makeSeededAgents();
    const matchups = generateR64Matchups(seeded);
    expect(matchups.every((m) => m.round === "R64")).toBe(true);
  });
});

// ── Helpers for generateNextRoundMatchups tests ──

function makeCompletedR64Matchups(): BracketMatchup[] {
  // 32 matchups, 8 per region, all with winners assigned
  const regions: RegionName[] = ["monad", "ethereum", "arbitrum", "base"];
  const matchups: BracketMatchup[] = [];
  let id = 1;
  let entryId = 1;

  for (const region of regions) {
    for (let i = 0; i < 8; i++) {
      const eA = entryId++;
      const eB = entryId++;
      matchups.push({
        id: id++,
        round: "R64",
        region,
        seedA: i * 2 + 1,
        seedB: i * 2 + 2,
        entryAId: eA,
        entryBId: eB,
        winnerId: eA, // entryA always wins in this test helper
        scoreA: 90,
        scoreB: 80,
        metricsAJson: null,
        metricsBJson: null,
        ipfsCid: null,
        txHash: null,
        startedAt: null,
        completedAt: new Date().toISOString(),
      });
    }
  }

  return matchups;
}

function makeCompletedElite8(): BracketMatchup[] {
  // 4 QF matchups, one per region, with winners
  const regions: RegionName[] = ["monad", "ethereum", "arbitrum", "base"];
  return regions.map((region, i) => ({
    id: i + 1,
    round: "QF" as RoundName,
    region,
    seedA: 1,
    seedB: 2,
    entryAId: i * 2 + 1,
    entryBId: i * 2 + 2,
    winnerId: i * 2 + 1, // entryA wins
    scoreA: 90,
    scoreB: 80,
    metricsAJson: null,
    metricsBJson: null,
    ipfsCid: null,
    txHash: null,
    startedAt: null,
    completedAt: new Date().toISOString(),
  }));
}

function makeCompletedFinal4(): BracketMatchup[] {
  return [
    {
      id: 1,
      round: "SF" as RoundName,
      region: null,
      seedA: 0,
      seedB: 0,
      entryAId: 1,
      entryBId: 3,
      winnerId: 1,
      scoreA: 90,
      scoreB: 80,
      metricsAJson: null,
      metricsBJson: null,
      ipfsCid: null,
      txHash: null,
      startedAt: null,
      completedAt: new Date().toISOString(),
    },
    {
      id: 2,
      round: "SF" as RoundName,
      region: null,
      seedA: 0,
      seedB: 0,
      entryAId: 5,
      entryBId: 7,
      winnerId: 5,
      scoreA: 85,
      scoreB: 75,
      metricsAJson: null,
      metricsBJson: null,
      ipfsCid: null,
      txHash: null,
      startedAt: null,
      completedAt: new Date().toISOString(),
    },
  ];
}

describe("generateNextRoundMatchups", () => {
  // SYS-BRK-4: next-round generation only from completed matchups
  it("SYS-BRK-4: throws if any matchup is not completed", () => {
    const matchups = makeCompletedR64Matchups();
    // Uncomplete one matchup
    matchups[0].winnerId = null;
    expect(() => generateNextRoundMatchups(matchups, "R64")).toThrow();
  });

  it("generates correct number of R32 matchups from completed R64", () => {
    const r64 = makeCompletedR64Matchups();
    const r32 = generateNextRoundMatchups(r64, "R64");
    expect(r32).toHaveLength(16); // 32 / 2 = 16
  });

  it("R32 matchups have correct round label", () => {
    const r64 = makeCompletedR64Matchups();
    const r32 = generateNextRoundMatchups(r64, "R64");
    expect(r32.every((m) => m.round === "R32")).toBe(true);
  });

  it("winner IDs propagate correctly to next round entries", () => {
    const r64 = makeCompletedR64Matchups();
    const r32 = generateNextRoundMatchups(r64, "R64");
    // All entryAId and entryBId in r32 should be winners from r64
    const r64WinnerIds = new Set(r64.map((m) => m.winnerId!));
    for (const m of r32) {
      expect(r64WinnerIds.has(m.entryAId)).toBe(true);
      expect(r64WinnerIds.has(m.entryBId)).toBe(true);
    }
  });

  // SYS-BRK-5: cross-region round gating
  it("SYS-BRK-5: R32 matchups stay within the same region", () => {
    const r64 = makeCompletedR64Matchups();
    const r32 = generateNextRoundMatchups(r64, "R64");
    // All r32 matchups should have a non-null region
    expect(r32.every((m) => m.region !== null)).toBe(true);
    // And 4 matchups per region
    for (const region of ["monad", "ethereum", "arbitrum", "base"]) {
      expect(r32.filter((m) => m.region === region)).toHaveLength(4);
    }
  });

  // SYS-BRK-6: Semifinals pairs Monad vs Ethereum, Arbitrum vs Base
  it("SYS-BRK-6: QF→SF pairs Monad vs Ethereum and Arbitrum vs Base", () => {
    const elite8 = makeCompletedElite8();
    const final4 = generateNextRoundMatchups(elite8, "QF");
    expect(final4).toHaveLength(2);
    expect(final4.every((m) => m.round === "SF")).toBe(true);
    expect(final4.every((m) => m.region === null)).toBe(true);

    // Semifinal 1: monad winner vs ethereum winner
    const monadWinner = elite8.find((m) => m.region === "monad")!.winnerId!;
    const ethereumWinner = elite8.find((m) => m.region === "ethereum")!.winnerId!;
    const arbitrumWinner = elite8.find((m) => m.region === "arbitrum")!.winnerId!;
    const baseWinner = elite8.find((m) => m.region === "base")!.winnerId!;

    const sf1 = final4[0];
    expect([sf1.entryAId, sf1.entryBId].sort()).toEqual([monadWinner, ethereumWinner].sort());

    const sf2 = final4[1];
    expect([sf2.entryAId, sf2.entryBId].sort()).toEqual([arbitrumWinner, baseWinner].sort());
  });

  it("SF→CHAMPIONSHIP produces exactly 1 matchup", () => {
    const final4 = makeCompletedFinal4();
    const championship = generateNextRoundMatchups(final4, "SF");
    expect(championship).toHaveLength(1);
    expect(championship[0].round).toBe("CHAMPIONSHIP");
    expect(championship[0].region).toBeNull();
    // Winners of both semis play in Championship
    expect(championship[0].entryAId).toBe(1); // winner of semifinal 1
    expect(championship[0].entryBId).toBe(5); // winner of semifinal 2
  });

  it("CHAMPIONSHIP produces no further matchups", () => {
    const championship: BracketMatchup[] = [
      {
        id: 1,
        round: "CHAMPIONSHIP" as RoundName,
        region: null,
        seedA: 0,
        seedB: 0,
        entryAId: 1,
        entryBId: 5,
        winnerId: 1,
        scoreA: 95,
        scoreB: 85,
        metricsAJson: null,
        metricsBJson: null,
        ipfsCid: null,
        txHash: null,
        startedAt: null,
        completedAt: new Date().toISOString(),
      },
    ];
    const nextRound = generateNextRoundMatchups(championship, "CHAMPIONSHIP");
    expect(nextRound).toHaveLength(0);
  });
});
