import { ValironSDK } from "@valiron/sdk";
import { scoreResult } from "@clankrank/shared";
import type { RiskMetrics, ScoreResult } from "@clankrank/shared";
import { EdgeProxyService } from "./edge-proxy.js";
import { config } from "../config.js";

export interface QualificationResult {
  metrics: RiskMetrics;
  scoreResult: ScoreResult;
  rawMetrics: {
    testSummary?: Record<string, unknown>;
    totalTimeMs: number;
  };
}

/**
 * Run a qualification test for a single agent via @valiron/sdk.
 *
 * Uses triggerSandboxTest() which runs sandbox probes server-side
 * and returns a Valiron score + tier.
 */
export async function runQualification(
  agentId: string,
  _sandboxService: unknown,
  edgeProxyService: EdgeProxyService,
): Promise<QualificationResult> {
  const isMock = config.isMockMode;
  const startTime = performance.now();

  let valironScore: number;
  let testSummary: Record<string, unknown> = {};
  let metrics: RiskMetrics;

  if (isMock) {
    // Mock mode: simulate a qualification result
    valironScore = 85 + Math.floor(Math.random() * 15);
    metrics = {
      respected429: true,
      loops: 0,
      totalRequests: 10,
      errorRate: 0.05,
      averageLatency: 120,
      burstiness: 0.3,
      onChainFeedbackCount: 0,
      onChainAverageScore: 0,
    };
  } else {
    const sdk = new ValironSDK({
      endpoint: config.edgeProxyUrl,
    });

    const result = await sdk.triggerSandboxTest(agentId);
    valironScore = result.valironScore;
    testSummary = result.testSummary as Record<string, unknown> ?? {};

    // Build metrics from the SDK result
    const reputation = await edgeProxyService.getReputation(agentId);
    metrics = {
      respected429: true,
      loops: 0,
      totalRequests: (testSummary.totalRequests as number) ?? 10,
      errorRate: (testSummary.errorCount as number ?? 0) / ((testSummary.totalRequests as number) ?? 10),
      averageLatency: (testSummary.avgLatencyMs as number) ?? 0,
      burstiness: 0,
      onChainFeedbackCount: reputation.onchainFeedbackCount,
      onChainAverageScore: reputation.score,
    };
  }

  const totalTimeMs = performance.now() - startTime;
  const result = scoreResult(valironScore);

  return {
    metrics,
    scoreResult: result,
    rawMetrics: { testSummary, totalTimeMs },
  };
}
