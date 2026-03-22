/**
 * Simple Prometheus-compatible metrics collector.
 * No external dependencies — plain Prometheus exposition format.
 */

interface DurationSummary {
  sum: number;
  count: number;
}

interface MetricsState {
  /** http_requests_total{method,path,status} */
  httpRequestsTotal: Map<string, number>;
  /** http_request_duration_ms{method,path} — sum + count */
  httpRequestDurationMs: Map<string, DurationSummary>;
  /** sandbox_jobs_total{status} */
  sandboxJobsTotal: { enqueued: number; completed: number; failed: number; timedOut: number };
  /** sse_connections_active gauge */
  sseConnectionsActive: number;
  /** sse_connections_total counter */
  sseConnectionsTotal: number;
  /** tournament_state info gauge */
  tournamentState: string;
}

class PrometheusMetrics {
  private state: MetricsState;

  constructor() {
    this.state = {
      httpRequestsTotal: new Map(),
      httpRequestDurationMs: new Map(),
      sandboxJobsTotal: { enqueued: 0, completed: 0, failed: 0, timedOut: 0 },
      sseConnectionsActive: 0,
      sseConnectionsTotal: 0,
      tournamentState: "REGISTRATION",
    };
  }

  incHttpRequest(method: string, path: string, status: number): void {
    const key = `${method}|${path}|${status}`;
    this.state.httpRequestsTotal.set(
      key,
      (this.state.httpRequestsTotal.get(key) ?? 0) + 1,
    );
  }

  observeHttpDuration(method: string, path: string, durationMs: number): void {
    const key = `${method}|${path}`;
    const existing = this.state.httpRequestDurationMs.get(key) ?? { sum: 0, count: 0 };
    this.state.httpRequestDurationMs.set(key, {
      sum: existing.sum + durationMs,
      count: existing.count + 1,
    });
  }

  incSandboxJob(status: "enqueued" | "completed" | "failed" | "timedOut"): void {
    this.state.sandboxJobsTotal[status]++;
  }

  incSSEConnection(): void {
    this.state.sseConnectionsActive++;
    this.state.sseConnectionsTotal++;
  }

  decSSEConnection(): void {
    if (this.state.sseConnectionsActive > 0) {
      this.state.sseConnectionsActive--;
    }
  }

  setTournamentState(state: string): void {
    this.state.tournamentState = state;
  }

  serialize(): string {
    const lines: string[] = [];

    // http_requests_total
    lines.push("# HELP http_requests_total Total number of HTTP requests");
    lines.push("# TYPE http_requests_total counter");
    for (const [key, value] of this.state.httpRequestsTotal) {
      const [method, path, status] = key.split("|");
      lines.push(`http_requests_total{method="${method}",path="${path}",status="${status}"} ${value}`);
    }

    // http_request_duration_ms
    lines.push("# HELP http_request_duration_ms HTTP request duration in milliseconds");
    lines.push("# TYPE http_request_duration_ms summary");
    for (const [key, { sum, count }] of this.state.httpRequestDurationMs) {
      const [method, path] = key.split("|");
      lines.push(`http_request_duration_ms_sum{method="${method}",path="${path}"} ${sum}`);
      lines.push(`http_request_duration_ms_count{method="${method}",path="${path}"} ${count}`);
    }

    // sandbox_jobs_total
    lines.push("# HELP sandbox_jobs_total Total sandbox job count by status");
    lines.push("# TYPE sandbox_jobs_total counter");
    for (const [status, value] of Object.entries(this.state.sandboxJobsTotal)) {
      lines.push(`sandbox_jobs_total{status="${status}"} ${value}`);
    }

    // sse_connections_active
    lines.push("# HELP sse_connections_active Currently active SSE connections");
    lines.push("# TYPE sse_connections_active gauge");
    lines.push(`sse_connections_active ${this.state.sseConnectionsActive}`);

    // sse_connections_total
    lines.push("# HELP sse_connections_total Total SSE connections ever established");
    lines.push("# TYPE sse_connections_total counter");
    lines.push(`sse_connections_total ${this.state.sseConnectionsTotal}`);

    // tournament_state
    lines.push("# HELP tournament_state Current tournament state (info gauge)");
    lines.push("# TYPE tournament_state gauge");
    lines.push(`tournament_state{state="${this.state.tournamentState}"} 1`);

    return lines.join("\n") + "\n";
  }
}

export const metrics = new PrometheusMetrics();
