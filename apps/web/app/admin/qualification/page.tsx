"use client";

import { useState } from "react";
import { adminPost } from "@/lib/api";

interface QualRunResult {
  agentId?: string;
  score?: number;
  tier?: string;
  error?: string;
}

interface RunAllResponse {
  qualified: number;
  failed: number;
  results: QualRunResult[];
}

interface SeedResult {
  entryId: number;
  agentId: string;
  region: string;
  seed: number;
  score: number;
}

interface SeedAndBracketResponse {
  seededAgents: SeedResult[];
  matchups: { id: number }[];
}

type StepState = "idle" | "loading" | "success" | "error";

export default function QualificationPage() {
  const [runAllState, setRunAllState] = useState<StepState>("idle");
  const [runAllData, setRunAllData] = useState<RunAllResponse | null>(null);
  const [runAllError, setRunAllError] = useState<string | null>(null);

  const [seedState, setSeedState] = useState<StepState>("idle");
  const [seedData, setSeedData] = useState<SeedAndBracketResponse | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  const handleRunAll = async () => {
    setRunAllState("loading");
    setRunAllError(null);
    setRunAllData(null);
    try {
      const data = await adminPost<RunAllResponse>("/admin/qualification/run-all", {});
      setRunAllData(data);
      setRunAllState("success");
    } catch (err) {
      setRunAllError(err instanceof Error ? err.message : "Run all qualifications failed");
      setRunAllState("error");
    }
  };

  const handleSeedAndBracket = async () => {
    setSeedState("loading");
    setSeedError(null);
    setSeedData(null);
    try {
      const data = await adminPost<SeedAndBracketResponse>("/admin/seed-and-bracket", {});
      setSeedData(data);
      setSeedState("success");
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : "Seed and bracket failed");
      setSeedState("error");
    }
  };

  const REGION_COLORS: Record<string, string> = {
    monad: "#836EF9",
    ethereum: "#627EEA",
    arbitrum: "#FF6B35",
    base: "#0052FF",
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Qualification</h1>
        <p className="text-sm text-[#7b93af] mt-1">
          Run qualification scoring and generate the tournament bracket
        </p>
      </div>

      {/* Step 1: Run All Qualifications */}
      <div className="rounded-xl border border-[#1b3a5c] bg-[#0d1b2a] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white">Step 1: Run All Qualifications</h2>
            <p className="text-sm text-[#7b93af] mt-1">
              Runs trust scoring against every registered agent. Marks each as qualified or failed.
            </p>
          </div>
          <button
            onClick={handleRunAll}
            disabled={runAllState === "loading"}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors flex-shrink-0"
          >
            {runAllState === "loading" ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                Running…
              </span>
            ) : (
              "▶ Run All Qualifications"
            )}
          </button>
        </div>

        {/* Run all result */}
        {runAllState === "success" && runAllData && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-4">
              <div className="rounded-lg bg-green-900/40 border border-green-800 px-4 py-2 text-center">
                <div className="text-xl font-bold text-green-400">{runAllData.qualified}</div>
                <div className="text-xs text-green-600 uppercase tracking-wide">Qualified</div>
              </div>
              <div className="rounded-lg bg-red-900/40 border border-red-800 px-4 py-2 text-center">
                <div className="text-xl font-bold text-red-400">{runAllData.failed}</div>
                <div className="text-xs text-red-600 uppercase tracking-wide">Failed</div>
              </div>
            </div>

            {Array.isArray(runAllData.results) && runAllData.results.length > 0 && (
              <div className="mt-3">
                <h4 className="text-xs font-semibold text-[#7b93af] uppercase tracking-widest mb-2">
                  Results
                </h4>
                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {runAllData.results.map((r, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between text-xs px-3 py-1.5 rounded-lg ${
                        r.error
                          ? "bg-red-900/30 border border-red-900"
                          : "bg-[#162a44]"
                      }`}
                    >
                      <span className="font-mono text-gray-300 truncate mr-2">
                        {r.agentId ?? `Result #${i + 1}`}
                      </span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        {r.score !== undefined && (
                          <span className="text-[#7b93af] tabular-nums">{r.score.toFixed(1)}</span>
                        )}
                        {r.tier && (
                          <span className="text-white bg-[#1b3a5c] px-1.5 py-0.5 rounded font-bold">
                            {r.tier}
                          </span>
                        )}
                        {r.error && (
                          <span className="text-red-400 truncate max-w-xs">{r.error}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {runAllState === "error" && (
          <div className="mt-4 rounded-lg bg-red-900/30 border border-red-800 p-3 text-red-400 text-sm">
            {runAllError}
          </div>
        )}
      </div>

      {/* Step 2: Seed & Generate Bracket */}
      <div className="rounded-xl border border-[#1b3a5c] bg-[#0d1b2a] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white">Step 2: Seed &amp; Generate Bracket</h2>
            <p className="text-sm text-[#7b93af] mt-1">
              Seeds the top 64 qualified agents into 4 regions and generates the full tournament bracket.
            </p>
          </div>
          <button
            onClick={handleSeedAndBracket}
            disabled={seedState === "loading"}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors flex-shrink-0"
          >
            {seedState === "loading" ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                Seeding…
              </span>
            ) : (
              "🌱 Seed &amp; Generate Bracket"
            )}
          </button>
        </div>

        {/* Seed result */}
        {seedState === "success" && seedData && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-4">
              <div className="rounded-lg bg-teal-900/40 border border-teal-800 px-4 py-2 text-center">
                <div className="text-xl font-bold text-teal-400">{seedData.seededAgents?.length ?? 0}</div>
                <div className="text-xs text-teal-600 uppercase tracking-wide">Seeded Agents</div>
              </div>
              <div className="rounded-lg bg-[#162a44] border border-[#1b3a5c] px-4 py-2 text-center">
                <div className="text-xl font-bold text-white">{seedData.matchups?.length ?? 0}</div>
                <div className="text-xs text-[#7b93af] uppercase tracking-wide">Matchups Created</div>
              </div>
            </div>

            {Array.isArray(seedData.seededAgents) && seedData.seededAgents.length > 0 && (
              <div className="mt-3">
                <h4 className="text-xs font-semibold text-[#7b93af] uppercase tracking-widest mb-2">
                  Seedings
                </h4>
                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {seedData.seededAgents.map((agent, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-[#162a44]"
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: REGION_COLORS[agent.region] ?? "#6b7280" }}
                      />
                      <span className="text-[#7b93af] tabular-nums w-5 text-right">
                        #{agent.seed}
                      </span>
                      <span className="font-mono text-gray-300 truncate flex-1">
                        {agent.agentId}
                      </span>
                      <span className="text-[#7b93af] capitalize">{agent.region}</span>
                      <span className="text-[#7b93af] tabular-nums">{agent.score.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {seedState === "error" && (
          <div className="mt-4 rounded-lg bg-red-900/30 border border-red-800 p-3 text-red-400 text-sm">
            {seedError}
          </div>
        )}
      </div>
    </div>
  );
}
