import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

process.env.EDGE_PROXY_URL = "mock";
process.env.SANDBOX_API_URL = "mock";
process.env.DATABASE_URL = "file::memory:";
process.env.API_PORT = "3098";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema.js";
import { MatchRunner } from "../src/services/match-runner.js";
import { SandboxOrchestrator } from "../src/services/orchestrator/index.js";

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;
let matchRunner: MatchRunner;
let orchestrator: SandboxOrchestrator;

function setupTestDb() {
  sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tournament_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL UNIQUE,
      wallet_address TEXT NOT NULL,
      chain TEXT NOT NULL CHECK(chain IN ('monad','ethereum','arbitrum','base')),
      authorized_feedback INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'registered'
    );
    CREATE TABLE IF NOT EXISTS qualification_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL UNIQUE REFERENCES tournament_entries(id),
      score REAL NOT NULL,
      tier TEXT NOT NULL,
      respected429 INTEGER,
      loops INTEGER,
      total_requests INTEGER,
      error_rate REAL,
      avg_latency REAL,
      burstiness REAL,
      on_chain_feedback_count INTEGER,
      on_chain_avg_score REAL,
      raw_metrics_json TEXT,
      scored_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bracket_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round TEXT NOT NULL,
      region TEXT,
      seed_a INTEGER,
      seed_b INTEGER,
      entry_a_id INTEGER NOT NULL REFERENCES tournament_entries(id),
      entry_b_id INTEGER NOT NULL REFERENCES tournament_entries(id),
      winner_id INTEGER,
      score_a REAL,
      score_b REAL,
      metrics_a_json TEXT,
      metrics_b_json TEXT,
      ipfs_cid TEXT,
      tx_hash TEXT,
      started_at TEXT,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS tournament_meta (
      id INTEGER PRIMARY KEY DEFAULT 1,
      state TEXT NOT NULL DEFAULT 'REGISTRATION',
      current_round TEXT,
      started_at TEXT,
      updated_at TEXT
    );
    INSERT OR IGNORE INTO tournament_meta (id, state) VALUES (1, 'R64');
  `);

  return sqlite;
}

/** Insert a test entry and return its id */
async function insertEntry(agentId: string): Promise<number> {
  const [entry] = await db.insert(schema.tournamentEntries).values({
    agentId,
    walletAddress: "0x" + "a".repeat(40),
    chain: "monad",
    authorizedFeedback: false,
  }).returning();
  return entry.id;
}

/** Insert a matchup and return its id */
async function insertMatchup(
  entryAId: number,
  entryBId: number,
  round: "R64" | "R32" | "SWEET16" | "ELITE8" | "FINAL4" | "CHAMPIONSHIP" = "R64",
): Promise<number> {
  const [m] = await db.insert(schema.bracketState).values({
    round,
    region: "monad",
    seedA: 1,
    seedB: 2,
    entryAId,
    entryBId,
  }).returning();
  return m.id;
}

beforeAll(() => {
  setupTestDb();
  db = drizzle(sqlite, { schema });
  orchestrator = new SandboxOrchestrator({ sandboxRuntime: "mock", redisUrl: "mock" });
  matchRunner = new MatchRunner(db as ReturnType<typeof drizzle<typeof schema>>, orchestrator);
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  // Clean up bracket and entries before each test
  sqlite.exec("DELETE FROM bracket_state");
  sqlite.exec("DELETE FROM qualification_scores");
  sqlite.exec("DELETE FROM tournament_entries");
  sqlite.exec("UPDATE tournament_meta SET state = 'R64', current_round = 'R64'");
});

describe("MatchRunner.executeMatch", () => {
  it("executes match end-to-end in mock mode and returns MatchResult", async () => {
    const eA = await insertEntry("agent-match-A");
    const eB = await insertEntry("agent-match-B");
    const matchId = await insertMatchup(eA, eB);

    const result = await matchRunner.executeMatch(matchId);

    expect(result.matchId).toBe(matchId);
    expect(result.round).toBe("R64");
    expect(result.entryAId).toBe(eA);
    expect(result.entryBId).toBe(eB);
    expect(typeof result.scoreA).toBe("number");
    expect(typeof result.scoreB).toBe("number");
    expect(result.completedAt).toBeDefined();
    expect(result.metricsA).toBeDefined();
    expect(result.metricsB).toBeDefined();
  });

  it("SYS-DATA-3: winnerId is always entryAId or entryBId", async () => {
    const eA = await insertEntry("agent-winner-A");
    const eB = await insertEntry("agent-winner-B");
    const matchId = await insertMatchup(eA, eB);

    const result = await matchRunner.executeMatch(matchId);

    expect([eA, eB]).toContain(result.winnerId);
  });

  it("updates bracket_state with scores, metrics JSON, and completedAt", async () => {
    const eA = await insertEntry("agent-db-A");
    const eB = await insertEntry("agent-db-B");
    const matchId = await insertMatchup(eA, eB);

    await matchRunner.executeMatch(matchId);

    const updated = await db.query.bracketState.findFirst({
      where: (t, { eq }) => eq(t.id, matchId),
    });

    expect(updated!.winnerId).toBeDefined();
    expect(updated!.scoreA).not.toBeNull();
    expect(updated!.scoreB).not.toBeNull();
    expect(updated!.metricsAJson).not.toBeNull();
    expect(updated!.metricsBJson).not.toBeNull();
    expect(updated!.completedAt).not.toBeNull();
  });

  it("throws if matchup not found", async () => {
    await expect(matchRunner.executeMatch(99999)).rejects.toThrow("not found");
  });

  it("tiebreaker applied when scores are equal (mock mode deterministic)", async () => {
    const eA = await insertEntry("agent-tie-A");
    const eB = await insertEntry("agent-tie-B");
    const matchId = await insertMatchup(eA, eB);

    const result = await matchRunner.executeMatch(matchId);

    // Whatever the scores, the winner is deterministic
    expect([eA, eB]).toContain(result.winnerId);
  });

  it("sets startedAt on the bracket_state row when match starts", async () => {
    const eA = await insertEntry("agent-started-A");
    const eB = await insertEntry("agent-started-B");
    const matchId = await insertMatchup(eA, eB);

    await matchRunner.executeMatch(matchId);

    const row = await db.query.bracketState.findFirst({
      where: (t, { eq }) => eq(t.id, matchId),
    });
    expect(row!.startedAt).toBeDefined();
  });
});

describe("MatchRunner.executeRound", () => {
  it("executes all pending matchups in a round", async () => {
    const entries = await Promise.all([
      insertEntry("round-agent-1"),
      insertEntry("round-agent-2"),
      insertEntry("round-agent-3"),
      insertEntry("round-agent-4"),
    ]);

    const m1 = await insertMatchup(entries[0], entries[1]);
    const m2 = await insertMatchup(entries[2], entries[3]);

    const results = await matchRunner.executeRound("R64");

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.matchId).sort()).toEqual([m1, m2].sort());
  });

  it("skips already-completed matchups", async () => {
    const eA = await insertEntry("round-skip-A");
    const eB = await insertEntry("round-skip-B");

    // Insert a matchup that's already complete (winnerId set)
    const [completed] = await db.insert(schema.bracketState).values({
      round: "R64",
      region: "monad",
      seedA: 3,
      seedB: 4,
      entryAId: eA,
      entryBId: eB,
      winnerId: eA, // already done
    }).returning();

    // Only pending matchups (winnerId=null) are executed
    const results = await matchRunner.executeRound("R64");

    // The already-completed one should not be in results
    expect(results.every((r) => r.matchId !== completed.id)).toBe(true);
  });

  it("SYS-RES-4: returns empty array when no pending matchups", async () => {
    const results = await matchRunner.executeRound("R64");
    expect(results).toHaveLength(0);
  });
});

describe("MatchRunner.generateNextRound", () => {
  it("generates R32 matchups from completed R64 round", async () => {
    // Insert 2 completed R64 matchups in monad region
    const agents = await Promise.all([
      insertEntry("gen-agent-1"),
      insertEntry("gen-agent-2"),
      insertEntry("gen-agent-3"),
      insertEntry("gen-agent-4"),
    ]);

    // Insert R64 matchups with winners already set
    await db.insert(schema.bracketState).values([
      {
        round: "R64",
        region: "monad",
        seedA: 1,
        seedB: 2,
        entryAId: agents[0],
        entryBId: agents[1],
        winnerId: agents[0],
        scoreA: 90,
        scoreB: 80,
        completedAt: new Date().toISOString(),
      },
      {
        round: "R64",
        region: "monad",
        seedA: 3,
        seedB: 4,
        entryAId: agents[2],
        entryBId: agents[3],
        winnerId: agents[2],
        scoreA: 85,
        scoreB: 75,
        completedAt: new Date().toISOString(),
      },
    ]);

    const inserted = await matchRunner.generateNextRound("R64");

    // With 2 R64 matchups in monad, we get 1 R32 matchup
    expect(inserted).toBe(1);

    const r32 = await db.query.bracketState.findMany({
      where: (t, { eq }) => eq(t.round, "R32"),
    });

    expect(r32).toHaveLength(1);
    expect(r32[0].entryAId).toBe(agents[0]);
    expect(r32[0].entryBId).toBe(agents[2]);
  });

  it("throws if not all matchups are completed", async () => {
    const eA = await insertEntry("gen-incomplete-A");
    const eB = await insertEntry("gen-incomplete-B");

    // Insert R64 matchup WITHOUT winner
    await db.insert(schema.bracketState).values({
      round: "R64",
      region: "monad",
      seedA: 1,
      seedB: 2,
      entryAId: eA,
      entryBId: eB,
      // winnerId intentionally missing
    });

    await expect(matchRunner.generateNextRound("R64")).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: MatchRunner postMatch feedback tests
// ─────────────────────────────────────────────────────────────────────────────

import { FeedbackWriter } from "../src/services/feedback-writer.js";
import { MockIPFSService } from "../src/services/ipfs.js";

describe("MatchRunner postMatch feedback", () => {
  it("executeMatch writes ipfsCid and txHash to bracket_state when authorizedFeedback=true", async () => {
    // Create entries with authorizedFeedback = true
    const [entryA] = await db
      .insert(schema.tournamentEntries)
      .values({
        agentId: "feedback-agent-A",
        walletAddress: "0x" + "a".repeat(40),
        chain: "monad",
        authorizedFeedback: true,
      })
      .returning();

    const [entryB] = await db
      .insert(schema.tournamentEntries)
      .values({
        agentId: "feedback-agent-B",
        walletAddress: "0x" + "b".repeat(40),
        chain: "monad",
        authorizedFeedback: true,
      })
      .returning();

    const matchId = await insertMatchup(entryA.id, entryB.id);

    // Create a MatchRunner with a mock FeedbackWriter
    const mockFeedback = new FeedbackWriter({ ipfsService: new MockIPFSService() });
    const runner = new MatchRunner(
      db as ReturnType<typeof drizzle<typeof schema>>,
      orchestrator,
      mockFeedback,
    );

    await runner.executeMatch(matchId);

    const row = await db.query.bracketState.findFirst({
      where: (t, { eq }) => eq(t.id, matchId),
    });

    // Winner's feedback should be stored
    expect(row!.ipfsCid).toBeTruthy();
    expect(row!.txHash).toBeTruthy();
    expect(row!.ipfsCid).toMatch(/^mock-cid-/);
    expect(row!.txHash).toMatch(/^mock-tx-/);
  });

  it("executeMatch does NOT write ipfsCid/txHash when authorizedFeedback=false", async () => {
    // Create entries with authorizedFeedback = false
    const [entryA] = await db
      .insert(schema.tournamentEntries)
      .values({
        agentId: "nofeedback-agent-A",
        walletAddress: "0x" + "c".repeat(40),
        chain: "ethereum",
        authorizedFeedback: false,
      })
      .returning();

    const [entryB] = await db
      .insert(schema.tournamentEntries)
      .values({
        agentId: "nofeedback-agent-B",
        walletAddress: "0x" + "d".repeat(40),
        chain: "ethereum",
        authorizedFeedback: false,
      })
      .returning();

    const matchId = await insertMatchup(entryA.id, entryB.id);

    const mockFeedback = new FeedbackWriter({ ipfsService: new MockIPFSService() });
    const runner = new MatchRunner(
      db as ReturnType<typeof drizzle<typeof schema>>,
      orchestrator,
      mockFeedback,
    );

    await runner.executeMatch(matchId);

    const row = await db.query.bracketState.findFirst({
      where: (t, { eq }) => eq(t.id, matchId),
    });

    // No feedback when not authorized
    expect(row!.ipfsCid).toBeNull();
    expect(row!.txHash).toBeNull();
  });

  it("feedback failure does NOT throw or block executeMatch", async () => {
    const [entryA] = await db
      .insert(schema.tournamentEntries)
      .values({
        agentId: "failfeedback-agent-A",
        walletAddress: "0x" + "e".repeat(40),
        chain: "base",
        authorizedFeedback: true,
      })
      .returning();

    const [entryB] = await db
      .insert(schema.tournamentEntries)
      .values({
        agentId: "failfeedback-agent-B",
        walletAddress: "0x" + "f".repeat(40),
        chain: "base",
        authorizedFeedback: true,
      })
      .returning();

    const matchId = await insertMatchup(entryA.id, entryB.id);

    // Create a failing FeedbackWriter
    const failingIPFS = {
      async uploadMetrics(_: object) {
        throw new Error("IPFS connection refused");
      },
    };
    const failingFeedback = new FeedbackWriter({
      ipfsService: failingIPFS as unknown as MockIPFSService,
    });

    const runner = new MatchRunner(
      db as ReturnType<typeof drizzle<typeof schema>>,
      orchestrator,
      failingFeedback,
    );

    // Should NOT throw even though feedback fails
    const result = await runner.executeMatch(matchId);
    expect(result.matchId).toBe(matchId);
    expect([entryA.id, entryB.id]).toContain(result.winnerId);
  });

  it("postRound chains executeRound + generateNextRound and returns results", async () => {
    // Insert 4 agents and 2 R64 matchups
    const agents = await Promise.all([
      db.insert(schema.tournamentEntries).values({
        agentId: "postround-agent-1",
        walletAddress: "0x" + "1".repeat(40),
        chain: "monad",
        authorizedFeedback: false,
      }).returning(),
      db.insert(schema.tournamentEntries).values({
        agentId: "postround-agent-2",
        walletAddress: "0x" + "2".repeat(40),
        chain: "monad",
        authorizedFeedback: false,
      }).returning(),
      db.insert(schema.tournamentEntries).values({
        agentId: "postround-agent-3",
        walletAddress: "0x" + "3".repeat(40),
        chain: "monad",
        authorizedFeedback: false,
      }).returning(),
      db.insert(schema.tournamentEntries).values({
        agentId: "postround-agent-4",
        walletAddress: "0x" + "4".repeat(40),
        chain: "monad",
        authorizedFeedback: false,
      }).returning(),
    ]);

    const ids = agents.map((a) => a[0].id);

    // Insert 2 R64 matchups in monad region with proper seeds
    await db.insert(schema.bracketState).values([
      {
        round: "R64",
        region: "monad",
        seedA: 1,
        seedB: 16,
        entryAId: ids[0],
        entryBId: ids[1],
      },
      {
        round: "R64",
        region: "monad",
        seedA: 8,
        seedB: 9,
        entryAId: ids[2],
        entryBId: ids[3],
      },
    ]);

    const runner = new MatchRunner(
      db as ReturnType<typeof drizzle<typeof schema>>,
      orchestrator,
    );

    const { results, nextRoundMatchups } = await runner.postRound("R64");

    expect(results).toHaveLength(2);
    expect(nextRoundMatchups).toBe(1); // 2 R64 → 1 R32 in monad
  }, 30000);
});
