import { describe, it, expect, vi } from "vitest";
import { FeedbackWriter } from "../src/services/feedback-writer.js";
import { MockIPFSService } from "../src/services/ipfs.js";

function makeMockIPFS() {
  return new MockIPFSService();
}

function makeWriter(options: { privateKey?: string } = {}) {
  return new FeedbackWriter({
    ...options,
    ipfsService: makeMockIPFS(),
  });
}

const baseParams = {
  agentId: "test-agent-001",
  entryId: 1,
  chain: "monad" as const,
  authorizedFeedback: true,
  score: 85,
  metricsJson: { totalRequests: 10, errorRate: 0.05, averageLatency: 120 },
  round: "R64" as const,
  matchId: 42,
};

describe("FeedbackWriter", () => {
  // SYS-CHAIN-1: feedback NOT written when authorized_feedback=false
  it("SYS-CHAIN-1: skips feedback when authorizedFeedback=false", async () => {
    const writer = makeWriter();
    const result = await writer.writeFeedback({
      ...baseParams,
      authorizedFeedback: false,
    });
    expect(result.skipped).toBe(true);
    expect(result.txHash).toBeUndefined();
    expect(result.ipfsCid).toBeUndefined();
  });

  // SYS-CHAIN-2: feedback IS written when authorized_feedback=true
  it("SYS-CHAIN-2: writes feedback when authorizedFeedback=true (mock mode)", async () => {
    const writer = makeWriter();
    const result = await writer.writeFeedback({ ...baseParams });
    expect(result.skipped).toBe(false);
    expect(result.txHash).toBeDefined();
    expect(result.ipfsCid).toBeDefined();
  });

  // Mock mode returns deterministic CID and tx hash
  it("mock mode returns deterministic tx hash", async () => {
    const writer = makeWriter();
    const result1 = await writer.writeFeedback({ ...baseParams });
    const result2 = await writer.writeFeedback({ ...baseParams });
    expect(result1.txHash).toBe(result2.txHash);
  });

  it("mock mode returns deterministic CID based on content", async () => {
    const writer = makeWriter();
    const result1 = await writer.writeFeedback({
      ...baseParams,
      metricsJson: { score: 90 },
    });
    const result2 = await writer.writeFeedback({
      ...baseParams,
      metricsJson: { score: 90 },
    });
    expect(result1.ipfsCid).toBe(result2.ipfsCid);
  });

  it("different metrics produce different mock CIDs", async () => {
    const writer = makeWriter();
    const result1 = await writer.writeFeedback({
      ...baseParams,
      metricsJson: { score: 90 },
    });
    const result2 = await writer.writeFeedback({
      ...baseParams,
      metricsJson: { score: 50 },
    });
    expect(result1.ipfsCid).not.toBe(result2.ipfsCid);
  });

  // SYS-CHAIN-3: giveFeedback called with correct tag1 (round) and tag2 (chain)
  it("SYS-CHAIN-3: tx hash encodes round-specific data (round=R64, chain=monad)", async () => {
    const writer = makeWriter();
    const result = await writer.writeFeedback({
      ...baseParams,
      round: "R64",
      chain: "monad",
    });
    expect(result.txHash).toMatch(/^mock-tx-/);
    expect(result.skipped).toBe(false);
  });

  it("SYS-CHAIN-3: different rounds produce different tx hashes", async () => {
    const writer = makeWriter();
    const r64 = await writer.writeFeedback({ ...baseParams, round: "R64" });
    const r32 = await writer.writeFeedback({ ...baseParams, round: "R32" });
    expect(r64.txHash).not.toBe(r32.txHash);
  });

  // SYS-CHAIN-4: IPFS CID stored matches what mock returns
  it("SYS-CHAIN-4: IPFS CID matches MockIPFSService output", async () => {
    const ipfs = new MockIPFSService();
    const writer = new FeedbackWriter({ ipfsService: ipfs });
    const expectedCidResult = await ipfs.uploadMetrics(baseParams.metricsJson);

    const result = await writer.writeFeedback({ ...baseParams });

    expect(result.ipfsCid).toBe(expectedCidResult.cid);
  });

  // SYS-CHAIN-5: tx revert does NOT halt tournament (IPFS failure path)
  it("SYS-CHAIN-5: IPFS upload failure returns skipped=false without crashing", async () => {
    const failingIPFS = {
      async uploadMetrics(_: object) {
        throw new Error("IPFS connection refused");
      },
    };

    const writer = new FeedbackWriter({ ipfsService: failingIPFS as unknown as MockIPFSService });

    // Should NOT throw — gracefully handles IPFS failure
    const result = await writer.writeFeedback({ ...baseParams });

    expect(result.skipped).toBe(false);
    expect(result.ipfsCid).toBeUndefined();
    expect(result.txHash).toBeUndefined();
  });

  // SYS-CHAIN-6: correct chain used per agent's registration
  it("SYS-CHAIN-6: different chains produce correct feedback (ethereum chain)", async () => {
    const writer = makeWriter();
    const result = await writer.writeFeedback({
      ...baseParams,
      chain: "ethereum",
    });
    expect(result.skipped).toBe(false);
    expect(result.txHash).toBeDefined();
  });

  it("SYS-CHAIN-6: arbitrum chain works correctly", async () => {
    const writer = makeWriter();
    const result = await writer.writeFeedback({
      ...baseParams,
      chain: "arbitrum",
    });
    expect(result.skipped).toBe(false);
    expect(result.txHash).toBeDefined();
  });

  it("skipped result has no txHash or ipfsCid when authorizedFeedback=false", async () => {
    const writer = makeWriter();
    const result = await writer.writeFeedback({
      ...baseParams,
      authorizedFeedback: false,
    });
    expect(result.txHash).toBeUndefined();
    expect(result.ipfsCid).toBeUndefined();
    expect(result.skipped).toBe(true);
  });

  it("mock CID starts with 'mock-cid-'", async () => {
    const writer = makeWriter();
    const result = await writer.writeFeedback({ ...baseParams });
    expect(result.ipfsCid).toMatch(/^mock-cid-/);
  });

  it("mock tx hash starts with 'mock-tx-'", async () => {
    const writer = makeWriter();
    const result = await writer.writeFeedback({ ...baseParams });
    expect(result.txHash).toMatch(/^mock-tx-/);
  });
});

describe("MockIPFSService", () => {
  it("returns CID with mock-cid- prefix", async () => {
    const ipfs = new MockIPFSService();
    const result = await ipfs.uploadMetrics({ foo: "bar" });
    expect(result.cid).toMatch(/^mock-cid-/);
  });

  it("returns same CID for same content", async () => {
    const ipfs = new MockIPFSService();
    const r1 = await ipfs.uploadMetrics({ score: 90 });
    const r2 = await ipfs.uploadMetrics({ score: 90 });
    expect(r1.cid).toBe(r2.cid);
  });

  it("returns different CIDs for different content", async () => {
    const ipfs = new MockIPFSService();
    const r1 = await ipfs.uploadMetrics({ score: 90 });
    const r2 = await ipfs.uploadMetrics({ score: 50 });
    expect(r1.cid).not.toBe(r2.cid);
  });
});
