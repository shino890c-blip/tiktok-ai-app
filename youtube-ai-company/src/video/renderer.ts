import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ScriptOutput } from "../agents/schemas.js";
import type { AppConfig } from "../config/index.js";
import { NonRetryableError, ValidationError } from "../core/errors.js";
import { probe, run } from "./process.js";
import { buildAss, type TimedScene } from "./subtitles.js";
import { createTTS, type TTSProvider } from "./tts.js";

export interface RenderResult {
  filePath: string;
  durationSec: number;
  width: number;
  height: number;
  hasNarration: boolean;
  speedup: number;
  placeholder: boolean;
  /** Lines to append to the YouTube description (voice credits / AI disclosure). */
  credits: string[];
}

/** Turns a QC-approved script into an uploadable vertical video file. */
export interface VideoRenderer {
  readonly name: string;
  render(script: ScriptOutput, outPath: string, opts: { maxDurationSec: number }): Promise<RenderResult>;
}

export const PLACEHOLDER_SUFFIX = ".placeholder.mp4";

/** Test/demo renderer: writes a marker file instantly. Publisher refuses to upload it to real YouTube. */
export class PlaceholderRenderer implements VideoRenderer {
  readonly name = "placeholder";
  async render(script: ScriptOutput, outPath: string): Promise<RenderResult> {
    const file = outPath.replace(/\.mp4$/, PLACEHOLDER_SUFFIX);
    mkdirSync(path.dirname(file), { recursive: true });
    await writeFile(file, `PLACEHOLDER VIDEO\n${script.title_candidates[0]}\n`);
    return { filePath: file, durationSec: script.estimated_duration_sec, width: 1080, height: 1920, hasNarration: false, speedup: 1, placeholder: true, credits: [] };
  }
}

/**
 * ffmpeg renderer: TTS narration per scene → scene lengths fitted to the audio → one ASS
 * script (backgrounds, telops, captions, progress bar) burned onto a 1080x1920 canvas.
 * Optional royalty-free BGM (BGM_FILE) is mixed in at low volume.
 */
export class FfmpegRenderer implements VideoRenderer {
  readonly name = "ffmpeg";
  private fontName: string | null = null;

  constructor(
    private readonly cfg: AppConfig["video"],
    private readonly tts: TTSProvider,
  ) {}

  private async font(): Promise<string> {
    if (this.cfg.fontName) return this.cfg.fontName;
    if (this.fontName) return this.fontName;
    try {
      const { stdout } = await run("fc-match", ["-f", "%{family}", "sans-serif:lang=ja"], { timeoutMs: 10_000 });
      this.fontName = stdout.split(",")[0]!.trim() || "Noto Sans CJK JP";
    } catch {
      this.fontName = "Noto Sans CJK JP";
    }
    return this.fontName;
  }

  async render(script: ScriptOutput, outPath: string, opts: { maxDurationSec: number }): Promise<RenderResult> {
    const { ffmpegPath: ffmpeg, ffprobePath: ffprobe } = this.cfg;
    const work = await mkdtemp(path.join(os.tmpdir(), "ytco-render-"));
    try {
      const scenes = [...script.scenes].sort((a, b) => a.start_sec - b.start_sec);
      if (!scenes.length) throw new ValidationError("Script has no scenes");

      // 1) Narration per scene; measure real length.
      const raw: { file: string | null; dur: number }[] = [];
      for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i]!;
        const text = sc.narration.trim();
        if (!this.tts.producesAudio || !text) {
          raw.push({ file: null, dur: 0 });
          continue;
        }
        const f = path.join(work, `raw_${i}.wav`);
        await this.tts.synthesize(text, f);
        raw.push({ file: f, dur: (await probe(ffprobe, f)).durationSec });
      }

      // 2) Fit scene lengths to narration; speed up slightly if the total exceeds the Shorts limit.
      let lengths = scenes.map((sc, i) => Math.max(sc.end_sec - sc.start_sec, raw[i]!.dur + 0.25, 1));
      let total = lengths.reduce((s, d) => s + d, 0);
      let speedup = 1;
      if (total > opts.maxDurationSec) {
        speedup = total / opts.maxDurationSec;
        if (speedup > this.cfg.maxSpeedup) {
          throw new NonRetryableError(
            `Narration needs ${total.toFixed(1)}s (> ${opts.maxDurationSec}s even at ${this.cfg.maxSpeedup}x). Script must be shortened.`,
            "NARRATION_TOO_LONG",
          );
        }
        lengths = lengths.map((d) => d / speedup);
        total = lengths.reduce((s, d) => s + d, 0);
      }

      // 3) Build exact-length audio per scene and concatenate.
      const list: string[] = [];
      for (let i = 0; i < scenes.length; i++) {
        const out = path.join(work, `scene_${i}.wav`);
        const d = lengths[i]!.toFixed(3);
        const r = raw[i]!;
        if (r.file) {
          const af = [speedup > 1 ? `atempo=${speedup.toFixed(4)}` : null, "apad"].filter(Boolean).join(",");
          await run(ffmpeg, ["-y", "-v", "error", "-i", r.file, "-af", af, "-t", d, "-ar", "44100", "-ac", "1", out]);
        } else {
          await run(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", d, out]);
        }
        list.push(`file '${path.basename(out)}'`);
      }
      await writeFile(path.join(work, "list.txt"), list.join("\n") + "\n");
      await run(ffmpeg, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "pcm_s16le", "narration.wav"], { cwd: work });

      // 4) Subtitles / visuals timed to the same lengths.
      let t = 0;
      const timed: TimedScene[] = scenes.map((sc, i) => {
        const start = t;
        t += lengths[i]!;
        return { start, end: t, telop: sc.telop, narration: sc.narration, isHook: i === 0 };
      });
      await writeFile(path.join(work, "subs.ass"), buildAss(timed, { fontName: await this.font() }));

      // 5) Compose.
      const args = ["-y", "-v", "error", "-f", "lavfi", "-i", `color=c=black:s=1080x1920:r=30:d=${total.toFixed(3)}`, "-i", "narration.wav"];
      let audioGraph = "[1:a]anull[a]";
      if (this.cfg.bgmFile) {
        args.push("-stream_loop", "-1", "-i", this.cfg.bgmFile);
        audioGraph = `[2:a]volume=${this.cfg.bgmVolume}[b];[1:a][b]amix=inputs=2:duration=first:normalize=0[a]`;
      }
      mkdirSync(path.dirname(outPath), { recursive: true });
      args.push(
        "-filter_complex", `[0:v]ass=subs.ass[v];${audioGraph}`,
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-t", total.toFixed(3), "-movflags", "+faststart",
        path.resolve(outPath),
      );
      await run(ffmpeg, args, { cwd: work, timeoutMs: 20 * 60_000 });

      // 6) Verify the output instead of trusting the exit code.
      const info = await probe(ffprobe, outPath);
      const size = (await stat(outPath)).size;
      if (!info.hasVideo || !info.hasAudio || size === 0 || info.width !== 1080 || info.height !== 1920) {
        throw new ValidationError(`Rendered file is invalid: ${JSON.stringify({ ...info, size })}`);
      }
      if (Math.abs(info.durationSec - total) > 1.0) {
        throw new ValidationError(`Rendered duration ${info.durationSec.toFixed(2)}s differs from planned ${total.toFixed(2)}s`);
      }
      return {
        filePath: path.resolve(outPath),
        durationSec: Number(info.durationSec.toFixed(2)),
        width: info.width,
        height: info.height,
        hasNarration: this.tts.producesAudio,
        speedup: Number(speedup.toFixed(3)),
        placeholder: false,
        credits: this.tts.credit ? [this.tts.credit] : [],
      };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}

export function createRenderer(config: AppConfig): VideoRenderer {
  if (config.video.renderer === "placeholder") return new PlaceholderRenderer();
  return new FfmpegRenderer(config.video, createTTS(config));
}
