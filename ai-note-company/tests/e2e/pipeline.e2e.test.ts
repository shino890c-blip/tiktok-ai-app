import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, test } from "node:test";
import { makeCompany, type TestCompany } from "../helpers/company";

let t: TestCompany;
afterEach(() => t?.cleanup());

test("E2E: start company → research → strategy → writing → QC → approval → mock publish → analytics → knowledge → next plan", async () => {
  t = makeCompany({ DEFAULT_ARTICLE_MODE: "PARTIAL_PAID", DAILY_ARTICLE_LIMIT: "1" });
  const { c } = t;

  // 1. Start: the supervisor creates today's article and runs until human approval is needed.
  const first = await c.supervisor.tick();
  assert.deepEqual(first.ran.map((x) => `${x.type}:${x.status}`), ["research:COMPLETED", "strategy:COMPLETED", "writing:COMPLETED", "quality:COMPLETED", "draft:COMPLETED"]);
  const article = c.repo.listArticles(1)[0];
  assert.equal(article.status, "DRAFT");
  assert.ok(article.quality_score! >= 80);
  assert.ok(fs.existsSync(article.file_path!));
  assert.ok(c.repo.latestDraft(article.article_id)?.edit_url);
  assert.equal(c.repo.listPublished().length, 0, "auto publish is OFF by default");

  // 2. Approval required and notified.
  const [approval] = c.repo.pendingApprovals();
  assert.ok(approval);
  assert.ok(t.channel.sent.some((s) => s.startsWith("[NOTE APPROVAL REQUIRED]")));

  // DAILY_ARTICLE_LIMIT: another tick doesn't start a second article today.
  const idle = await c.supervisor.tick();
  assert.equal(idle.ran.length, 0);
  assert.equal(c.supervisor.articlesStartedToday(), 1);

  // 3. Human approves → publish (mock) → analytics → knowledge → next candidates.
  c.approvals.decide(approval.approval_id, "APPROVE");
  const second = await c.supervisor.tick({ createDaily: false });
  assert.deepEqual(second.ran.map((x) => `${x.type}:${x.status}`), ["publish:COMPLETED", "analytics:COMPLETED", "knowledge:COMPLETED", "research:COMPLETED"]);

  const pub = c.repo.getPublished(article.article_id)!;
  assert.equal(pub.status, "PUBLISHED");
  assert.ok(pub.is_mock);
  assert.ok(t.channel.sent.some((s) => s.startsWith("[NOTE PUBLISHED]")));

  const an = c.repo.latestAnalytics(article.article_id)!;
  for (const k of ["article_id", "performance_score", "views", "likes", "comments", "sales", "what_worked", "what_failed", "next_actions"]) assert.ok(k in an, k);
  assert.equal(an.is_simulated, true);

  const kb = c.knowledge.summarize();
  assert.equal(kb.article_count, 1);
  assert.ok(kb.notes.some((n) => /断定しません/.test(n)), "one article is never treated as a trend");

  const candidates = second.ran[3];
  assert.equal(candidates.output!.mode, "candidates");
  assert.equal(candidates.output!.knowledge_articles, 1, "next research saw the knowledge base");
  assert.ok((candidates.output!.topics as string[]).length > 0);

  // 4. Next day: the next plan is generated using the knowledge + candidates.
  const tomorrow = new Date(Date.now() + 24 * 3600_000);
  const next = c.supervisor.ensureDailyResearch(tomorrow, { force: true });
  assert.ok(next);
  await c.supervisor.tick({ createDaily: false, maxTasks: 2 });
  const strategies = c.repo.db.all<{ idea_id: string }>("SELECT idea_id FROM strategies ORDER BY created_at");
  assert.equal(strategies.length, 2, "second article plan created");
  const nextIdea = c.repo.getIdea(strategies[1].idea_id)!;
  assert.notEqual(nextIdea.topic, c.repo.getIdea(article.idea_id)!.topic, "doesn't repeat the published theme");

  // Health check is clean.
  const h = c.supervisor.health();
  assert.equal(h.failed_tasks.length, 0);
  assert.equal(h.stuck_tasks.length, 0);
  assert.equal(h.missing_article_files.length, 0);
  assert.equal(c.repo.listEvents({ level: "error" }).length, 0);
});

test("E2E: NOTE_AUTO_PUBLISH=true publishes after quality/safety checks without a human", async () => {
  t = makeCompany({ NOTE_AUTO_PUBLISH: "true" });
  const r = await t.c.supervisor.tick();
  assert.deepEqual(r.ran.map((x) => x.type), ["research", "strategy", "writing", "quality", "draft", "publish", "analytics", "knowledge", "research"]);
  assert.equal(t.c.repo.pendingApprovals().length, 0);
  assert.equal(t.c.repo.listPublished().length, 1);
});
