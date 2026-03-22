/**
 * Locus Checkout Routes
 *
 * Creates checkout sessions for registration payments and handles
 * webhooks from Locus when payment is confirmed on-chain.
 *
 * Flow:
 *   1. POST /checkout/session — create Locus session for registration fee
 *   2. Frontend renders LocusCheckout popup with sessionId
 *   3. POST /checkout/webhook — Locus calls back when paid, we mark predictor as paid
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { config } from "../config.js";
import { x402PaymentGate } from "../middleware/x402.js";
import type {
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  CheckoutWebhookPayload,
} from "@withlocus/checkout-react";

const LOCUS_API_BASE = config.locusApiBase;
const REGISTRATION_AMOUNT = "1.00";

const createCheckoutSchema = z.object({
  predictorId: z.number().int().positive(),
});

/**
 * Returns true if Locus checkout is configured.
 */
export function isLocusEnabled(): boolean {
  return !!config.locusApiKey;
}

export async function checkoutRoutes(app: FastifyInstance) {
  // POST /checkout/session — Create a Locus checkout session for registration fee
  app.post("/checkout/session", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isLocusEnabled()) {
      return reply.status(503).send({
        error: "Checkout not configured",
        message: "Locus API key is not set. Payment is currently disabled.",
      });
    }

    const parsed = createCheckoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { predictorId } = parsed.data;

    try {
      // Validate predictor exists
      const predictor = await db.query.predictors.findFirst({
        where: eq(schema.predictors.id, predictorId),
      });
      if (!predictor) {
        return reply.status(404).send({ error: "Predictor not found" });
      }

      // Already paid — no need to pay again
      if (predictor.paid) {
        return reply.status(400).send({
          error: "Already paid",
          message: "This predictor has already completed registration payment.",
        });
      }

      // Only send webhookUrl if we have a real public URL (Locus rejects http://localhost)
      const publicUrl = process.env.PUBLIC_API_URL;
      const webhookUrl =
        publicUrl && !publicUrl.startsWith("http://localhost")
          ? `${publicUrl}/api/checkout/webhook`
          : undefined;

      // Build request per SDK CreateCheckoutSessionRequest type
      const sessionRequest: CreateCheckoutSessionRequest = {
        amount: REGISTRATION_AMOUNT,
        description: `ClankRank — Registration (${predictor.displayName})`,
        ...(webhookUrl ? { webhookUrl } : {}),
        metadata: {
          predictorId: String(predictor.id),
          predictorName: predictor.displayName,
          type: predictor.type,
          purpose: "registration",
        },
      };

      // POST /api/checkout/sessions — per @withlocus/checkout-react SDK
      const locusResponse = await fetch(`${LOCUS_API_BASE}/checkout/sessions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.locusApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sessionRequest),
        signal: AbortSignal.timeout(10_000),
      });

      if (!locusResponse.ok) {
        const errText = await locusResponse.text().catch(() => "Unknown error");
        request.log.error({ status: locusResponse.status, body: errText }, "Locus session creation failed");
        return reply.status(502).send({
          error: "Checkout service error",
          message: "Failed to create payment session. Please try again.",
        });
      }

      // Response shape: { success: true, data: { id, checkoutUrl, amount, currency, status, expiresAt, webhookSecret? } }
      const locusData = await locusResponse.json() as CreateCheckoutSessionResponse & { data: { webhookSecret?: string } };
      const sessionId = locusData.data.id;
      const webhookSecret = locusData.data.webhookSecret;

      // Store pending checkout session (persist webhookSecret if Locus returns one for signature verification)
      await db.insert(schema.checkoutSessions).values({
        sessionId,
        predictorId: predictor.id,
        purpose: "registration",
        amount: REGISTRATION_AMOUNT,
        status: "PENDING",
        ...(webhookSecret ? { webhookSecret } : {}),
      });

      return reply.status(201).send({
        sessionId,
        checkoutUrl: locusData.data.checkoutUrl,
        amount: REGISTRATION_AMOUNT,
        currency: "USDC",
        description: `Registration — ${predictor.displayName}`,
      });
    } catch (err) {
      request.log.error(err, "Failed to create checkout session");
      return reply.status(503).send({
        error: "Service unavailable",
        message: "Could not create payment session. Please try again later.",
      });
    }
  });

  // POST /checkout/webhook — Locus webhook callback
  app.post("/checkout/webhook", async (request: FastifyRequest, reply: FastifyReply) => {
    const rawBody =
      (request as any).rawBody !== undefined
        ? (typeof (request as any).rawBody === "string"
            ? (request as any).rawBody
            : (request as any).rawBody.toString("utf8"))
        : JSON.stringify(request.body);
    const signature = request.headers["x-signature-256"] as string | undefined;

    // Parse using the SDK webhook payload type
    const body = request.body as CheckoutWebhookPayload;
    const event = body.event;
    const sessionId = body.data?.sessionId;

    if (!sessionId) {
      return reply.status(400).send({ error: "Missing session ID" });
    }

    // Look up our stored checkout session
    const checkoutSession = await db.query.checkoutSessions.findFirst({
      where: eq(schema.checkoutSessions.sessionId, sessionId),
    });

    if (!checkoutSession) {
      request.log.warn({ sessionId }, "Webhook for unknown session — ignoring");
      return reply.status(200).send({ received: true });
    }

    // Verify webhook signature if present
    if (checkoutSession.webhookSecret && signature) {
      const expected = "sha256=" + crypto
        .createHmac("sha256", checkoutSession.webhookSecret)
        .update(rawBody)
        .digest("hex");
      const signatureBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expected);
      if (signatureBuffer.length !== expectedBuffer.length ||
          !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        request.log.warn({ sessionId }, "Webhook signature mismatch");
        return reply.status(401).send({ error: "Invalid signature" });
      }
    }

    if (event === "checkout.session.paid") {
      const txHash = body.data?.paymentTxHash;
      const payerAddress = body.data?.payerAddress;
      const paidAt = body.data?.paidAt ?? new Date().toISOString();

      // Mark checkout session as paid
      await db.update(schema.checkoutSessions)
        .set({
          status: "PAID",
          paymentTxHash: txHash,
          payerAddress,
          paidAt,
        })
        .where(eq(schema.checkoutSessions.sessionId, sessionId));

      // Mark the predictor as paid
      await db.update(schema.predictors)
        .set({ paid: true })
        .where(eq(schema.predictors.id, checkoutSession.predictorId));

      request.log.info({ sessionId, predictorId: checkoutSession.predictorId }, "Predictor marked as paid via checkout");
    } else if (event === "checkout.session.expired") {
      await db.update(schema.checkoutSessions)
        .set({ status: "EXPIRED" })
        .where(eq(schema.checkoutSessions.sessionId, sessionId));
    }

    return reply.status(200).send({ received: true });
  });

  // GET /checkout/status/:sessionId — Check checkout session status
  app.get("/checkout/status/:sessionId", async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = request.params as { sessionId: string };

    const session = await db.query.checkoutSessions.findFirst({
      where: eq(schema.checkoutSessions.sessionId, sessionId),
    });

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    return reply.send({
      sessionId: session.sessionId,
      status: session.status,
      amount: session.amount,
      paymentTxHash: session.paymentTxHash,
      paidAt: session.paidAt,
    });
  });

  // POST /checkout/x402 — Pay registration fee via x402 protocol
  // The x402 payment gate preHandler enforces payment verification.
  // On success, marks the predictor as paid.
  app.post(
    "/checkout/x402",
    {
      preHandler: x402PaymentGate({
        price: `$${REGISTRATION_AMOUNT}`,
        description: `ClankRank — Registration fee ($${REGISTRATION_AMOUNT} USDC on Base)`,
      }),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createCheckoutSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { predictorId } = parsed.data;

      const predictor = await db.query.predictors.findFirst({
        where: eq(schema.predictors.id, predictorId),
      });
      if (!predictor) {
        return reply.status(404).send({ error: "Predictor not found" });
      }
      if (predictor.paid) {
        return reply.status(400).send({ error: "Already paid" });
      }

      // Payment was verified by x402 preHandler — mark predictor as paid
      await db.update(schema.predictors)
        .set({ paid: true })
        .where(eq(schema.predictors.id, predictorId));

      request.log.info({ predictorId }, "Predictor marked as paid via x402");

      return reply.send({
        success: true,
        predictorId,
        method: "x402",
        message: "Registration payment confirmed via x402.",
      });
    },
  );
}
