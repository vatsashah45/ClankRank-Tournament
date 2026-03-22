import type { SandboxInstance } from "@clankrank/shared";

/**
 * SandboxPool — Semaphore-based resource pool for sandbox instances.
 *
 * Limits concurrent sandbox runs to maxConcurrent (default 32).
 * Callers must acquire() a slot before provisioning and release() after destroy.
 */
export class SandboxPool {
  private maxConcurrent: number;
  private active: number;
  private waitQueue: Array<() => void>;
  private activeInstances: Set<string>;

  constructor(maxConcurrent = 32) {
    this.maxConcurrent = maxConcurrent;
    this.active = 0;
    this.waitQueue = [];
    this.activeInstances = new Set();
  }

  /**
   * Acquire a slot. Resolves immediately if under limit, otherwise waits.
   */
  acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }
    // Queue the caller
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Release a slot and optionally unregister an instance.
   * Wakes the next waiter if any.
   */
  release(instanceId?: string): void {
    if (instanceId) {
      this.activeInstances.delete(instanceId);
    }
    const next = this.waitQueue.shift();
    if (next) {
      // Give slot to next waiter without changing active count
      next();
    } else {
      this.active = Math.max(0, this.active - 1);
    }
  }

  /**
   * Register a live sandbox instance for tracking.
   */
  registerInstance(instance: SandboxInstance): void {
    this.activeInstances.add(instance.instanceId);
  }

  /**
   * Returns the number of currently active slots.
   */
  getActiveCount(): number {
    return this.active;
  }

  /**
   * Returns tracked live instance IDs.
   */
  getActiveInstances(): string[] {
    return Array.from(this.activeInstances);
  }
}
