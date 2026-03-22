"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BracketMatchup } from "@agent-madness/shared";
import { REGIONS } from "@agent-madness/shared";
import { adminPost } from "@/lib/api";

const REGION_COLORS: Record<string, string> = {
  monad: "#836EF9",
  ethereum: "#627EEA",
  arbitrum: "#FF6B35",
  base: "#0052FF",
};

interface AdminBracketProps {
  matchups: BracketMatchup[];
  currentRound?: string;
  onUpdate?: () => void;
}

interface MatchupCardProps {
  matchup: BracketMatchup;
  onUpdate?: () => void;
}

function MatchupCard({ matchup, onUpdate }: MatchupCardProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isComplete = matchup.completedAt !== null;
  const isWinnerA = matchup.winnerId === matchup.entryAId;
  const isWinnerB = matchup.winnerId === matchup.entryBId;

  const runMatchup = async (action: "run" | "replay") => {
    setRunning(true);
    setError(null);
    try {
      await adminPost(`/admin/matchup/${matchup.id}/${action}`, {});
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setRunning(false);
    }
  };

  const truncateId = (id: string) => {
    if (id.length <= 16) return id;
    return `${id.slice(0, 8)}…${id.slice(-6)}`;
  };

  return (
    <div
      className="rounded-lg border border-[#1b3a5c] bg-[#0d1b2a] p-3 hover:border-[#234d7a] transition-colors cursor-pointer"
      onClick={() => router.push(`/admin/matchup/${matchup.id}`)}
    >
      {/* Participants */}
      <div className="space-y-1 mb-2">
        <div className={`flex items-center justify-between text-xs ${isWinnerA ? "text-white" : "text-[#7b93af]"}`}>
          <span className="font-mono">
            <span className="text-[#5a7a9c] mr-1">#{matchup.seedA}</span>
            {truncateId(`Entry #${matchup.entryAId}`)}
          </span>
          {matchup.scoreA !== null && (
            <span className={`font-bold tabular-nums ${isWinnerA ? "text-green-400" : ""}`}>
              {matchup.scoreA.toFixed(1)}
            </span>
          )}
        </div>
        <div className="border-t border-[#1b3a5c]" />
        <div className={`flex items-center justify-between text-xs ${isWinnerB ? "text-white" : "text-[#7b93af]"}`}>
          <span className="font-mono">
            <span className="text-[#5a7a9c] mr-1">#{matchup.seedB}</span>
            {truncateId(`Entry #${matchup.entryBId}`)}
          </span>
          {matchup.scoreB !== null && (
            <span className={`font-bold tabular-nums ${isWinnerB ? "text-green-400" : ""}`}>
              {matchup.scoreB.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div
        className="flex items-center gap-1 mt-2"
        onClick={(e) => e.stopPropagation()}
      >
        {!isComplete && (
          <button
            onClick={() => runMatchup("run")}
            disabled={running}
            className="flex-1 px-2 py-1 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
          >
            {running ? "…" : "▶ Run"}
          </button>
        )}
        {isComplete && (
          <button
            onClick={() => runMatchup("replay")}
            disabled={running}
            className="flex-1 px-2 py-1 bg-[#162a44] hover:bg-[#1b3a5c] disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors border border-[#1b3a5c]"
          >
            {running ? "…" : "↺ Replay"}
          </button>
        )}
        <span
          className={`text-xs px-2 py-0.5 rounded font-medium ${
            isComplete
              ? "bg-green-900/50 text-green-400"
              : "bg-[#162a44] text-[#5a7a9c]"
          }`}
        >
          {isComplete ? "Done" : "Pending"}
        </span>
      </div>

      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

export function AdminBracket({ matchups, currentRound, onUpdate }: AdminBracketProps) {
  const [runningAll, setRunningAll] = useState(false);
  const [runAllResult, setRunAllResult] = useState<string | null>(null);

  const handleRunAll = async () => {
    if (!currentRound) return;
    setRunningAll(true);
    setRunAllResult(null);
    try {
      const data = await adminPost<{ results: unknown[]; roundComplete: boolean }>(
        `/admin/round/${currentRound}/run-all`,
        {}
      );
      setRunAllResult(
        `${Array.isArray(data.results) ? data.results.length : 0} matchups run. Round complete: ${data.roundComplete}`
      );
      onUpdate?.();
    } catch (err) {
      setRunAllResult(err instanceof Error ? err.message : "Run all failed");
    } finally {
      setRunningAll(false);
    }
  };

  // Group matchups by region
  const byRegion: Record<string, BracketMatchup[]> = {};
  const noRegion: BracketMatchup[] = [];

  for (const m of matchups) {
    if (m.region) {
      if (!byRegion[m.region]) byRegion[m.region] = [];
      byRegion[m.region].push(m);
    } else {
      noRegion.push(m);
    }
  }

  const regionOrder = REGIONS.map((r) => r.name);

  return (
    <div className="space-y-4">
      {/* Run All button */}
      {currentRound && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunAll}
            disabled={runningAll}
            className="px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {runningAll ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                Running All…
              </span>
            ) : (
              `▶ Run All ${currentRound}`
            )}
          </button>
          {runAllResult && (
            <span
              className={`text-xs px-3 py-1.5 rounded-lg ${
                runAllResult.toLowerCase().includes("failed") || runAllResult.toLowerCase().includes("error")
                  ? "bg-red-900/50 text-red-300 border border-red-800"
                  : "bg-green-900/50 text-green-300 border border-green-800"
              }`}
            >
              {runAllResult}
            </span>
          )}
        </div>
      )}

      {/* Regional grid */}
      <div className="grid grid-cols-2 gap-4">
        {regionOrder.map((regionName) => {
          const regionMatchups = byRegion[regionName];
          if (!regionMatchups || regionMatchups.length === 0) return null;

          const regionDef = REGIONS.find((r) => r.name === regionName);
          const color = REGION_COLORS[regionName] ?? "#6b7280";

          return (
            <div
              key={regionName}
              className="rounded-xl border border-[#1b3a5c] bg-[#0d1b2a]/80 p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <h3 className="text-sm font-bold" style={{ color }}>
                  {regionDef?.displayName ?? regionName}
                </h3>
                <span className="text-xs text-[#5a7a9c] ml-auto">
                  {regionMatchups.filter((m) => m.completedAt).length}/{regionMatchups.length} complete
                </span>
              </div>
              <div className="space-y-2">
                {regionMatchups.map((m) => (
                  <MatchupCard key={m.id} matchup={m} onUpdate={onUpdate} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Non-regional matchups (Final 4, Championship) */}
      {noRegion.length > 0 && (
        <div className="rounded-xl border border-[#1b3a5c] bg-[#0d1b2a]/80 p-4">
          <h3 className="text-sm font-bold text-white mb-3">
            {noRegion[0]?.round === "FINAL4"
              ? "Semifinals"
              : noRegion[0]?.round === "CHAMPIONSHIP"
              ? "Championship"
              : "Cross-Region Matchups"}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {noRegion.map((m) => (
              <MatchupCard key={m.id} matchup={m} onUpdate={onUpdate} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
