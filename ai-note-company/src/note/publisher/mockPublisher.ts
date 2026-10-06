import fs from "node:fs";
import path from "node:path";
import { markdownToHtml } from "./markdownToHtml";
import { PublishUnverifiedError, type DraftResult, type NotePostInput, type NotePublisher, type PublishResult } from "./types";

/**
 * Simulates note without touching the network. Writes what would have been
 * posted to data/mock-note/<key>/ so humans can inspect it.
 */
export class MockNotePublisher implements NotePublisher {
  readonly name = "mock";
  readonly isMock = true;
  /** For tests: make the next N calls of a kind fail. */
  failures: { draft: number; publish: number; unverified: number } = { draft: 0, publish: 0, unverified: 0 };

  constructor(private readonly dir: string) {}

  private keyFromEdit(editUrl: string): string {
    const m = /notes\/(n[0-9a-z]+)\/edit/.exec(editUrl);
    if (!m) throw new Error(`invalid mock edit url: ${editUrl}`);
    return m[1];
  }

  async saveDraft(input: NotePostInput, editUrl?: string | null): Promise<DraftResult> {
    if (this.failures.draft > 0) {
      this.failures.draft--;
      throw new Error("mock: simulated draft failure");
    }
    const key = editUrl ? this.keyFromEdit(editUrl) : `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const d = path.join(this.dir, key);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "draft.json"), JSON.stringify({ ...input, saved_at: new Date().toISOString() }, null, 2));
    fs.writeFileSync(
      path.join(d, "draft.html"),
      `<!doctype html><meta charset="utf-8"><title>${input.title}</title><h1>${input.title}</h1>${markdownToHtml(input.free_body)}${
        input.paid_body ? `<hr><p>--- ここから有料（${input.price}円）---</p>${markdownToHtml(input.paid_body)}` : ""
      }`,
    );
    return { status: "DRAFT", edit_url: `mock://note.com/notes/${key}/edit`, note_key: key, is_mock: true, warnings: [] };
  }

  async publish(input: NotePostInput, editUrl: string): Promise<PublishResult> {
    if (input.publish_mode === "DRAFT") throw new Error("DRAFT mode articles are never published.");
    if (this.failures.publish > 0) {
      this.failures.publish--;
      throw new Error("mock: simulated publish failure (before publish click)");
    }
    const key = this.keyFromEdit(editUrl);
    const d = path.join(this.dir, key);
    if (!fs.existsSync(path.join(d, "draft.json"))) throw new Error(`mock draft not found: ${key}`);
    if (this.failures.unverified > 0) {
      this.failures.unverified--;
      throw new PublishUnverifiedError("mock: publish clicked but URL could not be verified");
    }
    const url = `mock://note.com/ai-note-company/n/${key}`;
    fs.writeFileSync(path.join(d, "published.json"), JSON.stringify({ url, published_at: new Date().toISOString() }, null, 2));
    // "Verification": the published record must exist.
    if (!fs.existsSync(path.join(d, "published.json"))) throw new PublishUnverifiedError("mock publish not verified");
    return { status: "PUBLISHED", note_url: url, is_mock: true, warnings: [] };
  }
}
