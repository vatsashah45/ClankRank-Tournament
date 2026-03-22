"use client";

import type { BracketMatchup } from "@agent-madness/shared";
import { TierBadge } from "@/components/TierBadge";
import { LiveIndicator } from "./LiveIndicator";

interface MatchupCardProps {
  matchup: BracketMatchup;
  regionColor: string;
  agentAId?: string;
  agentBId?: string;
  agentATier?: string;
  agentBTier?: string;
  onClick?: (agentId: string) => void;
}

function truncateAgentId(id: string): string {
  if (!id) return "\u2014";
  if (id.length <= 12) return id;
  return `${id.slice(0, 4)}\u2026${id.slice(-4)}`;
}

export function MatchupCard({
  matchup,
  regionColor,
  agentAId,
  agentBId,
  agentATier,
  agentBTier,
  onClick,
}: MatchupCardProps) {
  const isLive = matchup.startedAt !== null && matchup.completedAt === null;
  const isCompleted = matchup.completedAt !== null;

  const aIsWinner = isCompleted && matchup.winnerId === matchup.entryAId;
  const bIsWinner = isCompleted && matchup.winnerId === matchup.entryBId;

  const hasSeedA = matchup.seedA > 0;
  const hasSeedB = matchup.seedB > 0;
  const hasBothAgents = hasSeedA && hasSeedB;

  const cardClasses = isLive
    ? "border animate-live-border"
    : isCompleted
    ? "border border-white/[0.08]"
    : "border border-white/[0.05]";

  function AgentRow({
    seed,
    hasSeed,
    agentId,
    tier,
    score,
    isWinner,
    isLoser,
  }: {
    seed: number;
    hasSeed: boolean;
    agentId?: string;
    tier?: string;
    score: number | null;
    isWinner: boolean;
    isLoser: boolean;
  }) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-[5px] cursor-pointer transition-all duration-200 border-l-2 ${
          isWinner ? "" : "border-transparent"
        } ${isLoser ? "opacity-25" : ""} ${!isWinner && !isLoser ? "hover:bg-white/[0.03]" : ""}`}
        style={isWinner ? {
          borderLeftColor: regionColor,
          backgroundColor: `${regionColor}12`,
        } : {}}
        onClick={() => agentId && onClick?.(agentId)}
        title={agentId}
      >
        <span className="text-white/25 w-4 text-right font-mono text-[10px] flex-shrink-0 tabular-nums">
          {hasSeed ? seed : "?"}
        </span>
        <span className={`flex-1 truncate font-mono text-[11px] ${
          isWinner ? "text-white font-semibold" : isLoser ? "text-white/40" : "text-white/70"
        }`}>
          {agentId ? truncateAgentId(agentId) : `#${seed}`}
        </span>
        {tier && (
          <span className="flex-shrink-0">
            <TierBadge tier={tier} size="sm" />
          </span>
        )}
        {isCompleted && score !== null && (
          <span className={`flex-shrink-0 font-mono font-semibold tabular-nums text-[11px] ${
            isWinner ? "text-white" : "text-white/30"
          }`}>
            {Math.round(score)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-[#0a1420] rounded-md ${cardClasses} overflow-hidden w-full min-w-[140px] max-w-[170px] text-xs`}>
      {isLive && (
        <div className="px-2 py-[3px] bg-green-950/60 border-b border-green-900/40 flex items-center">
          <LiveIndicator />
        </div>
      )}

      <AgentRow
        seed={matchup.seedA}
        hasSeed={hasSeedA}
        agentId={agentAId}
        tier={agentATier}
        score={matchup.scoreA}
        isWinner={aIsWinner}
        isLoser={bIsWinner}
      />

      <div className="border-t border-white/[0.05] mx-2" />

      <AgentRow
        seed={matchup.seedB}
        hasSeed={hasSeedB}
        agentId={agentBId}
        tier={agentBTier}
        score={matchup.scoreB}
        isWinner={bIsWinner}
        isLoser={aIsWinner}
      />
    </div>
  );
}
