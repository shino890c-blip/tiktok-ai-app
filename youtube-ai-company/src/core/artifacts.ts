import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export type ArtifactKind = "research" | "scripts" | "analytics" | "feedback" | "knowledge";

/** Writes agent deliverables as JSON files under data/<kind>/ (atomic write via rename). */
export class ArtifactStore {
  constructor(private readonly dataDir: string) {}

  pathFor(kind: ArtifactKind, id: string): string {
    return path.join(this.dataDir, kind, `${id}.json`);
  }

  write(kind: ArtifactKind, id: string, data: unknown): string {
    const file = this.pathFor(kind, id);
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    renameSync(tmp, file);
    return file;
  }

  /** An artifact "exists" only if the file is present, non-empty and valid JSON. */
  exists(file: string | null | undefined): boolean {
    if (!file || !existsSync(file)) return false;
    try {
      if (statSync(file).size === 0) return false;
      JSON.parse(readFileSync(file, "utf8"));
      return true;
    } catch {
      return false;
    }
  }

  read<T = unknown>(file: string): T {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  }
}
