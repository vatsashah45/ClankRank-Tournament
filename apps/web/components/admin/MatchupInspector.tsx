"use client";

import { useState } from "react";
import type { BracketMatchup } from "@clankrank/shared";
import { IPFS_GATEWAY_URL, BLOCK_EXPLORER_URLS } from "@clankrank/shared";
import { TierBadge } from "@/components/TierBadge";
import { adminPost } from "@/lib/api";

const REGION_COLORS: Record<string, string> = {
  monad: "#836EF9",
  ethereum: "#627EEA",
  arbitrum: "#FF6B35",
  base: "#0052FF",
};

interface AgentInfo {
  agentId: string;
  chain?: string;
  tier?: string;
}

interface MatchupInspectorProps {
  matchup: BracketMatchup;
  agentA?: AgentInfo;
  agentB?: AgentInfo;
  onReplay?: () => void;
}

function formatTs(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricsDisplay({ json }: { json: string | null }) {
  if (!json) return <p className="text-gray-600 text-xs italic">No metrics recorded</p>;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return <p className="text-red-400 text-xs">Invalid JSON</p>;
  }

  return (
    <div className="space-y-1">
      {Object.entries(parsed).map(([key, val]) => (
        <div key={key} className="flex justify-between text-xs gap-3">
          <span className="text-gray-500 font-mono">{key}</span>
          <span className="text-gray-300 font-mono text-right break-all">
            {typeof val === "object" ? JSON.stringify(val) : String(val)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MatchupInspector({
  matchup,
  agentA,
  agentB,
  onReplay,
}: MatchupInspectorProps) {
  const [replaying, setReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<string | null>(null);

  const handleReplay = async () => {
    setReplaying(true);
    setReplayResult(null);
    try {
      await adminPost(`/admin/matchup/${matchup.id}/replay`, {});
      setReplayResult("Replay initiated successfully");
      onReplay?.();
    } catch (err) {
      setReplayResult(err instanceof Error ? err.message : "Replay failed");
    } finally {
      setReplaying(false);
    }
  };

  const isWinnerA = matchup.winnerId === matchup.entryAId;
  const isWinnerB = matchup.winnerId === matchup.entryBId;
  const isComplete = matchup.completedAt !== null;

  const chainA = agentA?.chain ?? matchup.region ?? undefined;
  const chainB = agentB?.chain ?? matchup.region ?? undefined;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-widest">Matchup #{matchup.id}</span>
          <span className="text-xs text-gray-600">·</span>
          <span className="text-xs text-gray-400">{matchup.round}</span>
          {matchup.region && (
            <>
              <span className="text-xs text-gray-600">·</span>
              <span
                className="text-xs font-semibold capitalize"
                style={{ color: REGION_COLORS[matchup.region] ?? "#9ca3af" }}
              >
                {matchup.region}
              </span>
            </>
          )}
        </div>
        <button
          onClick={handleReplay}
          disabled={replaying}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {replaying ? "Replaying…" : "↺ Replay"}
        </button>
      </div>

      {replayResult && (
        <div
          className={`px-3 py-2 rounded-lg text-xs ${
            replayResult.includes("success")
              ? "bg-green-900/50 text-green-300 border border-green-800"
              : "bg-red-900/50 text-red-300 border border-red-800"
          }`}
        >
          {replayResult}
        </div>
      )}

      {/* Side-by-side agents */}
      <div className="grid grid-cols-2 gap-3">
        {/* Agent A */}
        <div
          className={`rounded-xl border p-4 ${
            isWinnerA
              ? "border-green-600 bg-green-950/30"
              : "border-gray-800 bg-gray-900"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Agent A · Seed #{matchup.seedA}</span>
            {isWinnerA && (
              <span className="text-xs bg-green-700 text-white px-2 py-0.5 rounded-full font-bold">
                WINNER
              </span>
            )}
          </div>
          <div className="font-mono text-sm text-white break-all mb-2">
            {agentA?.agentId ?? `Entry #${matchup.entryAId}`}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {chainA && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: REGION_COLORS[chainA] ?? "#6b7280" }}
                />
                <span className="capitalize">{chainA}</span>
              </span>
            )}
            {agentA?.tier && <TierBadge tier={agentA.tier} />}
          </div>
          {matchup.scoreA !== null && (
            <div className="mt-3 text-2xl font-bold text-white">
              {matchup.scoreA.toFixed(1)}
              <span className="text-sm text-gray-500 font-normal ml-1">pts</span>
            </div>
          )}
        </div>

        {/* Agent B */}
        <div
          className={`rounded-xl border p-4 ${
            isWinnerB
              ? "border-green-600 bg-green-950/30"
              : "border-gray-800 bg-gray-900"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Agent B · Seed #{matchup.seedB}</span>
            {isWinnerB && (
              <span className="text-xs bg-green-700 text-white px-2 py-0.5 rounded-full font-bold">
                WINNER
              </span>
            )}
          </div>
          <div className="font-mono text-sm text-white break-all mb-2">
            {agentB?.agentId ?? `Entry #${matchup.entryBId}`}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {chainB && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: REGION_COLORS[chainB] ?? "#6b7280" }}
                />
                <span className="capitalize">{chainB}</span>
              </span>
            )}
            {agentB?.tier && <TierBadge tier={agentB.tier} />}
          </div>
          {matchup.scoreB !== null && (
            <div className="mt-3 text-2xl font-bold text-white">
              {matchup.scoreB.toFixed(1)}
              <span className="text-sm text-gray-500 font-normal ml-1">pts</span>
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
          Match Details
        </h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-gray-500">Started</div>
          <div className="text-gray-300">{formatTs(matchup.startedAt)}</div>
          <div className="text-gray-500">Completed</div>
          <div className="text-gray-300">{formatTs(matchup.completedAt)}</div>
          <div className="text-gray-500">Status</div>
          <div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                isComplete
                  ? "bg-green-900 text-green-300"
                  : "bg-yellow-900 text-yellow-300"
              }`}
            >
              {isComplete ? "Complete" : "Pending"}
            </span>
          </div>
        </div>
      </div>

      {/* Links */}
      {(matchup.ipfsCid || matchup.txHash) && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
            On-Chain Links
          </h4>
          {matchup.ipfsCid && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">IPFS CID:</span>
              <a
                href={`${IPFS_GATEWAY_URL}${matchup.ipfsCid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:text-teal-300 font-mono break-all"
              >
                {matchup.ipfsCid}
              </a>
            </div>
          )}
          {matchup.txHash && chainA && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Tx Hash:</span>
              <a
                href={`${BLOCK_EXPLORER_URLS[chainA] ?? ""}${matchup.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:text-teal-300 font-mono break-all"
              >
                {matchup.txHash}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Agent A Metrics
          </h4>
          <MetricsDisplay json={matchup.metricsAJson} />
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Agent B Metrics
          </h4>
          <MetricsDisplay json={matchup.metricsBJson} />
        </div>
      </div>
    </div>
  );
}
