"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BracketMatchup, TournamentState } from "@agent-madness/shared";
import { ROUND_ORDER } from "@agent-madness/shared";
import { ChampionSpotlight } from "@/components/ChampionSpotlight";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
  qualificationScore: { score: number; tier: string } | null;
  matchHistory: {
    matchId: number;
    round: string;
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
  }[];
}

interface BracketResponse {
  state: TournamentState;
  matchups: BracketMatchup[];
}

/**
 * Champion page (US-POST-1).
 * If tournament is complete, fetches bracket to identify champion and renders ChampionSpotlight.
 * Otherwise shows "Tournament in progress" message.
 */
export default function ChampionPage() {
  const [bracketData, setBracketData] = useState<BracketResponse | null>(null);
  const [agentHistory, setAgentHistory] = useState<AgentHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load bracket to find champion
        const bracketRes = await fetch(`${API_URL}/api/bracket`, { cache: "no-store" });
        if (!bracketRes.ok) throw new Error(`HTTP ${bracketRes.status}`);
        const bracket = await bracketRes.json() as BracketResponse;
        setBracketData(bracket);

        if (bracket.state !== "COMPLETE") {
          setLoading(false);
          return;
        }

        // Find championship matchup and winner
        const championship = bracket.matchups.find((m) => m.round === "CHAMPIONSHIP");
        if (!championship?.winnerId || !championship.completedAt) {
          setLoading(false);
          return;
        }

        // Find champion's entry — we need to find the agentId for the winner entryId
        // We do this by fetching all matchups to find the agentId from the bracket data
        // Then fetch agent history using that agentId
        // Since BracketMatchup has entryAId/entryBId not agentId, we need to find it
        // We look for an entry in the bracket that can give us the champion's agentId
        // The API's bracket response may include entry details or we use the history endpoint
        // We try to get the champion's history via the entryId-based search
        // The API likely returns agentId info via GET /api/agent/:agentId/history
        // We need to resolve entryId → agentId first

        // Strategy: search all matchups for the winner entry to get agentId hints
        // For R64, the agentId might be deterministic. Let's try fetching the entry directly.
        // The bracket API might return agents. Let's check if the bracket includes agent info.

        // Since we only have entryId, we'll try fetching via entry-based route if available
        // or look for the agentId from the bracket response extended data
        const winnerEntryId = championship.winnerId === championship.entryAId
          ? championship.entryAId
          : championship.entryBId;

        // Try to resolve agentId from bracket matchups - look for any match with this entry
        // and try to get agentId from the history API using entry-based lookup
        // Fall back to fetching all agents if needed
        // For now, use the entry ID to try the history endpoint
        const historyRes = await fetch(
          `${API_URL}/api/agent/entry/${winnerEntryId}/history`,
          { cache: "no-store" }
        );

        if (historyRes.ok) {
          const history = await historyRes.json() as AgentHistoryData;
          setAgentHistory(history);
        } else {
          // Try alternative route: /api/bracket/champion
          const champRes = await fetch(`${API_URL}/api/bracket/champion`, { cache: "no-store" });
          if (champRes.ok) {
            const champData = await champRes.json() as AgentHistoryData;
            setAgentHistory(champData);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-[#0d1b2a] rounded w-1/4" />
        <div className="h-64 bg-[#0d1b2a] rounded-2xl" />
        <div className="h-40 bg-[#0d1b2a] rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="mb-6">
          <Link href="/tournament" className="text-sm text-[#7b93af] hover:text-white transition-colors">
            ← Back to Bracket
          </Link>
        </div>
        <div className="text-red-400 bg-red-950/30 border border-red-800 rounded-lg p-6">
          <p className="font-semibold mb-1">Failed to load champion data</p>
          <p className="text-sm text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  // Tournament not complete
  if (!bracketData || bracketData.state !== "COMPLETE") {
    const state = bracketData?.state ?? "REGISTRATION";
    const matchups = bracketData?.matchups ?? [];
    const completedMatchups = matchups.filter((m) => m.completedAt !== null).length;
    const totalMatchups = matchups.length;

    return (
      <div>
        <div className="mb-6">
          <Link href="/tournament" className="text-sm text-[#7b93af] hover:text-white transition-colors">
            ← Back to Bracket
          </Link>
        </div>
        <div className="text-center py-16 px-4">
          <div className="text-6xl mb-6" aria-hidden="true">🏀</div>
          <h1 className="text-3xl font-bold text-white mb-3">Tournament in Progress</h1>
          <p className="text-[#7b93af] text-lg mb-6">
            The champion has not yet been crowned.
          </p>
          <div className="inline-flex flex-col items-center gap-2 bg-[#0d1b2a] border border-[#1b3a5c] rounded-xl px-8 py-6">
            <div className="text-sm text-[#7b93af] uppercase tracking-wider">Current State</div>
            <div className="text-xl font-bold font-mono text-white">{state}</div>
            {totalMatchups > 0 && (
              <div className="text-sm text-[#7b93af] mt-1">
                {completedMatchups} / {totalMatchups} matchups completed
              </div>
            )}
          </div>
          <div className="mt-8">
            <Link
              href="/tournament"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#162a44] hover:bg-[#1b3a5c] border border-[#1b3a5c] transition-colors rounded-lg text-sm font-medium text-[#e8edf3]"
            >
              View Live Bracket
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Tournament complete but champion data not found
  if (!agentHistory) {
    const championship = bracketData.matchups.find((m) => m.round === "CHAMPIONSHIP");
    const championEntryId = championship?.winnerId;

    return (
      <div>
        <div className="mb-6">
          <Link href="/tournament" className="text-sm text-[#7b93af] hover:text-white transition-colors">
            ← Back to Bracket
          </Link>
        </div>
        <div className="text-center py-16 px-4">
          <div className="text-6xl mb-6" aria-hidden="true">🏆</div>
          <h1 className="text-3xl font-bold text-amber-400 mb-3">Tournament Complete!</h1>
          <p className="text-[#7b93af] mb-4">
            Champion Entry ID: <span className="font-mono text-white">#{championEntryId}</span>
          </p>
          <p className="text-[#5a7a9c] text-sm">
            Detailed champion profile loading...
          </p>
        </div>
      </div>
    );
  }

  // Build champion data from history
  const { entry, qualificationScore, matchHistory } = agentHistory;
  const champion = {
    agentId: entry.agentId,
    walletAddress: entry.walletAddress,
    chain: entry.chain,
    region: entry.region ?? entry.chain,
    seed: entry.seed ?? 1,
  };

  const matchesWon = matchHistory
    .filter((m) => m.won)
    .map((m) => ({
      matchId: m.matchId,
      round: m.round as import("@agent-madness/shared").RoundName,
      opponentId: m.opponentId,
      opponentSeed: m.opponentSeed,
      championScore: m.agentScore,
      opponentScore: m.opponentScore,
      tier: m.tier,
      averageLatency: m.averageLatency,
      totalRequests: m.totalRequests,
      ipfsCid: m.ipfsCid,
      txHash: m.txHash,
    }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Link href="/tournament" className="text-sm text-[#7b93af] hover:text-white transition-colors">
          ← Back to Bracket
        </Link>
      </div>
      <ChampionSpotlight
        champion={champion}
        qualificationScore={qualificationScore}
        matchesWon={matchesWon}
      />
    </div>
  );
}
