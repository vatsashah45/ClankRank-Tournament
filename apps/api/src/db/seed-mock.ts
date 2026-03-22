/**
 * Seed the database with 64+ mock agents for development.
 * Run: pnpm --filter api db:seed-mock
 */
import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

const CHAINS = ["monad", "ethereum", "arbitrum", "base"] as const;

const tiers = [
  { min: 98, name: "AAA" }, { min: 92, name: "AA" }, { min: 85, name: "A" },
  { min: 75, name: "BAA" }, { min: 65, name: "BA" }, { min: 50, name: "B" },
  { min: 35, name: "CAA" }, { min: 20, name: "CA" }, { min: 0, name: "C" },
];

function getTier(score: number): string {
  for (const t of tiers) {
    if (score >= t.min) return t.name;
  }
  return "C";
}

console.log("Seeding 68 mock agents...");

for (let i = 1; i <= 68; i++) {
  const agentId = `agent-${String(i).padStart(3, "0")}`;
  const wallet = "0x" + i.toString(16).padStart(40, "0");
  const chain = CHAINS[(i - 1) % 4];
  const authFeedback = Math.random() > 0.3;

  await sql`
    INSERT INTO tournament_entries (agent_id, wallet_address, chain, authorized_feedback, status)
    VALUES (${agentId}, ${wallet}, ${chain}, ${authFeedback}, 'qualified')
    ON CONFLICT (agent_id) DO NOTHING
  `;

  const baseScore = 100 - Math.floor(Math.random() * 60);
  const score = Math.max(0, Math.min(110, baseScore));
  const tier = getTier(score);
  const avgLatency = 50 + Math.random() * 300;

  await sql`
    INSERT INTO qualification_scores
    (entry_id, score, tier, respected429, loops, total_requests, error_rate, avg_latency, burstiness,
     on_chain_feedback_count, on_chain_avg_score, raw_metrics_json, scored_at)
    VALUES (
      ${i}, ${score}, ${tier}, ${true}, ${Math.floor(Math.random() * 3)}, ${10},
      ${Math.random() * 0.2}, ${avgLatency}, ${Math.random() * 0.5},
      ${Math.floor(Math.random() * 10)}, ${50 + Math.random() * 50},
      ${JSON.stringify({ mock: true })}, ${new Date().toISOString()}
    )
    ON CONFLICT (entry_id) DO NOTHING
  `;
}

await sql`
  UPDATE tournament_meta SET state = 'QUALIFICATION', updated_at = ${new Date().toISOString()} WHERE id = 1
`;

console.log("✓ Seeded 68 mock agents with qualification scores");
console.log("✓ Tournament state set to QUALIFICATION");
console.log("→ Next: POST /api/admin/seed-and-bracket to generate the bracket");

await sql.end();
