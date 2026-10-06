import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/index.js";
import { ConfigError } from "../src/core/errors.js";
import { withBackoff } from "../src/core/retry.js";
import { startDashboard } from "../src/dashboard/server.js";
import { extractJson } from "../src/llm/index.js";
import { createLogger, MemorySink } from "../src/logging/logger.js";
import { formatNotification } from "../src/notifications/index.js";
import { parseIsoDuration } from "../src/youtube/google.js";
import { createTestCompany, ROOT, runToApproval, type TestCompany } from "./helpers.js";

let c: TestCompany | undefined;
afterEach(async () => {
  await c?.cleanup();
  c = undefined;
});

describe("Config & safety defaults", () => {
  it("defaults to mock mode, no auto-publish, no real upload, private videos", () => {
    const cfg = loadConfig({}, ROOT);
    expect(cfg.mockMode).toBe(true);
    expect(cfg.pipeline.autoPublish).toBe(false);
    expect(cfg.youtube.uploadEnabled).toBe(false);
    expect(cfg.youtube.allowPublic).toBe(false);
    expect(cfg.youtube.defaultPrivacy).toBe("private");
    expect(cfg.pipeline).toMatchObject({ maxRetries: 3, agentTimeoutMinutes: 30, heartbeatIntervalSeconds: 60, dailyVideoLimit: 3 });
  });

  it("refuses real providers without keys and public privacy without explicit opt-in", () => {
    expect(() => loadConfig({ MOCK_MODE: "false", LLM_PROVIDER: "anthropic", LLM_MODEL: "x" }, ROOT)).toThrow(ConfigError);
    expect(() => loadConfig({ YOUTUBE_DEFAULT_PRIVACY: "public" }, ROOT)).toThrow(ConfigError);
    expect(() => loadConfig({ MAX_RETRIES: "abc" }, ROOT)).toThrow(ConfigError);
  });

  it("keeps secrets out of git", () => {
    const gi = readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    for (const p of [".env", "credentials.json", "token.json", "*.secret"]) expect(gi.split("\n")).toContain(p);
    const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
    expect(example).toMatch(/AUTO_PUBLISH=false/);
    expect(example).toMatch(/DAILY_VIDEO_LIMIT=3/);
  });

  it("has no hard-coded API keys in source", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts")) files.push(p);
      }
    };
    walk(path.join(ROOT, "src"));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-ant-[A-Za-z0-9-]{20,}/);
    }
  });
});

describe("Utilities", () => {
  it("bounded exponential backoff never retries forever", async () => {
    let n = 0;
    await expect(
      withBackoff(
        async () => {
          n++;
          throw new Error("down");
        },
        { retries: 3, baseDelayMs: 0, sleep: async () => undefined },
      ),
    ).rejects.toThrow("down");
    expect(n).toBe(4);
  });

  it("extracts JSON from fenced LLM output", () => {
    expect(extractJson('Here:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson("no json")).toThrow();
  });

  it("parses ISO-8601 durations from the YouTube API", () => {
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT1M5S")).toBe(65);
  });

  it("formats CRITICAL notifications in the operator format", () => {
    const text = formatNotification({ level: "CRITICAL", title: "x", agent: "researcher", taskId: "task_1", error: "boom", retry: "3/3", action: "check" });
    expect(text).toBe("[CRITICAL] x\nAgent：researcher\nTask：task_1\nError：boom\nRetry：3/3\nAction：check");
  });

  it("writes structured logs with timestamp/agent/task_id/event/message/metadata", () => {
    const sink = new MemorySink();
    createLogger({ sinks: [sink] }).child({ agent: "researcher", task_id: "t1" }).critical("x.y", "msg", { k: 1 });
    expect(sink.records[0]).toMatchObject({ level: "CRITICAL", agent: "researcher", task_id: "t1", event: "x.y", message: "msg", metadata: { k: 1 } });
    expect(sink.records[0]!.timestamp).toMatch(/^\d{4}-/);
  });
});

describe("Persistence & dashboard", () => {
  it("persists agent activity to system_events for traceability", async () => {
    c = await createTestCompany();
    await c.supervisor.startPipeline();
    await c.worker.runUntilIdle({ agents: ["researcher"] });
    await new Promise((r) => setTimeout(r, 20));
    const events = await c.ctx.repos.events.list({ where: { agent: "researcher" } });
    expect(events.some((e) => e.event === "research.idea_selected")).toBe(true);
  });

  it("serves status and requires the token for write actions", async () => {
    c = await createTestCompany();
    await runToApproval(c);
    const server = await startDashboard(c, { host: "127.0.0.1", port: 0, token: "test-token" });
    try {
      const addr = server.address() as { port: number };
      const base = `http://127.0.0.1:${addr.port}`;
      const status = (await (await fetch(`${base}/api/status`)).json()) as { pending_approvals: { approval_id: string }[] };
      expect(status.pending_approvals).toHaveLength(1);
      expect((await fetch(`${base}/`)).status).toBe(200);

      const id = status.pending_approvals[0]!.approval_id;
      expect((await fetch(`${base}/api/approvals/${id}/approve`, { method: "POST" })).status).toBe(401);
      const ok = await fetch(`${base}/api/approvals/${id}/approve`, { method: "POST", headers: { authorization: "Bearer test-token" }, body: "{}" });
      expect(ok.status).toBe(200);
      expect((await c.ctx.repos.approvals.get(id))?.status).toBe("approved");
    } finally {
      server.close();
    }
  });
});
