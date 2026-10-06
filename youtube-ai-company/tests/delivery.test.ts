import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/index.js";
import { DELIVERY_FILES } from "../src/delivery/index.js";
import { createTestCompany, ROOT, type TestCompany } from "./helpers.js";

let c: TestCompany | undefined;
afterEach(async () => {
  await c?.cleanup();
  c = undefined;
});

const DELIVERY = { PUBLISH_TARGET: "delivery" };

describe("Delivery mode (no YouTube API)", () => {
  it("is the default publish target", () => {
    expect(loadConfig({}, ROOT).publishTarget).toBe("delivery");
  });

  it("delivers a ready-to-upload folder without approval or any YouTube call", async () => {
    c = await createTestCompany({ env: DELIVERY });
    const { pipeline } = await c.supervisor.startPipeline();
    await c.worker.runUntilIdle();

    const p = (await c.ctx.repos.pipelines.get(pipeline!.pipeline_id))!;
    expect(p).toMatchObject({ status: "COMPLETED", stage: "COMPLETED" });
    expect(await c.ctx.repos.approvals.count()).toBe(0);
    expect(c.youtubeMock!.uploads).toHaveLength(0);

    const video = (await c.ctx.repos.videos.get(p.video_id!))!;
    expect(video.status).toBe("delivered");
    expect(existsSync(path.join(video.delivery_path!, DELIVERY_FILES.video))).toBe(true);
    const info = readFileSync(path.join(video.delivery_path!, DELIVERY_FILES.info), "utf8");
    expect(info).toContain(video.title);
    expect(info).toContain("#Shorts");
    expect(info).toContain(`npm run report -- ${video.video_id}`);
    expect(existsSync(path.join(video.delivery_path!, DELIVERY_FILES.script))).toBe(true);

    for (const t of await c.ctx.repos.tasks.list({ where: { pipeline_id: p.pipeline_id } })) {
      expect(await c.supervisor.verifyArtifacts(t)).toEqual([]);
    }
    expect(c.notifications.sent.some((n) => n.title.includes("納品しました"))).toBe(true);
  });

  it("learns from stats a human types in (npm run report)", async () => {
    c = await createTestCompany({ env: DELIVERY });
    const { pipeline } = await c.supervisor.startPipeline();
    await c.worker.runUntilIdle();
    const videoId = (await c.ctx.repos.pipelines.get(pipeline!.pipeline_id))!.video_id!;

    await c.ctx.tasks.create("analytics", { videoId, manualMetrics: { views: 5000, likes: 200, averageViewPercentage: 70 } });
    await c.worker.runUntilIdle();
    const a = (await c.ctx.repos.analytics.list({ where: { video_id: videoId } }))[0]!;
    expect(a.metrics).toMatchObject({ views: 5000, likes: 200 });
    expect(a.unavailable_metrics).toEqual(expect.arrayContaining(["comments", "impressions", "ctr", "retention"]));
    expect(await c.ctx.repos.knowledge.count({ video_id: videoId })).toBeGreaterThan(3);
  });

  it("refuses API analytics for a delivered video and tells the human to use report", async () => {
    c = await createTestCompany({ env: DELIVERY });
    const { pipeline } = await c.supervisor.startPipeline();
    await c.worker.runUntilIdle();
    const videoId = (await c.ctx.repos.pipelines.get(pipeline!.pipeline_id))!.video_id!;
    const t = await c.ctx.tasks.create("analytics", { videoId });
    await c.worker.runUntilIdle();
    expect((await c.ctx.tasks.get(t.task_id))?.error).toContain("npm run report");
  });

  it("autopilot keeps delivering up to the daily limit", async () => {
    c = await createTestCompany({ env: { ...DELIVERY, AUTO_CONTINUE: "true", DAILY_VIDEO_LIMIT: "3" } });
    await c.supervisor.startPipeline();
    await c.worker.runUntilIdle();
    expect(await c.ctx.repos.videos.count({ status: "delivered" })).toBe(3);
    expect(await c.ctx.repos.pipelines.count()).toBe(3);
  });

  it("does not feed simulated trend data to a real (non-mock) setup without a YouTube API", async () => {
    c = await createTestCompany({ env: { ...DELIVERY, MOCK_MODE: "false", LLM_PROVIDER: "mock", TTS_PROVIDER: "silent" } });
    await c.supervisor.startPipeline();
    await c.worker.runUntilIdle({ agents: ["researcher"] });
    const research = (await c.ctx.repos.research.list())[0]!;
    expect(research.source_urls).toEqual([]);
    expect((research.findings.stats as { sample_size: number }).sample_size).toBe(0);
  });
});
