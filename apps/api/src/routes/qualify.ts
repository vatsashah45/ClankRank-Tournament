import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { SandboxService } from "../services/sandbox.js";
import { EdgeProxyService } from "../services/edge-proxy.js";
import { runQualification } from "../services/qualification.js";

const sandboxService = new SandboxService();
const edgeProxyService = new EdgeProxyService();

export async function qualifyRoutes(app: FastifyInstance) {
  // POST /qualify/:entryId — Run qualification for a single agent
  app.post("/qualify/:entryId", async (request, reply) => {
    const { entryId } = request.params as { entryId: string };
    const id = parseInt(entryId, 10);

    if (isNaN(id)) {
      return reply.status(400).send({ error: "Invalid entry ID" });
    }

    // Find the entry
    const entry = await db.query.tournamentEntries.findFirst({
      where: eq(schema.tournamentEntries.id, id),
    });

    if (!entry) {
      return reply.status(404).send({ error: "Entry not found" });
    }

    // Run qualification
    try {
      const result = await runQualification(
        entry.agentId,
        sandboxService,
        edgeProxyService,
      );

      // Upsert qualification score (overwrite if re-qualifying)
      const existing = await db.query.qualificationScores.findFirst({
        where: eq(schema.qualificationScores.entryId, id),
      });

      const scoreData = {
        entryId: id,
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
        await db
          .update(schema.qualificationScores)
          .set(scoreData)
          .where(eq(schema.qualificationScores.entryId, id));
      } else {
        await db.insert(schema.qualificationScores).values(scoreData);
      }

      // Update entry status
      await db
        .update(schema.tournamentEntries)
        .set({ status: "qualified" })
        .where(eq(schema.tournamentEntries.id, id));

      return reply.send({
        message: "Qualification complete",
        entryId: id,
        score: result.scoreResult.score,
        tier: result.scoreResult.tier,
        metrics: result.metrics,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(500).send({
        error: "Qualification failed",
        details: message,
      });
    }
  });
}
