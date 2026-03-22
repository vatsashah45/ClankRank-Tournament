import { pgTable, serial, text, integer, doublePrecision, boolean, timestamp } from "drizzle-orm/pg-core";

// ──────────────────────────────────────────────
// Database Schema — Postgres (Supabase-compatible)
// ──────────────────────────────────────────────

export const tournamentEntries = pgTable("tournament_entries", {
  id: serial("id").primaryKey(),
  agentId: text("agent_id").notNull().unique(),
  walletAddress: text("wallet_address").notNull(),
  chain: text("chain").notNull(),
  authorizedFeedback: boolean("authorized_feedback").notNull().default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  status: text("status").notNull().default("registered"),
});

export const qualificationScores = pgTable("qualification_scores", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull().references(() => tournamentEntries.id).unique(),
  score: doublePrecision("score").notNull(),
  tier: text("tier").notNull(),
  respected429: boolean("respected429"),
  loops: integer("loops"),
  totalRequests: integer("total_requests"),
  errorRate: doublePrecision("error_rate"),
  avgLatency: doublePrecision("avg_latency"),
  burstiness: doublePrecision("burstiness"),
  onChainFeedbackCount: integer("on_chain_feedback_count"),
  onChainAvgScore: doublePrecision("on_chain_avg_score"),
  rawMetricsJson: text("raw_metrics_json"),
  scoredAt: text("scored_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const bracketState = pgTable("bracket_state", {
  id: serial("id").primaryKey(),
  round: text("round").notNull(),
  region: text("region"),
  seedA: integer("seed_a"),
  seedB: integer("seed_b"),
  entryAId: integer("entry_a_id").notNull().references(() => tournamentEntries.id),
  entryBId: integer("entry_b_id").notNull().references(() => tournamentEntries.id),
  winnerId: integer("winner_id").references(() => tournamentEntries.id),
  scoreA: doublePrecision("score_a"),
  scoreB: doublePrecision("score_b"),
  metricsAJson: text("metrics_a_json"),
  metricsBJson: text("metrics_b_json"),
  ipfsCid: text("ipfs_cid"),
  txHash: text("tx_hash"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
});

// ── Waitlist (overflow when chain hits 16-agent cap) ─────────

export const waitlist = pgTable("waitlist", {
  id: serial("id").primaryKey(),
  agentId: text("agent_id").notNull().unique(),
  walletAddress: text("wallet_address").notNull(),
  chain: text("chain").notNull(),
  authorizedFeedback: boolean("authorized_feedback").notNull().default(false),
  position: integer("position").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Sponsor Slots ────────────────────────────────────────────

export const sponsorSlots = pgTable("sponsor_slots", {
  id: serial("id").primaryKey(),
  tier: text("tier").notNull(), // surf, crawl, refer
  walletAddress: text("wallet_address").notNull(),
  agentId: text("agent_id"),
  displayName: text("display_name"),
  txHash: text("tx_hash"),
  amountUsd: integer("amount_usd").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Bracket Predictions ──────────────────────────────────────

export const predictors = pgTable("predictors", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  twitterHandle: text("twitter_handle"),
  walletAddress: text("wallet_address"),
  chain: text("chain"), // monad, ethereum, arbitrum, base
  type: text("type").notNull().default("human"),
  agentId: text("agent_id"),
  passwordHash: text("password_hash"), // bcrypt hash of user password
  accessToken: text("access_token"), // unique token for "magic link" style access
  emailVerified: boolean("email_verified").notNull().default(false),
  emailOptIn: boolean("email_opt_in").notNull().default(false),
  paid: boolean("paid").notNull().default(false),
  openEndedAnswer: text("open_ended_answer"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const bracketPredictions = pgTable("bracket_predictions", {
  id: serial("id").primaryKey(),
  predictorId: integer("predictor_id").notNull().references(() => predictors.id),
  picksJson: text("picks_json").notNull(),
  score: integer("score").notNull().default(0),
  correctPicks: integer("correct_picks").notNull().default(0),
  maxPossibleScore: integer("max_possible_score").notNull().default(192),
  submittedAt: text("submitted_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

// ── Tournament Meta ─────────────────────────────────────────

export const tournamentMeta = pgTable("tournament_meta", {
  id: integer("id").primaryKey().default(1),
  state: text("state").notNull().default("REGISTRATION"),
  currentRound: text("current_round"),
  startedAt: text("started_at"),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

// ── Locus Checkout Sessions ─────────────────────────────────

export const checkoutSessions = pgTable("checkout_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  predictorId: integer("predictor_id").notNull().references(() => predictors.id),
  purpose: text("purpose").notNull().default("registration"), // registration or prediction
  picksJson: text("picks_json"), // only set for prediction payments
  amount: text("amount").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING, PAID, EXPIRED, CANCELLED
  paymentTxHash: text("payment_tx_hash"),
  payerAddress: text("payer_address"),
  webhookSecret: text("webhook_secret"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  paidAt: text("paid_at"),
});
