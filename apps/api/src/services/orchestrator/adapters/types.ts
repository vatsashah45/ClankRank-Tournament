import type { SandboxConfig, SandboxInstance, SandboxRunResult } from "@agent-madness/shared";

/**
 * SandboxAdapter — abstraction over sandbox execution environments.
 *
 * Implementations: MockAdapter (local), E2BAdapter, DaytonaAdapter.
 * Selected via SANDBOX_RUNTIME env var: "e2b" | "daytona" | "mock"
 */
export interface SandboxAdapter {
  /**
   * Provision a new sandbox instance for the given agent.
   */
  provision(agentId: string, config: SandboxConfig): Promise<SandboxInstance>;

  /**
   * Execute the agent inside the sandbox, hitting the middleware harness URL.
   * Returns collected metrics and run result.
   */
  execute(instance: SandboxInstance, middlewareUrl: string): Promise<SandboxRunResult>;

  /**
   * Destroy and clean up the sandbox instance.
   */
  destroy(instance: SandboxInstance): Promise<void>;
}
