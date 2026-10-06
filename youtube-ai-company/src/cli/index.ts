#!/usr/bin/env node
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadConfig, loadDotEnv, redactConfig, type AppConfig } from "../config/index.js";
import { createCompany, type Company } from "../core/company.js";
import { AppError, errorMessage } from "../core/errors.js";
import type { TaskType } from "../database/types.js";
import { startDashboard } from "../dashboard/server.js";
import { GoogleOAuthClient } from "../youtube/index.js";
import { runDemo } from "./demo.js";
import { runDoctor } from "./doctor.js";
import { printStatus } from "./format.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const HELP = `AI YouTube Company CLI

Usage: npm run <command> -- [options]

Long-running
  autopilot             FULL AUTOMATION: start + AUTO_PUBLISH + AUTO_CONTINUE (checks setup first)
  start                 Worker + Supervisor + Watchdog + Dashboard (all-in-one)
  worker                Agent worker only (processes tasks, sends heartbeats)
  supervisor            Supervisor + Watchdog only
  dashboard             Dashboard web UI only

Pipeline
  goal [text] [--run]   Give the company a goal ("新しい動画を作る"). --run processes until approval
  research              Start a pipeline and run only the Researcher
  script | qc | publish | analyze | feedback
                        Run pending tasks of that stage  (analyze --video <id> --now)
  run                   Run every runnable task until idle

Delivery (PUBLISH_TARGET=delivery, default)
  deliveries            List delivered videos (folder, upload status)
  report <video_id> --views N [--likes N --comments N --shares N --subs N --avg-percent P --avg-duration S --url URL]
                        Enter stats from YouTube Studio → Analyst learns from them

Human-in-the-loop
  approvals             List pending approvals
  approve <id> [--by name] [--note text] [--video-file path] [--run]
  reject <id> --note text
  retry [task_id]       List FAILED tasks, or re-queue one
  cancel <task_id> --yes

Info
  status [--json]       Agents, tasks, pipelines, approvals, KPIs, next actions
  knowledge | experiments | config
  doctor                Check setup and list what you still need to do
  db:init               Create/migrate the SQLite database
  demo                  Full mock E2E run in an isolated demo database
  youtube:auth          OAuth consent flow; stores token.json (gitignored)
`;

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    run: { type: "boolean" },
    json: { type: "boolean" },
    yes: { type: "boolean" },
    now: { type: "boolean" },
    by: { type: "string" },
    note: { type: "string" },
    "video-file": { type: "string" },
    video: { type: "string" },
    goal: { type: "string" },
    views: { type: "string" },
    likes: { type: "string" },
    comments: { type: "string" },
    shares: { type: "string" },
    subs: { type: "string" },
    "avg-percent": { type: "string" },
    "avg-duration": { type: "string" },
    url: { type: "string" },
    "no-dashboard": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

async function withCompany<T>(config: AppConfig, fn: (c: Company) => Promise<T>): Promise<T> {
  const company = await createCompany(config);
  try {
    return await fn(company);
  } finally {
    await company.stop();
  }
}

async function runStage(c: Company, types: TaskType[]): Promise<void> {
  const agents = c.agents.filter((a) => a.handles.some((h) => types.includes(h))).map((a) => a.name);
  const n = await c.worker.runUntilIdle({ agents, types });
  console.log(`\n✔ processed ${n} task(s) [${types.join(", ")}]`);
  console.log((await c.supervisor.nextActions()).map((a) => `  → ${a}`).join("\n"));
}

function keepAlive(c: Company, extra: () => Promise<void> = async () => undefined): void {
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully…`);
    await extra();
    await c.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  c.ctx.bus.on("system.halt", async () => {
    await extra();
    await c.stop();
    process.exit(2);
  });
}

async function main(): Promise<void> {
  const cmd = positionals[0] ?? "help";
  if (flags.help || cmd === "help") {
    console.log(HELP);
    return;
  }
  loadDotEnv(ROOT);
  if (cmd === "autopilot") {
    // Running `autopilot` is the explicit opt-in to unattended production.
    process.env.AUTO_PUBLISH = "true";
    process.env.AUTO_CONTINUE = "true";
  }
  const config = loadConfig(process.env, ROOT);

  switch (cmd) {
    case "doctor": {
      const { ready } = await runDoctor(config);
      if (!ready) process.exitCode = 1;
      return;
    }
    case "autopilot": {
      const { ready } = await runDoctor(config);
      if (!ready && !config.mockMode) {
        console.log("✖ 準備ができていないためオートパイロットを開始しません。上の「あなたがやること」を済ませてください。");
        process.exitCode = 1;
        return;
      }
      const c = await createCompany(config);
      c.start();
      const server = flags["no-dashboard"] ? null : await startDashboard(c, config.dashboard);
      console.log(
        (config.publishTarget === "delivery"
          ? `\n🚀 オートパイロット開始: 調査→台本→品質チェック→動画生成→納品（${config.deliveryDir}）を自動で繰り返します` +
            `\n   投稿はあなたが「アップロード情報.txt」を見て行い、再生数を npm run report で入力するとAIが学習します`
          : `\n🚀 オートパイロット開始: 調査→台本→品質チェック→動画生成→投稿(${config.mockMode ? "MOCK" : config.youtube.allowPublic ? config.youtube.defaultPrivacy : "private"})→分析→学習 を自動で繰り返します`) +
          `\n   1日${config.pipeline.dailyVideoLimit}本まで / ${config.pipeline.autopilotMinIntervalMinutes}分間隔 / 連続${config.pipeline.autopilotMaxConsecutiveFailures}回失敗で自動停止` +
          `\n   Dashboard: http://${config.dashboard.host}:${config.dashboard.port}   停止: Ctrl+C\n`,
      );
      keepAlive(c, async () => void server?.close());
      return;
    }
    case "start": {
      const c = await createCompany(config);
      c.start();
      const server = flags["no-dashboard"] ? null : await startDashboard(c, config.dashboard);
      if (str(flags.goal)) await c.supervisor.startPipeline(str(flags.goal));
      keepAlive(c, async () => void server?.close());
      return;
    }
    case "worker": {
      const c = await createCompany(config);
      c.start({ worker: true, supervisor: false, watchdog: false });
      keepAlive(c);
      return;
    }
    case "supervisor": {
      const c = await createCompany(config);
      c.start({ worker: false, supervisor: true, watchdog: true });
      keepAlive(c);
      return;
    }
    case "dashboard": {
      const c = await createCompany(config);
      const server = await startDashboard(c, config.dashboard);
      keepAlive(c, async () => void server.close());
      return;
    }
    case "db:init":
      await withCompany(config, async (c) => {
        console.log(`✔ Database ready: ${config.databaseUrl}`);
        console.log(`✔ Agents registered: ${(await c.ctx.state.all()).map((a) => a.name).join(", ")}`);
        console.log(`✔ Experiments seeded: ${(await c.ctx.experiments.list()).length}`);
      });
      return;
    case "goal":
    case "research":
      await withCompany(config, async (c) => {
        const goal = positionals.slice(1).join(" ") || str(flags.goal) || "新しい動画を作る";
        const r = await c.supervisor.startPipeline(goal);
        if (!r.pipeline) {
          console.log(`✖ ${r.reason}`);
          process.exitCode = 1;
          return;
        }
        console.log(`✔ Pipeline ${r.pipeline.pipeline_id} started: "${goal}"`);
        if (cmd === "research") await runStage(c, ["research"]);
        else if (flags.run) await runStage(c, ["research", "script", "quality_check", "publish", "analytics", "feedback"]);
      });
      return;
    case "script":
      return withCompany(config, (c) => runStage(c, ["script"]));
    case "qc":
      return withCompany(config, (c) => runStage(c, ["quality_check"]));
    case "publish":
      return withCompany(config, (c) => runStage(c, ["publish"]));
    case "feedback":
      return withCompany(config, (c) => runStage(c, ["feedback"]));
    case "run":
      return withCompany(config, (c) => runStage(c, ["research", "script", "quality_check", "publish", "analytics", "feedback"]));
    case "analyze":
      return withCompany(config, async (c) => {
        const videoId = str(flags.video);
        if (videoId) {
          const has = (await c.ctx.repos.tasks.list({ where: { type: "analytics", status: ["PENDING", "RETRYING", "RUNNING"] } })).some((t) => t.input.videoId === videoId);
          if (!has) await c.ctx.tasks.create("analytics", { videoId });
        }
        if (flags.now) {
          const pending = await c.ctx.repos.tasks.list({ where: { type: "analytics", status: ["PENDING", "RETRYING"] } });
          for (const t of pending) await c.ctx.repos.tasks.update(t.task_id, { next_run_at: c.ctx.clock.now().toISOString() });
          console.log(`Analytics scheduled now for ${pending.length} task(s)`);
        }
        await runStage(c, ["analytics", "feedback"]);
      });
    case "deliveries":
      return withCompany(config, async (c) => {
        const vids = await c.ctx.repos.videos.list({ where: { status: "delivered" }, limit: 50 });
        if (!vids.length) return console.log("まだ納品された動画はありません（npm run autopilot で作り始めます）");
        for (const v of vids) {
          const reported = (await c.ctx.repos.analytics.count({ video_id: v.video_id })) > 0;
          console.log(`\n■ ${v.title}\n  フォルダ: ${v.delivery_path}\n  納品日時: ${v.published_at}  動画ID: ${v.video_id}  ${reported ? "✔ 再生数入力済み" : "（投稿後に npm run report -- " + v.video_id + " --views 再生数）"}`);
        }
      });
    case "report":
      return withCompany(config, async (c) => {
        const id = positionals[1];
        const n = (k: string) => (str(flags[k]) !== undefined ? Number(str(flags[k])) : undefined);
        if (!id || n("views") === undefined || !Number.isFinite(n("views"))) {
          throw new Error("Usage: report <video_id> --views 1234 [--likes 50 --comments 3 --shares 2 --subs 1 --avg-percent 65 --avg-duration 18]");
        }
        const video = await c.ctx.repos.videos.get(id);
        if (!video) throw new Error(`動画が見つかりません: ${id}（npm run deliveries で確認）`);
        const url = str(flags.url);
        if (url) await c.ctx.repos.videos.update(id, { youtube_url: url });
        await c.ctx.tasks.create("analytics", {
          videoId: id,
          manualMetrics: {
            views: n("views"),
            likes: n("likes"),
            comments: n("comments"),
            shares: n("shares"),
            subscribersGained: n("subs"),
            averageViewPercentage: n("avg-percent"),
            averageViewDurationSec: n("avg-duration"),
          },
        });
        await runStage(c, ["analytics", "feedback"]);
        const a = (await c.ctx.repos.analytics.list({ where: { video_id: id }, limit: 1 }))[0];
        if (a) {
          const r = a.report as Record<string, any>;
          console.log(`\n📊 スコア ${a.performance_score}（${r.success ? "成功" : "改善の余地あり"}）: ${r.verdict_reason}`);
          for (const x of (r.recommended_changes as string[]) ?? []) console.log(`  次回の改善: ${x}`);
        }
      });
    case "approvals":
      return withCompany(config, async (c) => {
        const pending = await c.ctx.approvals.pending();
        if (!pending.length) return console.log("承認待ちはありません");
        for (const a of pending) {
          const v = await c.ctx.repos.videos.get(a.video_id);
          const s = v ? await c.ctx.repos.scripts.get(v.script_id) : undefined;
          console.log(`\n■ ${a.approval_id}  (video ${a.video_id}, requested ${a.requested_at})`);
          console.log(`  タイトル: ${v?.title}`);
          console.log(`  公開設定: ${v?.privacy_status}   動画ファイル: ${v?.video_file_path ?? "(未添付)"}`);
          console.log(`  台本: ${s?.file_path}`);
          const checklist = (s?.qc_report?.human_checklist as string[] | undefined) ?? [];
          if (checklist.length) console.log(`  確認事項:\n${checklist.map((x) => `    - ${x}`).join("\n")}`);
        }
        console.log(`\n承認: npm run approve -- <approval_id> [--video-file path]   却下: npm run reject -- <approval_id> --note "理由"`);
      });
    case "approve":
      return withCompany(config, async (c) => {
        const id = positionals[1];
        if (!id) throw new Error("Usage: approve <approval_id|video_id>");
        const a = await c.ctx.approvals.approve(id, `cli:${str(flags.by) ?? process.env.USER ?? "human"}`, {
          note: str(flags.note),
          videoFilePath: str(flags["video-file"]),
        });
        console.log(`✔ Approved ${a.approval_id} (video ${a.video_id})`);
        if (flags.run) await runStage(c, ["publish", "analytics", "feedback"]);
        else console.log("  → npm run publish で投稿処理を実行（または起動中のworkerが自動で処理）");
      });
    case "reject":
      return withCompany(config, async (c) => {
        const id = positionals[1];
        const note = str(flags.note);
        if (!id || !note) throw new Error('Usage: reject <approval_id> --note "理由"');
        const a = await c.ctx.approvals.reject(id, `cli:${str(flags.by) ?? process.env.USER ?? "human"}`, note);
        console.log(`✔ Rejected ${a.approval_id}`);
      });
    case "retry":
      return withCompany(config, async (c) => {
        const id = positionals[1];
        if (!id) {
          const failed = await c.ctx.repos.tasks.list({ where: { status: "FAILED" }, limit: 30 });
          if (!failed.length) return console.log("FAILEDタスクはありません");
          for (const t of failed) console.log(`${t.task_id}  ${t.type.padEnd(14)} ${t.error_code ?? ""}  ${t.error ?? ""}`);
          return console.log("\n再実行: npm run retry -- <task_id>");
        }
        const ok = await c.supervisor.retryTask(id);
        console.log(ok ? `✔ Re-queued ${id}` : `✖ ${id} is not a FAILED task`);
      });
    case "cancel":
      return withCompany(config, async (c) => {
        const id = positionals[1];
        if (!id) throw new Error("Usage: cancel <task_id> --yes");
        if (!flags.yes) {
          console.log("キャンセルは取り消せません。実行するには --yes を付けてください。");
          return;
        }
        console.log((await c.ctx.tasks.cancel(id, "Cancelled by human via CLI")) ? `✔ Cancelled ${id}` : `✖ ${id} is not active`);
      });
    case "status":
      return withCompany(config, async (c) => {
        await c.supervisor.tick();
        const r = await c.supervisor.statusReport();
        if (flags.json) console.log(JSON.stringify(r, null, 2));
        else printStatus(r);
      });
    case "knowledge":
      return withCompany(config, async (c) => {
        for (const k of await c.ctx.knowledge.list({ limit: 50 })) console.log(`[${k.category}/${k.polarity}] ${k.content}`);
      });
    case "experiments":
      return withCompany(config, async (c) => {
        for (const e of await c.ctx.experiments.list()) {
          console.log(`${e.name}: ${e.variant}\n  仮説: ${e.hypothesis}\n  指標: ${e.metric} / 状態: ${e.status} / 結論: ${e.conclusion ?? "-"} / n=${e.video_ids.length}`);
        }
      });
    case "config":
      console.log(JSON.stringify(redactConfig(config), null, 2));
      return;
    case "demo":
      await runDemo(ROOT);
      return;
    case "youtube:auth":
      await youtubeAuth(config);
      return;
    default:
      console.log(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

async function youtubeAuth(config: AppConfig): Promise<void> {
  const { clientId, clientSecret, redirectUri, tokenPath } = config.youtube;
  if (!clientId || !clientSecret) throw new Error("Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env first (see README).");
  const client = new GoogleOAuthClient({ clientId, clientSecret, redirectUri, tokenPath });
  const { url, state } = client.buildAuthUrl();
  const redirect = new URL(redirectUri);
  console.log(`\n1. ブラウザで次のURLを開き、チャンネルのGoogleアカウントで許可してください:\n\n${url}\n`);
  console.log(`2. ${redirect.origin}${redirect.pathname} でコールバックを待っています…（Ctrl+Cで中止）`);
  await new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const u = new URL(req.url ?? "/", redirect.origin);
      if (u.pathname !== redirect.pathname) {
        res.writeHead(404).end();
        return;
      }
      try {
        if (u.searchParams.get("state") !== state) throw new Error("OAuth state mismatch");
        const code = u.searchParams.get("code");
        if (!code) throw new Error(u.searchParams.get("error") ?? "No code returned");
        await client.exchangeCode(code);
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("認証が完了しました。このタブを閉じてください。");
        console.log(`✔ Token saved to ${tokenPath} (gitignored)`);
        server.close();
        resolve();
      } catch (err) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end(`Error: ${errorMessage(err)}`);
        server.close();
        reject(err);
      }
    });
    // Inside Docker the callback must listen on 0.0.0.0 (OAUTH_LISTEN_HOST) to be reachable through the port mapping.
    server.listen(Number(redirect.port || 80), process.env.OAUTH_LISTEN_HOST || redirect.hostname);
  });
}

main().catch((err: unknown) => {
  const prefix = err instanceof AppError ? `[${err.code}] ` : "";
  console.error(`\n✖ ${prefix}${errorMessage(err)}`);
  process.exitCode = 1;
});
