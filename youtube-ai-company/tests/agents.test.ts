import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { computePerformanceScore } from "../src/agents/analyst/index.js";
import { runQualityRules } from "../src/agents/publisher/quality-rules.js";
import type { ScriptOutput } from "../src/agents/schemas.js";
import { MockLLMProvider, type LLMRequest, type LLMResponse } from "../src/llm/index.js";
import { createTestCompany, runToApproval, type TestCompany } from "./helpers.js";

let c: TestCompany;
afterEach(async () => {
  await c?.cleanup();
});

/** Mock LLM whose research answer copies a trending title (must be rejected as plagiarism). */
class CopyingLLM extends MockLLMProvider {
  override async complete(req: LLMRequest): Promise<LLMResponse> {
    const res = await super.complete(req);
    if (req.purpose !== "research") return res;
    const out = JSON.parse(res.text);
    const trending = req.context.trending as { title: string }[];
    out.ideas[0].topic = trending[0]!.title; // a straight copy
    out.ideas[0].confidence_score = 0.99;
    return { ...res, text: JSON.stringify(out) };
  }
}

describe("1. Researcher", () => {
  it("completes, saves research JSON + ideas, and selects an idea with a reason", async () => {
    c = await createTestCompany();
    const { pipeline } = await c.supervisor.startPipeline();
    await c.worker.runUntilIdle({ agents: ["researcher"] });

    const task = (await c.ctx.repos.tasks.list({ where: { type: "research" } }))[0]!;
    expect(task.status).toBe("COMPLETED");
    const out = task.output as Record<string, string>;
    const research = await c.ctx.repos.research.get(out.research_id!);
    expect(research).toBeDefined();
    expect(existsSync(research!.file_path)).toBe(true);

    const file = JSON.parse(readFileSync(research!.file_path, "utf8"));
    expect(file.ideas.length).toBeGreaterThanOrEqual(1);
    for (const idea of file.ideas) {
      expect(idea).toMatchObject({ idea_id: expect.any(String), topic: expect.any(String), hook: expect.any(String), trend_reason: expect.any(String), why_worth_making: expect.any(String) });
      expect(idea.confidence_score).toBeGreaterThanOrEqual(0);
    }
    const selected = await c.ctx.repos.ideas.get(out.selected_idea_id!);
    expect(selected?.status).toBe("selected");
    const p = await c.ctx.repos.pipelines.get(pipeline!.pipeline_id);
    expect(p?.stage).toBe("SCRIPT"); // Supervisor handed off to Script Writer
  });

  it("rejects ideas that copy an existing video's title", async () => {
    c = await createTestCompany({ llm: new CopyingLLM() });
    await c.supervisor.startPipeline();
    await c.worker.runUntilIdle({ agents: ["researcher"] });
    const task = (await c.ctx.repos.tasks.list({ where: { type: "research" } }))[0]!;
    const research = await c.ctx.repos.research.get((task.output as Record<string, string>).research_id!);
    const rejected = (research!.findings.rejected as { reason: string }[]) ?? [];
    expect(rejected.some((r) => r.reason.includes("コピー禁止"))).toBe(true);
    const selected = await c.ctx.repos.ideas.get((task.output as Record<string, string>).selected_idea_id!);
    expect(selected?.confidence_score).toBeLessThan(0.99);
  });
});

describe("2. Script Writer", () => {
  it("writes an original script with all required parts", async () => {
    c = await createTestCompany();
    await c.supervisor.startPipeline();
    await c.worker.runUntilIdle({ agents: ["researcher", "scriptwriter"] });
    const task = (await c.ctx.repos.tasks.list({ where: { type: "script" } }))[0]!;
    expect(task.status).toBe("COMPLETED");
    const script = await c.ctx.repos.scripts.get((task.output as Record<string, string>).script_id!);
    expect(existsSync(script!.file_path)).toBe(true);
    const s = script!.content as unknown as ScriptOutput;
    expect(s.title_candidates).toHaveLength(3);
    expect(s.hook.narration.length).toBeGreaterThan(0);
    expect(s.scenes[0]!.start_sec).toBe(0);
    for (const sc of s.scenes) expect(sc).toMatchObject({ narration: expect.any(String), telop: expect.any(String), visual: expect.any(String), sfx: expect.any(String), bgm: expect.any(String) });
    expect(s.cta).toBeTruthy();
    expect(s.estimated_duration_sec).toBeGreaterThan(0);
    expect(s.retention_points.length).toBeGreaterThan(0);
  });

  it("does not retry a task whose input is invalid", async () => {
    c = await createTestCompany();
    const t = await c.ctx.tasks.create("script", { ideaId: "idea_does_not_exist" });
    await c.worker.runUntilIdle({ agents: ["scriptwriter"] });
    const after = await c.ctx.tasks.get(t.task_id);
    expect(after?.status).toBe("FAILED");
    expect(after?.error_code).toBe("INVALID_INPUT");
    expect(after?.retry_count).toBe(0);
  });
});

const goodScript = (): ScriptOutput => ({
  title_candidates: ["冷凍ご飯をふっくら保つコツ", "冷凍ご飯の正しい包み方", "冷凍ご飯がパサつく理由"],
  hook: { time_range: "0-2s", narration: "冷凍ご飯、包むタイミングが大事です", telop: "包むタイミング", visual: "アップ", intent: "" },
  scenes: [
    { scene_no: 1, start_sec: 0, end_sec: 3, narration: "冷凍ご飯、包むタイミングが大事です", telop: "包むタイミング", visual: "アップ", sfx: "", bgm: "" },
    { scene_no: 2, start_sec: 3, end_sec: 15, narration: "温かいうちに薄く包むのがコツです。", telop: "温かいうちに", visual: "手元", sfx: "", bgm: "" },
    { scene_no: 3, start_sec: 15, end_sec: 25, narration: "保存して試してみてください。", telop: "保存してね", visual: "完成", sfx: "", bgm: "" },
  ],
  cta: "保存してね",
  estimated_duration_sec: 25,
  retention_points: [{ time_sec: 2, technique: "予告" }],
  description: "冷凍ご飯のコツ",
  hashtags: ["#Shorts"],
  bgm_direction: "",
  fact_check_notes: [],
});

describe("3. Publisher quality check", () => {
  const opts = { minDurationSec: 10, maxDurationSec: 60, privacyStatus: "private", allowPublic: false };

  it("passes a clean script", () => {
    expect(runQualityRules(goodScript(), opts).filter((i) => i.severity !== "minor")).toEqual([]);
  });

  it("flags misleading claims, bad duration, missing CTA and audio/subtitle drift", () => {
    const s = goodScript();
    s.hook.narration = "これを飲むだけで痩せる！";
    s.scenes[0]!.narration = "これを飲むだけで痩せる！絶対に治る方法を今から全部説明していきますのでよく聞いてください。最後まで見ないと損しますよ";
    s.estimated_duration_sec = 90;
    s.cta = "";
    const issues = runQualityRules(s, opts);
    const blockers = issues.filter((i) => i.severity === "blocker").map((i) => i.field);
    expect(blockers).toEqual(expect.arrayContaining(["safety", "duration", "cta", "scenes[0]"]));
  });

  it("marks a passing script READY_FOR_APPROVAL and creates an approval", async () => {
    c = await createTestCompany();
    const pid = await runToApproval(c);
    const qc = (await c.ctx.repos.tasks.list({ where: { type: "quality_check" } }))[0]!;
    expect((qc.output as Record<string, unknown>).status).toBe("READY_FOR_APPROVAL");
    const video = await c.ctx.repos.videos.get((qc.output as Record<string, string>).video_id!);
    expect(video?.status).toBe("ready_for_approval");
    expect(video?.privacy_status).toBe("private");
    expect((await c.ctx.repos.pipelines.get(pid))?.status).toBe("WAITING_APPROVAL");
  });

  it("sends a failing script back to the Script Writer, then fails after max revisions", async () => {
    class BadScriptLLM extends MockLLMProvider {
      override async complete(req: LLMRequest): Promise<LLMResponse> {
        const res = await super.complete(req);
        if (req.purpose !== "script") return res;
        const out = JSON.parse(res.text);
        out.description = `${out.description} これを飲むだけで痩せる`;
        return { ...res, text: JSON.stringify(out) };
      }
    }
    c = await createTestCompany({ llm: new BadScriptLLM(), env: { MAX_SCRIPT_REVISIONS: "2" } });
    const pid = await runToApproval(c);
    const scripts = await c.ctx.repos.tasks.list({ where: { type: "script" }, orderBy: "created_at ASC" });
    expect(scripts).toHaveLength(3); // original + 2 revisions
    expect((scripts[1]!.input.revisionNotes as string[]).some((n) => n.includes("safety"))).toBe(true);
    const p = await c.ctx.repos.pipelines.get(pid);
    expect(p?.status).toBe("FAILED");
    expect(await c.ctx.repos.approvals.count()).toBe(0);
    expect(c.notifications.sent.some((n) => n.title.includes("品質チェック"))).toBe(true);
  });
});

describe("6. Analytics", () => {
  it("scores only on available metrics and never invents CTR/impressions", () => {
    const full = computePerformanceScore({ views: 10_000, averageViewPercentage: 70, likes: 500, comments: 20, shares: 30, subscribersGained: 10 }, null);
    expect(full.score).toBeGreaterThan(0);
    expect(full.basis).not.toContain("ctr");
    const partial = computePerformanceScore({ views: 10_000 }, null);
    expect(partial.insufficientData).toBe(true);
    expect(computePerformanceScore({}, null)).toEqual({ score: 0, basis: [], insufficientData: true });
  });
});
