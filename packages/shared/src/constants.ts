import type { TierName, RegionName, RoundName, TournamentState } from "./types.js";

// ── Tier definitions (Moody's-style, from spec p.13) ──

export interface TierDefinition {
  name: TierName;
  minScore: number;
  color: string;
  description: string;
}

export const TIERS: TierDefinition[] = [
  { name: "AAA", minScore: 98, color: "#20808D", description: "Pristine trust" },
  { name: "AA", minScore: 92, color: "#115058", description: "Very high trust" },
  { name: "A", minScore: 85, color: "#35D07F", description: "High trust" },
  { name: "BAA", minScore: 75, color: "#627EEA", description: "Moderate trust" },
  { name: "BA", minScore: 65, color: "#FFC553", description: "Adequate trust" },
  { name: "B", minScore: 50, color: "#FF6B35", description: "Speculative" },
  { name: "CAA", minScore: 35, color: "#A84B2F", description: "Poor trust" },
  { name: "CA", minScore: 20, color: "#944454", description: "Very poor trust" },
  { name: "C", minScore: 0, color: "#091717", description: "Default / failure" },
];

export function getTierForScore(score: number): TierName {
  for (const tier of TIERS) {
    if (score >= tier.minScore) return tier.name;
  }
  return "C";
}

export function getTierColor(tier: TierName): string {
  return TIERS.find((t) => t.name === tier)?.color ?? "#091717";
}

// ── Region definitions ──

export interface RegionDefinition {
  name: RegionName;
  displayName: string;
  color: string;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export const REGIONS: RegionDefinition[] = [
  { name: "monad", displayName: "Monad", color: "#836EF9", position: "top-left" },
  { name: "ethereum", displayName: "Ethereum", color: "#627EEA", position: "top-right" },
  { name: "arbitrum", displayName: "Arbitrum", color: "#FF6B35", position: "bottom-left" },
  { name: "base", displayName: "Base", color: "#0052FF", position: "bottom-right" },
];

export const REGION_NAMES: RegionName[] = ["monad", "ethereum", "arbitrum", "base"];

// ── Tournament rounds ──

export const ROUND_ORDER: RoundName[] = [
  "R64", "R32", "R16", "QF", "SF", "CHAMPIONSHIP",
];

export const STATE_ORDER: TournamentState[] = [
  "REGISTRATION", "QUALIFICATION", "R64", "R32", "R16",
  "QF", "SF", "CHAMPIONSHIP", "COMPLETE",
];

// ── Bracket pairings (within each region of 16) ──

export const BRACKET_PAIRINGS: [number, number][] = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15],
];

// ── Bracket halves for Semifinals ──
// Monad vs Ethereum winners meet in Semifinal A
// Arbitrum vs Base winners meet in Semifinal B
export const BRACKET_HALVES: [RegionName, RegionName][] = [
  ["monad", "ethereum"],
  ["arbitrum", "base"],
];

// ── Constants ──

export const MAX_TOURNAMENT_SIZE = 64;
export const AGENTS_PER_REGION = 16;
export const QUALIFICATION_REQUEST_COUNT = 10;
export const SANDBOX_TIMEOUT_MS = 30_000;
export const MATCH_SANDBOX_TIMEOUT_MS = 60_000;

export const WALLET_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export const CHAINS = ["monad", "ethereum", "arbitrum", "base"] as const;

// ── Round display names (no hard-coded dates — admin advances manually) ──

export interface RoundSchedule {
  round: RoundName;
  displayName: string;
}

/**
 * No hard-coded dates. Tournament phases are advanced manually by admin.
 * This removes all time-locked actions — the quarterfinal selection, round starts, etc.
 * are all triggered on-demand rather than at a specific date/time.
 */
export const TOURNAMENT_SCHEDULE: Record<string, string> = {
  QUALIFICATION_END: "TBD",
  SEEDING_DAY: "TBD",
};

export const ROUND_SCHEDULE: RoundSchedule[] = [
  { round: "R64",          displayName: "Round of 64" },
  { round: "R32",          displayName: "Round of 32" },
  { round: "R16",      displayName: "Round of 16" },
  { round: "QF",       displayName: "Quarterfinals" },
  { round: "SF",       displayName: "Semifinals" },
  { round: "CHAMPIONSHIP", displayName: "Grand Final" },
];

/** Venue for Semifinals + Championship */
export const CHAMPIONSHIP_VENUE = {
  name: "EVM Champions Arena",
  city: "",
  state: "",
} as const;

// ── Tournament Branding ──
export const TOURNAMENT_NAME = "ClankRank";

// ── Predictor Caps ──
export const MAX_HUMAN_PREDICTORS = 1000;
export const MAX_AGENT_PREDICTORS = 1000;

// ── Participation Fees ──
export const AGENT_ENTRY_FEE = "$0.10";
export const HUMAN_PREDICTION_FEE = "$1.00";
export const AGENT_PREDICTION_FEE = "$1.00";

/** Block explorer base URLs per chain (for tx hash links) */
export const BLOCK_EXPLORER_URLS: Record<string, string> = {
  monad: "https://explorer.monad.xyz/tx/",
  ethereum: "https://etherscan.io/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  base: "https://basescan.org/tx/",
} as const;

/** IPFS gateway base URL */
export const IPFS_GATEWAY_URL = "https://gateway.pinata.cloud/ipfs/";

/**
 * Get the display info for a specific round.
 */
export function getRoundSchedule(round: RoundName): RoundSchedule | undefined {
  return ROUND_SCHEDULE.find((s) => s.round === round);
}
