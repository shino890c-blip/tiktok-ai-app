import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { validateIdeas } from "../../src/agents/researcher/researcher";
import type { TrendSource } from "../../src/agents/researcher/sources";
import { parseRssItems } from "../../src/agents/researcher/sources";
import { makeCompany, type TestCompany } from "../helpers/company";
import { runOne } from "../helpers/steps";

let t: TestCompany;
afterEach(() => t?.cleanup());

const okSource: TrendSource = { name: "test", fetch: async () => ({ source: "test", ok: true, signals: [{ source: "test", title: "生成AI 副業 時短", url: "https://example.com/a" }] }) };
const brokenSource: TrendSource = { name: "broken", fetch: async () => ({ source: "broken", ok: false, signals: [], error: "HTTP 500" }) };

test("researcher: produces ideas in the required shape and selects one", async () => {
  t = makeCompany({}, { sources: [okSource, brokenSource] });
  const task = await runOne(t.c, "research", { count: 6 });
  assert.equal(task.status, "COMPLETED");
  const ideaId = String(task.output!.idea_id);
  const idea = t.c.repo.getIdea(ideaId)!;
  for (const k of ["idea_id", "topic", "target_reader", "reader_problem", "trend_reason", "unique_angle", "title_candidates", "monetization_potential", "confidence", "sources"]) assert.ok(k in idea, k);
  assert.ok(idea.trend_reason.length > 20, "explains WHY the theme may be read");
  assert.equal((task.output!.idea_ids as string[]).length, 6);
  // Failed sources are reported, not fabricated.
  const report = task.output!.source_report as { source: string; ok: boolean; count: number; error?: string }[];
  const broken = report.find((r) => r.source === "broken")!;
  assert.equal(broken.ok, false);
  assert.equal(broken.count, 0);
  assert.equal(broken.error, "HTTP 500");
  // Relevant signals are cited as sources.
  const all = (task.output!.idea_ids as string[]).map((id) => t.c.repo.getIdea(id)!);
  assert.ok(all.some((i) => i.sources.includes("https://example.com/a")));
});

test("researcher: avoids topics already written about", async () => {
  t = makeCompany();
  const first = await runOne(t.c, "research", { count: 1 });
  const second = await runOne(t.c, "research", { count: 1 });
  assert.notEqual(first.output!.topic, second.output!.topic);
});

test("researcher: candidates mode stores ideas without selecting one", async () => {
  t = makeCompany();
  const task = await runOne(t.c, "research", { mode: "candidates", count: 2 }, null);
  assert.equal(task.output!.mode, "candidates");
  assert.equal(t.c.repo.listIdeas().filter((i) => i.selected).length, 0);
  assert.equal(t.c.tasks.list({ type: "strategy" }).length, 0, "candidates don't start a pipeline");
});

test("researcher: invalid LLM output is rejected", () => {
  assert.throws(() => validateIdeas({ ideas: [] }), /empty/);
  assert.throws(() => validateIdeas({ ideas: [{ topic: "x" }] }), /target_reader/);
});

test("researcher: RSS parser extracts titles, links and traffic", () => {
  const xml = `<rss><channel><item><title><![CDATA[テスト &amp; 話題]]></title><link>https://e.com/1</link><ht:approx_traffic>2000+</ht:approx_traffic></item><item><title>二件目</title></item></channel></rss>`;
  assert.deepEqual(parseRssItems(xml), [
    { title: "テスト & 話題", link: "https://e.com/1", traffic: "2000+" },
    { title: "二件目", link: undefined, traffic: undefined },
  ]);
});
