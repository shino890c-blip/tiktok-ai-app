import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderArticleMarkdown } from "../../src/agents/writer/articleFormat";
import { containment, runQualityControl } from "../../src/quality/qualityControl";
import type { Article } from "../../src/types";
import { makeCompany, type TestCompany } from "../helpers/company";
import { drain, runOne } from "../helpers/steps";

let t: TestCompany;
afterEach(() => t?.cleanup());

function article(free: string, paid = "", mode: Article["mode"] = "FREE", price = 0, title = "在宅ワークの午前中を立て直す小さな習慣"): Article {
  const md = renderArticleMarkdown({ title, description: "d", tags: ["a"], slug: "s", free_part: `# ${title}\n\n${free}`, paid_part: paid });
  return { article_id: "art_x", strategy_id: "s", idea_id: "i", title, body_markdown: md, free_part: `# ${title}\n\n${free}`, paid_part: paid, mode, price, tags: ["a"], seo: { title, description: "d", tags: ["a"], slug: "s" }, cover_image: null, body_images: [], quality_score: null, status: "WRITING", revision: 0, file_path: null };
}

test("quality: the writer's article passes (score ≥ 80) and the report is stored", async () => {
  t = makeCompany();
  const r = await runOne(t.c, "research", { count: 1 });
  await drain(t.c, { only: ["strategy", "writing", "quality"] });
  const art = t.c.repo.listArticles(1)[0];
  const rep = t.c.repo.latestQualityReport(art.article_id)!;
  assert.ok(r.status === "COMPLETED");
  assert.ok(rep.score >= 80, `score=${rep.score} ${JSON.stringify(rep.issues)}`);
  assert.equal(rep.passed, true);
  assert.equal(art.status, "QC_PASSED");
  assert.equal(t.c.tasks.list({ type: "draft" }).length, 1, "QC pass queues the note draft");
});

test("quality: AI-smelly, thin, duplicated, over-claiming text fails (< 80)", async () => {
  const bad = [
    "## はじめに",
    "副業を始めることは人生にとって重要です。副業を始めることは人生にとって重要です。副業を始めることは人生にとって重要です。絶対に稼げます。誰でも簡単に100%成功します。",
    "## ポイント",
    "- 様々な方法があります\n- 様々な工夫が重要です\n- 非常に重要です\n- 非常に必要不可欠です\n- 徹底解説します",
    "## 最後に",
    "いかがでしたか？ぜひ参考にしてください。いかがでしたでしょうか。",
  ].join("\n\n");
  const rep = await runQualityControl(article(bad), { threshold: 80 });
  assert.ok(rep.score < 80, `score=${rep.score}`);
  assert.equal(rep.passed, false);
  const checks = new Set(rep.issues.map((i) => i.check));
  for (const c of ["AI臭", "重複", "根拠のない断定", "導入", "読者価値"]) assert.ok(checks.has(c), `expected ${c} in ${[...checks]}`);
});

test("quality: inappropriate content or personal info is never safe to publish", async () => {
  const good = (await (async () => { t = makeCompany(); await runOne(t.c, "research", { count: 1 }); await drain(t.c, { only: ["strategy", "writing"] }); return t.c.repo.listArticles(1)[0]; })());
  const tainted = { ...good, body_markdown: good.body_markdown + "\n\n連絡先 090-1234-5678 まで。違法ダウンロードの方法も紹介。" };
  const rep = await runQualityControl(tainted, { threshold: 80 });
  assert.equal(rep.safe_to_publish, false);
  assert.equal(rep.passed, false);
  assert.ok(rep.issues.some((i) => i.check === "不適切な内容" && i.severity === "critical"));
});

test("quality: paid article without a real paid part / padded paid part is flagged", async () => {
  const free = "## 背景\n\n" + "読者の状況に寄り添う導入の文章をここに置きます。たとえば具体的な場面を想像してください。まず手順を決めて試してみます。".repeat(12);
  const noPaid = await runQualityControl(article(free, "", "PAID", 980), { threshold: 80 });
  assert.ok(noPaid.issues.some((i) => i.check === "有料部分の価値" && i.severity === "critical"));
  const padded = await runQualityControl(article(free, free, "PAID", 980), { threshold: 80 });
  assert.ok(padded.issues.some((i) => /水増し/.test(i.message)), JSON.stringify(padded.issues));
});

test("quality: copy of an existing text is detected", async () => {
  const text = "## 本文\n\n" + "オリジナリティのある文章を書くためには自分の体験を起点にすることが近道です。".repeat(20);
  assert.ok(containment(text, text) > 0.9);
  const rep = await runQualityControl(article(text), { threshold: 80, references: [{ id: "art_other", text }] });
  assert.ok(rep.issues.some((i) => i.check === "コピーコンテンツ"));
  assert.equal(rep.safe_to_publish, false);
});

test("quality: stale 'latest' information is flagged", async () => {
  const rep = await runQualityControl(article("## 情報\n\n2019年の最新データによると状況は変わりました。"), { threshold: 80, now: new Date("2026-10-06") });
  assert.ok(rep.issues.some((i) => i.check === "古い情報"));
});

test("quality: failing article is sent back to the writer (bounded revisions)", async () => {
  t = makeCompany({ QUALITY_THRESHOLD: "101", MAX_REVISIONS: "2" }); // impossible threshold
  await runOne(t.c, "research", { count: 1 });
  await drain(t.c);
  const writes = t.c.tasks.list({ type: "writing" });
  assert.equal(writes.length, 3, "initial + 2 revisions");
  assert.equal(t.c.tasks.list({ type: "draft" }).length, 0, "never drafted");
  assert.equal(t.c.repo.listArticles(1)[0].status, "FAILED");
  assert.ok(t.channel.sent.some((s) => s.includes("[NOTE ERROR]") && s.includes("品質")));
});
