import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { MockNotePublisher } from "../../src/note/publisher/mockPublisher";
import { PublishUnverifiedError, type NotePostInput } from "../../src/note/publisher/types";
import { makeCompany, type TestCompany } from "../helpers/company";
import { drain, runOne } from "../helpers/steps";

let t: TestCompany | undefined;
afterEach(() => t?.cleanup());

const input: NotePostInput = { article_id: "a", title: "タイトル", free_body: "## 見出し\n\n本文", paid_body: "", tags: ["x"], cover_image: null, price: 0, publish_mode: "FREE" };

test("mock publisher: saves a DRAFT, then publishes and returns a verified URL", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mock-note-"));
  const p = new MockNotePublisher(dir);
  const d = await p.saveDraft(input);
  assert.equal(d.status, "DRAFT");
  assert.match(d.edit_url, /^mock:\/\/note\.com\/notes\/n[0-9a-z]+\/edit$/);
  assert.ok(fs.existsSync(path.join(dir, d.note_key!, "draft.html")));
  const again = await p.saveDraft({ ...input, title: "更新" }, d.edit_url);
  assert.equal(again.edit_url, d.edit_url, "updating a draft keeps its URL");
  const r = await p.publish(input, d.edit_url);
  assert.equal(r.status, "PUBLISHED");
  assert.match(r.note_url, /\/n\/n[0-9a-z]+$/);
  await assert.rejects(p.publish({ ...input, publish_mode: "DRAFT" }, d.edit_url), /never published/);
  await assert.rejects(p.publish(input, "mock://note.com/notes/nmissing/edit"), /not found/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("publisher agent: an unverified publish is FAILED (not PUBLISHED) and never auto-retried", async () => {
  t = makeCompany();
  await runOne(t.c, "research", { count: 1 });
  await drain(t.c);
  const ap = t.c.repo.pendingApprovals()[0];
  t.c.approvals.decide(ap.approval_id, "APPROVE");
  t.publisher.failures.unverified = 1;
  const [task] = await drain(t.c, { only: ["publish"] });
  assert.equal(task.status, "FAILED");
  assert.equal(task.retry_count, 0);
  assert.equal(t.c.repo.listPublished().length, 0, "never claims PUBLISHED without a verified URL");
  assert.notEqual(t.c.repo.getArticle(ap.article_id)!.status, "PUBLISHED");
  assert.ok(t.channel.sent.some((s) => s.startsWith("[NOTE ERROR]")));
});

test("publisher agent: a failure before the publish click is retried", async () => {
  t = makeCompany();
  await runOne(t.c, "research", { count: 1 });
  await drain(t.c);
  t.c.approvals.decide(t.c.repo.pendingApprovals()[0].approval_id, "APPROVE");
  t.publisher.failures.publish = 1;
  await drain(t.c, { only: ["publish"] });
  const task = t.c.tasks.list({ type: "publish" })[0];
  assert.equal(task.status, "COMPLETED");
  assert.equal(task.retry_count, 1);
  assert.equal(t.c.repo.listPublished().length, 1);
});

test("publisher agent: DRAFT-mode articles are kept as drafts even after approval", async () => {
  t = makeCompany({ DEFAULT_ARTICLE_MODE: "DRAFT" });
  await runOne(t.c, "research", { count: 1 });
  await drain(t.c);
  t.c.approvals.decide(t.c.repo.pendingApprovals()[0].approval_id, "APPROVE");
  const [task] = await drain(t.c, { only: ["publish"] });
  assert.equal(task.status, "CANCELLED");
  assert.equal(t.c.repo.listPublished().length, 0);
});
