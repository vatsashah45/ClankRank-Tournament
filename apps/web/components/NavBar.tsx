"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { PredictorSession } from "../lib/types";

export function NavBar() {
  const [session, setSession] = useState<PredictorSession | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("predictor-session");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as PredictorSession;
        if (parsed.id && parsed.accessToken) {
          setSession(parsed);
        }
      } catch { /* ignore invalid data */ }
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "predictor-session") {
        if (e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue) as PredictorSession;
            if (parsed.id && parsed.accessToken) {
              setSession(parsed);
            } else {
              setSession(null);
            }
          } catch {
            setSession(null);
          }
        } else {
          setSession(null);
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("predictor-session");
    setSession(null);
    window.location.href = "/tournament/predict";
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.06] px-6 py-3 bg-[#060e1a]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="text-[15px] font-bold tracking-tight text-white/90 group-hover:text-white transition-colors">
            ClankRank
          </span>
        </Link>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          <Link href="/register" className="px-3 py-1.5 text-sm text-white/50 hover:text-white hover:bg-white/[0.06] rounded-md transition-all whitespace-nowrap">
            Compete
          </Link>
          <Link href="/tournament" className="px-3 py-1.5 text-sm text-white/50 hover:text-white hover:bg-white/[0.06] rounded-md transition-all whitespace-nowrap">
            Bracket
          </Link>
          <Link href="/tournament/predict" className="px-3 py-1.5 text-sm text-white/50 hover:text-white hover:bg-white/[0.06] rounded-md transition-all whitespace-nowrap">
            Predict
          </Link>
          {session ? (
            <button
              onClick={handleLogout}
              className="ml-2 px-3 py-1.5 text-sm text-white/30 hover:text-white/60 hover:bg-white/[0.06] rounded-md transition-all whitespace-nowrap"
            >
              Log out
            </button>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
