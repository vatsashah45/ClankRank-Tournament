"use client";

import { useState } from "react";
import type { TournamentState } from "@clankrank/shared";
import { adminPost } from "@/lib/api";

interface ActionPanelProps {
  state: TournamentState;
  currentRound?: string;
  onActionComplete?: () => void;
}

interface ActionResult {
  success: boolean;
  message: string;
}

export function ActionPanel({ state, currentRound, onActionComplete }: ActionPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = async (label: string, fn: () => Promise<string>) => {
    setLoading(label);
    setResult(null);
    try {
      const msg = await fn();
      setResult({ success: true, message: msg });
      onActionComplete?.();
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : "Action failed",
      });
    } finally {
      setLoading(null);
    }
  };

  const runAllQualifications = () =>
    run("Run All Qualifications", async () => {
      const data = await adminPost<{ qualified: number; failed: number }>(
        "/admin/qualification/run-all",
        {}
      );
      return `Qualified: ${data.qualified}, Failed: ${data.failed}`;
    });

  const seedAndBracket = () =>
    run("Seed & Generate Bracket", async () => {
      const data = await adminPost<{ seededAgents: unknown[]; matchups: unknown[] }>(
        "/admin/seed-and-bracket",
        {}
      );
      return `Seeded ${Array.isArray(data.seededAgents) ? data.seededAgents.length : 0} agents, created ${Array.isArray(data.matchups) ? data.matchups.length : 0} matchups`;
    });

  const runAllRound = () =>
    run(`Run All ${currentRound ?? "Round"}`, async () => {
      const data = await adminPost<{
        results: unknown[];
        roundComplete: boolean;
      }>(`/admin/round/${currentRound}/run-all`, {});
      return `${Array.isArray(data.results) ? data.results.length : 0} matchups run. Round complete: ${data.roundComplete}`;
    });

  const generateNextRound = () =>
    run("Generate Next Round", async () => {
      const data = await adminPost<{
        completedRound: string;
        nextRoundMatchups: number;
      }>(`/admin/round/${currentRound}/generate-next`, {});
      return `Generated ${data.nextRoundMatchups} matchups from ${data.completedRound}`;
    });

  const advanceState = () =>
    run("Advance State", async () => {
      const data = await adminPost<{ previousState: string; newState: string }>(
        "/admin/state/advance",
        {}
      );
      return `Advanced: ${data.previousState} → ${data.newState}`;
    });

  const actions: Array<{
    label: string;
    onClick: () => void;
    variant: "primary" | "secondary" | "danger";
  }> = [];

  if (state === "REGISTRATION") {
    actions.push({ label: "Run All Qualifications", onClick: runAllQualifications, variant: "primary" });
    actions.push({ label: "Advance to Qualification", onClick: advanceState, variant: "secondary" });
  } else if (state === "QUALIFICATION") {
    actions.push({ label: "Seed & Generate Bracket", onClick: seedAndBracket, variant: "primary" });
    actions.push({ label: "Advance to R64", onClick: advanceState, variant: "secondary" });
  } else if (currentRound && ["R64", "R32", "R16", "QF", "SF", "CHAMPIONSHIP"].includes(state)) {
    actions.push({ label: `Run All ${currentRound}`, onClick: runAllRound, variant: "primary" });
    if (state !== "CHAMPIONSHIP") {
      actions.push({ label: "Generate Next Round", onClick: generateNextRound, variant: "secondary" });
    }
    actions.push({ label: "Advance", onClick: advanceState, variant: "secondary" });
  }

  if (actions.length === 0) return null;

  const btnClass = (variant: "primary" | "secondary" | "danger") => {
    if (variant === "primary") return "bg-[#3b82f6] hover:bg-[#2563eb] text-white";
    if (variant === "secondary") return "bg-[#162a44] hover:bg-[#1b3a5c] text-white border border-[#1b3a5c]";
    return "bg-red-600 hover:bg-red-500 text-white";
  };

  return (
    <div className="rounded-xl border border-[#1b3a5c] bg-[#0d1b2a] p-4">
      <h3 className="text-sm font-semibold text-white uppercase tracking-widest mb-3">
        Quick Actions
      </h3>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            disabled={loading !== null}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${btnClass(action.variant)}`}
          >
            {loading === action.label ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                {action.label}…
              </span>
            ) : (
              action.label
            )}
          </button>
        ))}
      </div>

      {result && (
        <div
          className={`mt-3 px-3 py-2 rounded-lg text-sm ${
            result.success
              ? "bg-green-900/50 text-green-300 border border-green-800"
              : "bg-red-900/50 text-red-300 border border-red-800"
          }`}
        >
          {result.success ? "✓ " : "✗ "}
          {result.message}
        </div>
      )}
    </div>
  );
}
