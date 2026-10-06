/** Tiny runtime validators for LLM JSON (no external schema lib). */
export function obj(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`${what} must be an object`);
  return v as Record<string, unknown>;
}
export function str(o: Record<string, unknown>, key: string, opts: { optional?: boolean } = {}): string {
  const v = o[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (opts.optional) return typeof v === "string" ? v : "";
  throw new Error(`"${key}" must be a non-empty string`);
}
export function num(o: Record<string, unknown>, key: string, min: number, max: number, def?: number): number {
  const v = typeof o[key] === "string" ? Number(o[key]) : o[key];
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(min, Math.min(max, v));
  if (def !== undefined) return def;
  throw new Error(`"${key}" must be a number`);
}
export function strArr(o: Record<string, unknown>, key: string, opts: { min?: number } = {}): string[] {
  const v = o[key];
  const arr = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
  if (arr.length < (opts.min ?? 0)) throw new Error(`"${key}" must have at least ${opts.min} items`);
  return arr;
}
