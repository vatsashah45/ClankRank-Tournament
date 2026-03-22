import type { FastifyInstance } from "fastify";
import { eventBus } from "../services/event-bus.js";
import { metrics } from "../services/metrics.js";

export async function eventsRoutes(app: FastifyInstance) {
  // GET /bracket/events — SSE stream for live bracket updates
  app.get("/bracket/events", async (request, reply) => {
    // Track SSE connection
    metrics.incSSEConnection();

    // Set SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send initial connection event
    reply.raw.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

    // Listen for tournament events
    const handler = (event: { id: number; type: string; data: Record<string, unknown>; timestamp: string }) => {
      reply.raw.write(`id: ${event.id}\n`);
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event.data)}\n\n`);
    };

    eventBus.on("tournament-event", handler);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      reply.raw.write(`: heartbeat\n\n`);
    }, 30000);

    // Keep the connection open until the client disconnects
    await new Promise<void>((resolve) => {
      request.raw.on("close", () => {
        eventBus.off("tournament-event", handler);
        clearInterval(heartbeat);
        metrics.decSSEConnection();
        resolve();
      });
    });
  });
}
