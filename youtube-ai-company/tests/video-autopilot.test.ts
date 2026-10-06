import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ScriptOutput } from "../src/agents/schemas.js";
import { loadConfig } from "../src/config/index.js";
import { FakeClock } from "../src/core/clock.js";
import { ExternalApiError } from "../src/core/errors.js";
import { MockLLMProvider } from "../src/llm/index.js";
import { probe } from "../src/video/process.js";
import { FfmpegRenderer } from "../src/video/renderer.js";
import { buildAss, chunkNarration, wrapJa } from "../src/video/subtitles.js";
import { SilentTTS, VoicevoxTTS } from "../src/video/tts.js";
import { MockYouTubeProvider } from "../src/youtube/index.js";
import { createTestCompany, ROOT, runToApproval, type TestCompany } from "./helpers.js";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

let c: TestCompany | undefined;
const cleanups: (() => void)[] = [];
afterEach(async () => {
  await c?.cleanup();
  c = undefined;
  while (cleanups.length) cleanups.pop()!();
});

async function sampleScript(duration = 20): Promise<ScriptOutput> {
  const res = await new MockLLMProvider().complete({
    purpose: "script",
    system: "",
    prompt: "",
    context: { idea: { topic: "玉ねぎで涙が出にくくなる切り方", hook: "玉ねぎで泣いてしまう人、包丁を見直したことありますか？", recommended_duration: duration, target_audience: "料理初心者" }, maxDuration: 60 },
  });
  return JSON.parse(res.text) as ScriptOutput;
}

describe("Subtitles", () => {
  it("wraps Japanese text with balanced hard breaks and chunks narration at punctuation", () => {
    expect(wrapJa("保存して試してみてね", 9)).toBe("保存して試\\Nしてみてね");
    const chunks = chunkNarration("1つ目、冷めると水分が逃げる。2つ目、温かいうちに薄く平らに包む。", 20);
    expect(chunks.every((x) => [...x].length <= 20)).toBe(true);
    expect(chunks.join("")).toBe("1つ目、冷めると水分が逃げる。2つ目、温かいうちに薄く平らに包む。");
  });

  it("builds ASS events whose timing covers every scene", () => {
    const ass = buildAss(
      [
        { start: 0, end: 3, telop: "フック{x}", narration: "あ。", isHook: true },
        { start: 3, end: 10, telop: "本題", narration: "い。う。", isHook: false },
      ],
      { fontName: "Noto Sans CJK JP" },
    );
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("0:00:10.00");
    expect(ass).not.toContain("{x}"); // override-tag injection stripped
  });
});

describe.skipIf(!hasFfmpeg)("ffmpeg renderer", () => {
  it("renders a verified 1080x1920 video with an audio track", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ytco-render-test-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const cfg = loadConfig({}, ROOT);
    const script = await sampleScript(15);
    const r = await new FfmpegRenderer(cfg.video, new SilentTTS()).render(script, path.join(dir, "v.mp4"), { maxDurationSec: 60 });
    const info = await probe("ffprobe", r.filePath);
    expect(info).toMatchObject({ hasVideo: true, hasAudio: true, width: 1080, height: 1920 });
    expect(Math.abs(info.durationSec - script.estimated_duration_sec)).toBeLessThan(1);
  });

  it("uses VOICEVOX narration, stretches scenes to fit it, and adds the credit line", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ytco-vv-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const wav = path.join(dir, "tone.wav");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=440:d=4", "-ar", "24000", wav]);
    const tone = readFileSync(wav);
    const calls: string[] = [];
    const server: Server = createServer((req, res) => {
      calls.push(req.url!.split("?")[0]!);
      if (req.url!.startsWith("/audio_query")) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ speedScale: 1 }));
      } else if (req.url!.startsWith("/synthesis")) {
        res.setHeader("content-type", "audio/wav");
        res.end(tone);
      } else res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    cleanups.push(() => server.close());
    const port = (server.address() as { port: number }).port;

    const tts = new VoicevoxTTS(`http://127.0.0.1:${port}`, 3, 1.1, "VOICEVOX:ずんだもん");
    const script = await sampleScript(15);
    const cfg = loadConfig({}, ROOT);
    const r = await new FfmpegRenderer(cfg.video, tts).render(script, path.join(dir, "v.mp4"), { maxDurationSec: 60 });
    expect(calls.filter((x) => x === "/synthesis").length).toBe(script.scenes.length);
    expect(r.credits).toEqual(["VOICEVOX:ずんだもん"]);
    expect(r.durationSec).toBeGreaterThanOrEqual(script.scenes.length * 4); // every scene ≥ its 4s narration
  });

  it("refuses narration that cannot fit the Shorts limit even when sped up", async () => {
    const cfg = loadConfig({ NARRATION_MAX_SPEEDUP: "1.1" }, ROOT);
    const script = await sampleScript(45);
    await expect(new FfmpegRenderer(cfg.video, new SilentTTS()).render(script, path.join(os.tmpdir(), "never.mp4"), { maxDurationSec: 20 })).rejects.toThrow(
      /Script must be shortened/,
    );
  });
});

describe("Render stage in the pipeline", () => {
  it("detects a rendered video file that disappeared", async () => {
    c = await createTestCompany();
    await runToApproval(c);
    const render = (await c.ctx.repos.tasks.list({ where: { type: "render" } }))[0]!;
    const video = await c.ctx.repos.videos.get((render.output as Record<string, string>).video_id!);
    unlinkSync(video!.video_file_path!);
    expect((await c.supervisor.verifyArtifacts(render)).join()).toContain("rendered video file missing");
  });

  it("never uploads a placeholder video to real YouTube", async () => {
    class RealishYouTube extends MockYouTubeProvider {}
    const yt = new RealishYouTube();
    Object.defineProperty(yt, "isMock", { value: false });
    c = await createTestCompany({ youtube: yt });
    await c.supervisor.startPipeline();
    await c.worker.runUntilIdle();
    const render = (await c.ctx.repos.tasks.list({ where: { type: "render" } }))[0]!;
    expect(render.status).toBe("FAILED");
    expect(render.error_code).toBe("PLACEHOLDER_VIDEO");
    expect(yt.uploads).toHaveLength(0);
  });
});

describe("Autopilot (AUTO_CONTINUE)", () => {
  it("starts the next video once the previous one is published, without waiting for analytics", async () => {
    const clock = new FakeClock("2026-05-01T00:00:00Z");
    c = await createTestCompany({ clock, env: { AUTO_PUBLISH: "true", AUTO_CONTINUE: "true", ANALYTICS_DELAY_HOURS: "48", DAILY_VIDEO_LIMIT: "3" } });
    await c.supervisor.startPipeline();
    await c.worker.runUntilIdle();
    // 3 videos produced and published on the same day; analytics still scheduled for later.
    expect(c.youtubeMock!.uploads).toHaveLength(3);
    expect(await c.ctx.repos.pipelines.count({ stage: "ANALYTICS" })).toBe(3);
    expect((await c.supervisor.startPipeline()).pipeline).toBeNull(); // daily cap holds

    clock.advance(49 * 3_600_000); // analytics become due
    await c.worker.runUntilIdle();
    expect(await c.ctx.repos.pipelines.count({ status: "COMPLETED" })).toBe(3);
  });

  it("spaces automatic starts by AUTOPILOT_MIN_INTERVAL_MINUTES", async () => {
    const clock = new FakeClock("2026-05-01T00:00:00Z");
    c = await createTestCompany({ clock, env: { AUTO_PUBLISH: "true", AUTO_CONTINUE: "true", AUTOPILOT_MIN_INTERVAL_MINUTES: "120" } });
    await c.supervisor.startPipeline();
    await c.worker.runUntilIdle();
    expect(await c.ctx.repos.pipelines.count()).toBe(1);
    clock.advance(121 * 60_000);
    expect((await c.supervisor.tick()).some((a) => a.startsWith("autopilot_started"))).toBe(true);
  });

  it("pauses after consecutive failed pipelines (circuit breaker) and alerts a human", async () => {
    class Down extends MockYouTubeProvider {
      override async searchTrendingShorts(): Promise<never> {
        throw new ExternalApiError("HTTP 503", 503, true);
      }
    }
    c = await createTestCompany({ youtube: new Down(), env: { AUTO_CONTINUE: "true", MAX_RETRIES: "0", AUTOPILOT_MAX_CONSECUTIVE_FAILURES: "2", DAILY_VIDEO_LIMIT: "10" } });
    await c.supervisor.startPipeline();
    await c.worker.runUntilIdle();
    await c.supervisor.tick();
    await c.worker.runUntilIdle();
    for (let i = 0; i < 3; i++) await c.supervisor.tick();
    expect(await c.ctx.repos.pipelines.count({ status: "FAILED" })).toBe(2);
    expect(await c.ctx.repos.pipelines.count()).toBe(2); // no runaway retries of new pipelines
    expect(c.notifications.sent.some((n) => n.title.includes("オートパイロットを一時停止"))).toBe(true);
  });
});
