import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { ExternalApiError, PublishUnknownStateError } from "../src/core/errors.js";
import { MockYouTubeProvider, type UploadRequest, type UploadResult } from "../src/youtube/index.js";
import { createTestCompany, runToApproval, type TestCompany } from "./helpers.js";

let c: TestCompany;
afterEach(async () => {
  await c?.cleanup();
});

describe("4. Approval", () => {
  it("holds the publish task in WAITING_APPROVAL until a human approves (AUTO_PUBLISH=false)", async () => {
    c = await createTestCompany();
    await runToApproval(c);
    const publish = (await c.ctx.repos.tasks.list({ where: { type: "publish" } }))[0]!;
    expect(publish.status).toBe("WAITING_APPROVAL");
    expect(c.youtubeMock!.uploads).toHaveLength(0);

    await c.worker.runUntilIdle(); // nothing may publish without approval
    expect(c.youtubeMock!.uploads).toHaveLength(0);

    const [approval] = await c.ctx.approvals.pending();
    await c.ctx.approvals.approve(approval!.approval_id, "tester");
    expect((await c.ctx.tasks.get(publish.task_id))?.status).toBe("PENDING");
  });

  it("cancels publishing when a human rejects", async () => {
    c = await createTestCompany();
    await runToApproval(c);
    const [approval] = await c.ctx.approvals.pending();
    await c.ctx.approvals.reject(approval!.approval_id, "tester", "BGMの権利が不明");
    const publish = (await c.ctx.repos.tasks.list({ where: { type: "publish" } }))[0]!;
    expect(publish.status).toBe("CANCELLED");
    expect((await c.ctx.repos.videos.get(approval!.video_id))?.status).toBe("rejected");
    await c.worker.runUntilIdle();
    expect(c.youtubeMock!.uploads).toHaveLength(0);
  });

  it("refuses to publish an unapproved video even if a publish task is forced", async () => {
    c = await createTestCompany();
    await runToApproval(c);
    const [approval] = await c.ctx.approvals.pending();
    const forced = await c.ctx.tasks.create("publish", { videoId: approval!.video_id });
    await c.worker.runUntilIdle({ types: ["publish"] });
    const t = await c.ctx.tasks.get(forced.task_id);
    expect(t?.status).toBe("FAILED");
    expect(t?.error_code).toBe("NOT_APPROVED");
    expect(c.youtubeMock!.uploads).toHaveLength(0);
  });

  it("auto-approves only when AUTO_PUBLISH=true", async () => {
    c = await createTestCompany({ env: { AUTO_PUBLISH: "true" } });
    await runToApproval(c);
    const approvals = await c.ctx.repos.approvals.list();
    expect(approvals[0]?.status).toBe("approved");
    expect(approvals[0]?.decided_by).toBe("system:auto_publish");
    expect(c.youtubeMock!.uploads).toHaveLength(1);
  });
});

describe("5. Mock publish", () => {
  it("publishes privately with a YouTube ID and never uploads twice", async () => {
    c = await createTestCompany();
    await runToApproval(c);
    const [approval] = await c.ctx.approvals.pending();
    await c.ctx.approvals.approve(approval!.approval_id, "tester");
    await c.worker.runUntilIdle({ types: ["publish"] });
    const video = await c.ctx.repos.videos.get(approval!.video_id);
    expect(video?.status).toBe("published");
    expect(video?.youtube_video_id).toMatch(/^mock_/);
    expect(video?.privacy_status).toBe("private");

    const again = await c.ctx.tasks.create("publish", { videoId: video!.video_id });
    await c.worker.runUntilIdle({ types: ["publish"] });
    expect((await c.ctx.tasks.get(again.task_id))?.status).toBe("COMPLETED");
    expect(c.youtubeMock!.uploads).toHaveLength(1);
  });

  it("aborts (no retry) when the upload ends in an unknown state", async () => {
    class FlakyUpload extends MockYouTubeProvider {
      override async uploadVideo(_req: UploadRequest): Promise<UploadResult> {
        throw new PublishUnknownStateError("connection reset mid-upload");
      }
    }
    c = await createTestCompany({ youtube: new FlakyUpload() });
    await runToApproval(c);
    const [approval] = await c.ctx.approvals.pending();
    await c.ctx.approvals.approve(approval!.approval_id, "tester");
    await c.worker.runUntilIdle();
    const publish = (await c.ctx.repos.tasks.list({ where: { type: "publish" } }))[0]!;
    expect(publish.status).toBe("FAILED");
    expect(publish.retry_count).toBe(0);
    expect((await c.ctx.repos.videos.get(approval!.video_id))?.status).toBe("publish_unknown");
    await expect(c.supervisor.retryTask(publish.task_id)).rejects.toThrow(/unknown state/);
    const critical = c.notifications.sent.find((n) => n.level === "CRITICAL");
    expect(critical?.action).toContain("YouTube Studio");
  });
});

describe("6/7. Analytics → Feedback → Knowledge Base", () => {
  it("analyses the published video and stores learnings in the Knowledge Base", async () => {
    c = await createTestCompany();
    await runToApproval(c);
    const [approval] = await c.ctx.approvals.pending();
    await c.ctx.approvals.approve(approval!.approval_id, "tester");
    await c.worker.runUntilIdle();

    const analytics = (await c.ctx.repos.analytics.list())[0]!;
    expect(existsSync(analytics.file_path)).toBe(true);
    expect(analytics.unavailable_metrics).toEqual(expect.arrayContaining(["impressions", "ctr"]));
    const report = JSON.parse(readFileSync(analytics.file_path, "utf8"));
    for (const key of ["video_id", "performance_score", "what_worked", "what_failed", "retention_analysis", "recommended_changes", "next_experiments", "growth_hypothesis"]) {
      expect(report).toHaveProperty(key);
    }
    expect(report.recommended_changes.length).toBeGreaterThan(0);

    const feedback = await c.ctx.repos.feedback.list();
    expect(feedback.map((f) => f.target_agent).sort()).toEqual(["researcher", "scriptwriter"]);
    expect(feedback.every((f) => f.applied === 1)).toBe(true);

    const kb = await c.ctx.knowledge.forVideo(analytics.video_id);
    const categories = new Set(kb.map((k) => k.category));
    for (const cat of ["video_outcome", "hook", "theme", "duration", "title_pattern", "cta"]) expect(categories.has(cat as never)).toBe(true);
    expect(existsSync(`${c.dataDir}/knowledge/knowledge-base.json`)).toBe(true);

    // The next research run receives the learnings as context.
    const digest = await c.ctx.knowledge.digest();
    expect(digest.totalEntries).toBe(kb.length);
  });
});

describe("10/11. Retry", () => {
  it("retries a transient failure and then succeeds", async () => {
    let calls = 0;
    class FlakySearch extends MockYouTubeProvider {
      override async searchTrendingShorts(...args: Parameters<MockYouTubeProvider["searchTrendingShorts"]>) {
        calls++;
        if (calls === 1) throw new ExternalApiError("HTTP 503", 503, true);
        return super.searchTrendingShorts(...args);
      }
    }
    c = await createTestCompany({ youtube: new FlakySearch() });
    await c.supervisor.startPipeline();
    await c.worker.runUntilIdle({ agents: ["researcher"] });
    const t = (await c.ctx.repos.tasks.list({ where: { type: "research" } }))[0]!;
    expect(t.status).toBe("COMPLETED");
    expect(t.retry_count).toBe(1);
  });

  it("marks the task FAILED after MAX_RETRIES and notifies with the CRITICAL format", async () => {
    class AlwaysDown extends MockYouTubeProvider {
      override async searchTrendingShorts(): Promise<never> {
        throw new ExternalApiError("HTTP 503", 503, true);
      }
    }
    c = await createTestCompany({ youtube: new AlwaysDown(), env: { MAX_RETRIES: "3" } });
    const { pipeline } = await c.supervisor.startPipeline();
    await c.worker.runUntilIdle({ agents: ["researcher"] });
    const t = (await c.ctx.repos.tasks.list({ where: { type: "research" } }))[0]!;
    expect(t.status).toBe("FAILED");
    expect(t.retry_count).toBe(3);
    expect(t.attempt).toBe(4); // 1 + 3 retries, never more
    expect((await c.ctx.repos.pipelines.get(pipeline!.pipeline_id))?.status).toBe("FAILED");
    const n = c.notifications.sent.find((x) => x.level === "CRITICAL");
    expect(n).toMatchObject({ agent: "researcher", taskId: t.task_id, retry: expect.stringContaining("3/3") });
  });
});

describe("Daily limit", () => {
  it("does not start more pipelines than DAILY_VIDEO_LIMIT", async () => {
    c = await createTestCompany({ env: { DAILY_VIDEO_LIMIT: "2" } });
    expect((await c.supervisor.startPipeline()).pipeline).not.toBeNull();
    expect((await c.supervisor.startPipeline()).pipeline).not.toBeNull();
    const third = await c.supervisor.startPipeline();
    expect(third.pipeline).toBeNull();
    expect(third.reason).toContain("DAILY_VIDEO_LIMIT");
  });
});
