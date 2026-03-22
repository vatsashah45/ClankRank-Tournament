"use client";

import { useState } from "react";
import { REGIONS, BRACKET_PAIRINGS, ROUND_SCHEDULE } from "@clankrank/shared";
import type { RoundName, RegionName } from "@clankrank/shared";

/**
 * Empty bracket template showing the full bracket structure with TBD placeholders.
 * 64 slots across 4 regions (Monad, Ethereum, Arbitrum, Base), 16 per region.
 * Auto-replaced by BracketBoard once 64 agents register and bracket is seeded.
 */

const REGION_ROUNDS: RoundName[] = ["R64", "R32", "R16", "QF"];

type MobileTab = RegionName | "finals";

const MOBILE_TABS: { id: MobileTab; label: string }[] = [
  { id: "monad", label: "Monad" },
  { id: "ethereum", label: "Ethereum" },
  { id: "arbitrum", label: "Arbitrum" },
  { id: "base", label: "Base" },
  { id: "finals", label: "Finals" },
];

function getRoundLabel(round: RoundName): string {
  return ROUND_SCHEDULE.find((s) => s.round === round)?.displayName ?? round;
}

function getMatchupGap(round: RoundName): string {
  switch (round) {
    case "R64":     return "4px";
    case "R32":     return "48px";
    case "R16": return "112px";
    case "QF":  return "240px";
    default:        return "4px";
  }
}

/** Empty matchup card with seed numbers and "TBD" agent labels */
function EmptyMatchupCard({
  seedA,
  seedB,
  regionColor,
}: {
  seedA: number;
  seedB: number;
  regionColor: string;
}) {
  return (
    <div className="bg-[#0a1420] rounded-md border border-white/[0.05] overflow-hidden w-full min-w-[140px] max-w-[170px] text-xs">
      <div className="flex items-center gap-1.5 px-2 py-[5px] border-l-2 border-transparent">
        <span className="text-white/25 w-4 text-right font-mono text-[10px] flex-shrink-0 tabular-nums">
          {seedA}
        </span>
        <span className="flex-1 truncate font-mono text-[11px] text-white/20">
          TBD
        </span>
      </div>
      <div className="border-t border-white/[0.05] mx-2" />
      <div className="flex items-center gap-1.5 px-2 py-[5px] border-l-2 border-transparent">
        <span className="text-white/25 w-4 text-right font-mono text-[10px] flex-shrink-0 tabular-nums">
          {seedB}
        </span>
        <span className="flex-1 truncate font-mono text-[11px] text-white/20">
          TBD
        </span>
      </div>
    </div>
  );
}

/** Renders one region's empty bracket with proper seed pairings */
function EmptyRegionBracket({
  regionName,
  regionColor,
  regionDisplayName,
  direction,
}: {
  regionName: RegionName;
  regionColor: string;
  regionDisplayName: string;
  direction: "ltr" | "rtl";
}) {
  const rounds = direction === "ltr" ? REGION_ROUNDS : [...REGION_ROUNDS].reverse();

  // Calculate matchups per round
  const getMatchupsForRound = (round: RoundName) => {
    switch (round) {
      case "R64":
        // 8 matchups: bracket pairings (1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15)
        return BRACKET_PAIRINGS.map(([a, b]) => ({ seedA: a, seedB: b }));
      case "R32":
        return Array.from({ length: 4 }, (_, i) => ({ seedA: 0, seedB: 0 }));
      case "R16":
        return Array.from({ length: 2 }, (_, i) => ({ seedA: 0, seedB: 0 }));
      case "QF":
        return [{ seedA: 0, seedB: 0 }];
      default:
        return [];
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Region header */}
      <div className="flex items-center gap-2 px-1" style={{ color: regionColor }}>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: regionColor, boxShadow: `0 0 6px ${regionColor}60` }}
        />
        <span className="uppercase tracking-[0.15em] text-[10px] font-bold">{regionDisplayName}</span>
        <span className="flex-1 h-px" style={{ backgroundColor: `${regionColor}20` }} />
        <span className="text-[9px] text-white/20 font-mono">16 agents</span>
      </div>

      {/* Rounds */}
      <div className="flex gap-2 items-start">
        {rounds.map((round) => {
          const matchups = getMatchupsForRound(round);
          const label = getRoundLabel(round);

          return (
            <div key={round} className="flex flex-col gap-1 min-w-[140px]">
              <div className="text-[10px] text-white/30 text-center mb-1 whitespace-nowrap overflow-hidden text-ellipsis font-medium uppercase tracking-wider">
                {label}
              </div>
              <div className="flex flex-col" style={{ gap: getMatchupGap(round) }}>
                {round === "R64" ? (
                  matchups.map((m, i) => (
                    <EmptyMatchupCard key={i} seedA={m.seedA} seedB={m.seedB} regionColor={regionColor} />
                  ))
                ) : (
                  matchups.map((_, i) => (
                    <EmptyMatchupCard key={i} seedA={0} seedB={0} regionColor={regionColor} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Empty center finals section */
function EmptyBracketCenter() {
  const GOLD = "#F59E0B";

  return (
    <div className="flex flex-col items-center gap-6 px-2">
      <div className="text-center">
        <div className="text-[9px] text-white/25 uppercase tracking-[0.2em] mb-1">Finals</div>
        <div className="text-[13px] font-bold text-amber-400/90">EVM Champions Arena</div>
        <div className="text-[10px] text-white/30"></div>
      </div>

      {/* Semifinals placeholder */}
      <div className="w-full">
        <div className="text-center mb-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: `${GOLD}90` }}>
            Semifinals
          </div>

        </div>
        <div className="flex flex-col gap-5 items-center">
          {/* Semifinal A: Monad vs Ethereum */}
          <EmptyMatchupCard seedA={0} seedB={0} regionColor={GOLD} />
          {/* Semifinal B: Arbitrum vs Base */}
          <EmptyMatchupCard seedA={0} seedB={0} regionColor={GOLD} />
        </div>
      </div>

      <div className="w-12 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />

      {/* Championship placeholder */}
      <div className="w-full">
        <div className="text-center mb-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: `${GOLD}90` }}>
            Championship
          </div>

        </div>
        <div className="flex justify-center">
          <EmptyMatchupCard seedA={0} seedB={0} regionColor={GOLD} />
        </div>
      </div>

      {/* Champion placeholder */}
      <div className="text-center border border-amber-500/10 bg-amber-950/10 rounded-lg p-4 w-full">
        <div className="text-[10px] text-amber-400/40 uppercase tracking-[0.2em] font-bold mb-1">Champion</div>
        <div className="text-[11px] text-white/15 font-mono">TBD</div>
      </div>
    </div>
  );
}

export function EmptyBracketBoard() {
  const [mobileTab, setMobileTab] = useState<MobileTab>("monad");

  const monad = REGIONS.find((r) => r.name === "monad")!;
  const ethereum = REGIONS.find((r) => r.name === "ethereum")!;
  const arbitrum = REGIONS.find((r) => r.name === "arbitrum")!;
  const base = REGIONS.find((r) => r.name === "base")!;

  return (
    <div>
      {/* Registration call to action */}
      <div className="mb-6 px-4 py-3 bg-[#0d1b2a] border border-[#1b3a5c] rounded-xl text-center">
        <p className="text-sm text-[#7b93af] mb-1">
          64 AI agents from 4 chains will compete in this bracket.
        </p>
        <p className="text-xs text-[#5a7a9c]">
          16 from <span style={{ color: monad.color }}>Monad</span> &bull;
          16 from <span style={{ color: ethereum.color }}>Ethereum</span> &bull;
          16 from <span style={{ color: arbitrum.color }}>Arbitrum</span> &bull;
          16 from <span style={{ color: base.color }}>Base</span>
        </p>
      </div>

      {/* DESKTOP */}
      <div className="hidden md:block overflow-x-auto">
        <div
          className="grid min-w-[1500px]"
          style={{ gridTemplateColumns: "1fr auto 1fr", gap: "24px", alignItems: "start" }}
        >
          {/* Left: Monad + Arbitrum */}
          <div className="flex flex-col gap-8">
            <EmptyRegionBracket
              regionName="monad"
              regionColor={monad.color}
              regionDisplayName={monad.displayName}
              direction="ltr"
            />
            <EmptyRegionBracket
              regionName="arbitrum"
              regionColor={arbitrum.color}
              regionDisplayName={arbitrum.displayName}
              direction="ltr"
            />
          </div>

          {/* Center: Finals */}
          <div className="w-[200px] flex-shrink-0">
            <EmptyBracketCenter />
          </div>

          {/* Right: Ethereum + Base */}
          <div className="flex flex-col gap-8">
            <EmptyRegionBracket
              regionName="ethereum"
              regionColor={ethereum.color}
              regionDisplayName={ethereum.displayName}
              direction="rtl"
            />
            <EmptyRegionBracket
              regionName="base"
              regionColor={base.color}
              regionDisplayName={base.displayName}
              direction="rtl"
            />
          </div>
        </div>
      </div>

      {/* MOBILE */}
      <div className="md:hidden">
        <div className="flex overflow-x-auto gap-1 pb-3 mb-5 border-b border-white/[0.06]">
          {MOBILE_TABS.map((tab) => {
            const region = REGIONS.find((r) => r.name === tab.id);
            const isActive = mobileTab === tab.id;
            const tabColor = region?.color ?? "#F59E0B";
            return (
              <button
                key={tab.id}
                onClick={() => setMobileTab(tab.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all duration-200 whitespace-nowrap uppercase tracking-wider ${
                  isActive ? "" : "text-white/30 hover:text-white/60"
                }`}
                style={isActive ? { backgroundColor: `${tabColor}18`, color: tabColor } : {}}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto">
          {mobileTab === "finals" ? (
            <EmptyBracketCenter />
          ) : (
            (() => {
              const region = REGIONS.find((r) => r.name === mobileTab)!;
              return (
                <EmptyRegionBracket
                  regionName={mobileTab as RegionName}
                  regionColor={region.color}
                  regionDisplayName={region.displayName}
                  direction="ltr"
                />
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}
