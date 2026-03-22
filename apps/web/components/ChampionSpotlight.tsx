"use client";

import {
  CHAMPIONSHIP_VENUE,
  BLOCK_EXPLORER_URLS,
  IPFS_GATEWAY_URL,
  REGIONS,
  ROUND_SCHEDULE,
  ROUND_ORDER,
} from "@agent-madness/shared";
import type { RoundName } from "@agent-madness/shared";
import { TierBadge } from "@/components/TierBadge";

interface MatchWon {
  matchId: number;
  round: RoundName;
  opponentId: string;
  opponentSeed: number;
  championScore: number;
  opponentScore: number;
  tier: string;
  averageLatency: number | null;
  totalRequests: number | null;
  ipfsCid: string | null;
  txHash: string | null;
}

interface ChampionEntry {
  agentId: string;
  walletAddress: string;
  chain: string;
  region: string;
  seed: number;
}

interface ChampionSpotlightProps {
  champion: ChampionEntry;
  qualificationScore: { score: number; tier: string } | null;
  matchesWon: MatchWon[];
}

function getRoundLabel(round: string): string {
  return ROUND_SCHEDULE.find((s) => s.round === round)?.displayName ?? round;
}

function getRegionColor(chain: string): string {
  return REGIONS.find((r) => r.name === chain)?.color ?? "#F59E0B";
}

/**
 * Champion spotlight display (US-POST-1).
 * Shows champion agent, path to championship, metrics, and on-chain links.
 * All venue/date info from shared constants.
 */
export function ChampionSpotlight({
  champion,
  qualificationScore,
  matchesWon,
}: ChampionSpotlightProps) {
  const regionColor = getRegionColor(champion.chain);
  const explorerBase = BLOCK_EXPLORER_URLS[champion.chain] ?? "";

  // Sort matches in round order
  const sortedMatches = [...matchesWon].sort(
    (a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round)
  );

  return (
    <div className="space-y-10">
      {/* ── Trophy banner ── */}
      <div
        className="relative rounded-2xl overflow-hidden border animate-champion-glow"
        style={{ borderColor: "#F59E0B60", background: "linear-gradient(135deg, #451a03 0%, #1c0d00 50%, #0a1628 100%)" }}
      >
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "repeating-linear-gradient(45deg, #F59E0B 0, #F59E0B 1px, transparent 0, transparent 50%)",
          backgroundSize: "20px 20px",
        }} />
        <div className="relative px-8 py-10 text-center">
          <div className="text-5xl mb-4" aria-hidden="true">🏆</div>
          <div className="text-amber-400 text-sm font-bold uppercase tracking-[0.2em] mb-2">
            AI Agent Madness Champion
          </div>
          <h1 className="text-3xl font-bold font-mono break-all text-white mb-4">
            {champion.agentId}
          </h1>

          {/* Badges row */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
            <span
              className="px-3 py-1 rounded-full text-sm font-bold capitalize"
              style={{
                backgroundColor: `${regionColor}30`,
                color: regionColor,
                border: `1px solid ${regionColor}60`,
              }}
            >
              {champion.chain}
            </span>
            <span className="px-3 py-1 rounded-full text-sm font-bold bg-amber-900/50 text-amber-400 border border-amber-700">
              #{champion.seed} Seed
            </span>
            {qualificationScore && (
              <TierBadge tier={qualificationScore.tier} score={qualificationScore.score} />
            )}
            <a
              href="https://8004scan.io/agents"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 rounded-full text-sm font-bold bg-blue-900/30 text-blue-400 border border-blue-700/50 hover:bg-blue-900/50 transition-colors"
            >
              8004scan
            </a>
          </div>

          {/* Venue + date */}
          <div className="text-gray-300 text-sm">
            <span className="font-bold text-amber-300">
              {CHAMPIONSHIP_VENUE.name}
            </span>
            {", "}
            {CHAMPIONSHIP_VENUE.city}, {CHAMPIONSHIP_VENUE.state}

          </div>
        </div>
      </div>

      {/* ── Wallet address ── */}
      <section className="bg-[#0d1b2a] border border-[#1b3a5c] rounded-xl p-4">
        <div className="text-xs text-[#7b93af] uppercase tracking-wider mb-1">Wallet Address</div>
        <div className="font-mono text-sm text-[#e8edf3] break-all">
          {champion.walletAddress}
        </div>
        {explorerBase && (
          <a
            href={`${explorerBase.replace("/tx/", "/address/")}${champion.walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1 inline-block"
          >
            View on {champion.chain} explorer ↗
          </a>
        )}
      </section>

      {/* ── Path to championship ── */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span style={{ color: "#F59E0B" }}>●</span>
          Path to Championship
        </h2>
        <div className="space-y-3">
          {sortedMatches.map((match, i) => (
            <div
              key={match.matchId}
              className="flex items-center gap-4 bg-[#0d1b2a] border border-[#1b3a5c] rounded-xl px-4 py-3"
            >
              {/* Round indicator */}
              <div className="flex-shrink-0 text-center">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: `${regionColor}30`, color: regionColor }}
                >
                  {i + 1}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-xs text-[#7b93af] mb-0.5">
                  {getRoundLabel(match.round)}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[#7b93af] text-sm">vs.</span>
                  <span
                    className="font-mono text-sm text-[#e8edf3]"
                    title={match.opponentId}
                  >
                    {match.opponentId.length > 12
                      ? `${match.opponentId.slice(0, 4)}...${match.opponentId.slice(-4)}`
                      : match.opponentId}
                  </span>
                  <span className="text-[#5a7a9c] text-xs">#{match.opponentSeed}</span>
                </div>
              </div>

              {/* Scores */}
              <div className="flex-shrink-0 text-right">
                <div className="text-sm font-bold">
                  <span style={{ color: regionColor }}>
                    {Math.round(match.championScore)}
                  </span>
                  <span className="text-[#5a7a9c] mx-1 text-xs">–</span>
                  <span className="text-[#5a7a9c]">{Math.round(match.opponentScore)}</span>
                </div>
                <TierBadge tier={match.tier} />
              </div>

              {/* On-chain links */}
              <div className="flex-shrink-0 flex flex-col gap-1">
                {match.ipfsCid && (
                  <a
                    href={`${IPFS_GATEWAY_URL}${match.ipfsCid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline"
                    title="View on IPFS"
                  >
                    IPFS ↗
                  </a>
                )}
                {match.txHash && explorerBase && (
                  <a
                    href={`${explorerBase}${match.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline"
                    title="View transaction"
                  >
                    TX ↗
                  </a>
                )}
              </div>
            </div>
          ))}

          {sortedMatches.length === 0 && (
            <div className="text-[#5a7a9c] text-sm text-center py-6 border border-[#1b3a5c] rounded-xl">
              Match history unavailable
            </div>
          )}
        </div>
      </section>

      {/* ── Full metrics table ── */}
      {sortedMatches.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span style={{ color: "#F59E0B" }}>●</span>
            Full Performance Metrics
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#7b93af] border-b border-[#1b3a5c]">
                  <th className="text-left py-2 pr-4 font-medium">Round</th>
                  <th className="text-right py-2 pr-4 font-medium">Score</th>
                  <th className="text-left py-2 pr-4 font-medium">Tier</th>
                  <th className="text-right py-2 pr-4 font-medium">Latency</th>
                  <th className="text-right py-2 pr-4 font-medium">Requests</th>
                  <th className="text-left py-2 pr-4 font-medium">Opponent</th>
                  <th className="text-left py-2 font-medium">On-Chain</th>
                </tr>
              </thead>
              <tbody>
                {sortedMatches.map((match) => (
                  <tr key={match.matchId} className="border-b border-[#1b3a5c]/50 hover:bg-[#162a44]/40 transition-colors">
                    <td className="py-2 pr-4 text-[#e8edf3]">{getRoundLabel(match.round)}</td>
                    <td className="py-2 pr-4 text-right font-bold tabular-nums">
                      <span style={{ color: regionColor }}>
                        {Math.round(match.championScore)}
                      </span>
                      <span className="text-[#5a7a9c] font-normal ml-1 text-xs">
                        vs {Math.round(match.opponentScore)}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <TierBadge tier={match.tier} />
                    </td>
                    <td className="py-2 pr-4 text-right text-[#7b93af] tabular-nums">
                      {match.averageLatency !== null ? `${Math.round(match.averageLatency)}ms` : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right text-[#7b93af] tabular-nums">
                      {match.totalRequests ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="font-mono text-[#7b93af]">
                        {match.opponentId.length > 12
                          ? `${match.opponentId.slice(0, 4)}...${match.opponentId.slice(-4)}`
                          : match.opponentId}
                      </span>
                      <span className="text-[#5a7a9c] ml-1">#{match.opponentSeed}</span>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {match.ipfsCid && (
                          <a
                            href={`${IPFS_GATEWAY_URL}${match.ipfsCid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 transition-colors text-xs underline"
                          >
                            IPFS
                          </a>
                        )}
                        {match.txHash && explorerBase && (
                          <a
                            href={`${explorerBase}${match.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 transition-colors text-xs underline"
                          >
                            TX
                          </a>
                        )}
                        {!match.ipfsCid && !match.txHash && (
                          <span className="text-[#1b3a5c]">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
