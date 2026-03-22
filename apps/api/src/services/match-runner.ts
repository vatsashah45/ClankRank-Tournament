import { eq, and, isNull, isNotNull } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { schema } from "../db/index.js";
import { SandboxOrchestrator } from "./orchestrator/index.js";
import { createHarness } from "../middlewares/harness.js";
import { resolveTiebreak } from "@clankrank/shared";
import { generateNextRoundMatchups } from "@clankrank/shared";
import type { MatchResult, MatchMetrics, RoundName, BracketMatchup, Chain } from "@clankrank/shared";
import { FeedbackWriter } from "./feedback-writer.js";
import { eventBus } from "./event-bus.js";

/**
 * MatchRunner — coordinates the full match lifecycle.
 *
 * M8 spec:
 *   executeMatch(matchId) — runs a single match end-to-end
 *   executeRound(round)   — runs all pending matches in a round
 *   generateNextRound(completedRound) — generates next-round rows in DB
 *   postRound(round) — runs executeRound + generateNextRound
 */
export class MatchRunner {
  private db: DB;
  private orchestrator: SandboxOrchestrator;
  private feedbackWriter: FeedbackWriter;

  constructor(db: DB, orchestrator: SandboxOrchestrator, feedbackWriter?: FeedbackWriter) {
    this.db = db;
    this.orchestrator = orchestrator;
    this.feedbackWriter = feedbackWriter ?? new FeedbackWriter();
  }

  /**
   * Execute a single match end-to-end:
   * 1. Fetch matchup from bracket_state
   * 2. Determine round → create harness with round-specific middleware
   * 3. Run both agents via orchestrator
   * 4. Apply tiebreaker if scores tied
   * 5. Update bracket_state with scores, metrics, winner
   * 6. Write feedback for both agents (postMatch hook)
   * 7. Return MatchResult
   */
  async executeMatch(matchId: number): Promise<MatchResult> {
    // 1. Fetch matchup
    const matchup = await this.db.query.bracketState.findFirst({
      where: eq(schema.bracketState.id, matchId),
    });

    if (!matchup) {
      throw new Error(`Matchup ${matchId} not found`);
    }

    // Fetch agent IDs from entries
    const entryA = await this.db.query.tournamentEntries.findFirst({
      where: eq(schema.tournamentEntries.id, matchup.entryAId),
    });
    const entryB = await this.db.query.tournamentEntries.findFirst({
      where: eq(schema.tournamentEntries.id, matchup.entryBId),
    });

    if (!entryA || !entryB) {
      throw new Error(`Entries not found for matchup ${matchId}`);
    }

    // Mark started
    await this.db
      .update(schema.bracketState)
      .set({ startedAt: new Date().toISOString() })
      .where(eq(schema.bracketState.id, matchId));

    // Emit match:started event
    const round = matchup.round as RoundName;
    eventBus.publish({
      type: "match:started",
      data: { matchId, round, region: matchup.region, entryAId: matchup.entryAId, entryBId: matchup.entryBId },
      timestamp: new Date().toISOString(),
    });

    // 2. Create harness for this round
    const harness = await createHarness(round);

    try {
      // 3. Run both agents via orchestrator
      const job = {
        matchId,
        roundNumber: round,
        agentAId: entryA.agentId,
        agentBId: entryB.agentId,
        entryAId: matchup.entryAId,
        entryBId: matchup.entryBId,
      };

      const rawResult = await this.orchestrator.runMatch(job, harness.url);

      // 4. Apply tiebreaker if scores tied
      let winnerId = rawResult.winnerId;
      if (rawResult.scoreA === rawResult.scoreB) {
        winnerId = resolveTiebreak(
          rawResult.metricsA,
          matchup.entryAId,
          rawResult.metricsB,
          matchup.entryBId,
        );
      }

      const completedAt = new Date().toISOString();

      // 5. Update bracket_state
      await this.db
        .update(schema.bracketState)
        .set({
          winnerId,
          scoreA: rawResult.scoreA,
          scoreB: rawResult.scoreB,
          metricsAJson: JSON.stringify(rawResult.metricsA),
          metricsBJson: JSON.stringify(rawResult.metricsB),
          completedAt,
        })
        .where(eq(schema.bracketState.id, matchId));

      // --- postMatch: write feedback for both agents ---
      try {
        const entryAFull = await this.db.query.tournamentEntries.findFirst({
          where: eq(schema.tournamentEntries.id, matchup.entryAId),
        });
        const entryBFull = await this.db.query.tournamentEntries.findFirst({
          where: eq(schema.tournamentEntries.id, matchup.entryBId),
        });

        if (entryAFull && entryBFull) {
          // Write feedback for agent A
          const feedbackA = await this.feedbackWriter.writeFeedback({
            agentId: entryA.agentId,
            entryId: matchup.entryAId,
            chain: entryAFull.chain as Chain,
            authorizedFeedback: !!entryAFull.authorizedFeedback,
            score: rawResult.scoreA,
            metricsJson: rawResult.metricsA,
            round,
            matchId,
          });

          // Write feedback for agent B
          const feedbackB = await this.feedbackWriter.writeFeedback({
            agentId: entryB.agentId,
            entryId: matchup.entryBId,
            chain: entryBFull.chain as Chain,
            authorizedFeedback: !!entryBFull.authorizedFeedback,
            score: rawResult.scoreB,
            metricsJson: rawResult.metricsB,
            round,
            matchId,
          });

          // Store IPFS CID and tx hash from winner's feedback on the bracket_state row
          const winnerFeedback = winnerId === matchup.entryAId ? feedbackA : feedbackB;
          if (winnerFeedback && !winnerFeedback.skipped) {
            await this.db
              .update(schema.bracketState)
              .set({
                ipfsCid: winnerFeedback.ipfsCid ?? null,
                txHash: winnerFeedback.txHash ?? null,
              })
              .where(eq(schema.bracketState.id, matchId));
          }
        }
      } catch (err) {
        // SYS-CHAIN-5: feedback failure NEVER blocks tournament
        console.error(`[MatchRunner] postMatch feedback failed for match ${matchId}:`, err);
      }

      // Emit match:completed event
      eventBus.publish({
        type: "match:completed",
        data: { matchId, round, region: matchup.region, winnerId, scoreA: rawResult.scoreA, scoreB: rawResult.scoreB },
        timestamp: new Date().toISOString(),
      });

      // 6. Return MatchResult
      const result: MatchResult = {
        ...rawResult,
        winnerId,
        completedAt,
      };

      return result;
    } finally {
      await harness.close().catch(() => {});
    }
  }

  /**
   * Execute all pending matches in a round.
   * "Pending" = winnerId IS NULL.
   */
  async executeRound(round: RoundName): Promise<MatchResult[]> {
    const pendingMatchups = await this.db.query.bracketState.findMany({
      where: and(
        eq(schema.bracketState.round, round),
        isNull(schema.bracketState.winnerId),
      ),
    });

    const results: MatchResult[] = [];
    for (const matchup of pendingMatchups) {
      try {
        const result = await this.executeMatch(matchup.id);
        results.push(result);
      } catch (err) {
        console.error(`[MatchRunner] executeMatch(${matchup.id}) failed:`, err);
        // Per SYS-RES-4: second failure → higher seed (entryA) advances
        await this.db
          .update(schema.bracketState)
          .set({
            winnerId: matchup.entryAId,
            scoreA: 0,
            scoreB: 0,
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.bracketState.id, matchup.id));
      }
    }

    return results;
  }

  /**
   * After a round completes, generate next-round matchup rows in DB.
   * Returns the number of new matchups inserted.
   */
  async generateNextRound(completedRound: RoundName): Promise<number> {
    // Fetch all matchups for the completed round
    const allMatchups = await this.db.query.bracketState.findMany({
      where: eq(schema.bracketState.round, completedRound),
    });

    // Convert DB rows to BracketMatchup type
    const bracketMatchups: BracketMatchup[] = allMatchups.map((m) => ({
      id: m.id,
      round: m.round as RoundName,
      region: m.region as BracketMatchup["region"],
      seedA: m.seedA ?? 0,
      seedB: m.seedB ?? 0,
      entryAId: m.entryAId,
      entryBId: m.entryBId,
      winnerId: m.winnerId ?? null,
      scoreA: m.scoreA ?? null,
      scoreB: m.scoreB ?? null,
      metricsAJson: m.metricsAJson ?? null,
      metricsBJson: m.metricsBJson ?? null,
      ipfsCid: m.ipfsCid ?? null,
      txHash: m.txHash ?? null,
      startedAt: m.startedAt ?? null,
      completedAt: m.completedAt ?? null,
    }));

    // Generate next round matchups (throws if any not completed)
    const nextMatchups = generateNextRoundMatchups(bracketMatchups, completedRound);

    // Insert into DB
    for (const m of nextMatchups) {
      await this.db.insert(schema.bracketState).values({
        round: m.round,
        region: m.region,
        seedA: m.seedA || null,
        seedB: m.seedB || null,
        entryAId: m.entryAId,
        entryBId: m.entryBId,
      });
    }

    return nextMatchups.length;
  }

  /**
   * Execute a full round lifecycle: run all matches → write feedback (via postMatch hooks) → generate next round.
   */
  async postRound(round: RoundName): Promise<{ results: MatchResult[]; nextRoundMatchups: number }> {
    const results = await this.executeRound(round);
    const nextRoundMatchups = await this.generateNextRound(round);
    return { results, nextRoundMatchups };
  }
}
