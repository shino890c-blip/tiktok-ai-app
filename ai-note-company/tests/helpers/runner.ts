import type { Agent } from "../../src/agents/base";
import type { Company } from "../../src/company";
import { AgentRunner } from "../../src/core/runner";
import { Watchdog } from "../../src/core/watchdog/watchdog";
import type { AgentName } from "../../src/types";

/** Runner + watchdog wired to a test company but with custom agents. */
export function customRunner(c: Company, factories: Partial<Record<AgentName, () => Agent>>) {
  const runner = new AgentRunner(
    { config: c.config, tasks: c.tasks, heartbeats: c.heartbeats, pipeline: c.pipeline, notifier: c.notifier, events: c.events, logger: c.logger },
    factories,
  );
  const watchdog = new Watchdog(c.config, c.repo, c.tasks, c.heartbeats, runner, c.notifier, c.events);
  return { runner, watchdog };
}
