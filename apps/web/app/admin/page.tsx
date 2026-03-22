"use client";

import { useState, useEffect, useCallback } from "react";
import type { TournamentState } from "@clankrank/shared";
import { ScheduleTimeline } from "@/components/admin/ScheduleTimeline";
import { ActionPanel } from "@/components/admin/ActionPanel";
import { adminGet } from "@/lib/api";

interface OverviewStats {
  total: number;
  registered: number;
  qualified: number;
  eliminated: number;
  active: number;
  champion?: number;
}

interface RoundStatus {
  round: string;
  completed: number;
  total: number;
  pending: number;
}

interface OverviewResponse {
  state: TournamentState;
  currentRound: string | null;
  entries: OverviewStats;
  roundStatus?: RoundStatus;
  schedule?: Record<string, string>;
}

const ROUND_DISPLAY: Record<string, string> = {
  R64: "First Round",
  R32: "Second Round",
  R16: "Top 16",
  QF: "Top 8",
  SF: "Semifinals",
  CHAMPIONSHIP: "Championship",
};

const NEXT_STEP: Record<string, string> = {
  REGISTRATION: "Run qualifications, then advance to Qualification phase.",
  QUALIFICATION: "Seed agents & generate the bracket, then advance to R64.",
  R64: "Run all First Round matchups → Generate Next Round → Advance to R32.",
  R32: "Run all Second Round matchups → Generate Next Round → Advance to Top 16.",
  R16: "Run all Top 16 matchups → Generate Next Round → Advance to Top 8.",
  QF: "Run all Top 8 matchups → Generate Next Round → Advance to Semifinals.",
  SF: "Run all Semifinal matchups → Generate Next Round → Advance to Championship.",
  CHAMPIONSHIP: "Run the Championship matchup → Advance to Complete.",
  COMPLETE: "Tournament is complete. No further actions needed.",
};

const STATE_BADGE: Record<string, string> = {
  REGISTRATION: "bg-blue-600 text-white",
  QUALIFICATION: "bg-yellow-500 text-gray-900",
  COMPLETE: "bg-amber-500 text-gray-900",
};

function getStateBadgeClass(state: string): string {
  return STATE_BADGE[state] ?? "bg-green-600 text-white";
}

interface StatCardProps {
  label: string;
  value: number | string;
  color?: string;
}

function StatCard({ label, value, color = "text-white" }: StatCardProps) {
  return (
    <div className="rounded-xl border border-[#1b3a5c] bg-[#0d1b2a] p-4">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-[#7b93af] uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await adminGet<OverviewResponse>("/admin/overview");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const isRoundState = data?.state && ["R64", "R32", "R16", "QF", "SF", "CHAMPIONSHIP"].includes(data.state);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-sm text-[#7b93af] mt-1">Tournament overview and controls</p>
      </div>

      {loading && (
        <div className="text-[#7b93af] text-sm">Loading overview…</div>
      )}

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-900/30 p-4 text-red-400 text-sm">
          Error: {error}
          <button
            onClick={fetchOverview}
            className="ml-3 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Status card */}
          <div className="rounded-xl border border-[#1b3a5c] bg-[#0d1b2a] p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide ${getStateBadgeClass(data.state)}`}
                  >
                    {data.state.replace("_", " ")}
                  </span>
                  {isRoundState && (
                    <span className="text-[#e8edf3] text-sm font-semibold">
                      {ROUND_DISPLAY[data.state] ?? data.state}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#5a7a9c] mt-2 leading-relaxed">
                  {NEXT_STEP[data.state] ?? "See actions below."}
                </p>
              </div>

              {isRoundState && data.roundStatus && data.roundStatus.total > 0 && (
                <div className="text-right flex-shrink-0">
                  <div className="text-2xl font-bold tabular-nums text-white">
                    {data.roundStatus.completed}
                    <span className="text-[#5a7a9c] text-base font-normal">
                      /{data.roundStatus.total}
                    </span>
                  </div>
                  <div className="text-xs text-[#7b93af]">matchups done</div>
                </div>
              )}
            </div>

            {isRoundState && data.roundStatus && data.roundStatus.total > 0 && (
              <div className="mt-4">
                <div className="w-full bg-[#162a44] rounded-full h-2">
                  <div
                    className="bg-[#3b82f6] h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.round(
                        (data.roundStatus.completed / data.roundStatus.total) * 100
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-[#5a7a9c] mt-1">
                  <span>{data.roundStatus.pending} remaining</span>
                  <span>
                    {Math.round(
                      (data.roundStatus.completed / data.roundStatus.total) * 100
                    )}% complete
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Entries" value={data.entries.total} />
            <StatCard
              label="Registered"
              value={data.entries.registered}
              color="text-blue-400"
            />
            <StatCard
              label="Qualified"
              value={data.entries.qualified}
              color="text-green-400"
            />
            <StatCard
              label="Active"
              value={data.entries.active}
              color="text-yellow-400"
            />
          </div>

          {/* Schedule timeline */}
          <ScheduleTimeline currentState={data.state} />

          {/* Quick actions */}
          <ActionPanel
            state={data.state}
            currentRound={isRoundState ? data.state : undefined}
            onActionComplete={fetchOverview}
          />
        </>
      )}
    </div>
  );
}
