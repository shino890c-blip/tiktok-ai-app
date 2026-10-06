import crypto from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Local date key (YYYY-MM-DD) used for the daily article limit. */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's local time "HH:MM" as a Date. */
export function todayAt(hhmm: string, base: Date = new Date()): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Invalid time "${hhmm}" (expected HH:MM)`);
  const d = new Date(base);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function slugify(input: string, fallback: string): string {
  const ascii = input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii.length >= 3 ? ascii.slice(0, 60) : fallback;
}

/** Deterministic hash → number in [0,1). Used by mock/simulation code. */
export function seeded(text: string): number {
  const h = crypto.createHash("sha256").update(text).digest();
  return h.readUInt32BE(0) / 0x100000000;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
