import express from "express";
import type { Express } from "express";
import type { Server } from "http";
import type { RoundName } from "@agent-madness/shared";
import { composeMiddlewares } from "./compose.js";

export interface HarnessInstance {
  app: Express;
  server: Server;
  url: string;
  close(): Promise<void>;
}

/**
 * createHarness — creates an Express HTTP server hosting the middleware stack
 * for a given round. Used by MockAdapter and tests.
 *
 * @param round - Which round's middleware stack to mount
 * @param port - Port to listen on. Defaults to 0 (OS-assigned ephemeral port)
 * @returns { app, server, url, close }
 */
export function createHarness(
  round: RoundName,
  port = 0,
  config?: Record<string, unknown>,
): Promise<HarnessInstance> {
  return new Promise((resolve, reject) => {
    const app = express();

    // Parse JSON bodies for R4+ endpoints
    app.use(express.json());

    // Mount the composed middleware stack
    const handlers = composeMiddlewares(round, config);
    for (const handler of handlers) {
      app.use(handler);
    }

    // Catch-all 404 for any unmatched path
    app.use((_req, res) => {
      res.status(404).json({ error: "Not found" });
    });

    const server = app.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to get server address"));
        return;
      }
      const url = `http://127.0.0.1:${addr.port}`;

      const harness: HarnessInstance = {
        app,
        server,
        url,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      };

      resolve(harness);
    });

    server.on("error", reject);
  });
}
