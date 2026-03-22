"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.token) {
        const secureSuffix = window.location.protocol === "https:" ? "; secure" : "";
        document.cookie = `admin-token=${encodeURIComponent(data.token)}; path=/; max-age=86400; samesite=strict${secureSuffix}`;
        router.push(redirectTo);
      } else {
        setError(data.error ?? "Invalid email or password.");
      }
    } catch {
      setError("Unable to connect to the API. Check that the server is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0d1b2a] border border-[#1b3a5c] mb-4">
            <span className="text-2xl">🏀</span>
          </div>
          <h1 className="text-xl font-bold text-white">ClankRank</h1>
          <p className="text-sm text-[#7b93af] mt-1">Admin Access</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[#1b3a5c] bg-[#0d1b2a] p-6">
          <h2 className="text-base font-semibold text-white mb-4">Admin Login</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-[#7b93af] uppercase tracking-wider mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full px-3 py-2.5 rounded-lg bg-[#162a44] border border-[#1b3a5c] text-white text-sm placeholder-[#5a7a9c] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-[#7b93af] uppercase tracking-wider mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className="w-full px-3 py-2.5 rounded-lg bg-[#162a44] border border-[#1b3a5c] text-white text-sm placeholder-[#5a7a9c] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-colors"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-900/30 border border-red-800 px-3 py-2.5 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full px-4 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#5a7a9c] mt-4">
          Admin access is restricted to authorized team members.
        </p>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <span className="text-[#7b93af] text-sm">Loading…</span>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
