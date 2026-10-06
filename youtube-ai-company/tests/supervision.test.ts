import { readFileSync, unlinkSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { FakeClock } from "../src/core/clock.js";
import { createTestCompany, runToApproval, type TestCompany } from "./helpers.js";

let c: TestCompany;
afterEach(async () => {
  await c?.cleanup();
});

describe("8. Supervisor task tracking", () => {
  it("tracks tasks, agents and next actions", async () => {
    c = await createTestCompany();
    await runToApproval(c);
    const r = await c.supervisor.statusReport();
    expect(r.agents.map((a) => a.name).sort()).toEqual(["analyst", "publisher", "researcher", "scriptwriter", "supervisor"]);
    expect(r.tasks.COMPLETED).toBe(3);
    expect(r.tasks.WAITING_APPROVAL).toBe(1);
    expect(r.pending_approvals).toHaveLength(1);
    expect(r.supervisor.next_actions.join("\n")).toContain("承認待ち");
    expect(r.mode).toMatchObject({ mock: true, auto_publish: false, upload_enabled: false });
  });

  it("recovers a stalled pipeline (completed task but next task never created)", async () => {
    c = await createTestCompany();
    const { pipeline } = await c.supervisor.startPipeline();
    c.supervisor.detach(); // simulate the Supervisor being down when research finished
    await c.worker.runUntilIdle({ agents: ["researcher"] });
    expect(await c.ctx.repos.tasks.count({ type: "script" })).toBe(0);

    const actions = await c.supervisor.tick();
    expect(actions).toContain(`advanced_stalled:${pipeline!.pipeline_id}`);
    expect(await c.ctx.repos.tasks.count({ type: "script", status: "PENDING" })).toBe(1);
  });
});

describe("9. Watchdog", () => {
  it("detects a stopped agent (lost heartbeat), restarts it and safely re-queues the task", async () => {
    const clock = new FakeClock("2026-03-01T00:00:00Z");
    c = await createTestCompany({ clock, env: { HEARTBEAT_INTERVAL_SECONDS: "60", HEARTBEAT_MISS_TOLERANCE: "3" } });
    await c.supervisor.startPipeline();
    const task = (await c.ctx.tasks.claimNext("researcher"))!; // claimed, then the agent "dies"
    await c.ctx.state.heartbeat("researcher", { status: "running", taskId: task.task_id });

    clock.advance(60_000);
    expect(await c.watchdog.check()).toEqual([]); // still within tolerance

    clock.advance(4 * 60_000);
    const findings = await c.watchdog.check();
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ agent: "researcher", reason: "heartbeat_lost", outcome: "retrying" });
    const after = await c.ctx.tasks.get(task.task_id);
    expect(after?.status).toBe("RETRYING");
    expect(after?.error_code).toBe("HEARTBEAT_LOST");
    const agent = await c.ctx.state.get("researcher");
    expect(agent).toMatchObject({ status: "idle", restart_count: 1 });

    // The re-queued task actually runs to completion afterwards.
    await c.worker.runUntilIdle({ agents: ["researcher"] });
    expect((await c.ctx.tasks.get(task.task_id))?.status).toBe("COMPLETED");
  });

  it("times out a task that runs longer than AGENT_TIMEOUT_MINUTES and FAILs it once retries are exhausted", async () => {
    const clock = new FakeClock("2026-03-01T00:00:00Z");
    c = await createTestCompany({ clock, env: { AGENT_TIMEOUT_MINUTES: "30", MAX_RETRIES: "1" } });
    await c.supervisor.startPipeline();
    for (let round = 0; round < 2; round++) {
      const t = (await c.ctx.tasks.claimNext("researcher"))!;
      for (let i = 0; i < 31; i++) {
        clock.advance(60_000);
        await c.ctx.tasks.heartbeat(t.task_id); // heartbeat alive, but no progress
      }
      await c.watchdog.check();
      await c.ctx.bus.drain();
    }
    const t = (await c.ctx.repos.tasks.list({ where: { type: "research" } }))[0]!;
    expect(t.status).toBe("FAILED");
    expect(t.error_code).toBe("TIMEOUT");
    expect(c.notifications.sent.some((n) => n.level === "CRITICAL" && n.taskId === t.task_id)).toBe(true);
  });

  it("ignores a late completion from a run the watchdog already reclaimed", async () => {
    const clock = new FakeClock();
    c = await createTestCompany({ clock });
    await c.supervisor.startPipeline();
    const stale = (await c.ctx.tasks.claimNext("researcher"))!;
    clock.advance(10 * 60_000);
    await c.watchdog.check();
    expect(await c.ctx.tasks.complete(stale, { research_id: "late" })).toBe(false);
  });
});

describe("12. Missing deliverables", () => {
  it("detects a completed research task whose JSON file is gone and re-runs it", async () => {
    c = await createTestCompany();
    const { pipeline } = await c.supervisor.startPipeline();
    await c.worker.runUntilIdle({ agents: ["researcher"] });
    const research = (await c.ctx.repos.research.list())[0]!;
    unlinkSync(research.file_path);

    const actions = await c.supervisor.tick();
    expect(actions.some((a) => a.startsWith("artifact_missing"))).toBe(true);
    const t = (await c.ctx.repos.tasks.list({ where: { type: "research" } }))[0]!;
    expect(t.status).toBe("RETRYING");
    expect(t.error_code).toBe("ARTIFACT_MISSING");
    expect(await c.ctx.repos.tasks.count({ type: "script", status: "CANCELLED" })).toBe(1);
    expect((await c.ctx.repos.pipelines.get(pipeline!.pipeline_id))?.stage).toBe("RESEARCH");
    expect(c.notifications.sent.some((n) => n.title.includes("成果物欠落"))).toBe(true);
  });

  it("flags a script task that completed without a script", async () => {
    c = await createTestCompany();
    await c.supervisor.startPipeline();
    await c.worker.runUntilIdle({ agents: ["researcher", "scriptwriter"] });
    const t = (await c.ctx.repos.tasks.list({ where: { type: "script" } }))[0]!;
    expect(await c.supervisor.verifyArtifacts({ ...t, output: { script_id: "script_missing" } })).toContain("script record missing");
  });

  it("treats 'published' without a YouTube ID as CRITICAL and never re-uploads", async () => {
    c = await createTestCompany();
    await runToApproval(c);
    const [approval] = await c.ctx.approvals.pending();
    await c.ctx.approvals.approve(approval!.approval_id, "tester");
    c.supervisor.detach();
    await c.worker.runUntilIdle({ types: ["publish"] });
    await c.ctx.repos.videos.update(approval!.video_id, { youtube_video_id: null }); // corrupted state

    await c.supervisor.tick();
    const publish = (await c.ctx.repos.tasks.list({ where: { type: "publish" } }))[0]!;
    expect(publish.status).toBe("FAILED");
    expect(c.youtubeMock!.uploads).toHaveLength(1);
    expect(c.notifications.sent.find((n) => n.level === "CRITICAL")?.title).toContain("YouTube video ID");
  });

  it("re-queues feedback when a completed pipeline never reached the Knowledge Base", async () => {
    c = await createTestCompany();
    await runToApproval(c);
    const [approval] = await c.ctx.approvals.pending();
    await c.ctx.approvals.approve(approval!.approval_id, "tester");
    await c.worker.runUntilIdle();
    await c.ctx.repos.db.run("DELETE FROM knowledge"); // simulate lost learnings (test-only)
    const actions = await c.supervisor.tick();
    expect(actions.some((a) => a.startsWith("requeued_feedback"))).toBe(true);
    await c.worker.runUntilIdle();
    expect(await c.ctx.repos.knowledge.count()).toBeGreaterThan(0);
  });
});

describe("13. E2E pipeline (mock)", () => {
  it("runs Research → Script → QC → Approval → Publish → Analytics → Feedback → Knowledge", async () => {
    c = await createTestCompany();
    const pid = await runToApproval(c);
    expect((await c.ctx.repos.pipelines.get(pid))?.stage).toBe("WAITING_APPROVAL");

    const [approval] = await c.ctx.approvals.pending();
    await c.ctx.approvals.approve(approval!.approval_id, "e2e-human");
    await c.worker.runUntilIdle();

    const p = (await c.ctx.repos.pipelines.get(pid))!;
    expect(p).toMatchObject({ status: "COMPLETED", stage: "COMPLETED" });
    const tasks = await c.ctx.repos.tasks.list({ where: { pipeline_id: pid } });
    expect(tasks.map((t) => t.type).sort()).toEqual(["analytics", "feedback", "publish", "quality_check", "research", "script"]);
    for (const t of tasks) {
      expect(t.status).toBe("COMPLETED");
      expect(await c.supervisor.verifyArtifacts(t)).toEqual([]);
    }
    expect(await c.ctx.repos.knowledge.count({ video_id: p.video_id })).toBeGreaterThan(5);
    const exp = await c.ctx.repos.experiments.get(p.experiment_id!);
    expect(exp?.video_ids).toContain(p.video_id);
    expect(await c.supervisor.tick()).toEqual([]); // healthy

    // Learnings flow into the next research cycle.
    await c.supervisor.startPipeline();
    await c.worker.runUntilIdle({ agents: ["researcher"] });
    const research = (await c.ctx.repos.research.list({ limit: 1 }))[0]!;
    const file = JSON.parse(readFileSync(research.file_path, "utf8"));
    expect(file.own_history.best.length).toBe(1);
  });

  it("AUTO_CONTINUE starts the next research but respects DAILY_VIDEO_LIMIT (no infinite loop)", async () => {
    c = await createTestCompany({ env: { AUTO_PUBLISH: "true", AUTO_CONTINUE: "true", DAILY_VIDEO_LIMIT: "2" } });
    await c.supervisor.startPipeline();
    await c.worker.runUntilIdle();
    expect(await c.ctx.repos.pipelines.count({ status: "COMPLETED" })).toBe(2);
    expect(await c.ctx.repos.pipelines.count()).toBe(2);
    expect(c.youtubeMock!.uploads).toHaveLength(2);
  });
});
