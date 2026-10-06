import type { AppConfig } from "../config";
import type { Repository } from "../database/repositories";
import type { EventBus } from "../core/events/eventBus";
import type { HeartbeatRegistry } from "../core/watchdog/heartbeat";
import type { LlmProvider } from "../llm/provider";
import type { Logger } from "../logger";
import type { AgentName, Task } from "../types";

/** Shared dependencies handed to every agent. */
export interface AgentContext {
  config: AppConfig;
  repo: Repository;
  llm: LlmProvider;
  events: EventBus;
  heartbeats: HeartbeatRegistry;
  logger: Logger;
}

/** What an agent returns from a task. */
export type AgentResult =
  | { kind: "completed"; output: Record<string, unknown> }
  | { kind: "waiting_approval"; output: Record<string, unknown> }
  | { kind: "cancelled"; reason: string };

/** Errors that must not be retried (e.g. UI changed, auth missing, refused). */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

export interface Agent {
  readonly name: AgentName;
  handle(task: Task, signal: AbortSignal): Promise<AgentResult>;
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error(`Aborted: ${String(signal.reason ?? "watchdog")}`);
}
