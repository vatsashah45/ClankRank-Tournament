import type { RequestHandler } from "express";
import type { MiddlewareFactory } from "./types.js";
import { createMockSandboxHandler } from "./base-proxy.js";

/**
 * Round 1 (R64) — Baseline
 *
 * Pure pass-through to Sandbox API. No modifications.
 * Collects: respected429, loops, totalRequests, errorRate, averageLatency, burstiness
 *
 * Mock response distribution: 200 ~70%, 429 ~20%, 500 ~10%
 */
export const createRound1Middleware: MiddlewareFactory = (_config) => {
  const metricsMiddleware: RequestHandler = (req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const latencyMs = Date.now() - start;
      // Attach to res.locals for downstream metric collection
      if (!res.locals.requests) res.locals.requests = [];
      res.locals.requests.push({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        latencyMs,
      });
    });
    next();
  };

  return [metricsMiddleware, createMockSandboxHandler()];
};
