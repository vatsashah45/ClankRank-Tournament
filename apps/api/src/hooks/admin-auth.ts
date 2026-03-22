import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import { config } from "../config.js";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";

export function adminAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  // Skip auth for the login endpoint itself
  if (request.url.endsWith("/admin/login") || request.url.includes("/admin/login?")) {
    done();
    return;
  }

  const key =
    request.headers["x-admin-key"] ??
    request.headers["authorization"]?.replace("Bearer ", "");

  if (!key) {
    reply.status(401).send({ error: "Unauthorized" });
    return;
  }

  // Check static API key first (fast path for programmatic access)
  if (config.adminApiKey && key === config.adminApiKey) {
    done();
    return;
  }

  // Check if this is a predictor access token from an admin email
  db.query.predictors
    .findFirst({ where: eq(schema.predictors.accessToken, key as string) })
    .then((predictor) => {
      if (
        predictor?.email &&
        config.adminEmails.includes(predictor.email.toLowerCase())
      ) {
        done();
      } else {
        reply.status(401).send({ error: "Unauthorized" });
      }
    })
    .catch(() => {
      reply.status(503).send({ error: "Auth check failed" });
    });
}
