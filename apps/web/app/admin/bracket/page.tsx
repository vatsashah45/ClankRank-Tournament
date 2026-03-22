"use client";

import { useState, useEffect, useCallback } from "react";
import type { BracketMatchup, TournamentState } from "@agent-madness/shared";
import { AdminBracket } from "@/components/admin/AdminBracket";
import { apiGet } from "@/lib/api";

interface BracketResponse {
  state: TournamentState;
  matchups: BracketMatchup[];
  count: number;
}

const ROUND_STATES = ["R64", "R32", "SWEET16", "ELITE8", "FINAL4", "CHAMPIONSHIP"];

export default function AdminBracketPage() {
  const [data, setData] = useState<BracketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBracket = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiGet<BracketResponse>("/bracket");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bracket");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBracket();
  }, [fetchBracket]);

  const currentRound = data?.state && ROUND_STATES.includes(data.state) ? data.state : undefined;

  // Filter to current round's matchups for display
  const visibleMatchups = data?.matchups
    ? currentRound
      ? data.matchups.filter((m) => m.round === currentRound)
      : data.matchups
    : [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bracket</h1>
          <p className="text-sm text-[#7b93af] mt-1">
            {currentRound ? `Current round: ${currentRound}` : "All matchups"}
            {data && (
              <span className="ml-2 text-[#5a7a9c]">· {data.count} total matchups</span>
            )}
          </p>
        </div>
        <button
          onClick={fetchBracket}
          disabled={loading}
          className="px-3 py-1.5 bg-[#1b3a5c] hover:bg-gray-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* Round filter tabs */}
      {data && (
        <div className="flex gap-1 flex-wrap">
          {ROUND_STATES.filter((r) =>
            data.matchups.some((m) => m.round === r)
          ).map((round) => {
            const roundMatchups = data.matchups.filter((m) => m.round === round);
            const completedCount = roundMatchups.filter((m) => m.completedAt).length;
            return (
              <a
                key={round}
                href={`/admin/round/${round}`}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#162a44] text-[#7b93af] hover:text-white hover:bg-[#1b3a5c] transition-colors"
              >
                {round}
                <span className="ml-1.5 text-[#5a7a9c]">
                  {completedCount}/{roundMatchups.length}
                </span>
              </a>
            );
          })}
        </div>
      )}

      {loading && (
        <div className="text-[#7b93af] text-sm">Loading bracket…</div>
      )}

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-900/30 p-4 text-red-400 text-sm">
          Error: {error}
          <button onClick={fetchBracket} className="ml-3 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && data && (
        visibleMatchups.length === 0 ? (
          <div className="rounded-xl border border-[#1b3a5c] bg-[#0d1b2a] p-8 text-center text-[#7b93af]">
            No matchups found. Bracket has not been generated yet.
          </div>
        ) : (
          <AdminBracket
            matchups={visibleMatchups}
            currentRound={currentRound}
            onUpdate={fetchBracket}
          />
        )
      )}
    </div>
  );
}
