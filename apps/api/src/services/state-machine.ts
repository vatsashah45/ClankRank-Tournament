import { eq, and, isNotNull } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { schema } from "../db/index.js";
import { STATE_ORDER, ROUND_ORDER, ROUND_SCHEDULE } from "@clankrank/shared";
import type { TournamentState, RoundName } from "@clankrank/shared";

// Required matchup counts per round
const ROUND_MATCHUP_COUNTS: Partial<Record<RoundName, number>> = {
  R64: 32,
  R32: 16,
  R16: 8,
  QF: 4,
  SF: 2,
  CHAMPIONSHIP: 1,
};

/**
 * TournamentStateMachine — manages tournament state transitions.
 *
 * SYS-DATA-5: Transitions follow STATE_ORDER (no skipping, no backward).
 * SYS-RES-5: State persisted in DB — survives restart.
 */
export class TournamentStateMachine {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  /**
   * Get current state from DB (survives restart — SYS-RES-5).
   */
  async getCurrentState(): Promise<TournamentState> {
    const meta = await this.db.query.tournamentMeta.findFirst();
    return (meta?.state as TournamentState) ?? "REGISTRATION";
  }

  /**
   * Validate and execute a state transition.
   *
   * Rules (SYS-DATA-5):
   * - Transitions must follow STATE_ORDER (no skipping, no backward)
   * - Each transition has preconditions (unless force=true)
   */
  async transition(
    targetState: TournamentState,
    options?: { force?: boolean },
  ): Promise<{ success: boolean; from: TournamentState; to: TournamentState; error?: string }> {
    const currentState = await this.getCurrentState();
    const currentIdx = STATE_ORDER.indexOf(currentState);
    const targetIdx = STATE_ORDER.indexOf(targetState);

    // Reject backward transitions
    if (targetIdx <= currentIdx) {
      return {
        success: false,
        from: currentState,
        to: targetState,
        error: `Cannot transition backward from ${currentState} to ${targetState}`,
      };
    }

    // Reject skipping transitions (unless force=true)
    if (!options?.force && targetIdx > currentIdx + 1) {
      return {
        success: false,
        from: currentState,
        to: targetState,
        error: `Cannot skip states from ${currentState} to ${targetState}`,
      };
    }

    // Check preconditions (unless force=true)
    if (!options?.force) {
      const preconditionError = await this.checkPreconditions(currentState, targetState);
      if (preconditionError) {
        return {
          success: false,
          from: currentState,
          to: targetState,
          error: preconditionError,
        };
      }
    }

    // Execute transition
    await this.db
      .update(schema.tournamentMeta)
      .set({
        state: targetState,
        currentRound: ROUND_ORDER.includes(targetState as RoundName)
          ? targetState
          : undefined,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.tournamentMeta.id, 1));

    return { success: true, from: currentState, to: targetState };
  }

  /**
   * Check preconditions for a state transition.
   * Returns error message if preconditions not met, null if OK.
   */
  private async checkPreconditions(
    from: TournamentState,
    to: TournamentState,
  ): Promise<string | null> {
    // REGISTRATION → QUALIFICATION: admin trigger (no preconditions beyond manual)
    if (from === "REGISTRATION" && to === "QUALIFICATION") {
      return null;
    }

    // QUALIFICATION → R64: all entries scored + bracket generated
    if (from === "QUALIFICATION" && to === "R64") {
      const scores = await this.db.query.qualificationScores.findMany();
      const entries = await this.db.query.tournamentEntries.findMany();
      const qualifiedCount = entries.filter((e) => e.status === "qualified").length;

      if (scores.length < 64 || qualifiedCount < 64) {
        return `Need at least 64 qualified agents, have ${scores.length} scores and ${qualifiedCount} qualified entries`;
      }

      const bracket = await this.db.query.bracketState.findMany({
        where: eq(schema.bracketState.round, "R64"),
      });
      if (bracket.length < 32) {
        return `R64 bracket not yet generated (need 32 matchups, have ${bracket.length})`;
      }

      return null;
    }

    // Round transitions: check previous round is complete
    const roundTransitions: Partial<Record<TournamentState, RoundName>> = {
      R32: "R64",
      R16: "R32",
      QF: "R16",
      SF: "QF",
      CHAMPIONSHIP: "SF",
      COMPLETE: "CHAMPIONSHIP",
    };

    const requiredRound = roundTransitions[to];
    if (requiredRound) {
      const isComplete = await this.isRoundComplete(requiredRound);
      if (!isComplete) {
        const count = ROUND_MATCHUP_COUNTS[requiredRound] ?? 0;
        const completed = await this.getCompletedCount(requiredRound);
        return `${requiredRound} round not complete (${completed}/${count} matchups done)`;
      }
    }

    return null;
  }

  /**
   * Check if all matchups in a round are completed.
   */
  async isRoundComplete(round: RoundName): Promise<boolean> {
    const matchups = await this.db.query.bracketState.findMany({
      where: eq(schema.bracketState.round, round),
    });

    if (matchups.length === 0) return false;

    const expectedCount = ROUND_MATCHUP_COUNTS[round];
    if (expectedCount !== undefined && matchups.length < expectedCount) return false;

    return matchups.every((m) => m.winnerId !== null);
  }

  /**
   * Get count of completed matchups in a round.
   */
  private async getCompletedCount(round: RoundName): Promise<number> {
    const matchups = await this.db.query.bracketState.findMany({
      where: eq(schema.bracketState.round, round),
    });
    return matchups.filter((m) => m.winnerId !== null).length;
  }

  /**
   * Auto-advance: check current round, if complete, generate next round + advance.
   * No date-based checks — admin triggers all state transitions manually.
   */
  async checkAndAdvance(): Promise<{ advanced: boolean; newState?: TournamentState }> {
    const currentState = await this.getCurrentState();

    // Only auto-advance during round states
    if (!ROUND_ORDER.includes(currentState as RoundName)) {
      return { advanced: false };
    }

    const currentRound = currentState as RoundName;
    const isComplete = await this.isRoundComplete(currentRound);

    if (!isComplete) {
      return { advanced: false };
    }

    // Determine next state
    const currentIdx = STATE_ORDER.indexOf(currentState);
    if (currentIdx >= STATE_ORDER.length - 1) {
      return { advanced: false };
    }

    const nextState = STATE_ORDER[currentIdx + 1] as TournamentState;

    const result = await this.transition(nextState, { force: true });
    if (result.success) {
      return { advanced: true, newState: nextState };
    }

    return { advanced: false };
  }

  /**
   * Get round schedule info for the current round.
   */
  getRoundSchedule(round: RoundName) {
    return ROUND_SCHEDULE.find((s) => s.round === round);
  }
}
