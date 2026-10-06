import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../../src/database/db";
import { Repository } from "../../src/database/repositories";
import { KnowledgeBase, summaryToPrompt, type ArticleOutcome } from "../../src/knowledge/knowledgeBase";

function outcome(i: number, o: Partial<ArticleOutcome>): ArticleOutcome {
  return { article_id: `a${i}`, topic: `topic ${i}`, title: "t", title_has_number: false, title_length: 20, structure: [], mode: "FREE", content_type: "free", price: 0, cta: "", views: 100, likes: 5, comments: 1, sales: 0, revenue: 0, performance_score: 50, success_factors: [], failure_factors: [], is_simulated: false, ...o };
}

test("knowledge: small samples never produce trend claims", () => {
  const repo = new Repository(openDatabase(":memory:"));
  for (let i = 0; i < 4; i++) repo.addKnowledge("article_outcome", `a${i}`, null, outcome(i, { title_has_number: i % 2 === 0, views: i % 2 === 0 ? 1000 : 10 }) as never);
  const s = new KnowledgeBase(repo).summarize();
  assert.equal(s.article_count, 4);
  assert.equal(s.insights.length, 0);
  assert.ok(s.notes.some((n) => /断定しません/.test(n)));
});

test("knowledge: detects 'numbers in title → more views' with enough data, labelled as tentative", () => {
  const repo = new Repository(openDatabase(":memory:"));
  for (let i = 0; i < 12; i++) repo.addKnowledge("article_outcome", `a${i}`, null, outcome(i, { title_has_number: i < 6, views: i < 6 ? 800 + i : 300 + i, performance_score: i }) as never);
  const s = new KnowledgeBase(repo).summarize();
  const ins = s.insights.find((x) => x.statement.includes("タイトルの数字"));
  assert.ok(ins, JSON.stringify(s.insights));
  assert.match(ins!.statement, /数字あり.*高い傾向（暫定）/);
  assert.equal(ins!.sample_size, 12);
  assert.equal(s.top_topics[0].topic, "topic 11");
  assert.match(summaryToPrompt(s), /伸びたテーマ/);
});

test("knowledge: tiny differences are not reported as trends", () => {
  const repo = new Repository(openDatabase(":memory:"));
  for (let i = 0; i < 12; i++) repo.addKnowledge("article_outcome", `a${i}`, null, outcome(i, { title_has_number: i < 6, views: i < 6 ? 105 : 100 }) as never);
  assert.equal(new KnowledgeBase(repo).summarize().insights.filter((x) => x.statement.includes("タイトルの数字")).length, 0);
});
