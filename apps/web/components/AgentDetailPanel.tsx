"use client";

import { useEffect, useState } from "react";
import {
  BLOCK_EXPLORER_URLS,
  IPFS_GATEWAY_URL,
  REGIONS,
  ROUND_SCHEDULE,
  ROUND_ORDER,
} from "@clankrank/shared";
import type { RoundName } from "@clankrank/shared";
import { TierBadge } from "@/components/TierBadge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface MatchHistoryEntry {
  matchId: number;
  round: RoundName;
  opponentId: string;
  opponentSeed: number;
  agentScore: number;
  opponentScore: number;
  won: boolean;
  tier: string;
  averageLatency: number | null;
  totalRequests: number | null;
  ipfsCid: string | null;
  txHash: string | null;
}

interface AgentHistoryData {
  entry: {
    id: number;
    agentId: string;
    walletAddress: string;
    chain: string;
    status: string;
    seed?: number;
    region?: string;
  };
  qualificationScore: {
    score: number;
    tier: string;
  } | null;
  matchHistory: MatchHistoryEntry[];
  explorerBaseUrl?: string;
  ipfsGatewayUrl?: string;
}

interface AgentDetailPanelProps {
  agentId: string;
}

function getRoundLabel(round: string): string {
  return ROUND_SCHEDULE.find((s) => s.round === round)?.displayName ?? round;
}

function getRegionColor(chain: string): string {
  return REGIONS.find((r) => r.name === chain)?.color ?? "#6B7280";
}

/**
 * Displays full agent history: score progression, metrics table, on-chain links, tier progression.
 * US-POST-2, US-POST-3: all on-chain links use BLOCK_EXPLORER_URLS and IPFS_GATEWAY_URL from constants.
 */
export function AgentDetailPanel({ agentId }: AgentDetailPanelProps) {
  const [data, setData] = useState<AgentHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/agent/${encodeURIComponent(agentId)}/history`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<AgentHistoryData>;
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load agent data");
        setLoading(false);
      });
  }, [agentId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-[#0d1b2a] rounded w-1/3" />
        <div className="h-4 bg-[#0d1b2a] rounded w-1/2" />
        <div className="h-40 bg-[#0d1b2a] rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 bg-red-950/30 border border-red-800 rounded-lg p-4">
        <p className="font-semibold">Failed to load agent data</p>
        <p className="text-sm mt-1 text-red-300">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { entry, qualificationScore, matchHistory } = data;
  const regionColor = getRegionColor(entry.chain);

  // Explorer URL from constants (US-POST-2)
  const explorerBase = BLOCK_EXPLORER_URLS[entry.chain] ?? "";
  const ipfsBase = IPFS_GATEWAY_URL;

  // Sort match history in round order
  const sortedHistory = [...matchHistory].sort(
    (a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round)
  );

  // Score progression data points
  const scorePoints: { label: string; score: number; tier: string }[] = [];
  if (qualificationScore) {
    scorePoints.push({
      label: "Qualification",
      score: qualificationScore.score,
      tier: qualificationScore.tier,
    });
  }
  for (const match of sortedHistory) {
    scorePoints.push({
      label: getRoundLabel(match.round),
      score: match.agentScore,
      tier: match.tier,
    });
  }

  const maxScore = Math.max(...scorePoints.map((p) => p.score), 100);

  return (
    <div className="space-y-8">
      {/* ── 1. HEADER ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            {/* Chain badge */}
            <span
              className="px-2 py-0.5 rounded text-xs font-bold capitalize"
              style={{ backgroundColor: `${regionColor}30`, color: regionColor, border: `1px solid ${regionColor}60` }}
            >
              {entry.chain}
            </span>
            {/* Status */}
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
              entry.status === "champion"
                ? "bg-amber-900/50 text-amber-400"
                : entry.status === "active"
                ? "bg-green-900/50 text-green-400"
                : entry.status === "eliminated"
                ? "bg-red-900/30 text-red-400"
                : "bg-[#162a44] text-[#7b93af]"
            }`}>
              {entry.status.toUpperCase()}
            </span>
            {/* Tier */}
            {qualificationScore && (
              <TierBadge tier={qualificationScore.tier} score={qualificationScore.score} />
            )}
          </div>
          <h2 className="text-xl font-bold font-mono break-all">
            {entry.agentId}
          </h2>
          <div className="text-sm text-[#7b93af] mt-1">
            Wallet:{" "}
            <span className="font-mono text-xs text-[#e8edf3]">
              {entry.walletAddress.slice(0, 6)}...{entry.walletAddress.slice(-4)}
            </span>
            {entry.seed && (
              <span className="ml-3">
                Seed: <span className="text-white font-bold">#{entry.seed}</span>
              </span>
            )}
            {entry.region && (
              <span className="ml-3 capitalize" style={{ color: regionColor }}>
                {entry.region} Region
              </span>
            )}
            <a
              href="https://8004scan.io/agents"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400/70 hover:text-blue-300 underline ml-3"
            >
              View on 8004scan
            </a>
          </div>
        </div>
      </div>

      {/* ── 2. SCORE HISTORY ── */}
      {scorePoints.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-[#e8edf3] uppercase tracking-wider mb-3">
            Score Progression
          </h3>
          <div className="bg-[#0d1b2a] rounded-xl border border-[#1b3a5c] p-4">
            {/* Bar chart visualization */}
            <div className="flex items-end gap-3 h-24 mb-2">
              {scorePoints.map((pt, i) => (
                <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  <span className="text-xs font-bold text-white">
                    {Math.round(pt.score)}
                  </span>
                  <div
                    className="w-full rounded-t transition-all duration-500"
                    style={{
                      height: `${Math.round((pt.score / maxScore) * 64)}px`,
                      backgroundColor: regionColor,
                      opacity: 0.9,
                      minHeight: "4px",
                      boxShadow: `0 0 8px ${regionColor}60`,
                    }}
                  />
                </div>
              ))}
            </div>
            {/* Labels */}
            <div className="flex gap-3">
              {scorePoints.map((pt, i) => (
                <div key={i} className="flex-1 min-w-0 text-center">
                  <div className="text-xs text-[#7b93af] truncate">{pt.label}</div>
                  <div className="mt-0.5 flex justify-center">
                    <TierBadge tier={pt.tier} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 3. TIER PROGRESSION ── */}
      {scorePoints.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-[#e8edf3] uppercase tracking-wider mb-3">
            Tier Progression
          </h3>
          <div className="flex flex-wrap gap-2 items-center">
            {scorePoints.map((pt, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-[#1b3a5c] text-xs">→</span>}
                <div className="flex flex-col items-center gap-0.5">
                  <TierBadge tier={pt.tier} />
                  <span className="text-xs text-[#5a7a9c]">{pt.label}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 4. METRICS TABLE ── */}
      {sortedHistory.length > 0 ? (
        <section>
          <h3 className="text-sm font-bold text-[#e8edf3] uppercase tracking-wider mb-3">
            Match History
          </h3>
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
                  <th className="text-left py-2 pr-4 font-medium">Result</th>
                  <th className="text-left py-2 font-medium">On-Chain</th>
                </tr>
              </thead>
              <tbody>
                {sortedHistory.map((match) => (
                  <tr
                    key={match.matchId}
                    className={`border-b border-[#1b3a5c]/50 transition-colors hover:bg-[#162a44]/40 ${
                      match.won
                        ? "bg-green-950/10"
                        : "bg-red-950/10"
                    }`}
                  >
                    <td className="py-2 pr-4 text-[#e8edf3]">
                      {getRoundLabel(match.round)}
                    </td>
                    <td className="py-2 pr-4 text-right font-bold tabular-nums">
                      <span style={{ color: regionColor }}>
                        {Math.round(match.agentScore)}
                      </span>
                      <span className="text-[#5a7a9c] font-normal ml-1">
                        vs {Math.round(match.opponentScore)}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <TierBadge tier={match.tier} />
                    </td>
                    <td className="py-2 pr-4 text-right text-[#7b93af] tabular-nums">
                      {match.averageLatency !== null
                        ? `${Math.round(match.averageLatency)}ms`
                        : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right text-[#7b93af] tabular-nums">
                      {match.totalRequests ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="font-mono text-[#7b93af]">
                        {match.opponentId
                          ? (match.opponentId.length > 12
                            ? `${match.opponentId.slice(0, 4)}...${match.opponentId.slice(-4)}`
                            : match.opponentId)
                          : "—"}
                      </span>
                      {match.opponentSeed != null && (
                        <span className="text-[#5a7a9c] ml-1">#{match.opponentSeed}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`font-bold ${
                          match.won ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {match.won ? "WIN" : "LOSS"}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {/* IPFS link (US-POST-3) */}
                        {match.ipfsCid && (
                          <a
                            href={`${ipfsBase}${match.ipfsCid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 transition-colors text-xs underline"
                            title="View on IPFS"
                          >
                            IPFS
                          </a>
                        )}
                        {/* Tx hash link (US-POST-2) */}
                        {match.txHash && explorerBase && (
                          <a
                            href={`${explorerBase}${match.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 transition-colors text-xs underline"
                            title="View transaction on block explorer"
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
      ) : (
        <div className="text-[#5a7a9c] text-sm py-4 text-center border border-[#1b3a5c] rounded-lg">
          No match history yet
        </div>
      )}
    </div>
  );
}
