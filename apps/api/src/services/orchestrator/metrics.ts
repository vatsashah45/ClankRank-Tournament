import type {
  RoundName,
  RiskMetrics,
  RoundPenalties,
  MatchMetrics,
  SandboxRunResult,
  TierName,
} from "@agent-madness/shared";
import { computeMatchScore } from "@agent-madness/shared";
import { ValironSDK } from "@valiron/sdk";
import { config } from "../../config.js";

/**
 * MetricsCollector — accumulates round-specific metrics during a sandbox run
 * and produces the canonical MatchMetrics JSON.
 */
export class MetricsCollector {
  private agentId: string;
  private matchId: number;
  private round: RoundName;
  private startTime: number;

  // Accumulated raw data
  private requestLogs: Array<{
    timestamp: number;
    status: number;
    latencyMs: number;
    url: string;
  }>;

  constructor(agentId: string, matchId: number, round: RoundName) {
    this.agentId = agentId;
    this.matchId = matchId;
    this.round = round;
    this.startTime = Date.now();
    this.requestLogs = [];
  }

  recordRequest(status: number, latencyMs: number, url: string): void {
    this.requestLogs.push({
      timestamp: Date.now(),
      status,
      latencyMs,
      url,
    });
  }

  /**
   * Produce MatchMetrics from a completed SandboxRunResult.
   */
  async finalize(
    result: SandboxRunResult,
    timedOut = false,
  ): Promise<MatchMetrics> {
    const durationMs = Date.now() - this.startTime;

    let baseScore = 0;
    let adjustedScore = 0;
    let tier: TierName = "C";

    if (timedOut) {
      adjustedScore = 0;
      tier = "C";
    } else {
      // Get base score from @valiron/sdk
      const isMock = config.isMockMode;
      if (isMock) {
        baseScore = 85;
      } else {
        const sdk = new ValironSDK({ endpoint: config.edgeProxyUrl });
        const sandboxResult = await sdk.triggerSandboxTest(this.agentId);
        baseScore = sandboxResult.valironScore;
      }
      const matchResult = computeMatchScore(
        baseScore,
        result.roundPenalties,
        this.round,
      );
      adjustedScore = matchResult.score;
      tier = matchResult.tier;
    }

    const metrics: MatchMetrics = {
      agentId: this.agentId,
      matchId: this.matchId,
      round: this.round,
      respected429: result.metrics.respected429,
      loops: result.metrics.loops,
      totalRequests: result.metrics.totalRequests,
      errorRate: result.metrics.errorRate ?? 0,
      averageLatency: result.metrics.averageLatency ?? 0,
      burstiness: result.metrics.burstiness ?? 0,
      roundPenalties: result.roundPenalties,
      baseScore,
      adjustedScore,
      tier,
      durationMs,
      timedOut,
      rawJson: JSON.stringify({
        agentId: this.agentId,
        matchId: this.matchId,
        round: this.round,
        riskMetrics: result.metrics,
        roundPenalties: result.roundPenalties,
        requestLogs: this.requestLogs,
      }),
    };

    return metrics;
  }

  /**
   * Build a zero-score MatchMetrics for timed-out runs.
   */
  buildTimeoutMetrics(): MatchMetrics {
    const zeroMetrics: RiskMetrics = {
      respected429: false,
      loops: 0,
      totalRequests: 0,
      errorRate: 1,
      averageLatency: 0,
      burstiness: 0,
    };
    const zeroPenalties: RoundPenalties = {};
    const durationMs = Date.now() - this.startTime;

    return {
      agentId: this.agentId,
      matchId: this.matchId,
      round: this.round,
      respected429: false,
      loops: 0,
      totalRequests: 0,
      errorRate: 1,
      averageLatency: 0,
      burstiness: 0,
      roundPenalties: zeroPenalties,
      baseScore: 0,
      adjustedScore: 0,
      tier: "C",
      durationMs,
      timedOut: true,
      rawJson: JSON.stringify({
        agentId: this.agentId,
        matchId: this.matchId,
        round: this.round,
        riskMetrics: zeroMetrics,
        roundPenalties: zeroPenalties,
        timedOut: true,
      }),
    };
  }
}
