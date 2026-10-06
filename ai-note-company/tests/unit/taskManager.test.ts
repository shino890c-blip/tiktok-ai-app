import assert from "node:assert/strict";
import { test } from "node:test";
import { TaskManager } from "../../src/core/tasks/taskManager";
import { openDatabase } from "../../src/database/db";

const tm = () => new TaskManager(openDatabase(":memory:"), { maxRetries: 3, retryBackoffSeconds: 0 });

test("task manager: task carries all required fields and lifecycle timestamps", () => {
  const m = tm();
  const t = m.create({ agent: "writer", type: "writing", input: { a: 1 } });
  for (const k of ["task_id", "agent", "status", "created_at", "started_at", "completed_at", "retry_count", "input", "output", "error"]) assert.ok(k in t, k);
  assert.equal(t.status, "PENDING");
  const r = m.start(t.task_id);
  assert.equal(r.status, "RUNNING");
  assert.ok(r.started_at);
  const d = m.complete(t.task_id, { ok: true });
  assert.equal(d.status, "COMPLETED");
  assert.deepEqual(d.output, { ok: true });
  assert.ok(d.completed_at);
});

test("task manager: invalid transitions are rejected", () => {
  const m = tm();
  const t = m.create({ agent: "writer", type: "writing", input: {} });
  assert.throws(() => m.complete(t.task_id, {}), /Invalid task transition PENDING → COMPLETED/);
  m.cancel(t.task_id, "x");
  assert.throws(() => m.start(t.task_id), /CANCELLED → RUNNING/);
});

test("task manager: retries up to MAX_RETRIES then FAILED (no infinite retry)", () => {
  const m = tm();
  const t = m.create({ agent: "writer", type: "writing", input: {} });
  for (let i = 1; i <= 3; i++) {
    m.start(t.task_id);
    const r = m.fail(t.task_id, `err ${i}`);
    assert.equal(r.willRetry, true);
    assert.equal(r.task.status, "RETRYING");
    assert.equal(r.task.retry_count, i);
  }
  m.start(t.task_id);
  const last = m.fail(t.task_id, "err 4");
  assert.equal(last.willRetry, false);
  assert.equal(last.task.status, "FAILED");
  assert.equal(last.task.error, "err 4");
});

test("task manager: non-retryable failures go straight to FAILED; manual retry resets", () => {
  const m = tm();
  const t = m.create({ agent: "publisher", type: "publish", input: {} });
  m.start(t.task_id);
  const r = m.fail(t.task_id, "ui changed", { retryable: false });
  assert.equal(r.task.status, "FAILED");
  assert.equal(r.task.retry_count, 0);
  assert.equal(m.resetForManualRetry(t.task_id).status, "PENDING");
});

test("task manager: runnable respects scheduled_at and WAITING_APPROVAL is not runnable", () => {
  const m = tm();
  const future = m.create({ agent: "writer", type: "writing", input: {}, scheduledAt: new Date(Date.now() + 3600_000) });
  const now = m.create({ agent: "writer", type: "writing", input: {} });
  const wait = m.create({ agent: "supervisor", type: "approval", input: {} });
  m.waitApproval(wait.task_id, {});
  const ids = m.runnable().map((t) => t.task_id);
  assert.ok(ids.includes(now.task_id));
  assert.ok(!ids.includes(future.task_id));
  assert.ok(!ids.includes(wait.task_id));
  assert.ok(m.runnable(new Date(Date.now() + 7200_000)).some((t) => t.task_id === future.task_id));
});
