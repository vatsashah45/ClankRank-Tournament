import type { FastifyInstance } from "fastify";
import { db, schema } from "../db/index.js";

export async function bracketRoutes(app: FastifyInstance) {
  // GET /bracket — Full bracket state
  app.get("/bracket", async (_request, reply) => {
    try {
      const [matchups, meta] = await Promise.all([
        db.query.bracketState.findMany({
          orderBy: (bs, { asc }) => [asc(bs.round), asc(bs.region), asc(bs.seedA)],
        }),
        db.query.tournamentMeta.findFirst(),
      ]);

      return reply.send({
        state: meta?.state ?? "REGISTRATION",
        matchups,
        count: matchups.length,
      });
    } catch (err) {
      _request.log.error(err, "Failed to fetch bracket data");
      return reply.status(503).send({
        error: "Database unavailable",
        message: "Could not load bracket data. The database may not be initialized — run pnpm db:migrate.",
      });
    }
  });

  // GET /bracket/region/:region — Matchups for a specific region
  app.get("/bracket/region/:region", async (request, reply) => {
    try {
      const { region } = request.params as { region: string };

      const matchups = await db.query.bracketState.findMany({
        where: (bs, { eq }) => eq(bs.region, region),
        orderBy: (bs, { asc }) => [asc(bs.round), asc(bs.seedA)],
      });

      return reply.send({ region, matchups, count: matchups.length });
    } catch (err) {
      request.log.error(err, "Failed to fetch region bracket data");
      return reply.status(503).send({
        error: "Database unavailable",
        message: "Could not load region bracket data.",
      });
    }
  });
}
