import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NonRetryableError, type Agent } from "../../src/agents/base";
import { LlmError } from "../../src/llm/provider";
import { makeCompany, type TestCompany } from "../helpers/company";
import { customRunner } from "../helpers/runner";

let t: TestCompany;
afterEach(() => t?.cleanup());

function agent(fn: () => Promise<unknown>): () => Agent {
  return () => ({ name: "analytics", handle: async () => { await fn(); return { kind: "completed", output: { ok: true } }; } });
}

test("retry: transient failures are retried and the task eventually completes", async () => {
  t = makeCompany();
  let calls = 0;
  const { runner } = customRunner(t.c, { analytics: agent(async () => { if (++calls < 3) throw new Error("temporary"); }) });
  let task = t.c.tasks.create({ agent: "analytics", type: "analytics", input: {} });
  while (["PENDING", "RETRYING"].includes(task.status)) task = await runner.run(t.c.tasks.require(task.task_id));
  assert.equal(task.status, "COMPLETED");
  assert.equal(task.retry_count, 2);
  assert.equal(calls, 3);
  assert.equal(t.channel.sent.filter((s) => s.startsWith("[NOTE ERROR]")).length, 0);
});

test("retry: permanent failure stops at MAX_RETRIES, marks FAILED and notifies a human", async () => {
  t = makeCompany({ MAX_RETRIES: "3" });
  let calls = 0;
  const { runner } = customRunner(t.c, { analytics: agent(async () => { calls++; throw new Error("always broken"); }) });
  let task = t.c.tasks.create({ agent: "analytics", type: "analytics", input: {} });
  for (let i = 0; i < 10 && ["PENDING", "RETRYING"].includes(task.status); i++) task = await runner.run(t.c.tasks.require(task.task_id));
  assert.equal(task.status, "FAILED");
  assert.equal(calls, 4, "1 attempt + 3 retries, never more");
  assert.equal(task.retry_count, 3);
  const err = t.channel.sent.find((s) => s.startsWith("[NOTE ERROR]"));
  assert.ok(err);
  assert.match(err!, /Agent: analytics/);
  assert.match(err!, /Retry: 3\/3/);
  assert.equal(t.c.heartbeats.get("analytics")?.status, "error");
});

test("retry: non-retryable errors (UI changed / refused) fail immediately", async () => {
  t = makeCompany();
  for (const e of [new NonRetryableError("ui changed"), new LlmError("refused", false)]) {
    let calls = 0;
    const { runner } = customRunner(t.c, { analytics: agent(async () => { calls++; throw e; }) });
    const task = await runner.run(t.c.tasks.create({ agent: "analytics", type: "analytics", input: {} }));
    assert.equal(task.status, "FAILED");
    assert.equal(calls, 1);
  }
});
