import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildChatGPTPrompt, fixablePipelines, importChatGPTAnswer, parseChatGPTAnswer } from "../src/chatgpt/index.js";
import { createTestCompany, ROOT, type TestCompany } from "./helpers.js";

const ANSWER = readFileSync(path.join(ROOT, "tests/fixtures/chatgpt-answer.txt"), "utf8");
let c: TestCompany | undefined;
afterEach(async () => {
  await c?.cleanup();
  c = undefined;
});

describe("ChatGPT copy-paste mode", () => {
  it("parses a typical ChatGPT reply (prose + ```json block), a bare object, and an array", () => {
    expect(parseChatGPTAnswer(ANSWER)).toHaveLength(1);
    const obj = JSON.parse(ANSWER.split("```json")[1]!.split("```")[0]!).videos[0];
    expect(parseChatGPTAnswer(JSON.stringify(obj))[0]!.topic).toBe(obj.topic);
    expect(parseChatGPTAnswer(JSON.stringify([obj, obj]))).toHaveLength(2);
  });

  it("explains in Japanese what is wrong with a broken or incomplete answer", () => {
    expect(() => parseChatGPTAnswer("台本はこちらです！")).toThrow(/JSONが見つかりませんでした/);
    expect(() => parseChatGPTAnswer('```json\n{"videos":[{"topic":"x"\n```')).toThrow(/JSON/);
    expect(() => parseChatGPTAnswer('{"videos":[{"topic":"テーマ","hook":"フック"}]}')).toThrow(/形式が足りません/);
  });

  it("builds a request prompt with rules, used topics and learnings", async () => {
    c = await createTestCompany({ env: { PUBLISH_TARGET: "delivery" } });
    await c.ctx.knowledge.record({ category: "hook", polarity: "negative", content: "長すぎる前置き" });
    await importChatGPTAnswer(c.ctx, ANSWER);
    const prompt = await buildChatGPTPrompt(c.ctx);
    expect(prompt).toContain("```json");
    expect(prompt).toContain("#Shorts");
    expect(prompt).toContain("スマホの充電を長持ちさせる習慣"); // don't repeat used topics
    expect(prompt).toContain("悪かった冒頭: 長すぎる前置き");
  });

  it("turns a pasted answer into a delivered video (QC → render → delivery)", async () => {
    c = await createTestCompany({ env: { PUBLISH_TARGET: "delivery" } });
    const r = await importChatGPTAnswer(c.ctx, ANSWER);
    expect(r.imported).toHaveLength(1);
    await c.worker.runUntilIdle();
    const p = (await c.ctx.repos.pipelines.get(r.imported[0]!.pipeline_id))!;
    expect(p).toMatchObject({ source: "chatgpt", status: "COMPLETED" });
    const v = (await c.ctx.repos.videos.get(p.video_id!))!;
    expect(v.status).toBe("delivered");
    expect(v.title).toBe("スマホの電池を長持ちさせる3つの習慣");
    expect(await c.ctx.repos.tasks.count({ type: ["research", "script"] })).toBe(0); // no internal AI used
  });

  it("respects DAILY_VIDEO_LIMIT and reports skipped scripts", async () => {
    c = await createTestCompany({ env: { PUBLISH_TARGET: "delivery", DAILY_VIDEO_LIMIT: "1" } });
    const obj = JSON.parse(ANSWER.split("```json")[1]!.split("```")[0]!).videos[0];
    const r = await importChatGPTAnswer(c.ctx, JSON.stringify({ videos: [obj, { ...obj, topic: "別テーマ" }] }));
    expect(r.imported).toHaveLength(1);
    expect(r.skipped[0]!.reason).toContain("上限");
  });

  it("does not hand a failed ChatGPT script to the internal writer; offers a fix prompt instead", async () => {
    c = await createTestCompany({ env: { PUBLISH_TARGET: "delivery" } });
    const bad = ANSWER.replace('"description": "スマホの電池', '"description": "飲むだけで痩せる スマホの電池');
    const r = await importChatGPTAnswer(c.ctx, bad);
    await c.worker.runUntilIdle();
    const pid = r.imported[0]!.pipeline_id;
    expect((await c.ctx.repos.pipelines.get(pid))?.status).toBe("FAILED");
    expect(await c.ctx.repos.tasks.count({ type: "script" })).toBe(0);
    expect((await fixablePipelines(c.ctx)).map((p) => p.pipeline_id)).toContain(pid);
    const fix = await buildChatGPTPrompt(c.ctx, { fixPipelineId: pid });
    expect(fix).toContain("飲むだけで痩せる");
    expect(fix).toContain("品質チェックの指摘");
    expect(c.notifications.sent.some((n) => n.title.includes("差し戻されました"))).toBe(true);
  });
});
