// ──────────────────────────────────────────────
// Core Types — AI Agent Madness
// Matches FROZEN spec exactly
// ──────────────────────────────────────────────

export type Chain = "monad" | "ethereum" | "arbitrum" | "base";

export type TournamentState =
  | "REGISTRATION"
  | "QUALIFICATION"
  | "R64"
  | "R32"
  | "SWEET16"
  | "ELITE8"
  | "FINAL4"
  | "CHAMPIONSHIP"
  | "COMPLETE";

export type RoundName = "R64" | "R32" | "SWEET16" | "ELITE8" | "FINAL4" | "CHAMPIONSHIP";

export type EntryStatus = "registered" | "qualified" | "eliminated" | "active" | "champion";

export type TierName = "AAA" | "AA" | "A" | "BAA" | "BA" | "B" | "CAA" | "CA" | "C";

export type RegionName = "monad" | "ethereum" | "arbitrum" | "base";

// ── RiskMetrics ──

export interface RiskMetrics {
  respected429: boolean;
  loops: number;
  totalRequests: number;
  errorRate?: number;
  averageLatency?: number;
  burstiness?: number;
  onChainFeedbackCount?: number;
  onChainAverageScore?: number;
}

export interface ScoreResult {
  score: number;
  tier: TierName;
}

// ── Entry ──

export interface TournamentEntry {
  id: number;
  agentId: string;
  walletAddress: string;
  chain: Chain;
  authorizedFeedback: boolean;
  createdAt: string;
  status: EntryStatus;
}

export interface CreateEntryInput {
  agentId: string;
  walletAddress: string;
  chain: Chain;
  authorizeFeedback: boolean;
}

// ── Qualification ──

export interface QualificationScore {
  id: number;
  entryId: number;
  score: number;
  tier: TierName;
  respected429: boolean;
  loops: number;
  totalRequests: number;
  errorRate: number;
  avgLatency: number;
  burstiness: number;
  onChainFeedbackCount: number;
  onChainAvgScore: number;
  rawMetricsJson: string;
  scoredAt: string;
}

// ── Seeding ──

export interface ScoredEntry {
  entryId: number;
  agentId: string;
  score: number;
  averageLatency: number;
  totalRequests: number;
}

export interface SeededAgent {
  entryId: number;
  agentId: string;
  region: RegionName;
  seed: number;
  score: number;
}

// ── Bracket ──

export interface BracketMatchup {
  id: number;
  round: RoundName;
  region: RegionName | null;
  seedA: number;
  seedB: number;
  entryAId: number;
  entryBId: number;
  winnerId: number | null;
  scoreA: number | null;
  scoreB: number | null;
  metricsAJson: string | null;
  metricsBJson: string | null;
  ipfsCid: string | null;
  txHash: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

// ── Edge Proxy responses ──

/**
 * Response shape from the Valiron SDK's getAgentProfile().
 */
export interface EdgeProxyAgentResponse {
  agentId: string;
  identity: {
    wallet: string;
    endpoints?: Record<string, string>;
    error?: string;
  };
  onchainReputation: {
    count: string;
    averageScore: number;
  };
  localReputation: {
    score: number;
    tier: string;
    exists: boolean;
    agentId?: string;
  } | null;
  routing: {
    tier: string;
    score: number;
  };
  chain: unknown;
  timestamp: string;
}

/** Convenience type for the reputation subset callers need. */
export interface EdgeProxyReputationResult {
  score: number;
  tier: string;
  onchainFeedbackCount: number;
}

// ── Phase 2: Sandbox Gauntlet Types ──

export interface RoundPenalties {
  // Round 2 — Adaptive Rate Limits
  backoffAccuracy?: number;       // 0-1
  // Round 3 — Adversarial Payloads
  jsonParseRecovery?: number;     // 0-1
  timeoutHandling?: number;       // 0-1
  redirectFollowing?: number;     // 0-1
  // Round 4 — Multi-Endpoint Orchestration
  sequenceAccuracy?: number;      // 0-1
  stepCompletionRate?: number;    // 0-1
  // Round 5 — Concurrent Load & State Corruption
  concurrencyResilience?: number; // 0-1
  stateConsistency?: number;      // 0-1
  // Round 6 — Zero-Shot Adaptation
  discoverySpeed?: number;        // 0-1
  schemaAdaptation?: number;      // 0-1
  novelEndpointSuccess?: number;  // 0-1
}

export interface MatchMetrics {
  agentId: string;
  matchId: number;
  round: RoundName;
  // Base risk metrics
  respected429: boolean;
  loops: number;
  totalRequests: number;
  errorRate: number;
  averageLatency: number;
  burstiness: number;
  // On-chain enrichment (optional, carried from qualification)
  onChainFeedbackCount?: number;
  onChainAverageScore?: number;
  // Round-specific metrics
  roundPenalties: RoundPenalties;
  // Final computed score
  baseScore: number;
  adjustedScore: number;
  tier: TierName;
  // Timing
  durationMs: number;
  timedOut: boolean;
  rawJson: string;
}

export interface MatchJob {
  matchId: number;
  roundNumber: RoundName;
  agentAId: string;
  agentBId: string;
  entryAId: number;
  entryBId: number;
}

export interface SandboxConfig {
  agentId: string;
  timeoutMs: number;
  memoryMb?: number;
  cpuCores?: number;
  env?: Record<string, string>;
}

export interface SandboxInstance {
  instanceId: string;
  agentId: string;
  status: "provisioning" | "ready" | "running" | "destroyed";
  provisionedAt: string;
  metadata?: Record<string, unknown>;
}

export interface SandboxRunResult {
  instanceId: string;
  agentId: string;
  success: boolean;
  timedOut: boolean;
  metrics: RiskMetrics;
  roundPenalties: RoundPenalties;
  durationMs: number;
  error?: string;
}

export interface MatchResult {
  matchId: number;
  round: RoundName;
  entryAId: number;
  entryBId: number;
  agentAId: string;
  agentBId: string;
  metricsA: MatchMetrics;
  metricsB: MatchMetrics;
  winnerId: number;
  scoreA: number;
  scoreB: number;
  completedAt: string;
}

// ── Bracket Predictions ──

export type PredictorType = "human" | "agent";

export interface Predictor {
  id: number;
  displayName: string;
  walletAddress: string | null;
  type: PredictorType;
  agentId: string | null;
  createdAt: string;
}

/** Bracket picks: { [matchupIdOrSlotKey: string]: pickedWinnerEntryId } */
export type BracketPicks = Record<string, number>;

export interface BracketPrediction {
  id: number;
  predictorId: number;
  picks: BracketPicks;
  score: number;
  correctPicks: number;
  maxPossibleScore: number;
  submittedAt: string;
  updatedAt: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  predictor: Predictor;
  score: number;
  correctPicks: number;
  maxPossibleScore: number;
  championPick: number | null;
}
