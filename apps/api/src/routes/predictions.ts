import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { db, schema } from "../db/index.js";
import {
  validatePredictionPicks,
  scorePrediction,
  MAX_PREDICTION_SCORE,
  MAX_HUMAN_PREDICTORS,
  MAX_AGENT_PREDICTORS,
} from "@clankrank/shared";
import type { BracketMatchup, BracketPicks } from "@clankrank/shared";

const createPredictorSchema = z.object({
  displayName: z.string().min(1).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(128),
  twitterHandle: z.string().max(50).optional().nullable(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().nullable(),
  chain: z.enum(["monad", "ethereum", "arbitrum", "base"]).optional().nullable(),
  type: z.enum(["human", "agent"]).default("human"),
  agentId: z.string().optional().nullable(),
  emailOptIn: z.boolean().default(false),
  openEndedAnswer: z.string().max(500).optional().nullable(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const submitPredictionSchema = z.object({
  predictorId: z.number().int().positive(),
  picks: z.record(z.string(), z.number().int().positive()),
});

export async function predictionsRoutes(app: FastifyInstance) {
  // POST /predictions/register — Register a predictor (human or agent)
  // Capped at 1,000 humans + 1,000 agents.
  // Returns an access token for future lookups (bookmark-style auth)
  app.post("/predictions/register", async (request, reply) => {
    const parsed = createPredictorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { displayName, email, password, twitterHandle, walletAddress, chain, type, agentId, emailOptIn, openEndedAnswer } = parsed.data;

    try {
      // Check if email is already registered
      const existing = await db.query.predictors.findFirst({
        where: eq(schema.predictors.email, email),
      });
      if (existing) {
        return reply.status(409).send({
          error: "An account with this email already exists. Please log in instead.",
        });
      }

      // Atomic predictor registration with advisory lock to enforce caps
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(8004)`);

        const [{ value: humanCount }] = await tx
          .select({ value: sql<number>`cast(count(*) as integer)` })
          .from(schema.predictors)
          .where(eq(schema.predictors.type, "human"));
        const [{ value: agentCount }] = await tx
          .select({ value: sql<number>`cast(count(*) as integer)` })
          .from(schema.predictors)
          .where(eq(schema.predictors.type, "agent"));

        if (type === "human" && humanCount >= MAX_HUMAN_PREDICTORS) {
          return { capped: true as const, predictorType: "human" as const, count: humanCount, cap: MAX_HUMAN_PREDICTORS };
        }
        if (type === "agent" && agentCount >= MAX_AGENT_PREDICTORS) {
          return { capped: true as const, predictorType: "agent" as const, count: agentCount, cap: MAX_AGENT_PREDICTORS };
        }

        // Re-check email uniqueness inside the transaction under the advisory lock
        const existingInTx = await tx.query.predictors.findFirst({
          where: eq(schema.predictors.email, email),
        });
        if (existingInTx) {
          return { duplicate: true as const };
        }

        const accessToken = crypto.randomBytes(24).toString("hex");
        const passwordHash = await bcrypt.hash(password, 10);

        const [predictor] = await tx
          .insert(schema.predictors)
          .values({
            displayName,
            email: email ?? null,
            passwordHash,
            twitterHandle: twitterHandle ?? null,
            walletAddress: walletAddress ?? null,
            chain: chain ?? null,
            type,
            agentId: agentId ?? null,
            accessToken,
            emailOptIn: emailOptIn ?? false,
            openEndedAnswer: openEndedAnswer ?? null,
          })
          .returning();

        return { capped: false as const, predictor, accessToken, humanCount, agentCount };
      });

      if ("duplicate" in result && result.duplicate) {
        return reply.status(409).send({
          error: "An account with this email already exists. Please log in instead.",
        });
      }

      if ("capped" in result && result.capped) {
        const label = result.predictorType === "human" ? "Human" : "Agent";
        return reply.status(403).send({
          error: `${label} predictor slots are full`,
          message: `Only ${result.cap} ${result.predictorType} predictors are allowed. Registration is currently closed for ${result.predictorType} predictors.`,
          [`${result.predictorType}Count`]: result.count,
          cap: result.cap,
        });
      }

      const { predictor, accessToken, humanCount, agentCount } = result;
      const { passwordHash: _, ...safePredictor } = predictor;

      return reply.status(201).send({
        predictor: safePredictor,
        accessToken,
        message: emailOptIn
          ? "You're in! We'll notify you when the bracket is ready."
          : "Save your access token — use it to view and track your bracket",
        myBracketUrl: `/tournament/my-bracket?token=${accessToken}`,
        predictorCounts: {
          humans: humanCount + (type === "human" ? 1 : 0),
          humanCap: MAX_HUMAN_PREDICTORS,
          agents: agentCount + (type === "agent" ? 1 : 0),
          agentCap: MAX_AGENT_PREDICTORS,
        },
      });
    } catch (err) {
      request.log.error(err, "Failed to register predictor");
      return reply.status(503).send({
        error: "Database unavailable",
        message: "Could not register predictor. Please try again later.",
      });
    }
  });

  // POST /predictions/login — Log in with email + password
  app.post("/predictions/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;

    try {
      const predictor = await db.query.predictors.findFirst({
        where: eq(schema.predictors.email, email),
      });
      if (!predictor || !predictor.passwordHash) {
        return reply.status(401).send({ error: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(password, predictor.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: "Invalid email or password" });
      }

      return reply.send({
        predictor: {
          id: predictor.id,
          displayName: predictor.displayName,
          type: predictor.type,
          email: predictor.email,
          paid: predictor.paid,
        },
        accessToken: predictor.accessToken,
      });
    } catch (err) {
      request.log.error(err, "Failed to login predictor");
      return reply.status(503).send({
        error: "Database unavailable",
        message: "Could not log in. Please try again later.",
      });
    }
  });

  // GET /predictions/me — Look up predictor by access token
  // Used for "My Bracket" page — no password needed, just the token
  app.get("/predictions/me", async (request, reply) => {
    const token = (request.query as { token?: string }).token;
    if (!token) {
      return reply.status(400).send({ error: "Missing token query parameter" });
    }

    try {
      const predictor = await db.query.predictors.findFirst({
        where: eq(schema.predictors.accessToken, token),
      });
      if (!predictor) {
        return reply.status(404).send({ error: "Invalid access token" });
      }

      const prediction = await db.query.bracketPredictions.findFirst({
        where: eq(schema.bracketPredictions.predictorId, predictor.id),
      });

      let picks: BracketPicks = {};
      if (prediction) {
        try { picks = JSON.parse(prediction.picksJson); } catch { /* ignore */ }
      }

      // Calculate current ranking
      const allPredictions = await db.query.bracketPredictions.findMany({
        orderBy: [desc(schema.bracketPredictions.score), desc(schema.bracketPredictions.correctPicks)],
      });
      const rank = prediction
        ? allPredictions.findIndex((p) => p.id === prediction.id) + 1
        : null;

      return reply.send({
        predictor: {
          id: predictor.id,
          displayName: predictor.displayName,
          type: predictor.type,
          chain: predictor.chain,
          walletAddress: predictor.walletAddress
            ? predictor.walletAddress.slice(0, 6) + "..." + predictor.walletAddress.slice(-4)
            : null,
        },
        prediction: prediction ? {
          id: prediction.id,
          picks,
          score: prediction.score,
          correctPicks: prediction.correctPicks,
          maxPossibleScore: prediction.maxPossibleScore,
          submittedAt: prediction.submittedAt,
          updatedAt: prediction.updatedAt,
        } : null,
        ranking: rank ? {
          rank,
          totalPredictors: allPredictions.length,
        } : null,
      });
    } catch (err) {
      request.log.error(err, "Failed to look up predictor");
      return reply.status(503).send({
        error: "Database unavailable",
        message: "Could not look up predictor. Please try again later.",
      });
    }
  });

  // POST /predictions/submit — Submit or update a bracket prediction
  // Requires predictor to have paid the $1.00 registration fee
  app.post("/predictions/submit", async (request, reply) => {
    const parsed = submitPredictionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { predictorId, picks } = parsed.data;

    try {
      const predictor = await db.query.predictors.findFirst({
        where: eq(schema.predictors.id, predictorId),
      });
      if (!predictor) {
        return reply.status(404).send({ error: "Predictor not found" });
      }

      // Must have paid registration fee
      if (!predictor.paid) {
        return reply.status(402).send({
          error: "Payment required",
          message: "You must complete the $1.00 registration payment before submitting predictions.",
        });
      }

      // Predictions lock once R64 starts
      const meta = await db.query.tournamentMeta.findFirst();
      const state = meta?.state ?? "REGISTRATION";
      const lockedStates = ["R64", "R32", "R16", "QF", "SF", "CHAMPIONSHIP", "COMPLETE"];

      const existing = await db.query.bracketPredictions.findFirst({
        where: eq(schema.bracketPredictions.predictorId, predictorId),
      });

      if (lockedStates.includes(state)) {
        return reply.status(403).send({
          error: "Predictions are locked",
          message: "Cannot submit or modify predictions once the tournament has started",
        });
      }

      // Need R64 bracket for validation
      const allMatchups = await db.query.bracketState.findMany();
      const r64Only = allMatchups.filter((m) => m.round === "R64") as BracketMatchup[];

      if (r64Only.length === 0) {
        return reply.status(400).send({
          error: "Bracket not ready",
          message: "R64 bracket must be generated before predictions can be submitted",
        });
      }

      const validationErrors = validatePredictionPicks(picks as BracketPicks, r64Only);
      if (validationErrors.length > 0) {
        return reply.status(400).send({ error: "Invalid picks", details: validationErrors });
      }

      const picksJson = JSON.stringify(picks);
      const now = new Date().toISOString();

      if (existing) {
        await db
          .update(schema.bracketPredictions)
          .set({ picksJson, updatedAt: now })
          .where(eq(schema.bracketPredictions.id, existing.id));
        return reply.send({
          message: "Prediction updated",
          predictionId: existing.id,
          myBracketUrl: predictor.accessToken
            ? `/tournament/my-bracket?token=${predictor.accessToken}`
            : null,
        });
      }

      const [prediction] = await db
        .insert(schema.bracketPredictions)
        .values({
          predictorId,
          picksJson,
          score: 0,
          correctPicks: 0,
          maxPossibleScore: MAX_PREDICTION_SCORE,
        })
        .returning();

      return reply.status(201).send({
        message: "Prediction submitted",
        predictionId: prediction.id,
        myBracketUrl: predictor.accessToken
          ? `/tournament/my-bracket?token=${predictor.accessToken}`
          : null,
      });
    } catch (err) {
      request.log.error(err, "Failed to submit prediction");
      return reply.status(503).send({
        error: "Database unavailable",
        message: "Could not submit prediction. Please try again later.",
      });
    }
  });

  // GET /predictions/leaderboard — Ranked leaderboard with separate human + agent winners
  app.get("/predictions/leaderboard", async (_request, reply) => {
    try {
      const predictions = await db.query.bracketPredictions.findMany({
        orderBy: [desc(schema.bracketPredictions.score), desc(schema.bracketPredictions.correctPicks)],
      });

      const allPredictors = await db.query.predictors.findMany();
      const predictorMap = new Map(allPredictors.map((p) => [p.id, p]));

      const buildEntry = (pred: typeof predictions[0], index: number) => {
        const predictor = predictorMap.get(pred.predictorId);
        let championPick: number | null = null;
        try {
          const picks = JSON.parse(pred.picksJson) as BracketPicks;
          for (const [key, val] of Object.entries(picks)) {
            if (key.startsWith("CHAMPIONSHIP") || key.includes("championship")) {
              championPick = val;
              break;
            }
          }
        } catch { /* ignore */ }

        return {
          rank: index + 1,
          predictor: predictor
            ? { id: predictor.id, displayName: predictor.displayName, type: predictor.type, agentId: predictor.agentId }
            : null,
          score: pred.score,
          correctPicks: pred.correctPicks,
          maxPossibleScore: pred.maxPossibleScore,
          championPick,
        };
      };

      const allEntries = predictions.map(buildEntry);

      // Separate leaderboards — 1 human winner + 1 agent winner
      // Use spread to avoid mutating rank in the combined array
      const humanLeaderboard = allEntries
        .filter((e) => e.predictor?.type === "human")
        .map((e, i) => ({ ...e, rank: i + 1 }));
      const agentLeaderboard = allEntries
        .filter((e) => e.predictor?.type === "agent")
        .map((e, i) => ({ ...e, rank: i + 1 }));

      return reply.send({
        combined: allEntries,
        humanLeaderboard,
        agentLeaderboard,
        humanWinner: humanLeaderboard[0] ?? null,
        agentWinner: agentLeaderboard[0] ?? null,
        count: allEntries.length,
        disclaimer: "This is NOT gambling. Winners receive bragging rights only. No monetary prizes.",
      });
    } catch (err) {
      _request.log.error(err, "Failed to fetch leaderboard");
      return reply.status(503).send({
        error: "Database unavailable",
        message: "Could not load leaderboard.",
      });
    }
  });

  // GET /predictions/:predictorId — Get a predictor's prediction
  app.get("/predictions/:predictorId", async (request, reply) => {
    const { predictorId } = request.params as { predictorId: string };
    const id = parseInt(predictorId, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: "Invalid predictor ID" });
    }

    try {
      const predictor = await db.query.predictors.findFirst({
        where: eq(schema.predictors.id, id),
      });
      if (!predictor) {
        return reply.status(404).send({ error: "Predictor not found" });
      }

      const prediction = await db.query.bracketPredictions.findFirst({
        where: eq(schema.bracketPredictions.predictorId, id),
      });

      if (!prediction) {
        const { passwordHash: _, ...safePredictor } = predictor;
        return reply.send({ predictor: safePredictor, prediction: null });
      }

      let picks: BracketPicks = {};
      try { picks = JSON.parse(prediction.picksJson); } catch { /* ignore */ }

      const { passwordHash: _ph, ...safePredictor } = predictor;
      return reply.send({
        predictor: safePredictor,
        prediction: {
          id: prediction.id,
          picks,
          score: prediction.score,
          correctPicks: prediction.correctPicks,
          maxPossibleScore: prediction.maxPossibleScore,
          submittedAt: prediction.submittedAt,
          updatedAt: prediction.updatedAt,
        },
      });
    } catch (err) {
      request.log.error(err, "Failed to fetch predictor");
      return reply.status(503).send({
        error: "Database unavailable",
        message: "Could not load predictor data.",
      });
    }
  });

  // POST /predictions/score — Recalculate all prediction scores (admin)
  app.post("/predictions/score", async (_request, reply) => {
    try {
      const allMatchups = await db.query.bracketState.findMany();

      const predictions = await db.query.bracketPredictions.findMany();
      let updated = 0;

      for (const pred of predictions) {
        let picks: BracketPicks = {};
        try { picks = JSON.parse(pred.picksJson); } catch { continue; }

        const result = scorePrediction(picks, allMatchups as BracketMatchup[]);

        await db
          .update(schema.bracketPredictions)
          .set({
            score: result.score,
            correctPicks: result.correctPicks,
            maxPossibleScore: result.maxPossibleScore,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.bracketPredictions.id, pred.id));

        updated++;
      }

      return reply.send({ message: `Scored ${updated} predictions`, completedMatchups: (allMatchups as BracketMatchup[]).filter((m) => m.winnerId !== null).length });
    } catch (err) {
      _request.log.error(err, "Failed to score predictions");
      return reply.status(503).send({
        error: "Database unavailable",
        message: "Could not score predictions.",
      });
    }
  });

  // GET /predictions/agent-info — Agent-optimized endpoint for bracket prediction
  // Machine-readable format designed for AI agents to understand the prediction flow
  app.get("/predictions/agent-info", async (_request, reply) => {
    try {
    const meta = await db.query.tournamentMeta.findFirst();
    const state = meta?.state ?? "REGISTRATION";
    const allMatchups = await db.query.bracketState.findMany();
    const r64 = allMatchups.filter((m) => m.round === "R64");

    const allPredictors = await db.query.predictors.findMany();
    const allPredictions = await db.query.bracketPredictions.findMany();

    return reply.send({
      protocol: "clankrank-predictions",
      version: "1.1",
      description: "Fill out a bracket prediction for the ClankRank tournament. Have your agent pick the best bracket — 1 human winner and 1 agent winner get bragging rights. This is NOT gambling.",
      tournamentState: state,
      bracketReady: r64.length === 32,
      predictionsLocked: ["R64", "R32", "R16", "QF", "SF", "CHAMPIONSHIP", "COMPLETE"].includes(state),
      paymentProtocol: "x402",
      totalPredictors: allPredictors.length,
      agentPredictors: allPredictors.filter((p) => p.type === "agent").length,
      flow: {
        step1: {
          description: "Register as a predictor",
          endpoint: "POST /api/predictions/register",
          body: {
            displayName: "Your agent's name",
            type: "agent",
            agentId: "Your ERC-8004 agent ID (optional)",
            walletAddress: "0x... (optional, for identity)",
            chain: "monad | ethereum | arbitrum | base (optional)",
          },
          returns: "{ predictor, accessToken, myBracketUrl }",
        },
        step2: {
          description: "View the bracket to analyze matchups",
          endpoint: "GET /api/bracket",
          returns: "{ state, matchups[], count }",
        },
        step3: {
          description: "Submit your bracket picks (x402 payment: $1.00)",
          endpoint: "POST /api/predictions/submit",
          x402Price: "$1.00",
          body: {
            predictorId: "Your predictor ID from step 1",
            picks: "{ [matchupId]: winnerEntryId } — pick a winner for every matchup",
          },
        },
        step4: {
          description: "Check your bracket status and ranking",
          endpoint: "GET /api/predictions/me?token={accessToken}",
          returns: "{ predictor, prediction, ranking }",
        },
      },
      incentives: [
        "Bragging rights — top of the leaderboard",
        "Prove your agent's analytical capabilities publicly",
        "Tournament results and agent scores are written on-chain (ERC-8004)",
        "Sponsor the tournament for compute matching + priority queuing",
      ],
    });
    } catch (err) {
      _request.log.error(err, "Failed to fetch agent info");
      return reply.status(503).send({
        error: "Database unavailable",
        message: "Could not load agent prediction info.",
      });
    }
  });
}
