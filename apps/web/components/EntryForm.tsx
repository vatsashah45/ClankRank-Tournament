"use client";

import { useState } from "react";
import { REGIONS } from "@clankrank/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const CHAINS = REGIONS.map((r) => ({ value: r.name, label: r.displayName, color: r.color }));

export interface FormState {
  agentId: string;
  walletAddress: string;
  chain: string;
  authorizeFeedback: boolean;
}

export const DEFAULT_FORM_STATE: FormState = {
  agentId: "",
  walletAddress: "",
  chain: "monad",
  authorizeFeedback: false,
};

interface EntryFormProps {
  formState?: FormState;
  onFormChange?: (state: FormState) => void;
}

const inputClasses =
  "w-full px-3 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-white text-sm placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-[#836EF9]/50 focus:border-[#836EF9]/30 transition-all";

export function EntryForm({ formState, onFormChange }: EntryFormProps) {
  const [internalForm, setInternalForm] = useState<FormState>(DEFAULT_FORM_STATE);

  const form = formState ?? internalForm;
  const setForm = (next: FormState) => {
    if (onFormChange) onFormChange(next);
    else setInternalForm(next);
  };

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch(`${API_URL}/api/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(`Agent ${form.agentId} registered successfully.`);
        setForm(DEFAULT_FORM_STATE);
      } else {
        setStatus("error");
        setMessage(data.error ?? "Registration failed");
      }
    } catch (err) {
      setStatus("error");
      setMessage("Network error \u2014 is the API server running?");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="agentId" className="block text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5">
          ERC-8004 Agent ID
        </label>
        <input
          id="agentId"
          type="text"
          required
          value={form.agentId}
          onChange={(e) => setForm({ ...form, agentId: e.target.value })}
          placeholder="e.g. agent-001"
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="wallet" className="block text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5">
          Wallet Address
        </label>
        <input
          id="wallet"
          type="text"
          required
          value={form.walletAddress}
          onChange={(e) => setForm({ ...form, walletAddress: e.target.value })}
          placeholder="0x..."
          pattern="^0x[a-fA-F0-9]{40}$"
          className={`${inputClasses} font-mono`}
        />
      </div>

      <div>
        <label htmlFor="chain" className="block text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5">
          Chain
        </label>
        <select
          id="chain"
          value={form.chain}
          onChange={(e) => setForm({ ...form, chain: e.target.value })}
          className={inputClasses}
        >
          {CHAINS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-start gap-3 py-1">
        <input
          id="authFeedback"
          type="checkbox"
          checked={form.authorizeFeedback}
          onChange={(e) => setForm({ ...form, authorizeFeedback: e.target.checked })}
          className="mt-0.5 w-4 h-4 rounded bg-white/[0.03] border-white/[0.1] text-[#836EF9] focus:ring-[#836EF9]/50"
        />
        <label htmlFor="authFeedback" className="text-sm text-white/40 leading-snug">
          Authorize on-chain reputation feedback writes
        </label>
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full py-2.5 bg-gradient-to-r from-[#836EF9] to-[#627EEA] hover:from-[#9580ff] hover:to-[#738cf0] disabled:from-white/[0.06] disabled:to-white/[0.06] disabled:text-white/30 rounded-lg font-medium text-sm transition-all shadow-lg shadow-[#836EF9]/10"
      >
        {status === "loading" ? "Registering\u2026" : "Register Agent"}
      </button>

      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            status === "success"
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          {message}
        </div>
      )}
    </form>
  );
}
