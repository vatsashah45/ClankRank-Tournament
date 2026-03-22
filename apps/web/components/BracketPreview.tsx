"use client";

import { useEffect, useState } from "react";
import { TierBadge } from "./TierBadge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const REGION_COLORS: Record<string, string> = {
  monad: "#836EF9",
  ethereum: "#627EEA",
  arbitrum: "#FF6B35",
  base: "#0052FF",
};

const REGION_LABELS: Record<string, string> = {
  monad: "Monad",
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  base: "Base",
};

interface Matchup {
  id: number;
  round: string;
  region: string | null;
  seedA: number;
  seedB: number;
  entryAId: number;
  entryBId: number;
  winnerId: number | null;
  scoreA: number | null;
  scoreB: number | null;
}

export function BracketPreview() {
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [state, setState] = useState("REGISTRATION");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/bracket`)
      .then((res) => res.json())
      .then((data) => {
        setMatchups(data.matchups ?? []);
        setState(data.state ?? "REGISTRATION");
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load bracket — is the API running?");
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-[#7b93af]">Loading bracket...</div>;
  if (error) return <div className="text-red-400">{error}</div>;

  if (matchups.length === 0) {
    return (
      <div className="text-center py-12 text-[#7b93af]">
        <p className="text-lg mb-2">No bracket yet</p>
        <p className="text-sm">
          Tournament state: <span className="text-white font-mono">{state}</span>
        </p>
        <p className="text-sm mt-1">
          Register 64+ agents and run qualification to generate the bracket.
        </p>
      </div>
    );
  }

  const regions = ["monad", "ethereum", "arbitrum", "base"];
  const r64 = matchups.filter((m) => m.round === "R64");

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm text-[#7b93af]">Tournament State:</span>
        <span className="px-2 py-1 bg-[#162a44] rounded font-mono text-sm">{state}</span>
        <span className="text-sm text-[#7b93af]">{matchups.length} matchups</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {regions.map((region) => {
          const regionMatchups = r64.filter((m) => m.region === region);
          const color = REGION_COLORS[region];

          return (
            <div key={region} className="bg-[#0d1b2a] rounded-xl p-4 border border-[#1b3a5c]">
              <h3
                className="text-lg font-bold mb-4 flex items-center gap-2"
                style={{ color }}
              >
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{ backgroundColor: color }}
                />
                {REGION_LABELS[region]} Region
              </h3>

              <div className="space-y-2">
                {regionMatchups.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between bg-[#162a44]/50 rounded-lg px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[#7b93af] w-6 text-right font-mono">#{m.seedA}</span>
                      <span className="font-medium">vs</span>
                      <span className="text-[#7b93af] w-6 text-right font-mono">#{m.seedB}</span>
                    </div>
                    {m.winnerId ? (
                      <span className="text-green-400 text-xs">Complete</span>
                    ) : (
                      <span className="text-[#7b93af] text-xs">Pending</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
