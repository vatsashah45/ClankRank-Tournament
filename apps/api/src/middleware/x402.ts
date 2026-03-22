/**
 * x402 Payment Middleware for Fastify
 *
 * Wraps Fastify routes with HTTP 402 payment requirements using the x402 protocol.
 * When a request arrives without a valid payment header, responds with 402 + payment
 * instructions. When payment is provided, verifies via the facilitator and proceeds.
 *
 * Uses @x402/core and @x402/evm for payment verification.
 *
 * If x402 is not configured (missing env vars), all gated endpoints pass through
 * freely — this allows local dev without payment infrastructure.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import { createCdpAuthHeaders } from "@coinbase/x402";
import { config } from "../config.js";

const ENABLE_X402_DEBUG_LOGS = process.env.X402_DEBUG_LOGS === "true";

// ── Types ──

export interface X402PriceConfig {
  /** USD price as string, e.g. "$0.10" or "$100" */
  price: string;
  /** Human-readable description shown in 402 response */
  description: string;
}

export interface X402Config {
  /** Wallet address to receive payments */
  payTo: string;
  /** Chain ID in CAIP-2 format, e.g. "eip155:8453" for Base mainnet */
  networkId: string;
  /** Facilitator URL for payment verification */
  facilitatorUrl: string;
  /** CDP API Key ID (for Coinbase-hosted facilitator) */
  cdpApiKeyId: string;
  /** CDP API Key Secret (for Coinbase-hosted facilitator) */
  cdpApiKeySecret: string;
}

// ── Configuration ──

const x402Config: X402Config | null = (() => {
  const payTo = process.env.X402_PAY_TO;
  const networkId = process.env.X402_NETWORK_ID ?? "eip155:8453"; // Base mainnet default
  const facilitatorUrl = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";
  const cdpApiKeyId = process.env.CDP_API_KEY_ID ?? "";
  const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET ?? "";

  if (!payTo) return null; // x402 not configured — passthrough mode

  return { payTo, networkId, facilitatorUrl, cdpApiKeyId, cdpApiKeySecret };
})();

// CDP auth headers generator — produces per-endpoint JWT bearer tokens
const getCdpAuthHeaders =
  x402Config && x402Config.cdpApiKeyId && x402Config.cdpApiKeySecret
    ? createCdpAuthHeaders(x402Config.cdpApiKeyId, x402Config.cdpApiKeySecret)
    : null;

async function facilitatorHeaders(endpoint: "verify" | "settle"): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (getCdpAuthHeaders) {
    const authHeaders = await getCdpAuthHeaders();
    Object.assign(headers, authHeaders[endpoint]);
  }
  return headers;
}

/**
 * Returns true if x402 is enabled (pay-to address configured).
 */
export function isX402Enabled(): boolean {
  return x402Config !== null;
}

/**
 * Creates a Fastify preHandler hook that enforces x402 payment.
 *
 * If x402 is not configured, returns a no-op handler (passthrough).
 * If configured, checks for PAYMENT-SIGNATURE header:
 *   - Missing → 402 with payment instructions
 *   - Present → verify with facilitator → proceed or reject
 */
export function x402PaymentGate(priceConfig: X402PriceConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!x402Config) {
      // x402 not configured — passthrough (local dev mode)
      return;
    }

    const paymentHeader = (request.headers["payment-signature"] ?? request.headers["x-payment"]) as string | undefined;

    if (!paymentHeader) {
      // No payment — respond with 402 and payment instructions
      // Convert dollar price to USDC raw amount (6 decimals)
      const dollars = parseFloat(priceConfig.price.replace("$", ""));
      const amount = String(Math.round(dollars * 1_000_000));

      const paymentRequired = {
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            price: priceConfig.price,
            amount,
            network: x402Config.networkId,
            payTo: x402Config.payTo,
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base mainnet
            maxTimeoutSeconds: 300,
            extra: {
              name: "USD Coin",
              version: "2",
            },
          },
        ],
        description: priceConfig.description,
      };

      // Encode as base64 for the header
      const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");

      reply
        .status(402)
        .header("payment-required", encoded)
        .header("content-type", "application/json")
        .send(paymentRequired);
      return reply;
    }

    // Payment header present — verify with facilitator
    try {
      // Decode the base64-encoded payment payload from the client
      const decodedStr = Buffer.from(paymentHeader, "base64").toString("utf-8");
      const paymentPayload = JSON.parse(decodedStr);
      if (ENABLE_X402_DEBUG_LOGS) {
        request.log.debug({ paymentPayloadKeys: Object.keys(paymentPayload) }, "x402 parsed paymentPayload");
      }

      // Reconstruct the payment requirements that the client accepted
      const dollars = parseFloat(priceConfig.price.replace("$", ""));
      const amount = String(Math.round(dollars * 1_000_000));
      const paymentRequirements = {
        scheme: "exact",
        price: priceConfig.price,
        amount,
        network: x402Config.networkId,
        payTo: x402Config.payTo,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        maxTimeoutSeconds: 300,
        extra: {
          name: "USD Coin",
          version: "2",
        },
      };

      const verifyBody = {
        x402Version: paymentPayload.x402Version ?? 2,
        paymentPayload,
        paymentRequirements,
      };

      const verifyHeaders = await facilitatorHeaders("verify");
      const verifyUrl = `${x402Config.facilitatorUrl}/verify`;

      if (ENABLE_X402_DEBUG_LOGS) {
        request.log.debug(
          {
            verifyUrl,
            verifyHeaders: { ...verifyHeaders, Authorization: verifyHeaders.Authorization ? `${verifyHeaders.Authorization.slice(0, 30)}...` : undefined },
            x402Version: verifyBody.x402Version,
          },
          "x402 verify request"
        );
      }

      const verifyResponse = await fetch(verifyUrl, {
        method: "POST",
        headers: verifyHeaders,
        body: JSON.stringify(verifyBody),
        signal: AbortSignal.timeout(10_000),
      });

      const verifyRawText = await verifyResponse.text();

      let verifyData: { isValid?: boolean; invalidReason?: string; invalidMessage?: string };
      try {
        verifyData = JSON.parse(verifyRawText);
      } catch {
        request.log.error({ status: verifyResponse.status }, "x402 facilitator verify response is not valid JSON");
        reply.status(502).send({ error: "Facilitator returned non-JSON response" });
        return reply;
      }

      request.log.info({ status: verifyResponse.status, isValid: verifyData.isValid }, "x402 facilitator verify response");

      if (!verifyResponse.ok || !verifyData.isValid) {
        request.log.warn({ httpOk: verifyResponse.ok, isValid: verifyData.isValid, verifyData }, "x402 verification FAILED");
        reply.status(402).send({
          error: "Payment verification failed",
          details: verifyData.invalidMessage ?? verifyData.invalidReason ?? "Unknown",
        });
        return reply;
      }

      // Payment verified — settle it
      const settleResponse = await fetch(`${x402Config.facilitatorUrl}/settle`, {
        method: "POST",
        headers: await facilitatorHeaders("settle"),
        body: JSON.stringify({
          x402Version: paymentPayload.x402Version ?? 2,
          paymentPayload,
          paymentRequirements,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!settleResponse.ok) {
        const settleData = await settleResponse.json().catch(() => ({}));
        request.log.warn({ settleData }, "x402 settlement failed but payment was valid — proceeding");
      }

      // Attach payment info to request for downstream use
      (request as any).x402Payment = {
        verified: true,
        price: priceConfig.price,
        network: x402Config.networkId,
      };

      // Proceed to route handler
    } catch (err) {
      request.log.error({ err }, "x402 payment verification error");
      reply.status(500).send({
        error: "Payment verification service error",
        details: err instanceof Error ? err.message : "Unknown error",
      });
      return reply;
    }
  };
}

/**
 * Pre-built payment gates for ClankRank endpoints.
 *
 * Participation fees:
 *   - Agent entry (to compete): $0.10
 *   - Human prediction: $1.00
 *   - Agent prediction: $1.00
 */
export const X402_GATES = {
  /** Pay to register an agent to compete ($0.10) */
  agentEntry: x402PaymentGate({
    price: "$0.10",
    description: "Register your AI agent to compete in ClankRank tournament ($0.10)",
  }),

  /** Pay to submit a bracket prediction — human ($1.00) */
  humanPrediction: x402PaymentGate({
    price: "$1.00",
    description: "Submit your bracket prediction for ClankRank ($1.00 human entry)",
  }),

  /** Pay to submit a bracket prediction — agent ($1.00) */
  agentPrediction: x402PaymentGate({
    price: "$1.00",
    description: "Submit your bracket prediction for ClankRank ($1.00 agent entry)",
  }),

  /** Surf Sponsor — $100 (10 slots) */
  sponsorSurf: x402PaymentGate({
    price: "$100.00",
    description: "Surf Sponsor: Priority queuing for future events + compute matching. 10 slots available.",
  }),

  /** Crawl Sponsor — $250 (3 slots) */
  sponsorCrawl: x402PaymentGate({
    price: "$250.00",
    description: "Crawl Sponsor: Enhanced compute matching + priority queuing + featured listing. 3 slots available.",
  }),

  /** Refer Sponsor — $1,000 (1 slot) */
  sponsorRefer: x402PaymentGate({
    price: "$1000.00",
    description: "Refer Sponsor: Maximum compute matching + top-tier priority + featured placement + exclusive analytics access. 1 slot available.",
  }),
};
