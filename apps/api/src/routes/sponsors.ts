import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { X402_GATES, isX402Enabled } from "../middleware/x402.js";

/**
 * Sponsor tiers with slot limits and benefits.
 *
 * Agents and brands can sponsor the tournament.
 * Sponsoring agents receive:
 *   - Compute matching for future events
 *   - Priority queuing (first access to expanded compute pools)
 *   - Featured listing on tournament page
 *   - Analytics access (agent performance insights)
 */
const SPONSOR_TIERS = {
  surf: {
    maxSlots: 10,
    amountUsd: 100,
    benefits: [
      "Compute matching for future events (1:1 ratio)",
      "Priority queuing for next 2 tournament events",
      "Sponsor badge on tournament page",
      "Early access to tournament analytics API",
    ],
  },
  crawl: {
    maxSlots: 3,
    amountUsd: 250,
    benefits: [
      "Enhanced compute matching (2:1 ratio)",
      "Priority queuing for next 5 tournament events",
      "Featured listing on tournament page with custom branding",
      "Full tournament analytics + agent comparison dashboard",
      "Direct API access to match replay data",
    ],
  },
  refer: {
    maxSlots: 1,
    amountUsd: 1000,
    benefits: [
      "Maximum compute matching (5:1 ratio)",
      "Top-tier priority queuing for all future events",
      "Featured placement in tournament header + finals broadcast",
      "Exclusive analytics: full agent telemetry + predictive insights",
      "Custom sandbox configuration for sponsored agents",
      "Direct line to engineering for integration support",
      "Co-branded tournament results page",
    ],
  },
} as const;

type SponsorTier = keyof typeof SPONSOR_TIERS;

const sponsorSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  agentId: z.string().optional(),
  displayName: z.string().min(1).max(100).optional(),
});

export async function sponsorRoutes(app: FastifyInstance) {
  // GET /sponsors — List all sponsors and available slots
  app.get("/sponsors", async (_request, reply) => {
    const allSponsors = await db.query.sponsorSlots.findMany({
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });

    const tiers = Object.entries(SPONSOR_TIERS).map(([tier, config]) => {
      const taken = allSponsors.filter((s) => s.tier === tier);
      return {
        tier,
        price: `$${config.amountUsd}`,
        maxSlots: config.maxSlots,
        takenSlots: taken.length,
        availableSlots: config.maxSlots - taken.length,
        benefits: config.benefits,
        sponsors: taken.map((s) => ({
          displayName: s.displayName,
          agentId: s.agentId,
          walletAddress: s.walletAddress.slice(0, 6) + "..." + s.walletAddress.slice(-4),
          createdAt: s.createdAt,
        })),
      };
    });

    return reply.send({
      tiers,
      x402Enabled: isX402Enabled(),
      totalSponsors: allSponsors.length,
    });
  });

  // POST /sponsors/surf — $100 Surf Sponsor (10 slots)
  app.post(
    "/sponsors/surf",
    { preHandler: [X402_GATES.sponsorSurf] },
    async (request, reply) => {
      return handleSponsor(request, reply, "surf");
    },
  );

  // POST /sponsors/crawl — $250 Crawl Sponsor (3 slots)
  app.post(
    "/sponsors/crawl",
    { preHandler: [X402_GATES.sponsorCrawl] },
    async (request, reply) => {
      return handleSponsor(request, reply, "crawl");
    },
  );

  // POST /sponsors/refer — $1,000 Refer Sponsor (1 slot)
  app.post(
    "/sponsors/refer",
    { preHandler: [X402_GATES.sponsorRefer] },
    async (request, reply) => {
      return handleSponsor(request, reply, "refer");
    },
  );

  // GET /sponsors/agent-info — Agent-optimized endpoint describing sponsorship benefits
  // Machine-readable format designed for AI agents to evaluate sponsorship value
  app.get("/sponsors/agent-info", async (_request, reply) => {
    const allSponsors = await db.query.sponsorSlots.findMany();

    return reply.send({
      protocol: "agent-madness-sponsor",
      version: "1.0",
      description: "Sponsor Agent Madness to receive compute matching, priority queuing, and analytics access for your AI agent.",
      paymentProtocol: "x402",
      x402Enabled: isX402Enabled(),
      tiers: Object.entries(SPONSOR_TIERS).map(([tier, config]) => {
        const taken = allSponsors.filter((s) => s.tier === tier).length;
        return {
          id: tier,
          endpoint: `/api/sponsors/${tier}`,
          method: "POST",
          priceUsd: config.amountUsd,
          x402Price: `$${config.amountUsd}.00`,
          slotsTotal: config.maxSlots,
          slotsRemaining: config.maxSlots - taken,
          available: taken < config.maxSlots,
          benefits: config.benefits,
          // Machine-readable benefit categories for agent evaluation
          benefitCategories: {
            computeMultiplier: tier === "refer" ? 5 : tier === "crawl" ? 2 : 1,
            priorityEvents: tier === "refer" ? Infinity : tier === "crawl" ? 5 : 2,
            analyticsAccess: tier === "refer" ? "full" : tier === "crawl" ? "full" : "basic",
            featuredPlacement: tier !== "surf",
          },
          requestBody: {
            walletAddress: "0x... (required, your agent's wallet)",
            agentId: "string (optional, your agent's ERC-8004 ID)",
            displayName: "string (optional, display name for listing)",
          },
        };
      }),
    });
  });
}

async function handleSponsor(request: FastifyRequest, reply: FastifyReply, tier: SponsorTier) {
  const tierConfig = SPONSOR_TIERS[tier];

  // Check slot availability
  const takenSlots = await db.query.sponsorSlots.findMany({
    where: eq(schema.sponsorSlots.tier, tier),
  });

  if (takenSlots.length >= tierConfig.maxSlots) {
    return reply.status(409).send({
      error: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Sponsor tier is sold out`,
      maxSlots: tierConfig.maxSlots,
      takenSlots: takenSlots.length,
    });
  }

  // Validate input
  const parsed = sponsorSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid input",
      details: parsed.error.flatten(),
    });
  }

  const { walletAddress, agentId, displayName } = parsed.data;

  // Check for duplicate wallet in same tier
  const existing = takenSlots.find((s) => s.walletAddress === walletAddress);
  if (existing) {
    return reply.status(409).send({
      error: "Wallet already sponsors this tier",
      walletAddress,
      tier,
    });
  }

  // Get tx hash from payment if available
  const txHash = (request as any).x402Payment?.txHash ?? null;

  const [slot] = await db.insert(schema.sponsorSlots).values({
    tier,
    walletAddress,
    agentId: agentId ?? null,
    displayName: displayName ?? null,
    txHash,
    amountUsd: tierConfig.amountUsd,
  }).returning();

  return reply.status(201).send({
    message: `Successfully claimed ${tier.charAt(0).toUpperCase() + tier.slice(1)} Sponsor slot`,
    slot,
    benefits: tierConfig.benefits,
    remainingSlots: tierConfig.maxSlots - takenSlots.length - 1,
  });
}

