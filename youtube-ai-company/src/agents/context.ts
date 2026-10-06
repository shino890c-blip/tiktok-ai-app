import type { AppConfig } from "../config/index.js";
import type { ArtifactStore } from "../core/artifacts.js";
import type { ApprovalService } from "../core/approvals.js";
import type { Clock } from "../core/clock.js";
import type { EventBus } from "../core/event-bus/index.js";
import type { StateManager } from "../core/state-manager/index.js";
import type { TaskManager } from "../core/task-manager/index.js";
import type { Repositories } from "../database/repositories.js";
import type { ExperimentManager } from "../experiments/index.js";
import type { KnowledgeBase } from "../knowledge/index.js";
import type { LLMProvider, PromptLoader } from "../llm/index.js";
import type { Logger } from "../logging/logger.js";
import type { NotificationService } from "../notifications/index.js";
import type { YouTubeProvider } from "../youtube/index.js";

/** Dependency-injection container shared by agents and core services. */
export interface AgentContext {
  config: AppConfig;
  clock: Clock;
  repos: Repositories;
  logger: Logger;
  bus: EventBus;
  tasks: TaskManager;
  state: StateManager;
  approvals: ApprovalService;
  llm: LLMProvider;
  youtube: YouTubeProvider;
  notifier: NotificationService;
  knowledge: KnowledgeBase;
  experiments: ExperimentManager;
  artifacts: ArtifactStore;
  prompts: PromptLoader;
}
