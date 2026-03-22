"use client";

import { useState, useEffect, useCallback } from "react";
import { EntryTable } from "@/components/admin/EntryTable";
import { getEntries, type EntryRecord } from "@/lib/api";

export default function EntriesPage() {
  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await getEntries();
      setEntries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Entries</h1>
          <p className="text-sm text-[#7b93af] mt-1">All registered tournament entries</p>
        </div>
        <button
          onClick={fetchEntries}
          disabled={loading}
          className="px-3 py-1.5 bg-[#1b3a5c] hover:bg-gray-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {loading && (
        <div className="text-[#7b93af] text-sm">Loading entries…</div>
      )}

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-900/30 p-4 text-red-400 text-sm">
          Error: {error}
          <button onClick={fetchEntries} className="ml-3 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <EntryTable entries={entries} />
      )}
    </div>
  );
}
