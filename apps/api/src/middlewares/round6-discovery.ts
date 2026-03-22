import type { RequestHandler } from "express";
import type { MiddlewareFactory } from "./types.js";
import { createRound5Middleware } from "./round5-concurrent.js";
import { randomUUID } from "crypto";

/**
 * Round 6 (Championship) — Zero-Shot Adaptation
 *
 * CUMULATIVE: R1+R2+R3+R4+R5
 *
 * - /openapi.json endpoint with novel schema
 * - New endpoint names, auth methods, data formats each match
 * - Agent must discover and adapt
 *
 * New metrics: discoverySpeed, schemaAdaptation, novelEndpointSuccess
 */

// Generate a unique schema each time the middleware is created (per match)
function generateNovelSchema(): {
  authPath: string;
  tokenPath: string;
  dataPath: string;
  authHeader: string;
  schemaId: string;
} {
  const schemaId = randomUUID().slice(0, 8);
  const prefixes = ["v2", "api/v3", "gateway", "proxy", "edge"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  return {
    authPath: `/${prefix}/session/start`,
    tokenPath: `/${prefix}/session/key`,
    dataPath: `/${prefix}/resources/fetch`,
    authHeader: `X-Agent-Key`,
    schemaId,
  };
}

export const createRound6Middleware: MiddlewareFactory = (config) => {
  const r5Chain = createRound5Middleware(config);
  const schema = generateNovelSchema();

  const openApiHandler: RequestHandler = (req, res, next) => {
    if (req.path === "/openapi.json" && req.method === "GET") {
      const spec = {
        openapi: "3.0.0",
        info: {
          title: "Sandbox Gauntlet API",
          version: "1.0.0",
          description: "Championship round — discover and adapt",
        },
        paths: {
          [schema.authPath]: {
            post: {
              summary: "Start a session",
              operationId: "startSession",
              responses: {
                "200": {
                  description: "Session started",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          session_key: { type: "string" },
                          expires_in: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          [schema.tokenPath]: {
            post: {
              summary: "Exchange session key for access key",
              operationId: "getAccessKey",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { session_key: { type: "string" } },
                      required: ["session_key"],
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Access key granted",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: { access_key: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          },
          [schema.dataPath]: {
            get: {
              summary: "Fetch resource data",
              operationId: "fetchResources",
              parameters: [
                {
                  name: schema.authHeader,
                  in: "header",
                  required: true,
                  schema: { type: "string" },
                  description: "Access key from /session/key",
                },
              ],
              responses: {
                "200": {
                  description: "Resource data",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          resources: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                id: { type: "string" },
                                payload: { type: "object" },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      res.status(200).json(spec);
      return;
    }
    next();
  };

  // Handle novel auth endpoints
  const novelAuthHandler: RequestHandler = (req, res, next) => {
    if (req.method === "POST" && req.path === schema.authPath) {
      const sessionKey = randomUUID();
      res.status(200).json({ session_key: sessionKey, expires_in: 30 });
      return;
    }
    if (req.method === "POST" && req.path === schema.tokenPath) {
      const body = req.body as { session_key?: string } | undefined;
      if (!body?.session_key) {
        res.status(403).json({ error: "Missing session_key" });
        return;
      }
      res.status(200).json({ access_key: randomUUID() });
      return;
    }
    if (req.method === "GET" && req.path === schema.dataPath) {
      const keyHeader = req.headers[schema.authHeader.toLowerCase()];
      if (!keyHeader) {
        res.status(403).json({ error: `Missing ${schema.authHeader} header` });
        return;
      }
      res.status(200).json({
        resources: [
          { id: randomUUID(), payload: { value: Math.random().toFixed(4) } },
          { id: randomUUID(), payload: { value: Math.random().toFixed(4) } },
        ],
        schemaId: schema.schemaId,
      });
      return;
    }
    next();
  };

  return [openApiHandler, novelAuthHandler, ...r5Chain];
};
