"use client";

import { useState, useCallback, useEffect } from "react";
import type { BracketMatchup, TournamentState } from "@agent-madness/shared";
import { useSSE } from "./useSSE";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface BracketData {
  matchups: BracketMatchup[];
  state: TournamentState;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface UseBracketOptions {
  initialMatchups?: BracketMatchup[];
  initialState?: TournamentState;
}

/**
 * Fetches bracket data from GET /api/bracket and keeps it up to date via SSE.
 * Accepts optional initial data from server-side fetch to avoid client waterfall.
 * On SSE match:started → marks the matchup as live in local state.
 * On SSE match:completed → updates the matchup with scores + winner.
 * On reconnect → refetches full bracket state.
 */
export function useBracket(options?: UseBracketOptions): BracketData {
  const hasInitialData = !!(options?.initialMatchups && options.initialMatchups.length > 0);
  const [matchups, setMatchups] = useState<BracketMatchup[]>(options?.initialMatchups ?? []);
  const [state, setState] = useState<TournamentState>(options?.initialState ?? "REGISTRATION");
  const [loading, setLoading] = useState(!hasInitialData);
  const [error, setError] = useState<string | null>(null);

  const fetchBracket = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_URL}/api/bracket`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMatchups(data.matchups ?? []);
      setState(data.state ?? "REGISTRATION");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load bracket"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skip initial fetch if server already provided data
    if (!hasInitialData) {
      fetchBracket();
    }
  }, [fetchBracket, hasInitialData]);

  useSSE({
    onMatchStarted: (data) => {
      setMatchups((prev) =>
        prev.map((m) =>
          m.id === data.matchId
            ? { ...m, startedAt: data.startedAt, completedAt: null }
            : m
        )
      );
    },
    onMatchCompleted: (data) => {
      setMatchups((prev) =>
        prev.map((m) =>
          m.id === data.matchId
            ? {
                ...m,
                winnerId: data.winnerId,
                scoreA: data.scoreA,
                scoreB: data.scoreB,
                completedAt: data.completedAt,
              }
            : m
        )
      );
    },
    onStateAdvanced: (data) => {
      setState(data.state as TournamentState);
      // Refetch to get updated bracket data
      fetchBracket();
    },
    onRoundCompleted: () => {
      fetchBracket();
    },
    onReconnect: () => {
      fetchBracket();
    },
  });

  return { matchups, state, loading, error, refetch: fetchBracket };
}
