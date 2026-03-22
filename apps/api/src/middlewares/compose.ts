import type { RequestHandler } from "express";
import type { RoundName } from "@clankrank/shared";
import { createRound1Middleware } from "./round1-baseline.js";
import { createRound2Middleware } from "./round2-rate-limits.js";
import { createRound3Middleware } from "./round3-adversarial.js";
import { createRound4Middleware } from "./round4-orchestration.js";
import { createRound5Middleware } from "./round5-concurrent.js";
import { createRound6Middleware } from "./round6-discovery.js";

/**
 * composeMiddlewares — returns the full middleware stack for a given round.
 *
 * Each round is cumulative:
 *   R64  → R1 only
 *   R32  → R1 + R2
 *   R16 → R1 + R2 + R3
 *   QF  → R1 + R2 + R3 + R4
 *   SF  → R1 + R2 + R3 + R4 + R5
 *   CHAMPIONSHIP → R1 + R2 + R3 + R4 + R5 + R6
 */
export function composeMiddlewares(
  round: RoundName,
  config?: Record<string, unknown>,
): RequestHandler[] {
  switch (round) {
    case "R64":
      return createRound1Middleware(config);
    case "R32":
      return createRound2Middleware(config);
    case "R16":
      return createRound3Middleware(config);
    case "QF":
      return createRound4Middleware(config);
    case "SF":
      return createRound5Middleware(config);
    case "CHAMPIONSHIP":
      return createRound6Middleware(config);
    default:
      return createRound1Middleware(config);
  }
}
