import { execFile } from "node:child_process";
import { NonRetryableError, RetryableError } from "../core/errors.js";

export interface RunResult {
  stdout: string;
  stderr: string;
}

/** Runs a binary without a shell (no injection), with a timeout and a bounded output buffer. */
export function run(bin: string, args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { cwd: opts.cwd, timeout: opts.timeoutMs ?? 10 * 60_000, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
      (err, stdout, stderr) => {
        if (!err) return resolve({ stdout, stderr });
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return reject(new NonRetryableError(`${bin} not found. Install ffmpeg (see README) or set FFMPEG_PATH/FFPROBE_PATH.`, "FFMPEG_NOT_FOUND"));
        }
        const tail = String(stderr).split("\n").filter(Boolean).slice(-6).join(" | ");
        reject(new RetryableError(`${bin} failed: ${tail || err.message}`, "RENDER_FAILED"));
      },
    );
  });
}

export interface ProbeResult {
  durationSec: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
}

export async function probe(ffprobe: string, file: string): Promise<ProbeResult> {
  const { stdout } = await run(ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { timeoutMs: 60_000 });
  const data = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number }[] };
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  return {
    durationSec: Number(data.format?.duration ?? 0),
    hasVideo: Boolean(video),
    hasAudio: streams.some((s) => s.codec_type === "audio"),
    width: video?.width ?? null,
    height: video?.height ?? null,
  };
}
