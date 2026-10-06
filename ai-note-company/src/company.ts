import fs from "node:fs";
import type { AgentContext } from "./agents/base";
import { AnalyticsAgent } from "./agents/analytics/analyticsAgent";
import { PublisherAgent } from "./agents/publisher/publisherAgent";
import { QualityAgent } from "./agents/quality/qualityAgent";
import { Researcher } from "./agents/researcher/researcher";
import type { TrendSource } from "./agents/researcher/sources";
import { Strategist } from "./agents/strategist/strategist";
import { KnowledgeAgent, Supervisor } from "./agents/supervisor/supervisor";
import { Writer } from "./agents/writer/writer";
import { createMetricsCollector, type MetricsCollector } from "./analytics/collectors";
import { loadConfig, type AppConfig } from "./config";
import { ApprovalService } from "./core/approvals";
import { EventBus } from "./core/events/eventBus";
import { Pipeline } from "./core/pipeline";
import { AgentRunner } from "./core/runner";
import { TaskManager } from "./core/tasks/taskManager";
import { HeartbeatRegistry } from "./core/watchdog/heartbeat";
import { Watchdog } from "./core/watchdog/watchdog";
import { openDatabase, type Db } from "./database/db";
import { Repository } from "./database/repositories";
import type { ImageProvider } from "./images";
import { KnowledgeBase } from "./knowledge/knowledgeBase";
import { createLlm, type LlmProvider } from "./llm";
import { Logger } from "./logger";
import { createNotePublisher, type NotePublisher } from "./note/publisher";
import { ConsoleChannel, createNotificationService, NotificationService, type NotificationChannel } from "./notifications/notificationService";

export interface CompanyOverrides {
  llm?: LlmProvider;
  publisher?: NotePublisher;
  collector?: MetricsCollector;
  notificationChannel?: NotificationChannel;
  sources?: TrendSource[];
  images?: ImageProvider;
  retryBackoffSeconds?: number;
  quiet?: boolean;
}

/** Dependency container: one instance = one AI Note Company. */
export class Company {
  readonly db: Db;
  readonly repo: Repository;
  readonly events: EventBus;
  readonly tasks: TaskManager;
  readonly heartbeats: HeartbeatRegistry;
  readonly notifier: NotificationService;
  readonly llm: LlmProvider;
  readonly publisher: NotePublisher;
  readonly pipeline: Pipeline;
  readonly runner: AgentRunner;
  readonly watchdog: Watchdog;
  readonly supervisor: Supervisor;
  readonly approvals: ApprovalService;
  readonly knowledge: KnowledgeBase;
  readonly logger: Logger;

  constructor(readonly config: AppConfig, o: CompanyOverrides = {}) {
    for (const d of [config.dataDir, config.logDir]) fs.mkdirSync(d, { recursive: true });
    Logger.configure(config.logDir, { quiet: o.quiet });
    this.logger = new Logger("company");
    this.db = openDatabase(config.databasePath);
    this.repo = new Repository(this.db);
    this.events = new EventBus(this.repo);
    this.tasks = new TaskManager(this.db, { maxRetries: config.maxRetries, retryBackoffSeconds: o.retryBackoffSeconds }, this.events);
    this.heartbeats = new HeartbeatRegistry(this.db);
    this.notifier = o.notificationChannel ? new NotificationService(o.notificationChannel, this.events) : createNotificationService(config, this.events, o.quiet);
    this.llm = o.llm ?? createLlm(config);
    this.publisher = o.publisher ?? createNotePublisher(config, this.logger.child("note"));
    this.knowledge = new KnowledgeBase(this.repo);
    const collector = o.collector ?? createMetricsCollector(config);

    const ctx = (name: string): AgentContext => ({
      config,
      repo: this.repo,
      llm: this.llm,
      events: this.events,
      heartbeats: this.heartbeats,
      logger: this.logger.child(name),
    });

    this.pipeline = new Pipeline(config, this.tasks, this.repo, this.notifier, this.events);
    this.runner = new AgentRunner(
      { config, tasks: this.tasks, heartbeats: this.heartbeats, pipeline: this.pipeline, notifier: this.notifier, events: this.events, logger: this.logger },
      {
        researcher: () => new Researcher(ctx("researcher"), o.sources),
        strategist: () => new Strategist(ctx("strategist")),
        writer: () => new Writer(ctx("writer"), o.images),
        quality: () => new QualityAgent(ctx("quality")),
        publisher: () => new PublisherAgent(ctx("publisher"), this.publisher, this.notifier),
        analytics: () => new AnalyticsAgent(ctx("analytics"), collector),
        supervisor: () => new KnowledgeAgent(ctx("supervisor")),
      },
    );
    this.watchdog = new Watchdog(config, this.repo, this.tasks, this.heartbeats, this.runner, this.notifier, this.events);
    this.supervisor = new Supervisor(config, this.repo, this.tasks, this.heartbeats, this.runner, this.watchdog, this.events, this.logger.child("supervisor"));
    this.approvals = new ApprovalService(config, this.repo, this.tasks, this.events);
  }

  close(): void {
    this.supervisor.stop();
    this.db.close();
  }
}

export function createCompany(config: AppConfig = loadConfig(), overrides: CompanyOverrides = {}): Company {
  return new Company(config, overrides);
}

export { ConsoleChannel };
