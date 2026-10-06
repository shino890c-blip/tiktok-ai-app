#!/usr/bin/env node
import fs from "node:fs";
import { createCompany, type Company } from "../company";
import { loadConfig } from "../config";
import { startDashboard } from "../dashboard/server";
import { Logger } from "../logger";
import type { ApprovalAction, Task, TaskType } from "../types";

function parseArgs(argv: string[]): { cmd: string; flags: Record<string, string | boolean> } {
  const [cmd = "help", ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else flags[key] = true;
  }
  return { cmd, flags };
}

/** Runs queued tasks of the given types right now (manual CLI ignores schedule times). */
async function runTypes(c: Company, types: TaskType[], opts: { max?: number } = {}): Promise<Task[]> {
  const ran: Task[] = [];
  for (let i = 0; i < (opts.max ?? 20); i++) {
    const t = c.tasks.list({ status: ["PENDING", "RETRYING"] }).find((x) => types.includes(x.type));
    if (!t) break;
    ran.push(await c.runner.run(t));
  }
  return ran;
}

function printTasks(ts: Task[]): void {
  if (!ts.length) return console.log("  (実行対象のタスクはありません)");
  for (const t of ts) console.log(`  ${t.status.padEnd(16)} ${t.type.padEnd(10)} ${t.task_id}${t.error ? `  ✖ ${t.error}` : ""}`);
}

function printStatus(c: Company): void {
  const h = c.supervisor.health();
  console.log(`\n=== AI Note Company status (${c.config.runMode.toUpperCase()} mode, auto_publish=${c.config.note.autoPublish}) ===`);
  console.log(`Today: ${h.articles_today}/${h.daily_limit} articles   Tasks: ${Object.entries(h.tasks).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log("\nAgents:");
  for (const a of h.agents) console.log(`  ${a.agent.padEnd(11)} ${a.status.padEnd(9)} hb=${a.last_heartbeat} restarts=${a.restarts}${a.stale ? " STALE" : ""}${a.last_error ? ` err=${a.last_error.slice(0, 80)}` : ""}`);
  const active = c.tasks.list({ status: ["PENDING", "RUNNING", "RETRYING", "WAITING_APPROVAL"] });
  console.log("\nCurrent tasks:");
  printTasks(active);
  const ap = c.repo.pendingApprovals();
  console.log(`\nPending approvals: ${ap.length}`);
  for (const a of ap) {
    const art = c.repo.getArticle(a.article_id);
    console.log(`  ${a.approval_id}  score=${art?.quality_score}  ${art?.price ? `¥${art.price}` : "無料"}  ${art?.title}`);
  }
  console.log("\nPublished:");
  for (const p of c.repo.listPublished(10)) {
    const an = c.repo.latestAnalytics(p.article_id);
    console.log(`  ${p.note_url}${p.is_mock ? " (MOCK)" : ""}  views=${an?.views ?? "-"} likes=${an?.likes ?? "-"} comments=${an?.comments ?? "-"} sales=${an?.sales ?? "-"}  ${p.title}`);
  }
  if (h.failed_tasks.length) {
    console.log("\nFailed tasks:");
    for (const f of h.failed_tasks) console.log(`  ${f.type} ${f.task_id}: ${f.error}`);
  }
  const kb = c.knowledge.summarize();
  console.log(`\nKnowledge: ${kb.article_count} articles, ${kb.insights.length} insights`);
  for (const n of kb.notes) console.log(`  ※ ${n}`);
}

const HELP = `AI Note Company CLI

  npm run dev          Supervisorループ + Dashboard（.envの設定で起動。既定はMOCK）
  npm run start        build済みコードで Supervisor + Dashboard
  npm run supervisor   Supervisorループのみ
  npm run research     今日の記事のResearchを今すぐ実行（DAILY_ARTICLE_LIMIT内）
  npm run write        Strategy → Writing → Quality を今すぐ実行
  npm run draft        note下書き作成を今すぐ実行
  npm run publish      承認済み記事の公開を実行
  npm run analytics    Analytics → Knowledge更新を今すぐ実行（--all で全公開記事）
  npm run status       状態を表示
  npm run approve      承認待ち一覧 / -- --id <approval_id> --action approve|reject|regenerate|edit [--comment ..] [--title ..] [--price ..] [--tags a,b] [--body-file path]
  npm run login        noteへ人間がログインし、セッションを .auth/ に保存
  npm run dashboard    Dashboardのみ起動
  npx tsx src/cli/index.ts pipeline        1記事を承認待ちまで一気に実行
  npx tsx src/cli/index.ts check-selectors noteのUIセレクタが解決できるか確認（要ログイン）
`;

async function main(): Promise<void> {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  if (cmd === "help" || flags.help) return void console.log(HELP);
  const config = loadConfig();

  if (cmd === "login") {
    Logger.configure(config.logDir);
    const { interactiveLogin } = await import("../note/auth/auth");
    const r = await interactiveLogin(config, new Logger("login"));
    console.log(r.message);
    process.exitCode = r.ok ? 0 : 1;
    return;
  }

  const c = createCompany(config);
  const shutdown = () => {
    c.close();
    process.exit(0);
  };

  switch (cmd) {
    case "dev":
    case "start": {
      const server = await startDashboard(c);
      console.log(`Dashboard: http://${config.dashboard.host}:${config.dashboard.port}  (mode=${config.runMode}, auto_publish=${config.note.autoPublish})`);
      process.on("SIGINT", () => server.close(shutdown));
      process.on("SIGTERM", () => server.close(shutdown));
      await c.supervisor.loop();
      return;
    }
    case "supervisor":
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
      await c.supervisor.loop();
      return;
    case "dashboard": {
      await startDashboard(c);
      console.log(`Dashboard: http://${config.dashboard.host}:${config.dashboard.port}`);
      process.on("SIGINT", shutdown);
      return;
    }
    case "research": {
      const t = c.supervisor.ensureDailyResearch(new Date(), { force: true });
      if (!t) console.log(`本日の記事数が DAILY_ARTICLE_LIMIT=${config.dailyArticleLimit} に達しています。`);
      printTasks(await runTypes(c, ["research"]));
      break;
    }
    case "write":
      printTasks(await runTypes(c, ["strategy", "writing", "quality"]));
      break;
    case "draft":
      printTasks(await runTypes(c, ["draft"]));
      break;
    case "publish":
      printTasks(await runTypes(c, ["publish"]));
      break;
    case "analytics": {
      if (flags.all) {
        for (const p of c.repo.listPublished(100)) c.tasks.create({ agent: "analytics", type: "analytics", input: { article_id: p.article_id }, pipelineId: c.repo.articlePipeline(p.article_id) });
      }
      printTasks(await runTypes(c, ["analytics", "knowledge"]));
      break;
    }
    case "pipeline": {
      c.supervisor.ensureDailyResearch(new Date(), { force: true });
      printTasks(await runTypes(c, ["research", "strategy", "writing", "quality", "draft"]));
      break;
    }
    case "approve": {
      if (!flags.id) {
        const list = c.repo.pendingApprovals();
        if (!list.length) console.log("承認待ちはありません。");
        for (const a of list) {
          const art = c.repo.getArticle(a.article_id);
          const qc = c.repo.latestQualityReport(a.article_id);
          console.log(`\n${a.approval_id}\n  Title: ${art?.title}\n  Price: ${art?.price ? `¥${art.price}` : "無料"}  Tags: ${art?.tags.join(", ")}\n  Quality: ${art?.quality_score}  issues=${qc?.issues.length ?? 0}\n  File: ${art?.file_path}\n  Draft: ${c.repo.latestDraft(a.article_id)?.edit_url ?? "-"}`);
        }
        console.log(`\n承認: npm run approve -- --id <approval_id> --action approve\nDashboard: npm run dashboard → http://${config.dashboard.host}:${config.dashboard.port}`);
        break;
      }
      const action = String(flags.action ?? "approve").toUpperCase() as ApprovalAction;
      const edits =
        action === "EDIT"
          ? {
              title: typeof flags.title === "string" ? flags.title : undefined,
              price: typeof flags.price === "string" ? Number(flags.price) : undefined,
              tags: typeof flags.tags === "string" ? flags.tags.split(",").map((s) => s.trim()) : undefined,
              body_markdown: typeof flags["body-file"] === "string" ? fs.readFileSync(flags["body-file"], "utf8") : undefined,
            }
          : undefined;
      const r = c.approvals.decide(String(flags.id), action, { comment: typeof flags.comment === "string" ? flags.comment : undefined, edits });
      console.log(`${action}: ${r.approval.approval_id} → ${r.approval.status}`);
      if (!flags["no-run"]) printTasks(await runTypes(c, ["publish", "writing", "quality", "draft"]));
      break;
    }
    case "status":
      printStatus(c);
      break;
    case "check-selectors": {
      const { checkSelectors } = await import("../note/browser/checkSelectors");
      const report = await checkSelectors(config);
      for (const r of report) console.log(`${r.matched === null ? "✖" : "✔"} ${r.name}${r.matched !== null ? ` (candidate #${r.matched})` : ""}`);
      break;
    }
    default:
      console.log(HELP);
      process.exitCode = 1;
  }
  c.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
