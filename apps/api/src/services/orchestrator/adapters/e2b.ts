import type { SandboxAdapter } from "./types.js";
import type { SandboxConfig, SandboxInstance, SandboxRunResult } from "@clankrank/shared";

/**
 * E2BAdapter — stub for E2B (e2b.dev) sandbox runtime.
 *
 * Install `@e2b/sdk` and implement when E2B credentials are available.
 * Set SANDBOX_RUNTIME=e2b to use.
 */
export class E2BAdapter implements SandboxAdapter {
  async provision(_agentId: string, _config: SandboxConfig): Promise<SandboxInstance> {
    throw new Error(
      "E2BAdapter not implemented. " +
        "Install @e2b/sdk, set E2B_API_KEY, and implement provision(). " +
        "Use SANDBOX_RUNTIME=mock for local development.",
    );
  }

  async execute(
    _instance: SandboxInstance,
    _middlewareUrl: string,
  ): Promise<SandboxRunResult> {
    throw new Error(
      "E2BAdapter not implemented. " +
        "See provision() for setup instructions.",
    );
  }

  async destroy(_instance: SandboxInstance): Promise<void> {
    throw new Error("E2BAdapter not implemented.");
  }
}
