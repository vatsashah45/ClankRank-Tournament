import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { entriesRoutes } from "./routes/entries.js";
import { qualifyRoutes } from "./routes/qualify.js";
import { bracketRoutes } from "./routes/bracket.js";
import { adminRoutes } from "./routes/admin.js";
import { eventsRoutes } from "./routes/events.js";
import { agentRoutes } from "./routes/agent.js";
import { predictionsRoutes } from "./routes/predictions.js";
import { sponsorRoutes } from "./routes/sponsors.js";
import { checkoutRoutes } from "./routes/checkout.js";
import { metrics } from "./services/metrics.js";
import { isX402Enabled } from "./middleware/x402.js";
import { db } from "./db/index.js";
import { sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
    exposedHeaders: ["payment-required", "PAYMENT-REQUIRED", "payment-response", "PAYMENT-RESPONSE", "x-payment-response", "X-PAYMENT-RESPONSE"],
  });

  // Global error handler — return JSON instead of generic 500
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    request.log.error(error, `Error on ${request.method} ${request.url}`);
    reply.status(statusCode).send({
      error: statusCode >= 500 ? "Internal Server Error" : error.message,
      message: error.message,
      statusCode,
    });
  });

  // Register route prefixes
  await app.register(entriesRoutes, { prefix: "/api" });
  await app.register(qualifyRoutes, { prefix: "/api" });
  await app.register(bracketRoutes, { prefix: "/api" });
  await app.register(adminRoutes, { prefix: "/api" });
  await app.register(eventsRoutes, { prefix: "/api" });
  await app.register(agentRoutes, { prefix: "/api" });
  await app.register(predictionsRoutes, { prefix: "/api" });
  await app.register(sponsorRoutes, { prefix: "/api" });
  await app.register(checkoutRoutes, { prefix: "/api" });

  // Track HTTP request counts and durations
  app.addHook("onResponse", (request, reply, done) => {
    const method = request.method;
    const path = request.routeOptions?.url ?? request.url;
    const status = reply.statusCode;
    const duration = reply.elapsedTime;

    metrics.incHttpRequest(method, path, status);
    metrics.observeHttpDuration(method, path, duration);
    done();
  });

  // Prometheus metrics endpoint (no auth required)
  app.get("/metrics", async (_request, reply) => {
    reply.type("text/plain; version=0.0.4; charset=utf-8");
    return metrics.serialize();
  });

  // Enhanced health check
  app.get("/health", async (_request, reply) => {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    // DB check
    const dbStart = performance.now();
    try {
      await db.execute(sql`SELECT 1`);
      checks.database = { status: "ok", latencyMs: Math.round(performance.now() - dbStart) };
    } catch (e) {
      checks.database = { status: "error", error: (e as Error).message };
    }

    // Redis check (skip if mock)
    if (config.redisUrl !== "mock") {
      // Placeholder: would ping Redis here
      checks.redis = { status: "unchecked" };
    } else {
      checks.redis = { status: "mock" };
    }

    const overall = Object.values(checks).every(
      (c) => c.status === "ok" || c.status === "mock" || c.status === "unchecked",
    )
      ? "ok"
      : "degraded";

    return reply.send({
      status: overall,
      version: process.env.npm_package_version ?? "1.0.0",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  // Worker health endpoint
  app.get("/worker/health", async (_request, reply) => {
    const checks: Record<string, { status: string; error?: string }> = {};

    // Queue connectivity check
    if (config.redisUrl === "mock") {
      checks.queue = { status: "mock" };
    } else {
      // Placeholder: would check BullMQ queue health here
      checks.queue = { status: "unchecked" };
    }

    const overall = Object.values(checks).every(
      (c) => c.status === "ok" || c.status === "mock" || c.status === "unchecked",
    )
      ? "ok"
      : "degraded";

    return reply.send({
      status: overall,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  return app;
}

// Start server only when run directly (not when imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    console.log(`\n🏀 ClankRank Tournament API running on port ${config.port}`);
    console.log(`   Mode: ${config.isMockMode ? "MOCK" : "LIVE"}`);
    console.log(`   Edge Proxy: ${config.edgeProxyUrl}`);
    console.log(`   Sandbox API: ${config.sandboxApiUrl}`);
    console.log(`   x402 Payments: ${isX402Enabled() ? "ENABLED" : "DISABLED (set X402_PAY_TO to enable)"}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
