/**
 * Fast tournament driver — seeds bracket, runs all rounds to COMPLETE.
 * Direct DB operations, no HTTP, no middleware harness.
 */
import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();

import {
  seedAgents,
  generateR64Matchups,
  type ScoredEntry,
} from "@clankrank/shared";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

type Round = "R64" | "R32" | "R16" | "QF" | "SF" | "CHAMPIONSHIP";

interface Row {
  id: number;
  round: string;
  region: string | null;
  seed_a: number | null;
  seed_b: number | null;
  entry_a_id: number;
  entry_b_id: number;
  winner_id: number | null;
}

console.log("=== Fast Tournament Driver ===\n");

const entries = await sql`SELECT * FROM tournament_entries WHERE status = 'qualified'` as Array<{
  id: number; agent_id: string; status: string;
}>;
const scores = await sql`SELECT * FROM qualification_scores` as Array<{
  entry_id: number; score: number; avg_latency: number; total_requests: number;
}>;

const scoreMap = new Map(scores.map(s => [s.entry_id, s]));

const scoredEntries: ScoredEntry[] = entries.map(e => {
  const s = scoreMap.get(e.id);
  return {
    entryId: e.id,
    agentId: e.agent_id,
    score: s?.score ?? 0,
    averageLatency: s?.avg_latency ?? 100,
    totalRequests: s?.total_requests ?? 10,
  };
});

console.log(`Qualified entries: ${scoredEntries.length}`);

const seeded = seedAgents(scoredEntries);
console.log(`Seeded: ${seeded.length} agents`);

const r64Matchups = generateR64Matchups(seeded);
console.log(`R64 matchups: ${r64Matchups.length}`);

for (const m of r64Matchups) {
  await sql`
    INSERT INTO bracket_state (round, region, seed_a, seed_b, entry_a_id, entry_b_id)
    VALUES (${m.round}, ${m.region}, ${m.seedA}, ${m.seedB}, ${m.entryAId}, ${m.entryBId})
  `;
}

await sql`UPDATE tournament_meta SET state = 'R64', current_round = 'R64', updated_at = ${new Date().toISOString()} WHERE id = 1`;
console.log("→ State: R64\n");

const ROUNDS: Round[] = ["R64", "R32", "R16", "QF", "SF", "CHAMPIONSHIP"];
const NEXT_ROUND: Record<string, Round | undefined> = {
  R64: "R32", R32: "R16", R16: "QF", QF: "SF", SF: "CHAMPIONSHIP",
};
const NEXT_STATE: Record<string, string> = {
  R64: "R32", R32: "R16", R16: "QF", QF: "SF", SF: "CHAMPIONSHIP", CHAMPIONSHIP: "COMPLETE",
};

for (const round of ROUNDS) {
  console.log(`--- ${round} ---`);

  const pending = await sql`SELECT * FROM bracket_state WHERE round = ${round} AND winner_id IS NULL ORDER BY id` as Row[];

  if (pending.length === 0) {
    console.log(`  No pending matches`);
    continue;
  }

  for (const m of pending) {
    const scoreA = 50 + Math.random() * 50;
    const scoreB = 50 + Math.random() * 50;
    const winnerId = scoreA >= scoreB ? m.entry_a_id : m.entry_b_id;

    const makeMetrics = (agentId: string, score: number) => JSON.stringify({
      agentId, matchId: m.id, round, adjustedScore: Math.round(score * 100) / 100,
      rawScore: score, baseScore: score, latency: 100 + Math.random() * 200,
      penalties: [], bonuses: [],
    });

    await sql`
      UPDATE bracket_state
      SET winner_id = ${winnerId}, score_a = ${Math.round(scoreA * 100) / 100},
          score_b = ${Math.round(scoreB * 100) / 100},
          metrics_a_json = ${makeMetrics("agentA", scoreA)},
          metrics_b_json = ${makeMetrics("agentB", scoreB)},
          started_at = ${new Date().toISOString()}, completed_at = ${new Date().toISOString()}
      WHERE id = ${m.id}
    `;
  }
  console.log(`  Ran ${pending.length} matches`);

  const nextRound = NEXT_ROUND[round];
  if (nextRound) {
    const completed = await sql`SELECT * FROM bracket_state WHERE round = ${round} ORDER BY id` as Row[];

    if (nextRound === "SF") {
      const regions = ["monad", "ethereum", "arbitrum", "base"];
      const regionWinners: number[] = [];
      for (const r of regions) {
        const regionMatches = completed.filter(m => m.region === r);
        const winner = regionMatches[regionMatches.length - 1];
        if (winner?.winner_id) regionWinners.push(winner.winner_id);
      }

      for (let i = 0; i < regionWinners.length; i += 2) {
        if (regionWinners[i] && regionWinners[i + 1]) {
          await sql`INSERT INTO bracket_state (round, region, seed_a, seed_b, entry_a_id, entry_b_id)
            VALUES ('SF', ${null}, ${null}, ${null}, ${regionWinners[i]}, ${regionWinners[i + 1]})`;
        }
      }
      console.log(`  Generated ${Math.floor(regionWinners.length / 2)} matchups for SF`);
    } else if (nextRound === "CHAMPIONSHIP") {
      const final4 = await sql`SELECT * FROM bracket_state WHERE round = 'SF' AND winner_id IS NOT NULL ORDER BY id` as Row[];

      if (final4.length >= 2) {
        await sql`INSERT INTO bracket_state (round, region, seed_a, seed_b, entry_a_id, entry_b_id)
          VALUES ('CHAMPIONSHIP', ${null}, ${null}, ${null}, ${final4[0].winner_id!}, ${final4[1].winner_id!})`;
        console.log(`  Generated 1 matchup for CHAMPIONSHIP`);
      }
    } else {
      const byRegion = new Map<string | null, Row[]>();
      for (const m of completed) {
        const key = m.region;
        if (!byRegion.has(key)) byRegion.set(key, []);
        byRegion.get(key)!.push(m);
      }

      let count = 0;
      for (const [region, matches] of byRegion) {
        for (let i = 0; i < matches.length; i += 2) {
          const m1 = matches[i];
          const m2 = matches[i + 1];
          if (m1?.winner_id && m2?.winner_id) {
            await sql`INSERT INTO bracket_state (round, region, seed_a, seed_b, entry_a_id, entry_b_id)
              VALUES (${nextRound}, ${region}, ${null}, ${null}, ${m1.winner_id}, ${m2.winner_id})`;
            count++;
          }
        }
      }
      console.log(`  Generated ${count} matchups for ${nextRound}`);
    }
  }

  const nextState = NEXT_STATE[round];
  const nextCurrent = nextState === "COMPLETE" ? null : nextState;
  await sql`UPDATE tournament_meta SET state = ${nextState}, current_round = ${nextCurrent}, updated_at = ${new Date().toISOString()} WHERE id = 1`;
  console.log(`  → State: ${nextState}`);
}

const championship = await sql`SELECT * FROM bracket_state WHERE round = 'CHAMPIONSHIP' AND winner_id IS NOT NULL` as Row[];

if (championship.length > 0 && championship[0].winner_id) {
  await sql`UPDATE tournament_entries SET status = 'champion' WHERE id = ${championship[0].winner_id}`;
  const champ = await sql`SELECT agent_id FROM tournament_entries WHERE id = ${championship[0].winner_id}` as Array<{ agent_id: string }>;
  console.log(`\n🏆 Champion: ${champ[0].agent_id} (entry #${championship[0].winner_id})`);
}

const metaRow = await sql`SELECT state FROM tournament_meta WHERE id = 1` as Array<{ state: string }>;
const totalMatches = await sql`SELECT COUNT(*) as cnt FROM bracket_state` as Array<{ cnt: string }>;
console.log(`\n✓ Final state: ${metaRow[0].state}`);
console.log(`✓ Total matches: ${totalMatches[0].cnt}`);

await sql.end();
