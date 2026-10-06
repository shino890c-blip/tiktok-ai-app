import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { makeCompany, type TestCompany } from "../helpers/company";
import { drain, runOne } from "../helpers/steps";

let t: TestCompany;
afterEach(() => t?.cleanup());

async function toApproval(env: Record<string, string> = {}) {
  t = makeCompany(env);
  await runOne(t.c, "research", { count: 1 });
  await drain(t.c);
  const ap = t.c.repo.pendingApprovals();
  assert.equal(ap.length, 1);
  return ap[0];
}

test("approval: draft waits for a human; nothing is published without APPROVE", async () => {
  const ap = await toApproval();
  assert.equal(t.c.tasks.list({ type: "approval" })[0].status, "WAITING_APPROVAL");
  assert.equal(t.c.tasks.list({ type: "publish" }).length, 0);
  assert.equal(t.c.repo.listPublished().length, 0);
  const n = t.channel.sent.find((s) => s.startsWith("[NOTE APPROVAL REQUIRED]"))!;
  for (const k of ["Title:", "URL:", "Price:", "Quality Score:"]) assert.ok(n.includes(k), k);
  assert.ok(n.includes(ap.approval_id));
});

test("approval: APPROVE → publish task → PUBLISHED", async () => {
  const ap = await toApproval();
  const { created } = t.c.approvals.decide(ap.approval_id, "APPROVE", { comment: "OK" });
  assert.equal(created[0].type, "publish");
  assert.equal(t.c.tasks.list({ type: "approval" })[0].status, "COMPLETED");
  await drain(t.c, { only: ["publish"] });
  assert.equal(t.c.repo.listPublished().length, 1);
  assert.throws(() => t.c.approvals.decide(ap.approval_id, "REJECT"), /already APPROVED/);
});

test("approval: REJECT stops the article", async () => {
  const ap = await toApproval();
  const { created } = t.c.approvals.decide(ap.approval_id, "REJECT", { comment: "テーマが弱い" });
  assert.equal(created.length, 0);
  assert.equal(t.c.repo.getArticle(ap.article_id)!.status, "REJECTED");
  assert.ok(t.c.repo.listFeedback().some((f) => f.source === "human" && f.message === "テーマが弱い"));
  await drain(t.c);
  assert.equal(t.c.repo.listPublished().length, 0);
});

test("approval: REGENERATE sends the article back to the writer with the comment", async () => {
  const ap = await toApproval();
  const { created } = t.c.approvals.decide(ap.approval_id, "REGENERATE", { comment: "もっと具体例を" });
  assert.equal(created[0].type, "writing");
  assert.equal(created[0].input.human_comment, "もっと具体例を");
  await drain(t.c);
  assert.equal(t.c.repo.getArticle(ap.article_id)!.revision, 1);
  assert.equal(t.c.repo.pendingApprovals().length, 1, "a fresh approval is requested");
});

test("approval: EDIT applies human edits, re-runs QC, updates the draft and asks again", async () => {
  const ap = await toApproval();
  const before = t.c.repo.getArticle(ap.article_id)!;
  t.c.approvals.decide(ap.approval_id, "EDIT", { edits: { title: "人間が直したタイトル：在宅ワークの朝を整える", tags: ["在宅", "習慣"] } });
  await drain(t.c);
  const after = t.c.repo.getArticle(ap.article_id)!;
  assert.equal(after.title, "人間が直したタイトル：在宅ワークの朝を整える");
  assert.deepEqual(after.tags, ["在宅", "習慣"]);
  assert.match(after.body_markdown, /^# 人間が直したタイトル/m);
  assert.equal(after.revision, before.revision + 1);
  const drafts = t.c.repo.db.all<{ edit_url: string }>("SELECT edit_url FROM drafts WHERE article_id = ?", [ap.article_id]);
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].edit_url, drafts[1].edit_url, "same note draft is updated, not duplicated");
  assert.equal(t.c.repo.pendingApprovals().length, 1);
});

test("approval: publishing without approval is refused when NOTE_AUTO_PUBLISH=false", async () => {
  const ap = await toApproval();
  const task = await runOne(t.c, "publish", { article_id: ap.article_id });
  assert.equal(task.status, "FAILED");
  assert.match(task.error!, /承認されていない/);
  assert.equal(task.retry_count, 0, "not retried");
  assert.equal(t.c.repo.listPublished().length, 0);
});
