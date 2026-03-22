import crypto from "node:crypto";
import type { Chain, RoundName } from "@clankrank/shared";
import { createIPFSService } from "./ipfs.js";
import type { IPFSService } from "./ipfs.js";

export interface FeedbackWriterOptions {
  privateKey?: string;
  rpcUrls?: Record<Chain, string>;
  reputationRegistryAddress?: string;
  ipfsService?: IPFSService;
}

export interface WriteFeedbackParams {
  agentId: string;
  entryId: number;
  chain: Chain;
  authorizedFeedback: boolean;
  score: number;
  metricsJson: object;
  round: RoundName;
  matchId: number;
}

export interface WriteFeedbackResult {
  txHash?: string;
  ipfsCid?: string;
  skipped: boolean;
}

/**
 * ERC-8004 giveFeedback ABI — 8-parameter spec-compliant signature.
 * See: https://eips.ethereum.org/EIPS/eip-8004
 */
const GIVE_FEEDBACK_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
] as const;

/**
 * FeedbackWriter — writes on-chain feedback for agents after a match.
 *
 * SYS-CHAIN-1: Feedback only written when authorizedFeedback=true.
 * SYS-CHAIN-5: Tx reverts do NOT halt the tournament — errors are logged.
 * Mock mode: used when no privateKey is provided.
 */
export class FeedbackWriter {
  private privateKey?: string;
  private rpcUrls?: Record<Chain, string>;
  private reputationRegistryAddress?: string;
  private isMock: boolean;
  private ipfsService: IPFSService;

  constructor(options: FeedbackWriterOptions = {}) {
    this.privateKey = options.privateKey;
    this.rpcUrls = options.rpcUrls;
    this.reputationRegistryAddress = options.reputationRegistryAddress;
    this.isMock = !options.privateKey;
    this.ipfsService = options.ipfsService ?? createIPFSService();
  }

  /**
   * Write on-chain feedback for an agent after a match.
   *
   * GATES:
   * - authorizedFeedback must be true (SYS-CHAIN-1)
   *
   * STEPS:
   * 1. Upload metrics to IPFS → get CID
   * 2. Call ERC-8004 giveFeedback(agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash)
   *    tag1 = round name ("R64", "R32", etc.)
   *    tag2 = agent's registered chain ("monad", "ethereum", etc.)
   *    feedbackURI = ipfs://{cid}
   *    feedbackHash = keccak256 of metrics JSON
   * 3. Return txHash + ipfsCid
   *
   * ERROR HANDLING:
   * - Tx revert → log error, return skipped=false with error logged (SYS-CHAIN-5)
   * - IPFS upload failure → log, skip feedback, continue
   */
  async writeFeedback(params: WriteFeedbackParams): Promise<WriteFeedbackResult> {
    // SYS-CHAIN-1: Gate on authorized_feedback
    if (!params.authorizedFeedback) {
      return { skipped: true };
    }

    // Step 1: Upload metrics to IPFS
    let ipfsCid: string | undefined;
    try {
      const uploadResult = await this.ipfsService.uploadMetrics(params.metricsJson);
      ipfsCid = uploadResult.cid;
    } catch (err) {
      console.error(
        `[FeedbackWriter] IPFS upload failed for agent ${params.agentId} match ${params.matchId}:`,
        err,
      );
      return { skipped: false, ipfsCid: undefined };
    }

    // Step 2: Write on-chain feedback
    const tag1 = params.round;
    const tag2 = params.chain;

    if (this.isMock) {
      // Mock mode: return deterministic mock tx hash
      const txInput = `${params.agentId}-${params.matchId}-${params.round}`;
      const txHash = `mock-tx-${crypto
        .createHash("sha256")
        .update(txInput)
        .digest("hex")
        .slice(0, 16)}`;
      return { txHash, ipfsCid, skipped: false };
    }

    // Live mode: call ERC-8004 giveFeedback via ethers.js
    try {
      const metricsStr = JSON.stringify(params.metricsJson);
      // Use keccak256 to match ERC-8004 spec (ethers is already imported above)
      const { ethers: eth } = await import("ethers" as string);
      const feedbackHashHex = (eth as any).keccak256((eth as any).toUtf8Bytes(metricsStr));

      const txHash = await this.callGiveFeedback({
        agentId: params.agentId,
        score: params.score,
        tag1,
        tag2,
        feedbackURI: `ipfs://${ipfsCid}`,
        feedbackHash: feedbackHashHex,
        chain: params.chain,
      });
      return { txHash, ipfsCid, skipped: false };
    } catch (err) {
      // SYS-CHAIN-5: Tx revert → log error, do NOT halt tournament
      console.error(
        `[FeedbackWriter] giveFeedback tx failed for agent ${params.agentId}:`,
        err,
      );
      return { skipped: false, ipfsCid };
    }
  }

  private async callGiveFeedback(args: {
    agentId: string;
    score: number;
    tag1: string;
    tag2: string;
    feedbackURI: string;
    feedbackHash: string;
    chain: Chain;
  }): Promise<string> {
    // Dynamic import of ethers to avoid hard dependency in mock mode
    // In mock mode this path is never reached
    const { ethers } = await import("ethers" as string);
    const rpcUrl = this.rpcUrls?.[args.chain];
    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for chain ${args.chain}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = ethers as any;
    const provider = new e.JsonRpcProvider(rpcUrl);
    const wallet = new e.Wallet(this.privateKey!, provider);

    // ERC-8004 spec-compliant ABI encoding
    const iface = new e.Interface(GIVE_FEEDBACK_ABI as unknown as string[]);

    // Derive a deterministic uint256 from the string agentId via keccak256
    const agentIdNumeric = BigInt(e.keccak256(e.toUtf8Bytes(args.agentId)));

    const data = iface.encodeFunctionData("giveFeedback", [
      agentIdNumeric,        // uint256 agentId (keccak256 of string ID)
      BigInt(args.score),    // int128 value
      0,                     // uint8 valueDecimals (scores are whole numbers)
      args.tag1,             // string tag1 (round)
      args.tag2,             // string tag2 (chain)
      "",                    // string endpoint (not applicable for tournament)
      args.feedbackURI,      // string feedbackURI (ipfs://{cid})
      args.feedbackHash,     // bytes32 feedbackHash
    ]);

    const tx = await wallet.sendTransaction({
      to: this.reputationRegistryAddress,
      data,
    });

    return tx.hash;
  }
}
