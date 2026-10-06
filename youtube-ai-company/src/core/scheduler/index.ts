import type { Logger } from "../../logging/logger.js";

interface Job {
  name: string;
  intervalMs: number;
  fn: () => Promise<void>;
  timer?: NodeJS.Timeout;
  running: boolean;
}

/**
 * Runs named periodic jobs. A job never overlaps with itself, and errors are logged
 * instead of killing the loop. `stop()` waits for in-flight runs.
 */
export class Scheduler {
  private jobs = new Map<string, Job>();
  private stopped = false;
  private inflight = new Set<Promise<void>>();

  constructor(private readonly logger: Logger) {}

  every(name: string, intervalMs: number, fn: () => Promise<void>, opts: { runImmediately?: boolean } = {}): void {
    const job: Job = { name, intervalMs, fn, running: false };
    this.jobs.set(name, job);
    const tick = async () => {
      if (this.stopped) return;
      if (!job.running) {
        job.running = true;
        const p = job
          .fn()
          .catch((err: unknown) => this.logger.error("scheduler.job_failed", `Job ${name} failed`, { error: String(err) }))
          .finally(() => {
            job.running = false;
          });
        this.inflight.add(p);
        await p;
        this.inflight.delete(p);
      }
      if (!this.stopped) job.timer = setTimeout(tick, job.intervalMs);
    };
    job.timer = setTimeout(tick, opts.runImmediately ? 0 : intervalMs);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const job of this.jobs.values()) if (job.timer) clearTimeout(job.timer);
    await Promise.allSettled([...this.inflight]);
  }
}
