import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { RoundName } from "@agent-madness/shared";

/**
 * MiddlewareContext — passed through middleware chain via res.locals.
 */
export interface MiddlewareContext {
  round: RoundName;
  requestId: string;
  startTime: number;
  // R4 auth state (keyed by client IP or requestId for stateless testing)
  authState?: {
    sessionId?: string;
    accessToken?: string;
    sessionExpiresAt?: number;
    tokenExpiresAt?: number;
    lastStep?: "none" | "auth" | "token" | "data";
  };
  // R5 noise tracking
  noiseAgentCount?: number;
  // R6 discovered schema
  discoveredSchema?: object;
}

/**
 * RequestLog — per-request audit log entry captured by metrics layer.
 */
export interface RequestLog {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  timestamp: string;
  injected?: string; // which adversarial injection was applied
}

/**
 * MiddlewareFactory — function that returns Express request handlers for a round.
 */
export type MiddlewareFactory = (config?: Record<string, unknown>) => RequestHandler[];

// Re-export Express types for convenience
export type { Request, Response, NextFunction, RequestHandler };
