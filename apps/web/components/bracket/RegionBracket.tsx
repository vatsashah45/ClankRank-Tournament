"use client";

import { useRouter } from "next/navigation";
import type { BracketMatchup, RegionName } from "@clankrank/shared";
import { ROUND_SCHEDULE } from "@clankrank/shared";
import type { RoundName } from "@clankrank/shared";
import { MatchupCard } from "./MatchupCard";

interface EntryMap {
  [entryId: number]: {
    agentId: string;
    tier?: string;
  };
}

interface RegionBracketProps {
  region: RegionName;
  regionColor: string;
  regionDisplayName: string;
  matchups: BracketMatchup[];
  entryMap: EntryMap;
  /** "ltr" = left-side regions (Monad, Arbitrum): rounds flow left→right (R64 on left)
   *  "rtl" = right-side regions (Ethereum, Base): rounds flow right→left (R64 on right)
   */
  direction: "ltr" | "rtl";
}

const REGION_ROUNDS: RoundName[] = ["R64", "R32", "R16", "QF"];

function getRoundLabel(round: RoundName): string {
  return ROUND_SCHEDULE.find((s) => s.round === round)?.displayName ?? round;
}

/**
 * Renders one region's bracket rounds (R64 → QF) as columns.
 * ltr: R64 leftmost, QF rightmost (flows toward center)
 * rtl: R64 rightmost, QF leftmost (flows toward center)
 */
export function RegionBracket({
  region,
  regionColor,
  regionDisplayName,
  matchups,
  entryMap,
  direction,
}: RegionBracketProps) {
  const router = useRouter();

  const handleAgentClick = (agentId: string) => {
    router.push(`/tournament/agent/${encodeURIComponent(agentId)}`);
  };

  // Get matchups per round for this region
  const roundMatchups = (round: RoundName) =>
    matchups
      .filter((m) => m.round === round && m.region === region)
      .sort((a, b) => a.id - b.id);

  // Rounds to display: R64 | R32 | R16 | QF
  const rounds = direction === "ltr" ? REGION_ROUNDS : [...REGION_ROUNDS].reverse();

  return (
    <div className="flex flex-col gap-3">
      {/* Region header */}
      <div
        className="flex items-center gap-2 px-1"
        style={{ color: regionColor }}
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 animate-region-glow"
          style={{ backgroundColor: regionColor, boxShadow: `0 0 6px ${regionColor}60` }}
        />
        <span className="uppercase tracking-[0.15em] text-[10px] font-bold">{regionDisplayName}</span>
        <span className="flex-1 h-px" style={{ backgroundColor: `${regionColor}20` }} />
      </div>

      {/* Rounds */}
      <div className="flex gap-2 items-start">
        {rounds.map((round) => {
          const rMatchups = roundMatchups(round);
          const label = getRoundLabel(round);

          return (
            <div key={round} className="flex flex-col gap-1 min-w-[140px]">
              {/* Round label */}
              <div className="text-[10px] text-white/30 text-center mb-1 whitespace-nowrap overflow-hidden text-ellipsis font-medium uppercase tracking-wider">
                {label}
              </div>

              {/* Matchup cards with spacing to align bracket positions */}
              <div
                className="flex flex-col"
                style={{
                  gap: getMatchupGap(round),
                }}
              >
                {rMatchups.length > 0 ? (
                  rMatchups.map((matchup) => {
                    const entryA = entryMap[matchup.entryAId];
                    const entryB = entryMap[matchup.entryBId];
                    return (
                      <div key={matchup.id} className="flex flex-col">
                        <MatchupCard
                          matchup={matchup}
                          regionColor={regionColor}
                          agentAId={entryA?.agentId}
                          agentBId={entryB?.agentId}
                          agentATier={entryA?.tier}
                          agentBTier={entryB?.tier}
                          onClick={handleAgentClick}
                        />
                      </div>
                    );
                  })
                ) : (
                  // Empty round placeholder
                  <div className="text-[10px] text-white/10 text-center py-4">
                    TBD
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Returns gap between matchup cards based on round (later rounds have more spacing) */
function getMatchupGap(round: RoundName): string {
  switch (round) {
    case "R64":    return "4px";
    case "R32":    return "48px";
    case "R16": return "112px";
    case "QF": return "240px";
    default:       return "4px";
  }
}
