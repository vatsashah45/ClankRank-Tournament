"use client";

import { useState, useMemo } from "react";
import type { BracketMatchup, TournamentState } from "@agent-madness/shared";
import { REGIONS } from "@agent-madness/shared";
import { RegionBracket } from "./RegionBracket";
import { BracketCenter } from "./BracketCenter";

interface EntryMap {
  [entryId: number]: {
    agentId: string;
    tier?: string;
  };
}

interface BracketBoardProps {
  matchups: BracketMatchup[];
  state: TournamentState;
}

type MobileTab = "monad" | "ethereum" | "arbitrum" | "base" | "finals";

const MOBILE_TABS: { id: MobileTab; label: string }[] = [
  { id: "monad", label: "Monad" },
  { id: "ethereum", label: "Ethereum" },
  { id: "arbitrum", label: "Arbitrum" },
  { id: "base", label: "Base" },
  { id: "finals", label: "Finals" },
];

/**
 * Main bracket display:
 *
 * DESKTOP (≥768px): 3-column CSS grid
 *   Left: Monad (top) + Arbitrum (bottom) — rounds flow L→R (R64 at outer edge)
 *   Center: Semifinals + Championship
 *   Right: Ethereum (top) + Base (bottom) — rounds flow R→L (R64 at outer edge)
 *
 * MOBILE (<768px): Tabs for region selection (US-BRK-6)
 *   Each tab shows that region's bracket vertically
 *   Finals tab shows BracketCenter
 */
export function BracketBoard({ matchups, state }: BracketBoardProps) {
  const [mobileTab, setMobileTab] = useState<MobileTab>("monad");

  // Build entry map from matchups — extracts entry IDs and resolves agent IDs
  // In production, entryAId/entryBId map to entries with agentId. We build
  // the best map we can from matchup data. The AgentDetailPanel fetches richer data.
  const entryMap = useMemo<EntryMap>(() => {
    const map: EntryMap = {};
    for (const m of matchups) {
      // We only have entryId — the actual agentId comes from API
      // We track entries we've seen with placeholder IDs
      if (!map[m.entryAId]) {
        map[m.entryAId] = { agentId: `entry-${m.entryAId}` };
      }
      if (!map[m.entryBId]) {
        map[m.entryBId] = { agentId: `entry-${m.entryBId}` };
      }
    }
    return map;
  }, [matchups]);

  // Regions by position
  const monad = REGIONS.find((r) => r.name === "monad")!;
  const ethereum = REGIONS.find((r) => r.name === "ethereum")!;
  const arbitrum = REGIONS.find((r) => r.name === "arbitrum")!;
  const base = REGIONS.find((r) => r.name === "base")!;

  const getRegionMatchups = (region: string) =>
    matchups.filter((m) => m.region === region);

  const allMatchups = matchups;

  return (
    <div>
      {/* ── DESKTOP LAYOUT ── */}
      <div className="hidden md:block overflow-x-auto">
        <div
          className="grid min-w-[1500px]"
          style={{ gridTemplateColumns: "1fr auto 1fr", gap: "24px", alignItems: "start" }}
        >
          {/* Left column: Monad (top) + Arbitrum (bottom) */}
          <div className="flex flex-col gap-8">
            {/* Monad — ltr: R64 at left, ELITE8 at right (toward center) */}
            <RegionBracket
              region="monad"
              regionColor={monad.color}
              regionDisplayName={monad.displayName}
              matchups={getRegionMatchups("monad")}
              entryMap={entryMap}
              direction="ltr"
            />
            {/* Arbitrum — ltr */}
            <RegionBracket
              region="arbitrum"
              regionColor={arbitrum.color}
              regionDisplayName={arbitrum.displayName}
              matchups={getRegionMatchups("arbitrum")}
              entryMap={entryMap}
              direction="ltr"
            />
          </div>

          {/* Center: Finals */}
          <div className="w-[200px] flex-shrink-0">
            <BracketCenter matchups={allMatchups} entryMap={entryMap} />
          </div>

          {/* Right column: Ethereum (top) + Base (bottom) */}
          <div className="flex flex-col gap-8">
            {/* Ethereum — rtl: ELITE8 at left, R64 at right (toward center) */}
            <RegionBracket
              region="ethereum"
              regionColor={ethereum.color}
              regionDisplayName={ethereum.displayName}
              matchups={getRegionMatchups("ethereum")}
              entryMap={entryMap}
              direction="rtl"
            />
            {/* Base — rtl */}
            <RegionBracket
              region="base"
              regionColor={base.color}
              regionDisplayName={base.displayName}
              matchups={getRegionMatchups("base")}
              entryMap={entryMap}
              direction="rtl"
            />
          </div>
        </div>
      </div>

      {/* ── MOBILE LAYOUT (US-BRK-6) ── */}
      <div className="md:hidden">
        {/* Region tabs */}
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

        {/* Tab content */}
        <div className="overflow-x-auto">
          {mobileTab === "finals" ? (
            <BracketCenter matchups={allMatchups} entryMap={entryMap} />
          ) : (
            (() => {
              const region = REGIONS.find((r) => r.name === mobileTab)!;
              return (
                <RegionBracket
                  region={mobileTab as "monad" | "ethereum" | "arbitrum" | "base"}
                  regionColor={region.color}
                  regionDisplayName={region.displayName}
                  matchups={getRegionMatchups(mobileTab)}
                  entryMap={entryMap}
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
