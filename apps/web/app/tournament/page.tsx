import type { BracketMatchup, TournamentState } from "@clankrank/shared";
import { TournamentBracket } from "@/components/bracket/TournamentBracket";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Server component — fetches bracket data at request time so it arrives with
 * the HTML instead of requiring a client-side waterfall.
 */
export default async function TournamentPage() {
  let matchups: BracketMatchup[] = [];
  let state: TournamentState = "REGISTRATION";

  try {
    const res = await fetch(`${API_URL}/api/bracket`, {
      next: { revalidate: 30 },
    });
    if (res.ok) {
      const data = await res.json();
      matchups = data.matchups ?? [];
      state = data.state ?? "REGISTRATION";
    }
  } catch {
    // Server fetch failed — client component will retry
  }

  return <TournamentBracket initialMatchups={matchups} initialState={state} />;
}
