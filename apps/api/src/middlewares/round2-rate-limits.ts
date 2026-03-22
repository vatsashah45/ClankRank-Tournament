import type { RequestHandler } from "express";
import type { MiddlewareFactory } from "./types.js";
import { createMockSandboxHandler } from "./base-proxy.js";

/**
 * Round 2 (R32) — Adaptive Rate Limits
 *
 * CUMULATIVE: includes Round 1 behavior.
 *
 * - 429 rate randomized 10-40% per 5-second burst window
 * - Retry-After headers: variable 1s, 3s, 5s, or 10s (randomized per 429)
 * - New metric: `backoffAccuracy` — ratio of times agent respected exact Retry-After
 */

const RETRY_AFTER_OPTIONS = [1, 3, 5, 10] as const;
const MIN_RATE_LIMIT = 0.10;
const MAX_RATE_LIMIT = 0.40;
const WINDOW_MS = 5000;

interface BurstWindow {
  startTime: number;
  rate: number;
}

export const createRound2Middleware: MiddlewareFactory = (_config) => {
  // Stateless per-request rate (regenerate per window)
  let currentWindow: BurstWindow = {
    startTime: Date.now(),
    rate: randomRate(),
  };

  function randomRate(): number {
    return MIN_RATE_LIMIT + Math.random() * (MAX_RATE_LIMIT - MIN_RATE_LIMIT);
  }

  function getCurrentRate(): number {
    const now = Date.now();
    if (now - currentWindow.startTime > WINDOW_MS) {
      currentWindow = { startTime: now, rate: randomRate() };
    }
    return currentWindow.rate;
  }

  const rateLimitMiddleware: RequestHandler = (req, res, next) => {
    // Only apply to the exact main data endpoint (not hops/sub-paths)
    if (req.path !== "/sandbox/api/data") {
      return next();
    }

    const rate = getCurrentRate();
    if (Math.random() < rate) {
      const retryAfter =
        RETRY_AFTER_OPTIONS[Math.floor(Math.random() * RETRY_AFTER_OPTIONS.length)];
      res
        .status(429)
        .setHeader("retry-after", String(retryAfter))
        .setHeader("x-ratelimit-reset", String(Math.floor(Date.now() / 1000) + retryAfter))
        .json({
          error: "Rate limit exceeded",
          retryAfter,
          message: `Please wait ${retryAfter}s before retrying`,
        });
      return;
    }

    next();
  };

  const baseHandler = createMockSandboxHandler();
  return [rateLimitMiddleware, baseHandler];
};
