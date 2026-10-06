import type { AppConfig } from "../config";
import type { EventBus } from "../core/events/eventBus";

export type Notification =
  | { type: "APPROVAL_REQUIRED"; title: string; url: string | null; price: number; qualityScore: number | null; approvalId: string; dashboardUrl?: string }
  | { type: "PUBLISHED"; title: string; url: string; simulated: boolean }
  | { type: "DRAFT_SAVED"; title: string; url: string | null; simulated: boolean }
  | { type: "ERROR"; agent: string; task: string; error: string; retry: string }
  | { type: "INFO"; message: string };

export function formatNotification(n: Notification): string {
  switch (n.type) {
    case "APPROVAL_REQUIRED":
      return [
        "[NOTE APPROVAL REQUIRED]",
        `Title: ${n.title}`,
        `URL: ${n.url ?? "-"}`,
        `Price: ${n.price > 0 ? `${n.price}円` : "無料"}`,
        `Quality Score: ${n.qualityScore ?? "-"}`,
        `Approval ID: ${n.approvalId}`,
        n.dashboardUrl ? `Review: ${n.dashboardUrl}` : `Review: npm run approve -- --id ${n.approvalId} --action approve`,
      ].join("\n");
    case "PUBLISHED":
      return ["[NOTE PUBLISHED]" + (n.simulated ? " (MOCK)" : ""), `Title: ${n.title}`, `URL: ${n.url}`].join("\n");
    case "DRAFT_SAVED":
      return ["[NOTE DRAFT SAVED]" + (n.simulated ? " (MOCK)" : ""), `Title: ${n.title}`, `URL: ${n.url ?? "-"}`].join("\n");
    case "ERROR":
      return ["[NOTE ERROR]", `Agent: ${n.agent}`, `Task: ${n.task}`, `Error: ${n.error}`, `Retry: ${n.retry}`].join("\n");
    case "INFO":
      return `[NOTE INFO]\n${n.message}`;
  }
}

export interface NotificationChannel {
  readonly name: string;
  send(text: string, n: Notification): Promise<void>;
}

export class ConsoleChannel implements NotificationChannel {
  readonly name = "console";
  sent: string[] = [];
  constructor(private readonly quiet = false) {}
  async send(text: string): Promise<void> {
    this.sent.push(text);
    if (!this.quiet) console.log(`\n${"=".repeat(48)}\n${text}\n${"=".repeat(48)}\n`);
  }
}

/** Discord / Slack incoming webhooks (both accept a simple JSON text body). */
export class WebhookChannel implements NotificationChannel {
  constructor(readonly name: "discord" | "slack", private readonly url: string) {
    if (!url) throw new Error(`NOTIFICATION_WEBHOOK_URL is required for ${name}`);
  }
  async send(text: string): Promise<void> {
    const body = this.name === "discord" ? { content: text.slice(0, 1900) } : { text };
    const res = await fetch(this.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${this.name} webhook failed: HTTP ${res.status}`);
  }
}

/**
 * Sends human-facing notifications. Failures of the channel never break the
 * pipeline; they fall back to console and are recorded as system events.
 */
export class NotificationService {
  private readonly fallback = new ConsoleChannel();
  constructor(private readonly channel: NotificationChannel, private readonly events?: EventBus) {}

  get channelName(): string {
    return this.channel.name;
  }

  async notify(n: Notification): Promise<void> {
    const text = formatNotification(n);
    this.events?.system(n.type === "ERROR" ? "error" : "info", `notification.${n.type.toLowerCase()}`, text.split("\n").slice(0, 3).join(" | "));
    try {
      await this.channel.send(text, n);
    } catch (e) {
      this.events?.system("warn", "notification.failed", `${this.channel.name}: ${(e as Error).message}`);
      if (this.channel !== this.fallback) await this.fallback.send(text);
    }
  }
}

export function createNotificationService(config: AppConfig, events?: EventBus, quiet = false): NotificationService {
  const p = config.notification.provider;
  const channel = p === "console" ? new ConsoleChannel(quiet) : new WebhookChannel(p, config.notification.webhookUrl);
  return new NotificationService(channel, events);
}
