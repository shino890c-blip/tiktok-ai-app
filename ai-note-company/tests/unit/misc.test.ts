import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../../src/config";
import { scheduleFor } from "../../src/core/scheduler/scheduler";
import { extractJson, generateJson, type LlmProvider } from "../../src/llm/provider";
import { formatNotification } from "../../src/notifications/notificationService";
import { markdownToHtml } from "../../src/note/publisher/markdownToHtml";
import { NOTE_URL_PATTERNS, SELECTORS } from "../../src/note/selectors";

test("config: safe defaults (auto publish OFF, 1 article/day, FREE, 980円, watchdog values)", () => {
  const c = loadConfig({}, process.cwd());
  assert.equal(c.note.autoPublish, false);
  assert.equal(c.dailyArticleLimit, 1);
  assert.equal(c.defaultArticleMode, "FREE");
  assert.equal(c.defaultArticlePrice, 980);
  assert.equal(c.heartbeatIntervalSeconds, 60);
  assert.equal(c.agentTimeoutMinutes, 30);
  assert.equal(c.maxRetries, 3);
  assert.equal(c.runMode, "mock");
  assert.equal(c.note.publisher, "mock");
  assert.match(c.note.storageStatePath, /\.auth[\\/]note-storage\.json$/);
  assert.throws(() => loadConfig({ DEFAULT_ARTICLE_MODE: "NOPE" }, process.cwd()), /DEFAULT_ARTICLE_MODE/);
});

test("scheduler: daily mode waits for the configured time; immediate mode does not", () => {
  const cfg = loadConfig({ SCHEDULE_MODE: "daily", SCHEDULE_RESEARCH: "08:00" }, process.cwd()).schedule;
  const early = new Date(2026, 9, 6, 7, 0);
  assert.equal(scheduleFor("research", cfg, early)?.getHours(), 8);
  assert.equal(scheduleFor("research", cfg, new Date(2026, 9, 6, 9, 0)), null);
  assert.equal(scheduleFor("research", { ...cfg, mode: "immediate" }, early), null);
});

test("llm: JSON extraction tolerates fences and prose; generateJson re-asks once", async () => {
  assert.deepEqual(extractJson('前置き\n```json\n{"a": "}"}\n```'), { a: "}" });
  let n = 0;
  const llm: LlmProvider = { name: "x", isMock: true, generateText: async () => (++n === 1 ? "not json" : '{"ok":true}') };
  assert.deepEqual(await generateJson(llm, { task: "research", system: "", prompt: "" }, (v) => v), { ok: true });
  assert.equal(n, 2);
});

test("notifications: message formats match the spec", () => {
  assert.equal(formatNotification({ type: "PUBLISHED", title: "T", url: "https://note.com/x/n/n1", simulated: false }), "[NOTE PUBLISHED]\nTitle: T\nURL: https://note.com/x/n/n1");
  const e = formatNotification({ type: "ERROR", agent: "writer", task: "t1", error: "boom", retry: "1/3" });
  assert.equal(e, "[NOTE ERROR]\nAgent: writer\nTask: t1\nError: boom\nRetry: 1/3");
});

test("note: markdown → HTML for the editor paste", () => {
  assert.equal(markdownToHtml("## 見出し\n\n本文 **強調**\n\n- a\n- b\n\n<!-- paid -->"), "<h2>見出し</h2><p>本文 <strong>強調</strong></p><ul><li>a</li><li>b</li></ul>");
  assert.equal(markdownToHtml("<script>"), "<p>&lt;script&gt;</p>");
});

test("note: selectors are centralised and URL patterns recognise note URLs", () => {
  for (const group of Object.values(SELECTORS)) for (const d of Object.values(group)) assert.ok(d.candidates.length >= 1 && d.name);
  assert.ok(NOTE_URL_PATTERNS.article.test("https://note.com/someone/n/n1a2b3c4d5e6"));
  assert.ok(NOTE_URL_PATTERNS.editor.test("https://editor.note.com/notes/n1a2b3c/edit/"));
  assert.ok(NOTE_URL_PATTERNS.loginPage.test("https://note.com/login?redirectPath=%2F"));
});

test("logger: secrets are redacted from log metadata", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { Logger } = await import("../../src/logger");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "log-"));
  Logger.configure(dir, { quiet: true });
  new Logger("t").info("x", { password: "hunter2", apiKey: "sk-1", nested: { cookie: "c" }, ok: 1 });
  const line = fs.readFileSync(path.join(dir, "app.log"), "utf8");
  assert.ok(!line.includes("hunter2") && !line.includes("sk-1") && line.includes('"ok":1'));
});
