import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? process.env.API_PORT ?? "3001", 10),
  edgeProxyUrl: process.env.EDGE_PROXY_URL ?? "mock",
  sandboxApiUrl: process.env.SANDBOX_API_URL ?? "mock",
  databaseUrl: process.env.DATABASE_URL ?? "",
  network: process.env.NETWORK ?? "monad",
  isMockMode: (process.env.EDGE_PROXY_URL ?? "mock") === "mock",
  // Phase 2: Sandbox Gauntlet
  redisUrl: process.env.REDIS_URL ?? "mock",
  sandboxRuntime: (process.env.SANDBOX_RUNTIME ?? "mock") as "e2b" | "daytona" | "mock",
  maxConcurrentSandboxes: parseInt(process.env.MAX_CONCURRENT_SANDBOXES ?? "32", 10),
  sandboxTimeoutMs: parseInt(process.env.SANDBOX_TIMEOUT_MS ?? "60000", 10),
  // Phase 5: Auth
  adminApiKey: process.env.ADMIN_API_KEY ?? "",
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  // Phase 5: Alerting (optional)
  alertSlackWebhook: process.env.ALERT_SLACK_WEBHOOK ?? "",
  alertPagerDutyKey: process.env.ALERT_PAGERDUTY_KEY ?? "",
  uptimePingUrl: process.env.UPTIME_PING_URL ?? "",
  // x402 Payment Protocol
  x402PayTo: process.env.X402_PAY_TO ?? "",
  x402NetworkId: process.env.X402_NETWORK_ID ?? "eip155:8453",
  x402FacilitatorUrl: process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
  // CDP API keys for Coinbase-hosted facilitator (optional)
  cdpApiKeyId: process.env.CDP_API_KEY_ID ?? "",
  cdpApiKeySecret: process.env.CDP_API_KEY_SECRET ?? "",
  // Locus Checkout
  locusApiKey: process.env.LOCUS_API_KEY ?? "",
  locusApiBase: process.env.LOCUS_API_BASE ?? "https://beta-api.paywithlocus.com/api",
} as const;
