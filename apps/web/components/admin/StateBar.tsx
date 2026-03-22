"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CHAMPIONSHIP_VENUE,
  getRoundSchedule,
} from "@clankrank/shared";
import type { TournamentState, RoundName } from "@clankrank/shared";
import { adminGet, adminPost } from "@/lib/api";

const ROUND_NAMES: RoundName[] = ["R64", "R32", "R16", "QF", "SF", "CHAMPIONSHIP"];

function getStateBadgeClass(state: TournamentState): string {
  switch (state) {
    case "REGISTRATION":
      return "bg-blue-600 text-white";
    case "QUALIFICATION":
      return "bg-yellow-500 text-gray-900";
    case "COMPLETE":
      return "bg-amber-500 text-gray-900";
    default:
      // Active round states
      return "bg-green-600 text-white";
  }
}

export function StateBar() {
  const [state, setState] = useState<TournamentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [advanceMessage, setAdvanceMessage] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminGet<{ state: TournamentState }>("/admin/state");
      setState(data.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleAdvance = async () => {
    if (!state) return;
    setAdvancing(true);
    setAdvanceMessage(null);
    try {
      const result = await adminPost<{ previousState: TournamentState; newState: TournamentState }>(
        "/admin/state/advance",
        {}
      );
      setState(result.newState);
      setAdvanceMessage(`Advanced: ${result.previousState} → ${result.newState}`);
      setTimeout(() => setAdvanceMessage(null), 4000);
    } catch (err) {
      setAdvanceMessage(err instanceof Error ? err.message : "Failed to advance state");
    } finally {
      setAdvancing(false);
    }
  };

  const isRoundState = state && ROUND_NAMES.includes(state as RoundName);
  const isVenueState = state === "SF" || state === "CHAMPIONSHIP";
  const roundSchedule = isRoundState ? getRoundSchedule(state as RoundName) : null;
  const isComplete = state === "COMPLETE";

  return (
    <div className="bg-[#0d1b2a] border-b border-[#1b3a5c] px-6 py-3 flex items-center gap-4 flex-wrap">
      {/* State Badge */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-[#7b93af] uppercase tracking-widest">
          Tournament State
        </span>
        {loading ? (
          <span className="text-[#5a7a9c] text-sm">Loading…</span>
        ) : error ? (
          <span className="text-red-400 text-sm">{error}</span>
        ) : state ? (
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${getStateBadgeClass(state)}`}
          >
            {state.replace("_", " ")}
          </span>
        ) : null}
      </div>

      {/* Round info */}
      {roundSchedule && (
        <div className="flex items-center gap-2 text-sm text-[#7b93af]">
          <span className="text-[#1b3a5c]">|</span>
          <span className="font-medium text-[#e8edf3]">{roundSchedule.displayName}</span>
        </div>
      )}

      {/* Venue for Final4 / Championship */}
      {isVenueState && (
        <div className="flex items-center gap-2 text-sm text-[#7b93af]">
          <span className="text-[#1b3a5c]">|</span>
          <span>📍</span>
          <span>
            {CHAMPIONSHIP_VENUE.name}, {CHAMPIONSHIP_VENUE.city}, {CHAMPIONSHIP_VENUE.state}
          </span>
        </div>
      )}

      {/* Spacer */}
      <div className="ml-auto flex items-center gap-3">
        {advanceMessage && (
          <span
            className={`text-xs px-3 py-1 rounded-full ${
              advanceMessage.includes("→")
                ? "bg-green-900 text-green-300"
                : "bg-red-900 text-red-300"
            }`}
          >
            {advanceMessage}
          </span>
        )}

        {!isComplete && !loading && state && (
          <button
            onClick={handleAdvance}
            disabled={advancing}
            className="px-4 py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {advancing ? "Advancing…" : "Advance State →"}
          </button>
        )}
      </div>
    </div>
  );
}
