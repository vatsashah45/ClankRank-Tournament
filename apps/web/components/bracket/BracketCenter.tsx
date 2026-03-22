"use client";

import { useRouter } from "next/navigation";
import type { BracketMatchup } from "@agent-madness/shared";
import { CHAMPIONSHIP_VENUE, getRoundSchedule } from "@agent-madness/shared";
import { MatchupCard } from "./MatchupCard";
import { TierBadge } from "@/components/TierBadge";

interface EntryMap {
  [entryId: number]: {
    agentId: string;
    tier?: string;
  };
}

interface BracketCenterProps {
  matchups: BracketMatchup[];
  entryMap: EntryMap;
}

const GOLD = "#F59E0B";

export function BracketCenter({ matchups, entryMap }: BracketCenterProps) {
  const router = useRouter();

  const final4Matchups = matchups.filter((m) => m.round === "FINAL4").sort((a, b) => a.id - b.id);
  const championship = matchups.find((m) => m.round === "CHAMPIONSHIP");

  const final4Schedule = getRoundSchedule("FINAL4");
  const champSchedule = getRoundSchedule("CHAMPIONSHIP");

  const handleAgentClick = (agentId: string) => {
    router.push(`/tournament/agent/${encodeURIComponent(agentId)}`);
  };

  return (
    <div className="flex flex-col items-center gap-6 px-2">
      {/* Venue header */}
      <div className="text-center">
        <div className="text-[9px] text-white/25 uppercase tracking-[0.2em] mb-1">Finals</div>
        <div className="text-[13px] font-bold text-amber-400/90">
          {CHAMPIONSHIP_VENUE.name}
        </div>
        <div className="text-[10px] text-white/30">
          {CHAMPIONSHIP_VENUE.city}, {CHAMPIONSHIP_VENUE.state}
        </div>
      </div>

      {/* Semifinals */}
      <div className="w-full">
        <div className="text-center mb-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: `${GOLD}90` }}>
            {final4Schedule?.displayName ?? "Semifinals"}
          </div>

        </div>

        <div className="flex flex-col gap-5 items-center">
          {final4Matchups.length > 0 ? (
            final4Matchups.map((matchup) => {
              const entryA = entryMap[matchup.entryAId];
              const entryB = entryMap[matchup.entryBId];
              return (
                <MatchupCard
                  key={matchup.id}
                  matchup={matchup}
                  regionColor={GOLD}
                  agentAId={entryA?.agentId}
                  agentBId={entryB?.agentId}
                  agentATier={entryA?.tier}
                  agentBTier={entryB?.tier}
                  onClick={handleAgentClick}
                />
              );
            })
          ) : (
            <div className="text-[10px] text-white/10 text-center py-3">TBD</div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="w-12 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />

      {/* Championship */}
      <div className="w-full">
        <div className="text-center mb-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: `${GOLD}90` }}>
            {champSchedule?.displayName ?? "Championship"}
          </div>

        </div>

        {championship ? (
          <div className="flex justify-center">
            <MatchupCard
              matchup={championship}
              regionColor={GOLD}
              agentAId={entryMap[championship.entryAId]?.agentId}
              agentBId={entryMap[championship.entryBId]?.agentId}
              agentATier={entryMap[championship.entryAId]?.tier}
              agentBTier={entryMap[championship.entryBId]?.tier}
              onClick={handleAgentClick}
            />
          </div>
        ) : (
          <div className="text-[10px] text-white/10 text-center py-3">TBD</div>
        )}
      </div>

      {/* Champion display */}
      {championship?.completedAt && championship.winnerId && (
        <div className="text-center border border-amber-500/15 bg-amber-950/20 rounded-lg p-4 w-full animate-champion-glow">
          <div className="text-[10px] text-amber-400/80 uppercase tracking-[0.2em] font-bold mb-2">
            Champion
          </div>
          {(() => {
            const winner = championship.winnerId === championship.entryAId
              ? entryMap[championship.entryAId]
              : entryMap[championship.entryBId];
            const score = championship.winnerId === championship.entryAId
              ? championship.scoreA
              : championship.scoreB;
            return (
              <div>
                <div
                  className="font-mono text-sm font-semibold text-amber-300 cursor-pointer hover:text-amber-200 transition-colors"
                  onClick={() => winner?.agentId && handleAgentClick(winner.agentId)}
                  title={winner?.agentId}
                >
                  {winner?.agentId
                    ? winner.agentId.length > 16
                      ? `${winner.agentId.slice(0, 6)}\u2026${winner.agentId.slice(-6)}`
                      : winner.agentId
                    : `Entry ${championship.winnerId}`}
                </div>
                <div className="flex items-center justify-center gap-2 mt-2">
                  {winner?.tier && <TierBadge tier={winner.tier} />}
                  {score !== null && (
                    <span className="text-[11px] text-white/40">
                      <span className="text-white font-mono font-semibold">{Math.round(score)}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
