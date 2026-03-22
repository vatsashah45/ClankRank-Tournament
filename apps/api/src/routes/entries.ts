import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { EdgeProxyService } from "../services/edge-proxy.js";
import { isValidWalletAddress, isValidChain, isValidAgentId, AGENTS_PER_REGION, CHAINS } from "@agent-madness/shared";
import type { TournamentState } from "@agent-madness/shared";
import { X402_GATES } from "../middleware/x402.js";

const edgeProxy = new EdgeProxyService();

// Global registration cap — derived from agents per region × number of chains
const TOTAL_CAP = AGENTS_PER_REGION * CHAINS.length; // 64 total

const createEntrySchema = z.object({
  agentId: z.string().min(1),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  chain: z.enum(["monad", "ethereum", "arbitrum", "base"]),
  authorizeFeedback: z.boolean().default(false),
});

export async function entriesRoutes(app: FastifyInstance) {
  // POST /entries — Register a new agent (global cap, overflow → waitlist)
  // x402 gated: $0.10 to register
  app.post("/entries", { preHandler: [X402_GATES.agentEntry] }, async (request, reply) => {
    // Check tournament state
    const meta = await db.query.tournamentMeta.findFirst();
    if (meta && meta.state !== "REGISTRATION") {
      return reply.status(400).send({
        error: "Registration is closed",
        currentState: meta.state,
      });
    }

    // Validate input
    const parsed = createEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const { agentId, walletAddress, chain, authorizeFeedback } = parsed.data;

    // Check for duplicate in both entries and waitlist
    const existing = await db.query.tournamentEntries.findFirst({
      where: eq(schema.tournamentEntries.agentId, agentId),
    });
    if (existing) {
      return reply.status(409).send({
        error: "Agent already registered",
        agentId,
      });
    }

    const existingWaitlist = await db.query.waitlist.findFirst({
      where: eq(schema.waitlist.agentId, agentId),
    });
    if (existingWaitlist) {
      return reply.status(409).send({
        error: "Agent already on waitlist",
        agentId,
        waitlistPosition: existingWaitlist.position,
      });
    }

    // Validate against Edge Proxy
    try {
      const validation = await edgeProxy.validateAgent(agentId);
      if (!validation.valid) {
        return reply.status(400).send({
          error: `Agent not found on ${chain}`,
          agentId,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(503).send({
        error: "Validation service unavailable",
        details: message,
      });
    }

    // Check total registration cap — no per-chain limit.
    // Any chain can have any number of agents. Top 64 by qualification score advance.
    // Uses a transaction with advisory lock to prevent race conditions.
    const registrationResult = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1234567890)`);

      const allEntries = await tx.query.tournamentEntries.findMany();

      if (allEntries.length >= TOTAL_CAP) {
        const allWaitlist = await tx.query.waitlist.findMany();
        const nextPosition = allWaitlist.length + 1;

        const [waitlistEntry] = await tx.insert(schema.waitlist).values({
          agentId,
          walletAddress,
          chain,
          authorizedFeedback: authorizeFeedback,
          position: nextPosition,
        }).returning();

        return { type: "waitlist" as const, waitlistEntry, waitlistPosition: nextPosition };
      }

      const [entry] = await tx.insert(schema.tournamentEntries).values({
        agentId,
        walletAddress,
        chain,
        authorizedFeedback: authorizeFeedback,
      }).returning();

      const chainEntries = allEntries.filter((e) => e.chain === chain);
      return {
        type: "entry" as const,
        entry,
        chainCount: chainEntries.length + 1,
        totalRegistered: allEntries.length + 1,
        remaining: TOTAL_CAP - allEntries.length - 1,
      };
    });

    if (registrationResult.type === "waitlist") {
      return reply.status(202).send({
        message: `Tournament is full (${TOTAL_CAP}/${TOTAL_CAP} agents). Added to waitlist.`,
        waitlistPosition: registrationResult.waitlistPosition,
        waitlistEntry: registrationResult.waitlistEntry,
      });
    }

    const { entry, chainCount, totalRegistered, remaining: remainingSlots } = registrationResult;

    return reply.status(201).send({
      message: "Agent registered successfully",
      entry,
      slots: {
        chain,
        chainCount,
        totalRegistered,
        totalCapacity: TOTAL_CAP,
        remaining: remainingSlots,
      },
    });
  });

  // GET /entries — List all registered agents
  app.get("/entries", async (_request, reply) => {
    try {
      const entries = await db.query.tournamentEntries.findMany({
        orderBy: (entries, { desc }) => [desc(entries.createdAt)],
      });

      // Include chain distribution counts
      const chainCounts: Record<string, number> = {};
      for (const e of entries) {
        chainCounts[e.chain] = (chainCounts[e.chain] ?? 0) + 1;
      }

      return reply.send({
        entries,
        count: entries.length,
        totalCapacity: TOTAL_CAP,
        remaining: Math.max(0, TOTAL_CAP - entries.length),
        chainDistribution: chainCounts,
      });
    } catch (err) {
      _request.log.error(err, "Failed to fetch entries");
      return reply.status(503).send({
        error: "Database unavailable",
        message: "Could not load entries. The database may not be initialized.",
      });
    }
  });

  // GET /entries/slots — Registration availability
  app.get("/entries/slots", async (_request, reply) => {
    try {
      const entries = await db.query.tournamentEntries.findMany();
      const waitlistEntries = await db.query.waitlist.findMany();

      const chainDistribution: Record<string, number> = {};
      for (const chain of CHAINS) {
        chainDistribution[chain] = entries.filter((e) => e.chain === chain).length;
      }

      return reply.send({
        totalRegistered: entries.length,
        totalWaitlisted: waitlistEntries.length,
        totalCapacity: TOTAL_CAP,
        remaining: Math.max(0, TOTAL_CAP - entries.length),
        chainDistribution,
      });
    } catch (err) {
      _request.log.error(err, "Failed to fetch entry slots");
      return reply.status(503).send({
        error: "Database unavailable",
        message: "Could not load slot data.",
      });
    }
  });

  // GET /entries/waitlist — View waitlist
  app.get("/entries/waitlist", async (request, reply) => {
    const { chain } = request.query as { chain?: string };

    let waitlistEntries;
    if (chain) {
      waitlistEntries = await db.query.waitlist.findMany({
        where: eq(schema.waitlist.chain, chain),
      });
    } else {
      waitlistEntries = await db.query.waitlist.findMany();
    }

    // Sort by position
    waitlistEntries.sort((a, b) => a.position - b.position);

    return reply.send({
      waitlist: waitlistEntries,
      count: waitlistEntries.length,
    });
  });

  // GET /entries/:id — Single entry with qualification score
  app.get("/entries/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const entryId = parseInt(id, 10);
    if (isNaN(entryId)) {
      return reply.status(400).send({ error: "Invalid entry ID" });
    }

    const entry = await db.query.tournamentEntries.findFirst({
      where: eq(schema.tournamentEntries.id, entryId),
    });
    if (!entry) {
      return reply.status(404).send({ error: "Entry not found" });
    }

    const qualScore = await db.query.qualificationScores.findFirst({
      where: eq(schema.qualificationScores.entryId, entryId),
    });

    const matchups = await db.query.bracketState.findMany();
    const agentMatchups = matchups.filter(
      (m) => m.entryAId === entryId || m.entryBId === entryId
    );

    return reply.send({ entry, qualificationScore: qualScore ?? null, matchups: agentMatchups });
  });
}
