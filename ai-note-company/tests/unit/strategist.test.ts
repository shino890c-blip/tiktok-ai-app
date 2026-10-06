import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { validateStrategy } from "../../src/agents/strategist/strategist";
import { makeCompany, type TestCompany } from "../helpers/company";
import { runOne } from "../helpers/steps";

let t: TestCompany;
afterEach(() => t?.cleanup());

test("strategy: FREE mode → free article, no paid sections, price 0", async () => {
  t = makeCompany({ DEFAULT_ARTICLE_MODE: "FREE" });
  const r = await runOne(t.c, "research", { count: 1 });
  const s = await runOne(t.c, "strategy", { idea_id: r.output!.idea_id });
  assert.equal(s.status, "COMPLETED");
  const st = t.c.repo.getStrategy(String(s.output!.strategy_id))!;
  for (const k of ["strategy_id", "content_type", "title", "subtitle", "outline", "free_value", "paid_value", "price", "cta", "target_reader"]) assert.ok(k in st, k);
  assert.equal(st.content_type, "free");
  assert.equal(st.price, 0);
  assert.ok(st.outline.every((o) => !o.paid));
});

test("strategy: PAID mode → free value exists on its own, paid sections, default price", async () => {
  t = makeCompany({ DEFAULT_ARTICLE_MODE: "PARTIAL_PAID", DEFAULT_ARTICLE_PRICE: "980" });
  const r = await runOne(t.c, "research", { count: 1 });
  const s = await runOne(t.c, "strategy", { idea_id: r.output!.idea_id });
  const st = t.c.repo.getStrategy(String(s.output!.strategy_id))!;
  assert.equal(st.content_type, "paid");
  assert.equal(st.price, 980);
  assert.ok(st.outline.some((o) => o.paid) && st.outline.some((o) => !o.paid));
  assert.ok(st.free_value.length > 10 && st.paid_value.length > 10);
});

test("strategy: validator repairs inconsistent LLM plans", () => {
  const base = { title: "t", outline: [{ heading: "a", points: ["x"] }, { heading: "b", points: ["y"], paid: true }], free_value: "f", paid_value: "p", cta: "c", target_reader: "r" };
  const free = validateStrategy({ ...base, content_type: "free", price: 500 }, { mode: "FREE", price: 980 });
  assert.equal(free.price, 0);
  assert.ok(free.outline.every((o) => !o.paid), "free articles never have paid sections");
  const paid = validateStrategy({ ...base, content_type: "paid", article_mode: "PAID", outline: [{ heading: "a", points: ["x"], paid: true }, { heading: "b", points: ["y"], paid: true }] }, { mode: "FREE", price: 980 });
  assert.equal(paid.outline[0].paid, false, "a paid article keeps a free part");
  assert.equal(paid.price, 980);
  assert.throws(() => validateStrategy({ ...base, outline: [] }, { mode: "FREE", price: 980 }), /outline/);
});
