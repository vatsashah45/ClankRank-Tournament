import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, schema } from "../db/index.js";
import { adminAuth } from "../hooks/admin-auth.js";
import { config } from "../config.js";
import { SandboxService } from "../services/sandbox.js";
import { EdgeProxyService } from "../services/edge-proxy.js";
import { runQualification } from "../services/qualification.js";
import { TournamentStateMachine } from "../services/state-machine.js";
import { MatchRunner } from "../services/match-runner.js";
import { SandboxOrchestrator } from "../services/orchestrator/index.js";
import { eventBus } from "../services/event-bus.js";
import {
  seedAgents,
  validateSeeding,
  generateR64Matchups,
  validateBracket,
  STATE_ORDER,
  ROUND_ORDER,
  ROUND_SCHEDULE,
  TOURNAMENT_SCHEDULE,
  CHAMPIONSHIP_VENUE,
  getRoundSchedule,
} from "@agent-madness/shared";
import type { ScoredEntry, TournamentState, RoundName } from "@agent-madness/shared";

const sandboxService = new SandboxService();
const edgeProxyService = new EdgeProxyService();
const stateMachine = new TournamentStateMachine(db);
const orchestrator = new SandboxOrchestrator({ sandboxRuntime: "mock", redisUrl: "mock" });
const matchRunner = new MatchRunner(db, orchestrator);

export async function adminRoutes(app: FastifyInstance) {
  // POST /admin/login — Email + password login for admin users
  // NOT protected by adminAuth — this IS the login endpoint
  app.post("/admin/login", async (request, reply) => {
    const { email, password } = (request.body as { email?: string; password?: string }) ?? {};

    if (!email || !password) {
      return reply.status(400).send({ error: "Email and password are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!config.adminEmails.includes(normalizedEmail)) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    try {
      const predictor = await db.query.predictors.findFirst({
        where: eq(schema.predictors.email, normalizedEmail),
      });

      if (!predictor || !predictor.passwordHash) {
        return reply.status(401).send({ error: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(password, predictor.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: "Invalid email or password" });
      }

      return reply.send({
        verified: true,
        token: predictor.accessToken,
        email: predictor.email,
        displayName: predictor.displayName,
      });
    } catch (err) {
      request.log.error(err, "Admin login failed");
      return reply.status(503).send({ error: "Unable to process login" });
    }
  });

  // Protect all remaining admin routes with auth hook
  app.addHook("onRequest", adminAuth);

  // POST /admin/verify — Verify admin key
  app.post("/admin/verify", async (_request, reply) => {
    return reply.send({ verified: true });
  });

  // GET /admin/state — Current tournament state
  app.get("/admin/state", async (_request, reply) => {
    const meta = await db.query.tournamentMeta.findFirst();
    return reply.send({ state: meta?.state ?? "REGISTRATION" });
  });

  // POST /admin/state/advance — Advance state with precondition validation
  app.post("/admin/state/advance", async (request, reply) => {
    const meta = await db.query.tournamentMeta.findFirst();
    if (!meta) {
      return reply.status(500).send({ error: "Tournament meta not initialized" });
    }

    const currentIdx = STATE_ORDER.indexOf(meta.state as TournamentState);
    if (currentIdx === -1 || currentIdx >= STATE_ORDER.length - 1) {
      return reply.status(400).send({ error: "Cannot advance beyond COMPLETE" });
    }

    const nextState = STATE_ORDER[currentIdx + 1] as TournamentState;
    const force = (request.query as Record<string, string>).force === "true";

    const result = await stateMachine.transition(nextState, { force });

    if (!result.success) {
      return reply.status(400).send({
        error: result.error ?? "Preconditions not met",
        currentState: result.from,
        targetState: result.to,
      });
    }

    eventBus.publish({
      type: "state:advanced",
      data: { from: result.from, to: result.to },
      timestamp: new Date().toISOString(),
    });

    return reply.send({ previousState: result.from, newState: result.to });
  });

  // POST /admin/qualification/run-all — Batch qualify all registered agents
  app.post("/admin/qualification/run-all", async (_request, reply) => {
    const entries = await db.query.tournamentEntries.findMany();
    const registered = entries.filter((e) => e.status === "registered");

    const results: Array<{ entryId: number; agentId: string; score: number; tier: string }> = [];
    const errors: Array<{ entryId: number; agentId: string; error: string }> = [];

    for (const entry of registered) {
      try {
        const result = await runQualification(
          entry.agentId,
          sandboxService,
          edgeProxyService,
        );

        // Check for existing score
        const existing = await db.query.qualificationScores.findFirst({
          where: eq(schema.qualificationScores.entryId, entry.id),
        });

        const scoreData = {
          entryId: entry.id,
          score: result.scoreResult.score,
          tier: result.scoreResult.tier,
          respected429: result.metrics.respected429,
          loops: result.metrics.loops,
          totalRequests: result.metrics.totalRequests,
          errorRate: result.metrics.errorRate ?? 0,
          avgLatency: result.metrics.averageLatency ?? 0,
          burstiness: result.metrics.burstiness ?? 0,
          onChainFeedbackCount: result.metrics.onChainFeedbackCount ?? 0,
          onChainAvgScore: result.metrics.onChainAverageScore ?? 0,
          rawMetricsJson: JSON.stringify(result.rawMetrics),
          scoredAt: new Date().toISOString(),
        };

        if (existing) {
          await db.update(schema.qualificationScores).set(scoreData)
            .where(eq(schema.qualificationScores.entryId, entry.id));
        } else {
          await db.insert(schema.qualificationScores).values(scoreData);
        }

        await db.update(schema.tournamentEntries)
          .set({ status: "qualified" })
          .where(eq(schema.tournamentEntries.id, entry.id));

        results.push({
          entryId: entry.id,
          agentId: entry.agentId,
          score: result.scoreResult.score,
          tier: result.scoreResult.tier,
        });
      } catch (err) {
        errors.push({
          entryId: entry.id,
          agentId: entry.agentId,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return reply.send({
      message: `Qualified ${results.length} agents`,
      qualified: results.length,
      failed: errors.length,
      results,
      errors,
    });
  });

  // POST /admin/seed-and-bracket — Run seeding + generate R64 bracket
  app.post("/admin/seed-and-bracket", async (_request, reply) => {
    // Fetch all qualification scores
    const scores = await db.query.qualificationScores.findMany();
    const entries = await db.query.tournamentEntries.findMany();

    const entryMap = new Map(entries.map((e) => [e.id, e]));

    const scoredEntries: ScoredEntry[] = scores.map((s) => ({
      entryId: s.entryId,
      agentId: entryMap.get(s.entryId)?.agentId ?? "unknown",
      score: s.score,
      averageLatency: s.avgLatency ?? 0,
      totalRequests: s.totalRequests ?? 10,
    }));

    if (scoredEntries.length < 64) {
      return reply.status(400).send({
        error: `Need at least 64 qualified agents, have ${scoredEntries.length}`,
      });
    }

    try {
      // Seed agents
      const seeded = seedAgents(scoredEntries);
      const seedErrors = validateSeeding(seeded);
      if (seedErrors.length > 0) {
        return reply.status(500).send({ error: "Seeding validation failed", details: seedErrors });
      }

      // Generate bracket
      const matchups = generateR64Matchups(seeded);
      const bracketErrors = validateBracket(matchups);
      if (bracketErrors.length > 0) {
        return reply.status(500).send({ error: "Bracket validation failed", details: bracketErrors });
      }

      // Clear existing bracket
      await db.delete(schema.bracketState);

      // Insert matchups
      for (const m of matchups) {
        await db.insert(schema.bracketState).values({
          round: m.round,
          region: m.region,
          seedA: m.seedA,
          seedB: m.seedB,
          entryAId: m.entryAId,
          entryBId: m.entryBId,
        });
      }

      // Advance state to R64
      await db
        .update(schema.tournamentMeta)
        .set({
          state: "R64",
          currentRound: "R64",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.tournamentMeta.id, 1));

      return reply.send({
        message: "Bracket generated",
        seededAgents: seeded.length,
        matchups: matchups.length,
        regions: {
          monad: seeded.filter((s) => s.region === "monad").length,
          ethereum: seeded.filter((s) => s.region === "ethereum").length,
          arbitrum: seeded.filter((s) => s.region === "arbitrum").length,
          base: seeded.filter((s) => s.region === "base").length,
        },
      });
    } catch (err) {
      return reply.status(500).send({
        error: "Bracket generation failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // POST /admin/matchup/:id/run — Run a single matchup
  app.post("/admin/matchup/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const matchId = parseInt(id, 10);
    if (isNaN(matchId)) {
      return reply.status(400).send({ error: "Invalid matchup ID" });
    }

    try {
      const result = await matchRunner.executeMatch(matchId);
      return reply.send({ message: "Match completed", result });
    } catch (err) {
      return reply.status(500).send({
        error: "Match execution failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // POST /admin/matchup/:id/replay — Clear and re-run a matchup
  app.post("/admin/matchup/:id/replay", async (request, reply) => {
    const { id } = request.params as { id: string };
    const matchId = parseInt(id, 10);
    if (isNaN(matchId)) {
      return reply.status(400).send({ error: "Invalid matchup ID" });
    }

    // Clear existing result
    await db
      .update(schema.bracketState)
      .set({
        winnerId: null,
        scoreA: null,
        scoreB: null,
        metricsAJson: null,
        metricsBJson: null,
        completedAt: null,
        startedAt: null,
      })
      .where(eq(schema.bracketState.id, matchId));

    try {
      const result = await matchRunner.executeMatch(matchId);
      return reply.send({ message: "Match replayed", result });
    } catch (err) {
      return reply.status(500).send({
        error: "Match replay failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // POST /admin/round/:round/run-all — Execute all pending matchups in a round
  app.post("/admin/round/:round/run-all", async (request, reply) => {
    const { round } = request.params as { round: string };

    const validRounds = ["R64", "R32", "SWEET16", "ELITE8", "FINAL4", "CHAMPIONSHIP"];
    if (!validRounds.includes(round)) {
      return reply.status(400).send({ error: `Invalid round: ${round}` });
    }

    try {
      const results = await matchRunner.executeRound(round as RoundName);
      const isComplete = await stateMachine.isRoundComplete(round as RoundName);

      if (isComplete) {
        eventBus.publish({
          type: "round:completed",
          data: { round },
          timestamp: new Date().toISOString(),
        });
      }

      return reply.send({
        message: `Executed ${results.length} matches in ${round}`,
        results,
        roundComplete: isComplete,
      });
    } catch (err) {
      return reply.status(500).send({
        error: "Round execution failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // POST /admin/round/:round/generate-next — Generate next round matchups from completed round winners
  app.post("/admin/round/:round/generate-next", async (request, reply) => {
    const { round } = request.params as { round: string };

    const validRounds = ["R64", "R32", "SWEET16", "ELITE8", "FINAL4"];
    if (!validRounds.includes(round)) {
      return reply.status(400).send({ error: `Invalid round for next-round generation: ${round}` });
    }

    const roundName = round as RoundName;
    const currentIndex = ROUND_ORDER.indexOf(roundName);
    if (currentIndex === -1 || currentIndex >= ROUND_ORDER.length - 1) {
      return reply.status(400).send({ error: `No next round can be generated from round: ${round}` });
    }
    const nextRound = ROUND_ORDER[currentIndex + 1] as RoundName;

    // Idempotency: if next-round matchups already exist, skip generation
    const existingNextRound = await db.query.bracketState.findMany({
      where: eq(schema.bracketState.round, nextRound),
    });
    if (existingNextRound.length > 0) {
      return reply.send({
        message: `Next round ${nextRound} already has matchups; skipping generation`,
        completedRound: round,
        nextRoundMatchups: existingNextRound.length,
      });
    }

    const isComplete = await stateMachine.isRoundComplete(roundName);
    if (!isComplete) {
      return reply.status(400).send({ error: `${round} is not yet complete — finish all matchups first` });
    }

    try {
      const count = await matchRunner.generateNextRound(roundName);
      return reply.send({
        message: `Generated ${count} matchups for next round`,
        completedRound: round,
        nextRoundMatchups: count,
      });
    } catch (err) {
      return reply.status(500).send({
        error: "Next round generation failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // GET /admin/round/:round/status — Round status
  app.get("/admin/round/:round/status", async (request, reply) => {
    const { round } = request.params as { round: string };

    const validRounds = ["R64", "R32", "SWEET16", "ELITE8", "FINAL4", "CHAMPIONSHIP"];
    if (!validRounds.includes(round)) {
      return reply.status(400).send({ error: `Invalid round: ${round}` });
    }

    const matchups = await db.query.bracketState.findMany({
      where: eq(schema.bracketState.round, round as RoundName),
    });

    const total = matchups.length;
    const completed = matchups.filter((m) => m.winnerId !== null).length;
    const pending = total - completed;
    const winners = matchups
      .filter((m) => m.winnerId !== null)
      .map((m) => m.winnerId);

    return reply.send({ round, total, completed, pending, winners });
  });

  // GET /admin/overview — Dashboard summary
  app.get("/admin/overview", async (_request, reply) => {
    const meta = await db.query.tournamentMeta.findFirst();
    const entries = await db.query.tournamentEntries.findMany();
    const scores = await db.query.qualificationScores.findMany();

    const state = (meta?.state ?? "REGISTRATION") as TournamentState;
    const currentRound = meta?.currentRound as RoundName | null;

    // Round status if in a round
    let roundStatus = null;
    if (currentRound && ROUND_ORDER.includes(currentRound as RoundName)) {
      const matchups = await db.query.bracketState.findMany({
        where: eq(schema.bracketState.round, currentRound),
      });
      roundStatus = {
        round: currentRound,
        total: matchups.length,
        completed: matchups.filter((m) => m.winnerId !== null).length,
        pending: matchups.filter((m) => m.winnerId === null).length,
        schedule: getRoundSchedule(currentRound as RoundName),
      };
    }

    return reply.send({
      state,
      currentRound,
      entries: {
        total: entries.length,
        registered: entries.filter((e) => e.status === "registered").length,
        qualified: entries.filter((e) => e.status === "qualified").length,
        eliminated: entries.filter((e) => e.status === "eliminated").length,
        active: entries.filter((e) => e.status === "active").length,
      },
      qualificationScores: scores.length,
      roundStatus,
      schedule: {
        rounds: ROUND_SCHEDULE,
        tournament: TOURNAMENT_SCHEDULE,
        venue: CHAMPIONSHIP_VENUE,
      },
    });
  });
}
