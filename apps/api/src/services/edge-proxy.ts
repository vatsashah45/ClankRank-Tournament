import { ValironSDK, type AgentProfile } from "@valiron/sdk";
import { config } from "../config.js";
import type { EdgeProxyReputationResult } from "@clankrank/shared";

/**
 * Edge Proxy client — validates agent identity and fetches on-chain reputation
 * via the public @valiron/sdk.
 */
export class EdgeProxyService {
  private sdk: ValironSDK;
  private isMock: boolean;

  constructor(baseUrl?: string) {
    const url = baseUrl ?? config.edgeProxyUrl;
    this.isMock = url === "mock";
    this.sdk = new ValironSDK({ endpoint: url === "mock" ? undefined : url });
  }

  /**
   * Validate ERC-8004 agent identity on-chain.
   */
  async validateAgent(agentId: string, chain?: string): Promise<{ valid: boolean; agent?: { id: string; walletAddress: string; chain: string; exists: boolean } }> {
    if (this.isMock) {
      return {
        valid: true,
        agent: {
          id: agentId,
          walletAddress: "0x" + "a".repeat(40),
          chain: "monad",
          exists: true,
        },
      };
    }

    try {
      const profile = await this.sdk.getAgentProfile(agentId, chain ? { chain: chain as any } : undefined);
      return {
        valid: true,
        agent: {
          id: profile.agentId,
          walletAddress: profile.identity.wallet,
          chain: chain ?? "monad",
          exists: true,
        },
      };
    } catch (err: any) {
      if (err?.statusCode === 404) {
        return { valid: false };
      }
      throw err;
    }
  }

  /**
   * Fetch on-chain reputation for an agent.
   */
  async getReputation(agentId: string): Promise<EdgeProxyReputationResult> {
    if (this.isMock) {
      return { score: 75, tier: "BAA", onchainFeedbackCount: 5 };
    }

    try {
      const profile = await this.sdk.getAgentProfile(agentId);
      return {
        score: profile.routing?.finalRoute ? (profile.localReputation?.score ?? profile.onchainReputation?.averageScore ?? 0) : 0,
        tier: profile.localReputation?.tier ?? "C",
        onchainFeedbackCount: Number(profile.onchainReputation?.count ?? 0),
      };
    } catch {
      return { score: 0, tier: "C", onchainFeedbackCount: 0 };
    }
  }
}
