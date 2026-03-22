"use client";

import { useState, useMemo } from "react";
import type { TournamentEntry } from "@agent-madness/shared";
import { TierBadge } from "@/components/TierBadge";

const REGION_COLORS: Record<string, string> = {
  monad: "#836EF9",
  ethereum: "#627EEA",
  arbitrum: "#FF6B35",
  base: "#0052FF",
};

interface EntryWithScore extends TournamentEntry {
  score?: number;
  tier?: string;
}

interface EntryTableProps {
  entries: EntryWithScore[];
}

type SortField = "agentId" | "chain" | "status" | "tier" | "score" | "createdAt";
type SortDir = "asc" | "desc";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_CLASS: Record<string, string> = {
  registered: "bg-blue-900 text-blue-300",
  qualified: "bg-green-900 text-green-300",
  eliminated: "bg-red-900 text-red-400",
  active: "bg-yellow-900 text-yellow-300",
  champion: "bg-amber-500 text-gray-900",
};

export function EntryTable({ entries }: EntryTableProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    let result = entries.filter((e) =>
      e.agentId.toLowerCase().includes(search.toLowerCase())
    );

    result = [...result].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";

      switch (sortField) {
        case "agentId":
          av = a.agentId;
          bv = b.agentId;
          break;
        case "chain":
          av = a.chain;
          bv = b.chain;
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        case "tier":
          av = a.tier ?? "";
          bv = b.tier ?? "";
          break;
        case "score":
          av = a.score ?? -1;
          bv = b.score ?? -1;
          break;
        case "createdAt":
          av = a.createdAt;
          bv = b.createdAt;
          break;
      }

      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [entries, search, sortField, sortDir]);

  const SortHeader = ({
    field,
    label,
  }: {
    field: SortField;
    label: string;
  }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-[#7b93af] uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortField === field ? (
          <span className="text-teal-400">{sortDir === "asc" ? "↑" : "↓"}</span>
        ) : (
          <span className="text-gray-700">↕</span>
        )}
      </span>
    </th>
  );

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter by Agent ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-[#162a44] border border-[#1b3a5c] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-teal-600 w-64"
        />
        <span className="text-sm text-[#7b93af]">
          {filtered.length} / {entries.length} entries
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#1b3a5c] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0d1b2a] border-b border-[#1b3a5c]">
            <tr>
              <SortHeader field="agentId" label="Agent ID" />
              <SortHeader field="chain" label="Chain" />
              <SortHeader field="status" label="Status" />
              <SortHeader field="tier" label="Tier" />
              <SortHeader field="score" label="Score" />
              <SortHeader field="createdAt" label="Created At" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[#7b93af]">
                  {search ? "No entries matching filter" : "No entries"}
                </td>
              </tr>
            ) : (
              filtered.map((entry) => (
                <tr key={entry.id} className="bg-[#0d1b2a] hover:bg-[#162a44] transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-300">
                    {entry.agentId}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: REGION_COLORS[entry.chain] ?? "#6b7280",
                        }}
                      />
                      <span className="text-gray-300 capitalize">{entry.chain}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_CLASS[entry.status] ?? "bg-[#1b3a5c] text-gray-300"}`}
                    >
                      {entry.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {entry.tier ? (
                      <TierBadge tier={entry.tier} score={entry.score} />
                    ) : (
                      <span className="text-[#5a7a9c] text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300 font-mono text-xs">
                    {entry.score !== undefined ? entry.score.toFixed(1) : (
                      <span className="text-[#5a7a9c]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#7b93af] text-xs">
                    {formatDate(entry.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
