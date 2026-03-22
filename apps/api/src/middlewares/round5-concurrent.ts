import type { RequestHandler } from "express";
import type { MiddlewareFactory } from "./types.js";
import { createRound4Middleware } from "./round4-orchestration.js";

/**
 * Round 5 (Semifinals) — Concurrent Load & State Corruption
 *
 * CUMULATIVE: R1+R2+R3+R4
 *
 * - 4 simulated noise agents hitting same endpoints (tracked as metrics, not actual HTTP clients)
 * - 30% chance early session token expiry
 * - Data changes between reads (race conditions)
 * - Latency spikes 500-2000ms
 *
 * New metrics: concurrencyResilience, stateConsistency
 */

const NOISE_AGENT_COUNT = 4;
const TOKEN_EXPIRY_EARLY_RATE = 0.30;
const DATA_MUTATION_RATE = 0.40;
const JITTER_RATE = 0.20;
const JITTER_MIN_MS = 500;
const JITTER_MAX_MS = 2000;

// Data state that mutates between reads
let dataState = { value: Math.random().toFixed(4), version: 0 };

export const createRound5Middleware: MiddlewareFactory = (config) => {
  const r4Chain = createRound4Middleware(config);

  const concurrentLoadMiddleware: RequestHandler = (req, res, next) => {
    // Attach noise agent context to res.locals
    res.locals.noiseAgentCount = NOISE_AGENT_COUNT;

    // Simulate latency jitter
    if (Math.random() < JITTER_RATE) {
      const jitter =
        JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS);
      setTimeout(() => next(), Math.round(jitter));
      return;
    }

    next();
  };

  const tokenExpiryMiddleware: RequestHandler = (req, res, next) => {
    if (req.path === "/sandbox/token" && req.method === "POST") {
      if (Math.random() < TOKEN_EXPIRY_EARLY_RATE) {
        // Immediately return an expired token to test agent's handling
        res.status(200).json({
          access_token: "expired-token-" + Date.now(),
          expires_in: 0,
          warning: "Token may expire immediately",
        });
        return;
      }
    }
    next();
  };

  const dataMutationMiddleware: RequestHandler = (req, res, next) => {
    if (req.path.startsWith("/sandbox/api/data") && req.method === "GET") {
      if (Math.random() < DATA_MUTATION_RATE) {
        // Mutate data between reads
        dataState = {
          value: Math.random().toFixed(4),
          version: dataState.version + 1,
        };
      }
      // Inject mutated state into response (intercept res.json)
      const origJson = res.json.bind(res);
      res.json = function (body) {
        if (
          res.statusCode === 200 &&
          body &&
          typeof body === "object" &&
          "data" in body
        ) {
          const mutated = {
            ...body,
            data: {
              ...(body as Record<string, unknown>).data as object,
              version: dataState.version,
              mutatedValue: dataState.value,
            },
          };
          return origJson(mutated);
        }
        return origJson(body);
      };
    }
    next();
  };

  return [concurrentLoadMiddleware, tokenExpiryMiddleware, dataMutationMiddleware, ...r4Chain];
};
