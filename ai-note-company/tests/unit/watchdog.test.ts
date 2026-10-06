import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Agent } from "../../src/agents/base";
import { makeCompany, type TestCompany } from "../helpers/company";
import { customRunner } from "../helpers/runner";

let t: TestCompany;
afterEach(() => t?.cleanup());

const hanging = (): Agent => ({ name: "writer", handle: () => new Promise(() => undefined) });

test("watchdog: heartbeat timeout aborts the hung agent, retries the task and restarts the agent", async () => {
  t = makeCompany({ AGENT_TIMEOUT_MINUTES: "30", HEARTBEAT_INTERVAL_SECONDS: "60" });
  const { runner, watchdog } = customRunner(t.c, { writer: hanging });
  const task = t.c.tasks.create({ agent: "writer", type: "writing", input: {} });
  const running = runner.run(task);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(t.c.heartbeats.get("writer")?.status, "running");

  // Heartbeat fresh → nothing happens.
  assert.equal((await watchdog.check()).length, 0);

  // 31 minutes later with no heartbeat → recovery.
  const actions = await watchdog.check(new Date(Date.now() + 31 * 60_000));
  assert.equal(actions.length, 1);
  assert.equal(actions[0].outcome, "retrying");
  assert.equal(actions[0].task_status_before, "RUNNING");
  const after = await running; // aborted run resolves instead of hanging forever
  assert.equal(after.status, "RETRYING");
  assert.equal(t.c.tasks.require(task.task_id).retry_count, 1);
  assert.equal(t.c.heartbeats.get("writer")?.restarts, 1);
  assert.ok(t.c.repo.listEvents().some((e) => e.type === "agent.restarted"));
});

test("watchdog: gives up after MAX_RETRIES → FAILED, reports to supervisor and notifies human", async () => {
  t = makeCompany({ MAX_RETRIES: "2" });
  const { runner, watchdog } = customRunner(t.c, { writer: hanging });
  const task = t.c.tasks.create({ agent: "writer", type: "writing", input: {} });
  let last;
  for (let i = 0; i < 5; i++) {
    const cur = t.c.tasks.require(task.task_id);
    if (!["PENDING", "RETRYING"].includes(cur.status)) break;
    const p = runner.run(cur);
    await new Promise((r) => setTimeout(r, 10));
    last = await watchdog.check(new Date(Date.now() + 31 * 60_000));
    await p;
  }
  assert.equal(t.c.tasks.require(task.task_id).status, "FAILED");
  assert.equal(last![0].outcome, "failed");
  assert.ok(t.c.repo.listEvents({ level: "error" }).some((e) => e.type === "watchdog.failed"));
  assert.ok(t.channel.sent.some((s) => s.includes("[NOTE ERROR]") && s.includes("Watchdog")));
});

test("watchdog: tasks left RUNNING by a crashed process are recovered on restart", async () => {
  t = makeCompany();
  const task = t.c.tasks.create({ agent: "writer", type: "writing", input: {} });
  t.c.tasks.start(task.task_id); // simulate crash: RUNNING but nobody working on it
  const actions = await t.c.watchdog.recoverAfterRestart();
  assert.equal(actions.length, 1);
  assert.equal(t.c.tasks.require(task.task_id).status, "RETRYING");
});
