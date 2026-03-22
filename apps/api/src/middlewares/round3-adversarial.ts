import type { RequestHandler, Response } from "express";
import type { MiddlewareFactory } from "./types.js";
import { createRound2Middleware } from "./round2-rate-limits.js";
import { createMockSandboxHandler } from "./base-proxy.js";

/**
 * Round 3 (Top 16) — Adversarial Payloads
 *
 * CUMULATIVE: includes Round 1 + Round 2 behaviors.
 *
 * - 30% of 200 responses → malformed JSON (truncated, invalid chars, wrong content-type)
 * - 15% of requests hang 15s before responding (timeout traps)
 * - 10% of requests → 302→302→actual endpoint (2-hop redirect chain)
 *
 * New metrics: jsonParseRecovery, timeoutHandling, redirectFollowing
 * Penalty: each up to -10, combined max -25
 */

const MALFORMED_RATE = 0.30;
const TIMEOUT_TRAP_RATE = 0.15;
const REDIRECT_RATE = 0.10;
const TIMEOUT_TRAP_MS = 15000;

function sendMalformedJson(res: Response): void {
  const type = Math.floor(Math.random() * 3);
  // Status already set — just modify the body
  switch (type) {
    case 0:
      // Truncated JSON
      res.setHeader("content-type", "application/json").end('{"data":{"id":42,"value":"0.1234');
      break;
    case 1:
      // Invalid chars injected
      res.setHeader("content-type", "application/json").end('{"data":{"id":42,"value":\x00"corrupt"}}');
      break;
    case 2:
      // Wrong content-type with valid JSON body
      res.setHeader("content-type", "text/plain").end('{"data":{"id":42}}');
      break;
  }
}

export const createRound3Middleware: MiddlewareFactory = (config) => {
  // Get R2 middleware chain (rate limiter + base handler)
  // We extract only the non-terminal handlers from R2 (i.e., the rate limiter)
  // and add our own adversarial layer + base handler at the end
  const r2Handlers = createRound2Middleware(config);
  // R2 chain = [metricsMiddleware? , rateLimitMiddleware, baseHandler]
  // We drop the last handler (baseHandler) and insert adversarial logic before our own base handler
  const r2Chain = r2Handlers.slice(0, -1);

  const adversarialMiddleware: RequestHandler = (req, res, next) => {
    // Only apply adversarial behavior to the main data endpoint (exact match)
    if (req.path !== "/sandbox/api/data") {
      return next();
    }

    const roll = Math.random();

    if (roll < REDIRECT_RATE) {
      // 2-hop redirect chain
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      res.redirect(302, `${baseUrl}/sandbox/api/data/hop1`);
      return;
    }

    if (roll < REDIRECT_RATE + TIMEOUT_TRAP_RATE) {
      // Hang for 15s — agents should timeout and handle gracefully
      setTimeout(() => {
        if (!res.headersSent) {
          res.status(200).json({ data: { id: 0, value: "delayed" } });
        }
      }, TIMEOUT_TRAP_MS);
      return; // Don't call next — intentional hang
    }

    // Pass to next — intercept response to inject malformed JSON
    const origJson = res.json.bind(res);
    res.json = function (body) {
      // Only inject malformed JSON on 200 responses
      if (res.statusCode === 200 && Math.random() < MALFORMED_RATE) {
        sendMalformedJson(res);
        return res;
      }
      return origJson(body);
    };

    next();
  };

  // Redirect hop endpoints handler
  const hopHandler: RequestHandler = (req, res, next) => {
    if (req.path === "/sandbox/api/data/hop1") {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      res.redirect(302, `${baseUrl}/sandbox/api/data/hop2`);
      return;
    }
    if (req.path === "/sandbox/api/data/hop2") {
      res.status(200).json({ data: { id: 99, value: "0.9999", redirected: true } });
      return;
    }
    next();
  };

  // Base mock handler — terminal handler for /sandbox/api/data
  const baseHandler = createMockSandboxHandler();

  return [...r2Chain, hopHandler, adversarialMiddleware, baseHandler];
};
