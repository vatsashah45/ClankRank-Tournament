import type { SandboxAdapter } from "./types.js";
import type { SandboxConfig, SandboxInstance, SandboxRunResult } from "@agent-madness/shared";

/**
 * DaytonaAdapter — stub for Daytona sandbox runtime.
 *
 * Install `@daytonaio/sdk` and implement when Daytona credentials are available.
 * Set SANDBOX_RUNTIME=daytona to use.
 */
export class DaytonaAdapter implements SandboxAdapter {
  async provision(_agentId: string, _config: SandboxConfig): Promise<SandboxInstance> {
    throw new Error(
      "DaytonaAdapter not implemented. " +
        "Install @daytonaio/sdk, set DAYTONA_API_KEY, and implement provision(). " +
        "Use SANDBOX_RUNTIME=mock for local development.",
    );
  }

  async execute(
    _instance: SandboxInstance,
    _middlewareUrl: string,
  ): Promise<SandboxRunResult> {
    throw new Error(
      "DaytonaAdapter not implemented. " +
        "See provision() for setup instructions.",
    );
  }

  async destroy(_instance: SandboxInstance): Promise<void> {
    throw new Error("DaytonaAdapter not implemented.");
  }
}
