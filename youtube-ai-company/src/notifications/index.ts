import type { AppConfig } from "../config/index.js";
import type { Logger } from "../logging/logger.js";

export type NotificationLevel = "INFO" | "WARN" | "ERROR" | "CRITICAL";

export interface Notification {
  level: NotificationLevel;
  title: string;
  agent?: string | null;
  taskId?: string | null;
  error?: string | null;
  retry?: string | null;
  action?: string | null;
  details?: Record<string, unknown>;
}

export interface NotificationChannel {
  readonly name: string;
  send(notification: Notification, formatted: string): Promise<void>;
}

/** Formats a notification. CRITICAL uses the fixed operator format. */
export function formatNotification(n: Notification): string {
  const lines = [`[${n.level}] ${n.title}`];
  if (n.level === "CRITICAL" || n.level === "ERROR") {
    lines.push(`Agent：${n.agent ?? "-"}`);
    lines.push(`Task：${n.taskId ?? "-"}`);
    lines.push(`Error：${n.error ?? "-"}`);
    lines.push(`Retry：${n.retry ?? "-"}`);
    lines.push(`Action：${n.action ?? "-"}`);
  } else {
    if (n.agent) lines.push(`Agent：${n.agent}`);
    if (n.taskId) lines.push(`Task：${n.taskId}`);
    if (n.action) lines.push(`Action：${n.action}`);
  }
  return lines.join("\n");
}

export class ConsoleChannel implements NotificationChannel {
  readonly name = "console";
  async send(n: Notification, formatted: string): Promise<void> {
    const stream = n.level === "CRITICAL" || n.level === "ERROR" ? process.stderr : process.stdout;
    stream.write(`\n🔔 ${formatted.replace(/\n/g, "\n   ")}\n\n`);
  }
}

/** Generic JSON webhook (Discord: {content}, Slack: {text}). */
export class WebhookChannel implements NotificationChannel {
  constructor(
    readonly name: string,
    private readonly url: string,
    private readonly bodyKey: "content" | "text",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  async send(_n: Notification, formatted: string): Promise<void> {
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [this.bodyKey]: formatted.slice(0, 1900) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`${this.name} webhook responded ${res.status}`);
  }
}

/** Collects notifications in memory (tests, dashboard). */
export class MemoryChannel implements NotificationChannel {
  readonly name = "memory";
  readonly sent: Notification[] = [];
  async send(n: Notification): Promise<void> {
    this.sent.push(n);
  }
}

export interface NotificationService {
  notify(n: Notification): Promise<void>;
  readonly recent: Notification[];
}

export class MultiChannelNotificationService implements NotificationService {
  readonly recent: Notification[] = [];
  constructor(
    private readonly channels: NotificationChannel[],
    private readonly logger: Logger,
    private readonly minLevel: NotificationLevel = "INFO",
  ) {}

  async notify(n: Notification): Promise<void> {
    const order: Record<NotificationLevel, number> = { INFO: 0, WARN: 1, ERROR: 2, CRITICAL: 3 };
    this.recent.push(n);
    if (this.recent.length > 100) this.recent.shift();
    const logFn = n.level === "CRITICAL" ? "critical" : n.level === "ERROR" ? "error" : n.level === "WARN" ? "warn" : "info";
    this.logger[logFn]("notification.sent", n.title, {
      agent: n.agent ?? undefined,
      task_id: n.taskId ?? undefined,
      error: n.error,
      action: n.action,
    });
    if (order[n.level] < order[this.minLevel]) return;
    const formatted = formatNotification(n);
    await Promise.all(
      this.channels.map(async (ch) => {
        try {
          await ch.send(n, formatted);
        } catch (err) {
          // A broken notification channel must never crash the pipeline.
          this.logger.error("notification.channel_failed", `Channel ${ch.name} failed`, { error: String(err) });
        }
      }),
    );
  }
}

export function createNotificationService(config: AppConfig, logger: Logger, extra: NotificationChannel[] = []): NotificationService {
  const channels: NotificationChannel[] = [...extra];
  for (const name of config.notifications.channels) {
    if (name === "console") channels.push(new ConsoleChannel());
    else if (name === "discord" && config.notifications.discordWebhookUrl)
      channels.push(new WebhookChannel("discord", config.notifications.discordWebhookUrl, "content"));
    else if (name === "slack" && config.notifications.slackWebhookUrl)
      channels.push(new WebhookChannel("slack", config.notifications.slackWebhookUrl, "text"));
    else if (name !== "none") logger.warn("notification.channel_unconfigured", `Notification channel "${name}" is not configured`);
  }
  return new MultiChannelNotificationService(channels, logger, "INFO");
}
