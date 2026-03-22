"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface PredictorData {
  predictor: {
    id: number;
    displayName: string;
    type: string;
    chain: string | null;
    walletAddress: string | null;
  };
  prediction: {
    id: number;
    picks: Record<string, number>;
    score: number;
    correctPicks: number;
    maxPossibleScore: number;
    submittedAt: string;
    updatedAt: string | null;
  } | null;
  ranking: {
    rank: number;
    totalPredictors: number;
  } | null;
}

export default function MyBracketPage() {
  return (
    <Suspense fallback={<div className="max-w-lg mx-auto animate-pulse space-y-4"><div className="h-8 bg-[#0d1b2a] rounded w-1/3" /><div className="h-48 bg-[#0d1b2a] rounded" /></div>}>
      <MyBracketContent />
    </Suspense>
  );
}

function MyBracketContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [data, setData] = useState<PredictorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Token input for manual entry
  const [tokenInput, setTokenInput] = useState("");

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchData(token);
  }, [token]);

  const fetchData = async (accessToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/predictions/me?token=${accessToken}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        setError(err.error ?? `HTTP ${res.status}`);
        return;
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenInput) {
      // Navigate with token
      window.location.href = `/tournament/my-bracket?token=${tokenInput}`;
    }
  };

  // No token — show input form
  if (!token) {
    return (
      <div className="max-w-lg mx-auto">
        <h1 className="text-3xl font-bold mb-2">My Bracket</h1>
        <p className="text-[#7b93af] mb-8">
          Enter your access token to view your bracket prediction and ranking.
        </p>

        <form onSubmit={handleTokenSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-[#7b93af] uppercase tracking-wider mb-1.5">
              Access Token
            </label>
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              required
              placeholder="Paste your access token here"
              className="w-full px-3 py-2.5 bg-[#0d1b2a] border border-[#1b3a5c] rounded-lg text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-[#3b82f6]/40"
            />
          </div>
          <button
            type="submit"
            disabled={!tokenInput}
            className="w-full px-4 py-3 bg-gradient-to-r from-[#836EF9] to-[#627EEA] text-white font-bold rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            View My Bracket
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-[#5a7a9c]">
            Don't have a token?{" "}
            <a href="/tournament/predict" className="text-[#3b82f6] hover:underline">
              Register to predict
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-[#0d1b2a] rounded w-1/3" />
        <div className="h-48 bg-[#0d1b2a] rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto">
        <h1 className="text-3xl font-bold mb-4">My Bracket</h1>
        <div className="text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-4 py-3 mb-6 text-sm">
          {error}
        </div>
        <a href="/tournament/predict" className="text-[#3b82f6] hover:underline text-sm">
          Register to predict
        </a>
      </div>
    );
  }

  if (!data) return null;

  const { predictor, prediction, ranking } = data;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">My Bracket</h1>

      {/* Predictor info card */}
      <div className="bg-[#0d1b2a] border border-[#1b3a5c] rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#836EF9] to-[#627EEA] flex items-center justify-center text-white font-bold text-lg">
            {predictor.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-white text-lg">{predictor.displayName}</div>
            <div className="flex items-center gap-3 text-xs text-[#5a7a9c]">
              <span className={`px-2 py-0.5 rounded ${predictor.type === "agent" ? "bg-[#836EF9]/15 text-[#836EF9]" : "bg-[#3b82f6]/15 text-[#3b82f6]"}`}>
                {predictor.type}
              </span>
              {predictor.chain && (
                <span className="text-white/30">{predictor.chain}</span>
              )}
              {predictor.walletAddress && (
                <span className="font-mono text-white/30">{predictor.walletAddress}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ranking + Score */}
      {ranking && prediction && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-[#0d1b2a] border border-[#1b3a5c] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">#{ranking.rank}</div>
            <div className="text-[10px] text-[#5a7a9c] uppercase tracking-wider">Rank</div>
            <div className="text-[10px] text-white/20">of {ranking.totalPredictors}</div>
          </div>
          <div className="bg-[#0d1b2a] border border-[#1b3a5c] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{prediction.score}</div>
            <div className="text-[10px] text-[#5a7a9c] uppercase tracking-wider">Score</div>
            <div className="text-[10px] text-white/20">max {prediction.maxPossibleScore}</div>
          </div>
          <div className="bg-[#0d1b2a] border border-[#1b3a5c] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{prediction.correctPicks}</div>
            <div className="text-[10px] text-[#5a7a9c] uppercase tracking-wider">Correct</div>
            <div className="text-[10px] text-white/20">picks</div>
          </div>
        </div>
      )}

      {/* No prediction yet */}
      {!prediction && (
        <div className="text-center py-12 bg-[#0d1b2a] border border-[#1b3a5c] rounded-xl">
          <div className="text-3xl mb-3">&#128203;</div>
          <p className="text-lg font-semibold text-[#e8edf3] mb-2">No Picks Yet</p>
          <p className="text-sm text-[#5a7a9c] mb-4">
            You haven't submitted bracket predictions yet.
          </p>
          <a
            href="/tournament/predict"
            className="inline-block px-6 py-2.5 bg-gradient-to-r from-[#836EF9] to-[#627EEA] text-white font-bold rounded-lg text-sm hover:opacity-90 transition-opacity"
          >
            Fill Out Bracket
          </a>
        </div>
      )}

      {/* Picks summary */}
      {prediction && (
        <div className="bg-[#0d1b2a] border border-[#1b3a5c] rounded-xl p-6">
          <h2 className="text-xs font-bold text-[#5a7a9c] uppercase tracking-wider mb-3">
            Your Picks
          </h2>
          <div className="text-xs text-[#5a7a9c] mb-4">
            Submitted {new Date(prediction.submittedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {prediction.updatedAt && prediction.updatedAt !== prediction.submittedAt && (
              <> &bull; Updated {new Date(prediction.updatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}</>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(prediction.picks).map(([matchupKey, winnerId]) => (
              <div
                key={matchupKey}
                className="bg-[#060e1a] border border-white/[0.05] rounded px-3 py-2 text-xs"
              >
                <div className="text-white/20 text-[9px] mb-0.5">{matchupKey}</div>
                <div className="text-white font-mono">Entry #{winnerId}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links */}
      <div className="flex gap-3 mt-6">
        <a
          href="/tournament"
          className="flex-1 text-center px-4 py-3 bg-[#0d1b2a] border border-[#1b3a5c] text-white/60 hover:text-white font-medium rounded-lg text-sm transition-colors"
        >
          View Full Bracket
        </a>
        <a
          href="/tournament/predict"
          className="flex-1 text-center px-4 py-3 bg-[#0d1b2a] border border-[#1b3a5c] text-white/60 hover:text-white font-medium rounded-lg text-sm transition-colors"
        >
          Update Picks
        </a>
      </div>
    </div>
  );
}
