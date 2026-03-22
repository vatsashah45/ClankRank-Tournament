"use client";

import Link from "next/link";
import { ROUND_SCHEDULE } from "@agent-madness/shared";
import type { BracketMatchup, TournamentState } from "@agent-madness/shared";
import { BracketBoard } from "@/components/bracket/BracketBoard";
import { EmptyBracketBoard } from "@/components/bracket/EmptyBracketBoard";
import { useBracket } from "@/hooks/useBracket";
import { LiveIndicator } from "@/components/bracket/LiveIndicator";

interface TournamentBracketProps {
  initialMatchups: BracketMatchup[];
  initialState: TournamentState;
}

/**
 * Client-side tournament bracket with SSE live updates.
 * Receives server-fetched data as initial props to avoid client waterfall.
 */
export function TournamentBracket({ initialMatchups, initialState }: TournamentBracketProps) {
  const { matchups, state, loading, error, refetch } = useBracket({
    initialMatchups,
    initialState,
  });

  const activeMatchups = matchups.filter(
    (m) => m.startedAt !== null && m.completedAt === null
  );
  const completedMatchups = matchups.filter((m) => m.completedAt !== null);

  // Get current round label
  const currentRoundLabel =
    ROUND_SCHEDULE.find((s) => s.round === state)?.displayName ?? state;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">Tournament Bracket</h1>
          <p className="text-[#7b93af]">
            64 AI agents compete across 4 regions: Monad, Ethereum, Arbitrum, and Base.
          </p>
        </div>

        {/* Champion link — only shown when complete */}
        {state === "COMPLETE" && (
          <Link
            href="/tournament/champion"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-900/50 hover:bg-amber-800/50 border border-amber-700 text-amber-300 hover:text-amber-200 rounded-lg text-sm font-bold transition-all duration-200"
          >
            🏆 View Champion
          </Link>
        )}
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-4 mb-6 px-4 py-3 bg-[#0d1b2a] border border-[#1b3a5c] rounded-xl text-sm">
        <div className="flex items-center gap-2">
          <span className="text-[#7b93af]">State:</span>
          <span className="px-2 py-0.5 bg-[#162a44] border border-[#1b3a5c] rounded font-mono text-xs text-[#e8edf3]">
            {state}
          </span>
          {state !== "REGISTRATION" && state !== "QUALIFICATION" && state !== "COMPLETE" && (
            <span className="text-[#7b93af]">{currentRoundLabel}</span>
          )}
          {state === "COMPLETE" && (
            <span className="text-amber-400 font-bold">🏆 Complete</span>
          )}
        </div>

        {activeMatchups.length > 0 && (
          <div className="flex items-center gap-2">
            <LiveIndicator />
            <span className="text-[#7b93af]">
              {activeMatchups.length} live matchup{activeMatchups.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        <div className="text-[#5a7a9c]">
          {completedMatchups.length}/{matchups.length} completed
        </div>

        <button
          onClick={refetch}
          className="ml-auto text-xs text-[#5a7a9c] hover:text-[#7b93af] transition-colors flex items-center gap-1"
          aria-label="Refresh bracket"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M10 6A4 4 0 1 1 6 2M6 2V0M6 2L4 4M6 2L8 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Refresh
        </button>
      </div>

      {/* Loading state — only shown if SSE triggers a refetch with no data yet */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-[#0d1b2a] rounded w-1/4" />
          <div className="grid grid-cols-3 gap-6">
            <div className="h-64 bg-[#0d1b2a] rounded" />
            <div className="h-64 bg-[#0d1b2a] rounded" />
            <div className="h-64 bg-[#0d1b2a] rounded" />
          </div>
        </div>
      )}

      {/* Error state — show warning banner but still render empty bracket */}
      {!loading && error && (
        <div className="text-amber-400 bg-amber-950/20 border border-amber-800/40 rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
          <p className="text-sm">Bracket data unavailable — showing template</p>
          <button
            onClick={refetch}
            className="text-xs px-3 py-1 bg-amber-900/30 hover:bg-amber-800/30 border border-amber-700/40 rounded transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty bracket template — shown when no matchups exist or on error */}
      {!loading && (error || matchups.length === 0) && (
        <EmptyBracketBoard />
      )}

      {/* Bracket */}
      {!loading && !error && matchups.length > 0 && (
        <BracketBoard matchups={matchups} state={state} />
      )}

      {/* Schedule reference */}
      {!loading && (
        <div className="mt-10 pt-6 border-t border-[#1b3a5c]">
          <h2 className="text-xs font-bold text-[#5a7a9c] uppercase tracking-wider mb-3">
            Tournament Schedule
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {ROUND_SCHEDULE.map((s) => (
              <div
                key={s.round}
                className={`bg-[#0d1b2a] border rounded-lg px-3 py-2 text-xs ${
                  s.round === state
                    ? "border-[#3b82f6]/40 bg-[#162a44]"
                    : "border-[#1b3a5c]"
                }`}
              >
                <div className={`font-bold ${s.round === state ? "text-white" : "text-[#7b93af]"}`}>
                  {s.displayName}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
