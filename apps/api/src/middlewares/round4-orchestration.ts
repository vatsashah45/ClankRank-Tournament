import type { RequestHandler } from "express";
import type { MiddlewareFactory } from "./types.js";
import { createRound3Middleware } from "./round3-adversarial.js";
import { randomUUID } from "crypto";

/**
 * Round 4 (Quarterfinals) — Multi-Endpoint Orchestration
 *
 * CUMULATIVE: R1+R2+R3
 *
 * New endpoints:
 *   POST /sandbox/auth → returns session_id (valid 30s)
 *   POST /sandbox/token → requires valid session_id, returns access_token
 *   GET /sandbox/api/data → requires Bearer {access_token}
 *
 * Out-of-sequence → 403 "Expected /auth first"
 *
 * New metrics: sequenceAccuracy, stepCompletionRate
 */

const SESSION_TTL_MS = 30000;
const TOKEN_TTL_MS = 30000;

interface SessionStore {
  sessions: Map<string, { expiresAt: number; usedForToken: boolean }>;
  tokens: Map<string, { expiresAt: number }>;
}

// In-process session store (ephemeral, per-harness-instance)
// This is intentionally simple — not shared across processes
function createSessionStore(): SessionStore {
  return {
    sessions: new Map(),
    tokens: new Map(),
  };
}

export const createRound4Middleware: MiddlewareFactory = (config) => {
  const r3Chain = createRound3Middleware(config);
  const store = createSessionStore();

  const authHandler: RequestHandler = (req, res, next) => {
    if (req.method === "POST" && req.path === "/sandbox/auth") {
      const sessionId = randomUUID();
      store.sessions.set(sessionId, {
        expiresAt: Date.now() + SESSION_TTL_MS,
        usedForToken: false,
      });
      res.status(200).json({ session_id: sessionId, expires_in: 30 });
      return;
    }
    next();
  };

  const tokenHandler: RequestHandler = (req, res, next) => {
    if (req.method === "POST" && req.path === "/sandbox/token") {
      const body = req.body as { session_id?: string } | undefined;
      const sessionId = body?.session_id;

      if (!sessionId) {
        res.status(403).json({ error: "Expected /auth first", code: "NO_SESSION" });
        return;
      }

      const session = store.sessions.get(sessionId);
      if (!session) {
        res.status(403).json({ error: "Invalid or expired session_id", code: "INVALID_SESSION" });
        return;
      }

      if (Date.now() > session.expiresAt) {
        store.sessions.delete(sessionId);
        res.status(403).json({ error: "Session expired", code: "SESSION_EXPIRED" });
        return;
      }

      const accessToken = randomUUID();
      store.tokens.set(accessToken, { expiresAt: Date.now() + TOKEN_TTL_MS });
      session.usedForToken = true;

      res.status(200).json({ access_token: accessToken, expires_in: 30 });
      return;
    }
    next();
  };

  const dataAuthGuard: RequestHandler = (req, res, next) => {
    if (req.path.startsWith("/sandbox/api/data") && req.method === "GET") {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(403).json({
          error: "Expected /auth first",
          code: "NO_TOKEN",
          hint: "POST /sandbox/auth → POST /sandbox/token → GET /sandbox/api/data",
        });
        return;
      }

      const token = authHeader.slice(7);
      const tokenRecord = store.tokens.get(token);

      if (!tokenRecord) {
        res.status(403).json({ error: "Invalid access_token", code: "INVALID_TOKEN" });
        return;
      }

      if (Date.now() > tokenRecord.expiresAt) {
        store.tokens.delete(token);
        res.status(403).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
        return;
      }
    }
    next();
  };

  return [authHandler, tokenHandler, dataAuthGuard, ...r3Chain];
};
