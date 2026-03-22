import { config } from "../config.js";

/**
 * Sandbox API client — runs qualification tests against agents.
 * In mock mode, simulates the 70/20/10 response distribution.
 */

export interface SandboxResponse {
  status: number;
  body: unknown;
  latencyMs: number;
}

export class SandboxService {
  private baseUrl: string;
  private isMock: boolean;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? config.sandboxApiUrl;
    this.isMock = this.baseUrl === "mock";
  }

  /**
   * Make a single request to the sandbox endpoint.
   * EP-3: GET {SANDBOX_API}/sandbox/api/data
   */
  async makeRequest(agentId: string): Promise<SandboxResponse> {
    const start = performance.now();

    if (this.isMock) {
      return this.mockRequest(start);
    }

    try {
      const res = await fetch(`${this.baseUrl}/sandbox/api/data`, {
        headers: { "x-agent-id": agentId },
        signal: AbortSignal.timeout(15_000),
      });

      const latencyMs = performance.now() - start;
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // Non-JSON response — that's fine, we track the status
      }

      return { status: res.status, body, latencyMs };
    } catch (err) {
      const latencyMs = performance.now() - start;
      if (err instanceof Error && err.name === "TimeoutError") {
        return { status: 0, body: null, latencyMs };
      }
      throw err;
    }
  }

  private mockRequest(startTime: number): SandboxResponse {
    // Simulate 70% 200, 20% 429, 10% 500
    const roll = Math.random();
    const latency = 50 + Math.random() * 200; // 50–250ms simulated

    if (roll < 0.7) {
      return {
        status: 200,
        body: { data: { value: Math.random(), timestamp: Date.now() } },
        latencyMs: latency,
      };
    } else if (roll < 0.9) {
      return {
        status: 429,
        body: { error: "Rate limited" },
        latencyMs: latency * 0.5,
      };
    } else {
      return {
        status: 500,
        body: { error: "Internal server error" },
        latencyMs: latency * 0.3,
      };
    }
  }
}
