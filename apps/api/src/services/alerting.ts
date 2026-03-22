import { config } from "../config.js";

/**
 * sendAlert — sends alerts to console, Slack (if configured), and PagerDuty placeholder.
 */
export async function sendAlert(
  severity: "info" | "warning" | "critical",
  message: string,
  context?: Record<string, unknown>,
): Promise<void> {
  console.log(`[ALERT:${severity}] ${message}`, context ?? "");

  // Slack webhook (placeholder — fires if URL configured)
  if (config.alertSlackWebhook) {
    try {
      await fetch(config.alertSlackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `[${severity.toUpperCase()}] ${message}`,
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: `*[${severity.toUpperCase()}]* ${message}` },
            },
            ...(context
              ? [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `\`\`\`${JSON.stringify(context, null, 2)}\`\`\``,
                    },
                  },
                ]
              : []),
          ],
        }),
      });
    } catch {
      /* non-critical — do not throw */
    }
  }

  // PagerDuty (placeholder — fires if key configured and severity is critical)
  if (config.alertPagerDutyKey && severity === "critical") {
    // Placeholder: PagerDuty Events API v2
    console.log("[PAGERDUTY] Would send critical alert:", message);
  }
}

/**
 * pingUptime — pings the configured uptime monitor URL.
 */
export async function pingUptime(): Promise<void> {
  if (config.uptimePingUrl) {
    try {
      await fetch(config.uptimePingUrl, { method: "GET" });
    } catch {
      /* non-critical */
    }
  }
}
