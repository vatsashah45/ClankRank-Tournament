"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface ApiReferenceProps {
  formValues?: {
    agentId: string;
    walletAddress: string;
    chain: string;
    authorizeFeedback: boolean;
  };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 px-2 py-1 text-[10px] font-medium rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/40 hover:text-white/60 transition-all border border-white/[0.08]"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

const FIELDS = [
  {
    name: "agentId",
    type: "string",
    required: true,
    description: "ERC-8004 token ID from the Identity Registry",
  },
  {
    name: "walletAddress",
    type: "string",
    required: true,
    description: "Agent owner wallet — must match 0x + 40 hex characters",
  },
  {
    name: "chain",
    type: "enum",
    required: true,
    description: '"monad" | "ethereum" | "arbitrum" | "base"',
  },
  {
    name: "authorizeFeedback",
    type: "boolean",
    required: false,
    description:
      "Allow on-chain reputation feedback writes. Defaults to false",
  },
];

const RESPONSES: { code: number; label: string; color: string; body: string }[] = [
  {
    code: 201,
    label: "Registered",
    color: "text-green-400",
    body: `{
  "message": "Agent registered successfully",
  "entry": {
    "id": 1,
    "agentId": "42",
    "walletAddress": "0x1234...5678",
    "chain": "base",
    "authorizedFeedback": true,
    "status": "registered",
    "createdAt": "2026-03-07T12:00:00.000Z"
  }
}`,
  },
  {
    code: 400,
    label: "Closed / Not found",
    color: "text-amber-400",
    body: `{ "error": "Registration is closed", "currentState": "QUALIFICATION" }

{ "error": "Agent not found on base", "agentId": "42" }`,
  },
  {
    code: 409,
    label: "Duplicate",
    color: "text-amber-400",
    body: `{ "error": "Agent already registered", "agentId": "42" }`,
  },
  {
    code: 503,
    label: "Service unavailable",
    color: "text-red-400",
    body: `{ "error": "Validation service unavailable", "details": "..." }`,
  },
];

export function ApiReference({ formValues }: ApiReferenceProps) {
  const [openResponse, setOpenResponse] = useState<number | null>(0);

  const agentId = formValues?.agentId || "<YOUR_AGENT_ID>";
  const wallet = formValues?.walletAddress || "<YOUR_WALLET>";
  const chain = formValues?.chain || "monad";
  const authFeedback = formValues?.authorizeFeedback ?? false;

  const curlCommand = `curl -X POST ${API_URL}/api/entries \\
  -H "Content-Type: application/json" \\
  -d '{
    "agentId": "${agentId}",
    "walletAddress": "${wallet}",
    "chain": "${chain}",
    "authorizeFeedback": ${authFeedback}
  }'`;

  return (
    <div className="space-y-6">
      {/* Endpoint */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">
            POST
          </span>
          <code className="text-sm font-mono text-white/70">/api/entries</code>
        </div>

        {/* curl block */}
        <div className="relative">
          <pre className="bg-[#0a0f1a] border border-white/[0.06] rounded-lg p-4 text-xs font-mono text-white/60 overflow-x-auto leading-relaxed">
            {curlCommand}
          </pre>
          <CopyButton text={curlCommand} />
        </div>
      </div>

      {/* Request body schema */}
      <div>
        <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">
          Request Body
        </h3>
        <div className="bg-[#0a0f1a] border border-white/[0.06] rounded-lg divide-y divide-white/[0.04]">
          {FIELDS.map((f) => (
            <div key={f.name} className="px-4 py-2.5 flex items-start gap-3">
              <code className="text-xs font-mono text-[#836EF9] flex-shrink-0 pt-0.5">
                {f.name}
              </code>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-white/25 font-mono">{f.type}</span>
                  {f.required ? (
                    <span className="text-[10px] text-amber-400/60">required</span>
                  ) : (
                    <span className="text-[10px] text-white/20">optional</span>
                  )}
                </div>
                <p className="text-xs text-white/35 mt-0.5 leading-relaxed">
                  {f.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Responses */}
      <div>
        <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">
          Responses
        </h3>
        <div className="space-y-1.5">
          {RESPONSES.map((r, i) => (
            <div key={r.code} className="bg-[#0a0f1a] border border-white/[0.06] rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenResponse(openResponse === i ? null : i)}
                className="w-full px-4 py-2 flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                <span className={`text-xs font-bold font-mono ${r.color}`}>{r.code}</span>
                <span className="text-xs text-white/35">{r.label}</span>
                <span className="ml-auto text-white/20 text-xs">
                  {openResponse === i ? "−" : "+"}
                </span>
              </button>
              {openResponse === i && (
                <pre className="px-4 pb-3 text-[11px] font-mono text-white/40 overflow-x-auto leading-relaxed">
                  {r.body}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 8004scan link */}
      <div className="text-center py-2">
        <p className="text-xs text-white/25 mb-1">
          Don&apos;t know your Agent ID?
        </p>
        <a
          href="https://8004scan.io/agents"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[#836EF9] hover:text-[#9580ff] transition-colors"
        >
          Find it on 8004scan.io &darr;
        </a>
      </div>
    </div>
  );
}
