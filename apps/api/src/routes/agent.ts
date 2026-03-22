import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { BLOCK_EXPLORER_URLS, IPFS_GATEWAY_URL } from "@clankrank/shared";

export async function agentRoutes(app: FastifyInstance) {
  // GET /agent/:agentId/history — Full tournament history for an agent
  app.get("/agent/:agentId/history", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };

    const entry = await db.query.tournamentEntries.findFirst({
      where: eq(schema.tournamentEntries.agentId, agentId),
    });
    if (!entry) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    const qualScore = await db.query.qualificationScores.findFirst({
      where: eq(schema.qualificationScores.entryId, entry.id),
    });

    const allMatchups = await db.query.bracketState.findMany();
    const allEntries = await db.query.tournamentEntries.findMany();
    const entryMap = new Map(allEntries.map((e) => [e.id, e]));

    const agentMatchups = allMatchups
      .filter((m) => m.entryAId === entry.id || m.entryBId === entry.id)
      .map((m) => {
        const isA = m.entryAId === entry.id;
        const opponentEntryId = isA ? m.entryBId : m.entryAId;
        const opponentEntry = entryMap.get(opponentEntryId);
        const rawMetrics = isA ? m.metricsAJson : m.metricsBJson;
        let parsedMetrics: Record<string, unknown> = {};
        try { parsedMetrics = rawMetrics ? JSON.parse(rawMetrics) : {}; } catch { /* ignore */ }
        return {
          matchId: m.id,
          round: m.round,
          region: m.region,
          seed: isA ? m.seedA : m.seedB,
          opponentEntryId,
          opponentId: opponentEntry?.agentId ?? null,
          opponentSeed: isA ? m.seedB : m.seedA,
          agentScore: isA ? m.scoreA : m.scoreB,
          opponentScore: isA ? m.scoreB : m.scoreA,
          won: m.winnerId === entry.id,
          tier: (parsedMetrics.tier as string) ?? null,
          averageLatency: (parsedMetrics.averageLatency as number) ?? null,
          totalRequests: (parsedMetrics.totalRequests as number) ?? null,
          metricsJson: rawMetrics,
          ipfsCid: m.ipfsCid,
          ipfsUrl: m.ipfsCid ? `${IPFS_GATEWAY_URL}${m.ipfsCid}` : null,
          txHash: m.txHash,
          txUrl: m.txHash ? `${BLOCK_EXPLORER_URLS[entry.chain] ?? ""}${m.txHash}` : null,
          startedAt: m.startedAt,
          completedAt: m.completedAt,
        };
      });

    return reply.send({
      entry,
      qualificationScore: qualScore ?? null,
      matchHistory: agentMatchups,
      explorerBaseUrl: BLOCK_EXPLORER_URLS[entry.chain] ?? null,
      ipfsGatewayUrl: IPFS_GATEWAY_URL,
    });
  });
}
