import crypto from "node:crypto";

/**
 * IPFSService — uploads metrics JSON to IPFS and returns a CID.
 *
 * In mock mode (no IPFS_API_KEY + IPFS_API_SECRET) returns a deterministic
 * mock CID derived from the content hash.
 */
export interface IPFSService {
  uploadMetrics(metricsJson: object): Promise<{ cid: string }>;
}

export class MockIPFSService implements IPFSService {
  async uploadMetrics(metricsJson: object): Promise<{ cid: string }> {
    const content = JSON.stringify(metricsJson);
    const hash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
    return { cid: `mock-cid-${hash}` };
  }
}

export class PinataIPFSService implements IPFSService {
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  async uploadMetrics(metricsJson: object): Promise<{ cid: string }> {
    const body = JSON.stringify({
      pinataContent: metricsJson,
      pinataMetadata: { name: "match-metrics" },
    });

    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: this.apiKey,
        pinata_secret_api_key: this.apiSecret,
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`Pinata upload failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { IpfsHash: string };
    return { cid: data.IpfsHash };
  }
}

/**
 * createIPFSService — factory that returns mock when env vars are missing.
 */
export function createIPFSService(): IPFSService {
  const apiKey = process.env.IPFS_API_KEY;
  const apiSecret = process.env.IPFS_API_SECRET;

  if (!apiKey || !apiSecret) {
    return new MockIPFSService();
  }

  return new PinataIPFSService(apiKey, apiSecret);
}
