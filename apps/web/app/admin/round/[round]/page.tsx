"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type { BracketMatchup, RoundName } from "@agent-madness/shared";
import { getRoundSchedule, CHAMPIONSHIP_VENUE } from "@agent-madness/shared";
import { apiGet, adminGet, adminPost } from "@/lib/api";

interface RoundStatus {
  total: number;
  completed: number;
  pending: number;
  winners: number[];
}

interface BracketResponse {
  matchups: BracketMatchup[];
  count: number;
}

const REGION_COLORS: Record<string, string> = {
  monad: "#836EF9",
  ethereum: "#627EEA",
  arbitrum: "#FF6B35",
  base: "#0052FF",
};

const VENUE_ROUNDS: RoundName[] = ["FINAL4", "CHAMPIONSHIP"];

export default function RoundDetailPage() {
  const params = useParams();
  const router = useRouter();
  const round = params?.round as string;

  const [status, setStatus] = useState<RoundStatus | null>(null);
  const [matchups, setMatchups] = useState<BracketMatchup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [runAllResult, setRunAllResult] = useState<string | null>(null);
  const [runningMatchup, setRunningMatchup] = useState<number | null>(null);

  const schedule = getRoundSchedule(round as RoundName);
  const isVenueRound = VENUE_ROUNDS.includes(round as RoundName);

  const fetchData = useCallback(async () => {
    if (!round) return;
    try {
      setLoading(true);
      setError(null);

      const [statusData, bracketData] = await Promise.all([
        adminGet<RoundStatus>(`/admin/round/${round}/status`),
        apiGet<BracketResponse>("/bracket"),
      ]);

      setStatus(statusData);
      const roundMatchups = (bracketData.matchups ?? []).filter((m) => m.round === round);
      setMatchups(roundMatchups);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load round data");
    } finally {
      setLoading(false);
    }
  }, [round]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRunAll = async () => {
    setRunningAll(true);
    setRunAllResult(null);
    try {
      const data = await adminPost<{ results: unknown[]; roundComplete: boolean; advanced: boolean }>(
        `/admin/round/${round}/run-all`,
        {}
      );
      setRunAllResult(
        `${Array.isArray(data.results) ? data.results.length : 0} matchups run. Complete: ${data.roundComplete}. Advanced: ${data.advanced}`
      );
      fetchData();
    } catch (err) {
      setRunAllResult(err instanceof Error ? err.message : "Run all failed");
    } finally {
      setRunningAll(false);
    }
  };

  const handleRunMatchup = async (matchupId: number, action: "run" | "replay") => {
    setRunningMatchup(matchupId);
    try {
      await adminPost(`/admin/matchup/${matchupId}/${action}`, {});
      fetchData();
    } catch (err) {
      console.error("Matchup action failed:", err);
    } finally {
      setRunningMatchup(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/admin/bracket")}
          className="text-[#7b93af] hover:text-white transition-colors text-sm"
        >
          ← Bracket
        </button>
        <span className="text-gray-700">/</span>
        <h1 className="text-2xl font-bold text-white">{round}</h1>
      </div>

      {/* Schedule info */}
      {schedule && (
        <div className="rounded-xl border border-[#1b3a5c] bg-[#0d1b2a] p-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-[#7b93af] text-xs uppercase tracking-widest block mb-0.5">
                Round
              </span>
              <span className="text-white font-medium">{schedule.displayName}</span>
            </div>
            {isVenueRound && (
              <div>
                <span className="text-[#7b93af] text-xs uppercase tracking-widest block mb-0.5">
                  Venue
                </span>
                <span className="text-white font-medium">
                  {CHAMPIONSHIP_VENUE.name}, {CHAMPIONSHIP_VENUE.city}, {CHAMPIONSHIP_VENUE.state}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {loading && <div className="text-[#7b93af] text-sm">Loading round data…</div>}

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-900/30 p-4 text-red-400 text-sm">
          Error: {error}
          <button onClick={fetchData} className="ml-3 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && status && (
        <>
          {/* Status summary + Run All */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-3">
              <div className="rounded-lg bg-[#0d1b2a] border border-[#1b3a5c] px-3 py-2 text-center">
                <div className="text-lg font-bold text-white tabular-nums">{status.total}</div>
                <div className="text-xs text-[#7b93af]">Total</div>
              </div>
              <div className="rounded-lg bg-green-900/40 border border-green-800 px-3 py-2 text-center">
                <div className="text-lg font-bold text-green-400 tabular-nums">{status.completed}</div>
                <div className="text-xs text-green-600">Complete</div>
              </div>
              <div className="rounded-lg bg-yellow-900/40 border border-yellow-800 px-3 py-2 text-center">
                <div className="text-lg font-bold text-yellow-400 tabular-nums">{status.pending}</div>
                <div className="text-xs text-yellow-600">Pending</div>
              </div>
            </div>

            {/* Progress bar */}
            {status.total > 0 && (
              <div className="flex-1 min-w-32">
                <div className="w-full bg-[#162a44] rounded-full h-2">
                  <div
                    className="bg-teal-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.round((status.completed / status.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleRunAll}
              disabled={runningAll}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors ml-auto"
            >
              {runningAll ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  Running…
                </span>
              ) : (
                `▶ Run All ${round}`
              )}
            </button>
          </div>

          {runAllResult && (
            <div
              className={`px-3 py-2 rounded-lg text-sm ${
                runAllResult.toLowerCase().includes("failed") || runAllResult.toLowerCase().includes("error")
                  ? "bg-red-900/50 text-red-300 border border-red-800"
                  : "bg-green-900/50 text-green-300 border border-green-800"
              }`}
            >
              {runAllResult}
            </div>
          )}

          {/* Matchup list */}
          <div className="space-y-2">
            {matchups.length === 0 ? (
              <div className="rounded-xl border border-[#1b3a5c] bg-[#0d1b2a] p-8 text-center text-[#7b93af]">
                No matchups for this round yet.
              </div>
            ) : (
              matchups.map((m) => {
                const isComplete = m.completedAt !== null;
                const isWinnerA = m.winnerId === m.entryAId;
                const isWinnerB = m.winnerId === m.entryBId;
                const isRunning = runningMatchup === m.id;
                const regionColor = m.region ? REGION_COLORS[m.region] : undefined;

                return (
                  <div
                    key={m.id}
                    className="rounded-xl border border-[#1b3a5c] bg-[#0d1b2a] p-4 hover:border-[#1b3a5c] transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {/* Region dot */}
                      {regionColor && (
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: regionColor }}
                          title={m.region ?? undefined}
                        />
                      )}

                      {/* Participants */}
                      <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
                        <div
                          className={`flex items-center justify-between text-sm ${
                            isWinnerA ? "text-white font-semibold" : "text-[#7b93af]"
                          }`}
                        >
                          <span className="font-mono truncate">
                            <span className="text-[#5a7a9c] mr-1">#{m.seedA}</span>
                            Entry #{m.entryAId}
                          </span>
                          {m.scoreA !== null && (
                            <span className={`tabular-nums ml-2 ${isWinnerA ? "text-green-400" : ""}`}>
                              {m.scoreA.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div
                          className={`flex items-center justify-between text-sm ${
                            isWinnerB ? "text-white font-semibold" : "text-[#7b93af]"
                          }`}
                        >
                          <span className="font-mono truncate">
                            <span className="text-[#5a7a9c] mr-1">#{m.seedB}</span>
                            Entry #{m.entryBId}
                          </span>
                          {m.scoreB !== null && (
                            <span className={`tabular-nums ml-2 ${isWinnerB ? "text-green-400" : ""}`}>
                              {m.scoreB.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status */}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                          isComplete
                            ? "bg-green-900 text-green-300"
                            : "bg-[#162a44] text-[#7b93af]"
                        }`}
                      >
                        {isComplete ? "Complete" : "Pending"}
                      </span>

                      {/* Actions */}
                      <div className="flex gap-2 flex-shrink-0">
                        {!isComplete && (
                          <button
                            onClick={() => handleRunMatchup(m.id, "run")}
                            disabled={isRunning}
                            className="px-3 py-1 bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            {isRunning ? "…" : "▶ Run"}
                          </button>
                        )}
                        {isComplete && (
                          <button
                            onClick={() => handleRunMatchup(m.id, "replay")}
                            disabled={isRunning}
                            className="px-3 py-1 bg-[#1b3a5c] hover:bg-gray-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            {isRunning ? "…" : "↺ Replay"}
                          </button>
                        )}
                        <button
                          onClick={() => router.push(`/admin/matchup/${m.id}`)}
                          className="px-3 py-1 bg-[#162a44] hover:bg-[#1b3a5c] text-[#7b93af] hover:text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          Inspect →
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
