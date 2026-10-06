import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, test } from "node:test";
import { PAID_MARKER, parseArticleMarkdown } from "../../src/agents/writer/articleFormat";
import { makeCompany, type TestCompany } from "../helpers/company";
import { runOne } from "../helpers/steps";

let t: TestCompany;
afterEach(() => t?.cleanup());

async function write(mode: string) {
  t = makeCompany({ DEFAULT_ARTICLE_MODE: mode });
  const r = await runOne(t.c, "research", { count: 1 });
  const s = await runOne(t.c, "strategy", { idea_id: r.output!.idea_id });
  const w = await runOne(t.c, "writing", { strategy_id: s.output!.strategy_id });
  assert.equal(w.status, "COMPLETED", w.error ?? "");
  return t.c.repo.getArticle(String(w.output!.article_id))!;
}

test("writer: free article saved as Markdown with structure and SEO fields", async () => {
  const a = await write("FREE");
  assert.ok(a.file_path && fs.existsSync(a.file_path));
  const md = fs.readFileSync(a.file_path!, "utf8");
  assert.match(md, /^---\ntitle: .+\ndescription: .+\ntags: .+\nslug: [a-z0-9-]+\n---/);
  assert.match(md, new RegExp(`^# ${a.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  assert.ok((md.match(/^## /gm) ?? []).length >= 3, "has sections");
  assert.match(md, /おわりに|まとめ/);
  assert.match(md, /コメント/, "has CTA");
  assert.ok(!md.includes(PAID_MARKER));
  assert.ok(a.seo.slug && a.seo.description && a.seo.tags.length >= 3);
  assert.equal(a.price, 0);
});

test("writer: paid article has free part → 'ここから先では' → paid part", async () => {
  const a = await write("PARTIAL_PAID");
  const md = fs.readFileSync(a.file_path!, "utf8");
  const idx = md.indexOf(PAID_MARKER);
  assert.ok(idx > 0);
  assert.match(md.slice(Math.max(0, idx - 400), idx), /ここから先では/);
  assert.ok(a.paid_part.length > 200);
  assert.ok(a.price > 0);
});

test("writer: cover image is generated (placeholder PNG) when no image API is set", async () => {
  const a = await write("FREE");
  assert.ok(a.cover_image && fs.existsSync(a.cover_image));
  const sig = fs.readFileSync(a.cover_image!).subarray(0, 8);
  assert.deepEqual([...sig], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test("writer: revision rewrites the same article and increments revision", async () => {
  const a = await write("FREE");
  const w2 = await runOne(t.c, "writing", { strategy_id: a.strategy_id, article_id: a.article_id, issues: [{ check: "AI臭", severity: "minor", message: "x", penalty: 2 }] });
  assert.equal(w2.status, "COMPLETED");
  const b = t.c.repo.getArticle(a.article_id)!;
  assert.equal(b.revision, 1);
  assert.ok(fs.existsSync(b.file_path!) && b.file_path!.endsWith("article.r1.md"));
});

test("article format: parser handles front matter, fences and the paid marker", () => {
  const p = parseArticleMarkdown("```markdown\n---\ntitle: T\ntags: a, #b、c\nslug: My Slug\n---\n# T\n\nfree\n\n<!-- paid -->\n\npaid\n```", "fallback");
  assert.equal(p.title, "T");
  assert.deepEqual(p.tags, ["a", "b", "c"]);
  assert.equal(p.slug, "my-slug");
  assert.equal(parseArticleMarkdown("# 日本語のみ\n\n本文", "fallback").slug, "fallback");
  assert.equal(p.paid_part, "paid");
});
