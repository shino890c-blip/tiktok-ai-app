import { AnalystAgent } from "../agents/analyst/index.js";
import type { BaseAgent } from "../agents/base-agent.js";
import type { AgentContext } from "../agents/context.js";
import { PublisherAgent } from "../agents/publisher/index.js";
import { ResearcherAgent } from "../agents/researcher/index.js";
import { ScriptWriterAgent } from "../agents/scriptwriter/index.js";
import { SupervisorAgent } from "../agents/supervisor/agent.js";
import { Supervisor } from "../agents/supervisor/orchestrator.js";
import type { AppConfig } from "../config/index.js";
import { openDatabase, type SqlDatabase } from "../database/connection.js";
import { createRepositories } from "../database/repositories.js";
import { migrate } from "../database/schema.js";
import { ExperimentManager } from "../experiments/index.js";
import { KnowledgeBase } from "../knowledge/index.js";
import { createLLMProvider, PromptLoader, type LLMProvider } from "../llm/index.js";
import { DatabaseEventSink } from "../logging/db-sink.js";
import { ConsoleSink, createLogger, FileSink, type Logger, type LogSink } from "../logging/logger.js";
import { createNotificationService, type NotificationChannel, type NotificationService } from "../notifications/index.js";
import { createYouTubeProvider, type YouTubeProvider } from "../youtube/index.js";
import { ApprovalService } from "./approvals.js";
import { ArtifactStore } from "./artifacts.js";
import { systemClock, type Clock } from "./clock.js";
import { EventBus } from "./event-bus/index.js";
import { Scheduler } from "./scheduler/index.js";
import { StateManager } from "./state-manager/index.js";
import { TaskManager } from "./task-manager/index.js";
import { Watchdog } from "./watchdog/index.js";
import { Worker } from "./worker.js";

export interface CompanyOverrides {
  clock?: Clock;
  db?: SqlDatabase;
  llm?: LLMProvider;
  youtube?: YouTubeProvider;
  notifier?: NotificationService;
  extraNotificationChannels?: NotificationChannel[];
  logSinks?: LogSink[];
}

export interface Company {
  ctx: AgentContext;
  agents: BaseAgent[];
  supervisor: Supervisor;
  watchdog: Watchdog;
  worker: Worker;
  scheduler: Scheduler;
  /** Starts the long-running loops (worker poll, watchdog, supervisor). */
  start(opts?: { worker?: boolean; supervisor?: boolean; watchdog?: boolean }): void;
  stop(): Promise<void>;
}

/** Composition root: wires every dependency explicitly (DI), so tests can swap any part. */
export async function createCompany(config: AppConfig, overrides: CompanyOverrides = {}): Promise<Company> {
  const clock = overrides.clock ?? systemClock;
  const sinks: LogSink[] = overrides.logSinks ?? [new ConsoleSink(), ...(config.logToFile ? [new FileSink(config.logDir)] : [])];
  const logger: Logger = createLogger({ minLevel: config.logLevel, sinks, clock });

  const db = overrides.db ?? openDatabase(config.databaseUrl);
  await migrate(db, clock.now().toISOString());
  const repos = createRepositories(db, clock);
  const dbSink = new DatabaseEventSink(repos);
  logger.addSink(dbSink);

  const bus = new EventBus((event, err) => logger.error("eventbus.handler_error", `Handler for ${event} failed`, { error: String(err) }));
  const notifier = overrides.notifier ?? createNotificationService(config, logger, overrides.extraNotificationChannels);
  const tasks = new TaskManager(repos, bus, clock, logger, { maxRetries: config.pipeline.maxRetries, retryBaseDelayMs: config.pipeline.retryBaseDelayMs });
  const state = new StateManager(repos, bus, clock);
  const artifacts = new ArtifactStore(config.dataDir);
  const ctx: AgentContext = {
    config,
    clock,
    repos,
    logger,
    bus,
    tasks,
    state,
    approvals: new ApprovalService(repos, tasks, bus, notifier, clock, logger),
    llm: overrides.llm ?? createLLMProvider(config),
    youtube: overrides.youtube ?? createYouTubeProvider(config, { repos, clock, logger }),
    notifier,
    knowledge: new KnowledgeBase(repos, artifacts),
    experiments: new ExperimentManager(repos, clock, config.pipeline.experimentMinSamples),
    artifacts,
    prompts: new PromptLoader(config.promptsDir),
  };

  await state.registerAll();
  await ctx.experiments.seedDefaults();

  const agents: BaseAgent[] = [
    new ResearcherAgent(ctx),
    new ScriptWriterAgent(ctx),
    new PublisherAgent(ctx),
    new AnalystAgent(ctx),
    new SupervisorAgent(ctx),
  ];
  const supervisor = new Supervisor(ctx);
  supervisor.attach();
  const watchdog = new Watchdog({ config, repos, tasks, state, bus, notifier, clock, logger });
  const worker = new Worker(agents, { tasks, bus, logger, notifier });
  const scheduler = new Scheduler(logger);

  let stopped = false;
  const company: Company = {
    ctx,
    agents,
    supervisor,
    watchdog,
    worker,
    scheduler,
    start(opts = {}) {
      const { worker: w = true, supervisor: s = true, watchdog: wd = true } = opts;
      if (w) scheduler.every("worker", config.pipeline.workerPollIntervalMs, async () => worker.poll(), { runImmediately: true });
      if (wd) scheduler.every("watchdog", config.pipeline.watchdogIntervalSeconds * 1000, async () => void (await watchdog.check()));
      if (s) scheduler.every("supervisor", config.pipeline.supervisorIntervalSeconds * 1000, async () => void (await supervisor.tick()), { runImmediately: true });
      logger.info("company.started", "AI YouTube company is running", { worker: w, supervisor: s, watchdog: wd, mock: config.mockMode });
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      await scheduler.stop();
      await worker.drain();
      await bus.drain();
      supervisor.detach();
      for (const a of await repos.agents.list()) {
        if (a.status === "running") await repos.agents.update(a.name, { status: "stopped" });
      }
      dbSink.disable();
      await db.close();
    },
  };
  bus.on("system.halt", ({ reason }) => {
    logger.critical("company.halt", `Halting company: ${reason}`);
    void scheduler.stop();
  });
  return company;
}
