/**
 * Drive a mock tournament to COMPLETE state.
 * 
 * Prerequisites:
 *   1. Database migrated and seeded (db:migrate + db:seed-mock)
 *   2. Bracket generated (seed-and-bracket was called)
 *   3. R64 matches have been run
 *
 * This script:
 *   - For each remaining round: generates matchups from prior winners, runs matches, advances state
 */
import { db, schema } from "./index.js";
import { eq } from "drizzle-orm";
import { SandboxOrchestrator } from "../services/orchestrator/index.js";
import { MatchRunner } from "../services/match-runner.js";
import { TournamentStateMachine } from "../services/state-machine.js";
import type { RoundName } from "@clankrank/shared";

const ROUND_SEQUENCE: RoundName[] = ["R32", "R16", "QF", "SF", "CHAMPIONSHIP"];

const orchestrator = new SandboxOrchestrator({ sandboxRuntime: "mock", redisUrl: "mock" });
const matchRunner = new MatchRunner(db, orchestrator);
const stateMachine = new TournamentStateMachine(db);

async function main() {
  for (const round of ROUND_SEQUENCE) {
    const state = await stateMachine.getCurrentState();
    console.log(`\nCurrent state: ${state}, processing: ${round}`);

    if (state !== round) {
      console.log(`  Skipping ${round} (state is ${state})`);
      continue;
    }

    // Determine the previous round
    const prevRound = getPreviousRound(round);
    if (prevRound) {
      // Generate matchups for this round from prior round's winners
      const generated = await matchRunner.generateNextRound(prevRound);
      console.log(`  Generated ${generated} matchups for ${round}`);
    }

    // Run all matches in this round
    const results = await matchRunner.executeRound(round);
    console.log(`  Executed ${results.length} matches in ${round}`);

    // Check and advance state
    const advance = await stateMachine.checkAndAdvance();
    if (advance.advanced) {
      console.log(`  Advanced to ${advance.newState}`);
    }
  }

  // Check final state
  const finalState = await stateMachine.getCurrentState();
  console.log(`\n✓ Tournament final state: ${finalState}`);

  // If COMPLETE, find the champion
  if (finalState === "COMPLETE") {
    const championship = await db.query.bracketState.findMany({
      where: eq(schema.bracketState.round, "CHAMPIONSHIP"),
    });
    if (championship.length > 0 && championship[0].winnerId) {
      const champion = await db.query.tournamentEntries.findFirst({
        where: eq(schema.tournamentEntries.id, championship[0].winnerId),
      });
      if (champion) {
        await db.update(schema.tournamentEntries)
          .set({ status: "champion" })
          .where(eq(schema.tournamentEntries.id, champion.id));
        console.log(`🏆 Champion: ${champion.agentId} (entry #${champion.id})`);
      }
    }
  }

  process.exit(0);
}

function getPreviousRound(round: RoundName): RoundName | null {
  const map: Record<string, RoundName> = {
    R32: "R64",
    R16: "R32",
    QF: "R16",
    SF: "QF",
    CHAMPIONSHIP: "SF",
  };
  return map[round] ?? null;
}

main().catch((err) => {
  console.error("Drive tournament failed:", err);
  process.exit(1);
});
