"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type { BracketMatchup } from "@agent-madness/shared";
import { MatchupInspector } from "@/components/admin/MatchupInspector";
import { apiGet, getEntries } from "@/lib/api";

interface BracketResponse {
  matchups: BracketMatchup[];
  count: number;
}

interface EntryInfo {
  id: number;
  agentId: string;
  chain: string;
  tier?: string;
}

export default function MatchupInspectorPage() {
  const params = useParams();
  const router = useRouter();
  const matchupId = params?.id as string;

  const [matchup, setMatchup] = useState<BracketMatchup | null>(null);
  const [agentA, setAgentA] = useState<EntryInfo | undefined>(undefined);
  const [agentB, setAgentB] = useState<EntryInfo | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!matchupId) return;
    try {
      setLoading(true);
      setError(null);

      const [bracketData, entries] = await Promise.all([
        apiGet<BracketResponse>("/bracket"),
        getEntries(),
      ]);

      const id = parseInt(matchupId, 10);
      const found = (bracketData.matchups ?? []).find((m) => m.id === id);

      if (!found) {
        setError(`Matchup #${matchupId} not found`);
        setLoading(false);
        return;
      }

      setMatchup(found);
      const entryA = entries.find((e) => e.id === found.entryAId);
      const entryB = entries.find((e) => e.id === found.entryBId);

      if (entryA) {
        setAgentA({ id: entryA.id, agentId: entryA.agentId, chain: entryA.chain, tier: entryA.tier });
      }
      if (entryB) {
        setAgentB({ id: entryB.id, agentId: entryB.agentId, chain: entryB.chain, tier: entryB.tier });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load matchup");
    } finally {
      setLoading(false);
    }
  }, [matchupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 text-sm">
        <button
          onClick={() => router.push("/admin/bracket")}
          className="text-[#7b93af] hover:text-white transition-colors"
        >
          ← Bracket
        </button>
        {matchup && (
          <>
            <span className="text-gray-700">/</span>
            <button
              onClick={() => router.push(`/admin/round/${matchup.round}`)}
              className="text-[#7b93af] hover:text-white transition-colors"
            >
              {matchup.round}
            </button>
          </>
        )}
        <span className="text-gray-700">/</span>
        <span className="text-white">Matchup #{matchupId}</span>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Matchup Inspector</h1>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-3 py-1.5 bg-[#1b3a5c] hover:bg-gray-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {loading && (
        <div className="text-[#7b93af] text-sm">Loading matchup data…</div>
      )}

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-900/30 p-4 text-red-400 text-sm">
          Error: {error}
          <button onClick={fetchData} className="ml-3 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && matchup && (
        <MatchupInspector
          matchup={matchup}
          agentA={agentA}
          agentB={agentB}
          onReplay={fetchData}
        />
      )}
    </div>
  );
}
