import type { StatusReport } from "../agents/supervisor/orchestrator.js";

export function printStatus(r: StatusReport): void {
  const line = "─".repeat(64);
  console.log(`\n${line}\nAI YouTube Company — ${r.generated_at}`);
  console.log(`Mode: ${r.mode.mock ? "MOCK" : "LIVE"} | LLM ${r.mode.llm} | YouTube ${r.mode.youtube} | AUTO_PUBLISH=${r.mode.auto_publish} | UPLOAD=${r.mode.upload_enabled}`);
  console.log(`${line}\nSupervisor: ${r.supervisor.status} (last check ${r.supervisor.last_tick ?? "-"})`);
  for (const a of r.supervisor.next_actions) console.log(`  → ${a}`);

  console.log(`\nAgents`);
  for (const a of r.agents) {
    console.log(`  ${a.name.padEnd(13)} ${a.status.padEnd(8)} hb=${a.last_heartbeat ?? "-"} ${a.current_task ? `task=${a.current_task}` : ""}${a.restart_count ? ` restarts=${a.restart_count}` : ""}`);
  }
  const t = r.tasks;
  console.log(`\nTasks  pending=${t.PENDING} running=${t.RUNNING} waiting_approval=${t.WAITING_APPROVAL} retrying=${t.RETRYING} completed=${t.COMPLETED} failed=${t.FAILED} cancelled=${t.CANCELLED} | retries total=${r.retries_total}`);
  for (const x of r.running_tasks) console.log(`  ${x.task_id} ${x.type.padEnd(14)} ${x.status.padEnd(16)} retry ${x.retry_count}/${x.max_retries}${x.error ? ` err=${x.error}` : ""}`);

  console.log(`\nPipelines (latest)`);
  for (const p of r.pipelines.slice(0, 5)) console.log(`  ${p.pipeline_id} ${p.stage.padEnd(16)} ${p.status}${p.error ? ` — ${p.error}` : ""}`);

  console.log(`\nApprovals pending: ${r.pending_approvals.length}`);
  for (const a of r.pending_approvals) console.log(`  ${a.approval_id}  「${a.title ?? a.video_id}」`);

  console.log(`\nVideos published=${r.videos.published} total_views=${r.videos.total_views} avg_views=${r.videos.average_views ?? "-"} | today ${r.daily.created_today}/${r.daily.limit} created, ${r.daily.published_today} published`);
  if (r.videos.latest) console.log(`  latest: 「${r.videos.latest.title}」 ${r.videos.latest.youtube_video_id}`);
  if (r.latest_analytics) {
    const la = r.latest_analytics as Record<string, any>;
    console.log(`  latest analysis: score=${la.performance_score} success=${la.success}`);
    for (const c of (la.recommended_changes as string[]) ?? []) console.log(`    改善: ${c}`);
  }
  console.log(`\nKnowledge entries: ${r.knowledge_entries}`);
  console.log(`Experiments: ${r.experiments.map((e) => `${e.name}[${e.status}${e.conclusion ? `:${e.conclusion}` : ""}, n=${e.samples}]`).join("  ")}`);
  if (r.recent_errors.length) {
    console.log(`\nRecent errors`);
    for (const e of r.recent_errors.slice(0, 5)) console.log(`  ${e.created_at} ${e.level} [${e.agent ?? "-"}] ${e.message}`);
  }
  console.log(line);
}
