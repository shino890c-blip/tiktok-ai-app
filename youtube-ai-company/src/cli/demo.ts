import path from "node:path";
import { loadConfig } from "../config/index.js";
import { createCompany } from "../core/company.js";
import { ConsoleSink, FileSink, LevelFilterSink } from "../logging/logger.js";
import { printStatus } from "./format.js";

const step = (n: number, title: string) => console.log(`\n\x1b[1m[${String(n).padStart(2, "0")}] ${title}\x1b[0m`);

/**
 * Full mock E2E run in an isolated, timestamped demo database (the real DB is untouched):
 * Research → Script → QC → Render → Approval → Mock Publish → Mock Analytics → Feedback → Knowledge → Supervisor check.
 */
export async function runDemo(root: string): Promise<boolean> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dataDir = path.join(root, "data", "demo", stamp);
  const config = loadConfig(
    {
      ...process.env,
      MOCK_MODE: "true",
      AUTO_PUBLISH: "false",
      DATA_DIR: dataDir,
      DATABASE_URL: `sqlite:${path.join(dataDir, "demo.db")}`,
      RETRY_BASE_DELAY_MS: "0",
      NOTIFY_CHANNELS: "console",
    },
    root,
  );

  step(1, "SQLite DB初期化 + Mockモード");
  const company = await createCompany(config, {
    logSinks: [new LevelFilterSink(new ConsoleSink(), "WARN"), new FileSink(config.logDir)],
  });
  const { ctx, supervisor, worker } = company;
  try {
    console.log(`  DB: ${config.databaseUrl}\n  LLM: ${ctx.llm.name}  YouTube: ${ctx.youtube.name}  AUTO_PUBLISH=${config.pipeline.autoPublish}`);

    step(2, "5 Agent起動（登録 + heartbeat）");
    for (const a of await ctx.state.all()) console.log(`  ✔ ${a.name.padEnd(13)} ${a.role}`);

    step(3, "Goal「新しい動画を作る」→ Research Task作成");
    const { pipeline, reason } = await supervisor.startPipeline("新しい動画を作る");
    if (!pipeline) throw new Error(reason);
    console.log(`  pipeline=${pipeline.pipeline_id}`);

    step(4, "Researcher 実行");
    await worker.runUntilIdle({ agents: ["researcher"] });
    let p = (await ctx.repos.pipelines.get(pipeline.pipeline_id))!;
    const research = await ctx.repos.research.get(p.research_id!);
    const idea = await ctx.repos.ideas.get(p.idea_id!);
    console.log(`  市場分析: ${research?.market_summary}`);
    console.log(`  選定企画: ${idea?.topic}（confidence ${idea?.confidence_score}）\n  フック: ${idea?.hook}\n  作る価値: ${idea?.why_worth_making}`);
    console.log(`  → ${research?.file_path}`);

    step(5, "Script Writer へ受け渡し → 台本作成");
    await worker.runUntilIdle({ agents: ["scriptwriter"] });
    p = (await ctx.repos.pipelines.get(pipeline.pipeline_id))!;
    const script = await ctx.repos.scripts.get(p.script_id!);
    const content = script?.content as Record<string, any>;
    console.log(`  タイトル候補: ${(content.title_candidates as string[]).join(" / ")}`);
    console.log(`  尺: ${content.estimated_duration_sec}秒  シーン数: ${(content.scenes as unknown[]).length}  フック形式: ${content.hook_style}`);
    console.log(`  → ${script?.file_path}`);

    step(6, "Publisher / Quality Check");
    await worker.runUntilIdle({ agents: ["publisher"], types: ["quality_check"] });
    p = (await ctx.repos.pipelines.get(pipeline.pipeline_id))!;
    // A QC send-back loops through Script Writer again (bounded by MAX_SCRIPT_REVISIONS).
    for (let i = 0; i < config.pipeline.maxScriptRevisions && p.stage !== "WAITING_APPROVAL" && p.status === "ACTIVE"; i++) {
      await worker.runUntilIdle({ agents: ["scriptwriter", "publisher"], types: ["script", "quality_check"] });
      p = (await ctx.repos.pipelines.get(pipeline.pipeline_id))!;
    }
    const finalScript = p.script_id ? await ctx.repos.scripts.get(p.script_id) : undefined;
    const qc = finalScript?.qc_report;
    console.log(`  QC: passed=${String(qc?.passed)} score=${String(qc?.overall_score)} issues=${JSON.stringify(qc?.counts)}`);
    console.log(`  pipeline stage: ${p.stage}`);

    step(7, "動画生成（ナレーション＋テロップ＋字幕 → 1080x1920 MP4）");
    await worker.runUntilIdle({ agents: ["publisher"], types: ["render"] });
    p = (await ctx.repos.pipelines.get(pipeline.pipeline_id))!;
    const render = (await ctx.repos.tasks.list({ where: { pipeline_id: pipeline.pipeline_id, type: "render" } }))[0];
    const ro = (render?.output ?? {}) as Record<string, unknown>;
    console.log(`  ${render?.status}: ${String(ro.file_path ?? render?.error)}  (${String(ro.duration_sec ?? "-")}秒, narration=${String(ro.has_narration ?? "-")})`);

    step(8, "Approval待ち（READY_FOR_APPROVAL）");
    const pending = await ctx.approvals.pending();
    if (!pending.length) throw new Error("No approval request was created");
    console.log(`  承認待ち: ${pending[0]!.approval_id}`);
    console.log("  （デモのため demo-operator が承認します。本番では人間が npm run approve / Dashboard で承認）");
    await ctx.approvals.approve(pending[0]!.approval_id, "demo-operator", { note: "mock E2E demo" });

    step(9, "Mock Publish");
    await worker.runUntilIdle({ agents: ["publisher"], types: ["publish"] });
    p = (await ctx.repos.pipelines.get(pipeline.pipeline_id))!;
    const video = await ctx.repos.videos.get(p.video_id!);
    console.log(`  ${video?.status}: ${video?.youtube_video_id} (${video?.privacy_status}) ${video?.youtube_url}`);

    step(10, "Mock Analytics");
    await worker.runUntilIdle({ agents: ["analyst"] });
    p = (await ctx.repos.pipelines.get(pipeline.pipeline_id))!;
    const analytics = p.analytics_id ? await ctx.repos.analytics.get(p.analytics_id) : undefined;
    const rep = analytics?.report as Record<string, any> | undefined;
    console.log(`  score=${analytics?.performance_score} success=${rep?.success} views=${(analytics?.metrics as any)?.views} 取得不可=${analytics?.unavailable_metrics.join(",")}`);
    for (const c of (rep?.recommended_changes as string[]) ?? []) console.log(`  次回の改善: ${c}`);

    step(11, "Feedback → Knowledge Base 保存");
    await worker.runUntilIdle({ agents: ["supervisor"] });
    const kb = await ctx.knowledge.forVideo(p.video_id!);
    console.log(`  Knowledge entries: ${kb.length}`);
    for (const k of kb.slice(0, 5)) console.log(`   - [${k.category}/${k.polarity}] ${k.content}`);

    step(12, "Supervisor 全体確認（成果物の存在・パイプライン状態）");
    const actions = await supervisor.tick();
    const tasks = await ctx.repos.tasks.list({ where: { pipeline_id: pipeline.pipeline_id }, orderBy: "created_at ASC" });
    let artifactProblems = 0;
    for (const t of tasks) {
      const problems = t.status === "COMPLETED" ? await supervisor.verifyArtifacts(t) : [];
      artifactProblems += problems.length;
      console.log(`  ${t.status === "COMPLETED" && !problems.length ? "✔" : "✖"} ${t.type.padEnd(14)} ${t.status}${problems.length ? ` ${problems.join("; ")}` : ""}`);
    }
    p = (await ctx.repos.pipelines.get(pipeline.pipeline_id))!;
    console.log(`  supervisor actions: ${actions.length ? actions.join(", ") : "none (healthy)"}`);
    printStatus(await supervisor.statusReport());

    const ok = p.status === "COMPLETED" && artifactProblems === 0 && kb.length > 0;
    console.log(ok ? "\n\x1b[32m✔ Mock E2E pipeline completed successfully\x1b[0m" : `\n\x1b[31m✖ E2E incomplete: pipeline=${p.status}/${p.stage}\x1b[0m`);
    console.log(`  demo data: ${dataDir}`);
    if (!ok) process.exitCode = 1;
    return ok;
  } finally {
    await company.stop();
  }
}
