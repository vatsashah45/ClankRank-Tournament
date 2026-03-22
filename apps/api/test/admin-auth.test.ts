/**
 * Admin Auth Tests — Phase 5
 *
 * Tests that admin routes are properly protected by the adminAuth hook,
 * and that public routes remain accessible without any key.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

// Set env BEFORE importing anything that reads config
process.env.EDGE_PROXY_URL = "mock";
process.env.SANDBOX_API_URL = "mock";
process.env.DATABASE_URL = "file::memory:";
process.env.API_PORT = "3098";

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema.js";
import { adminAuth } from "../src/hooks/admin-auth.js";
import { config } from "../src/config.js";
import { metrics } from "../src/services/metrics.js";

// ── Helpers ──

function buildTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tournament_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL UNIQUE,
      wallet_address TEXT NOT NULL,
      chain TEXT NOT NULL,
      authorized_feedback INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'registered'
    );
    CREATE TABLE IF NOT EXISTS qualification_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL UNIQUE REFERENCES tournament_entries(id),
      score REAL NOT NULL,
      tier TEXT NOT NULL,
      respected429 INTEGER,
      loops INTEGER,
      total_requests INTEGER,
      error_rate REAL,
      avg_latency REAL,
      burstiness REAL,
      on_chain_feedback_count INTEGER,
      on_chain_avg_score REAL,
      raw_metrics_json TEXT,
      scored_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bracket_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round TEXT NOT NULL,
      region TEXT,
      seed_a INTEGER,
      seed_b INTEGER,
      entry_a_id INTEGER NOT NULL REFERENCES tournament_entries(id),
      entry_b_id INTEGER NOT NULL REFERENCES tournament_entries(id),
      winner_id INTEGER,
      score_a REAL,
      score_b REAL,
      metrics_a_json TEXT,
      metrics_b_json TEXT,
      ipfs_cid TEXT,
      tx_hash TEXT,
      started_at TEXT,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS tournament_meta (
      id INTEGER PRIMARY KEY DEFAULT 1,
      state TEXT NOT NULL DEFAULT 'REGISTRATION',
      current_round TEXT,
      started_at TEXT,
      updated_at TEXT
    );
    INSERT OR IGNORE INTO tournament_meta (id, state) VALUES (1, 'REGISTRATION');
  `);
  return sqlite;
}

/**
 * Build a minimal test app that mimics the real app's admin route structure
 * but uses an in-memory DB and a configurable admin key.
 *
 * IMPORTANT: The admin key is set on config at build time and stays set
 * for the lifetime of the app, because the adminAuth hook reads
 * config.adminApiKey at request-time. Each describe block is responsible
 * for restoring config.adminApiKey in its own afterAll.
 */
async function buildTestApp(adminKey: string): Promise<{ app: FastifyInstance; originalKey: unknown }> {
  // Save original so callers can restore in afterAll
  const originalKey = (config as Record<string, unknown>).adminApiKey;
  (config as Record<string, unknown>).adminApiKey = adminKey;

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  const sqlite = buildTestDb();
  const db = drizzle(sqlite, { schema });

  // Public routes (no auth)
  app.get("/api/entries", async (_req, reply) => {
    const entries = await db.query.tournamentEntries.findMany();
    return reply.send({ entries, count: entries.length });
  });

  app.get("/api/bracket", async (_req, reply) => {
    const matchups = await db.query.bracketState.findMany();
    const meta = await db.query.tournamentMeta.findFirst();
    return reply.send({ state: meta?.state ?? "REGISTRATION", matchups, count: matchups.length });
  });

  app.get("/health", async (_req, reply) => {
    return reply.send({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/metrics", async (_req, reply) => {
    reply.type("text/plain; version=0.0.4; charset=utf-8");
    return metrics.serialize();
  });

  // Admin routes (protected by adminAuth hook)
  await app.register(async (adminApp) => {
    adminApp.addHook("onRequest", adminAuth);

    adminApp.get("/api/admin/state", async (_req, reply) => {
      const meta = await db.query.tournamentMeta.findFirst();
      return reply.send({ state: meta?.state ?? "REGISTRATION" });
    });

    adminApp.get("/api/admin/overview", async (_req, reply) => {
      return reply.send({ state: "REGISTRATION" });
    });

    adminApp.post("/api/admin/verify", async (_req, reply) => {
      return reply.send({ verified: true });
    });
  });

  await app.ready();

  // Do NOT restore config here — the adminAuth hook reads it at request time.
  // Each describe block restores in afterAll.
  return { app, originalKey };
}

// ── Test: No admin key configured → 503 ──

describe("Admin auth: no key configured", () => {
  let app: FastifyInstance;
  let originalKey: unknown;

  beforeAll(async () => {
    ({ app, originalKey } = await buildTestApp("")); // empty = not configured
  });

  afterAll(async () => {
    await app.close();
    (config as Record<string, unknown>).adminApiKey = originalKey;
  });

  it("GET /api/admin/state → 503 when no admin key configured", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/state",
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.payload).error).toBe("Admin API key not configured");
  });

  it("GET /api/admin/overview → 503 when no admin key configured", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/overview",
    });
    expect(res.statusCode).toBe(503);
  });

  it("POST /api/admin/verify → 503 when no admin key configured", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/verify",
    });
    expect(res.statusCode).toBe(503);
  });
});

// ── Test: Correct key → 200 ──

describe("Admin auth: correct key", () => {
  let app: FastifyInstance;
  let originalKey: unknown;
  const TEST_KEY = "test-secret-key-abc123";

  beforeAll(async () => {
    ({ app, originalKey } = await buildTestApp(TEST_KEY));
  });

  afterAll(async () => {
    await app.close();
    (config as Record<string, unknown>).adminApiKey = originalKey;
  });

  it("GET /api/admin/state → 200 with x-admin-key header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/state",
      headers: { "x-admin-key": TEST_KEY },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toHaveProperty("state");
  });

  it("GET /api/admin/state → 200 with Authorization: Bearer header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/state",
      headers: { authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("POST /api/admin/verify → 200 with correct key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/verify",
      headers: { "x-admin-key": TEST_KEY },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ verified: true });
  });
});

// ── Test: Wrong key → 401 ──

describe("Admin auth: wrong key", () => {
  let app: FastifyInstance;
  let originalKey: unknown;
  const CORRECT_KEY = "correct-secret-key";

  beforeAll(async () => {
    ({ app, originalKey } = await buildTestApp(CORRECT_KEY));
  });

  afterAll(async () => {
    await app.close();
    (config as Record<string, unknown>).adminApiKey = originalKey;
  });

  it("GET /api/admin/state → 401 with wrong key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/state",
      headers: { "x-admin-key": "wrong-key-xyz" },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.payload).error).toBe("Unauthorized");
  });

  it("GET /api/admin/state → 401 with no key at all (but key IS configured)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/state",
      // No auth headers
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/admin/verify → 401 with wrong key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/verify",
      headers: { "x-admin-key": "totally-wrong" },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── Test: Public routes remain accessible without any key ──

describe("Public routes: accessible without admin key", () => {
  let app: FastifyInstance;
  let originalKey: unknown;

  beforeAll(async () => {
    // Build with a configured key — public routes must STILL work
    ({ app, originalKey } = await buildTestApp("some-configured-key"));
  });

  afterAll(async () => {
    await app.close();
    (config as Record<string, unknown>).adminApiKey = originalKey;
  });

  it("GET /api/entries → 200 without any key", async () => {
    const res = await app.inject({ method: "GET", url: "/api/entries" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it("GET /api/bracket → 200 without any key", async () => {
    const res = await app.inject({ method: "GET", url: "/api/bracket" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toHaveProperty("state");
  });

  it("GET /health → 200 without any key", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toHaveProperty("status", "ok");
  });

  it("GET /metrics → 200 without any key", async () => {
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
  });
});
