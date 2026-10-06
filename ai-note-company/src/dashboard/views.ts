import { PAID_MARKER } from "../agents/writer/articleFormat";
import type { HealthReport } from "../agents/supervisor/supervisor";
import type { Company } from "../company";
import type { KnowledgeSummary } from "../knowledge/knowledgeBase";
import { markdownToHtml } from "../note/publisher/markdownToHtml";
import type { Approval, Task } from "../types";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CSS = `
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1f;--muted:#6b6b70;--line:#e3e3e0;--accent:#2a7d6f;--warn:#b26b00;--bad:#b3261e;--ok:#2a7d4f}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--card:#1d1d20;--fg:#ececef;--muted:#9b9ba3;--line:#2e2e33;--accent:#5cc3b0;--warn:#e0a03a;--bad:#f2766c;--ok:#6fcf97}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
header{padding:16px 24px;border-bottom:1px solid var(--line);display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}
header h1{font-size:18px;margin:0}a{color:var(--accent)}main{padding:16px 24px;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(340px,1fr))}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;min-width:0}section.wide{grid-column:1/-1}
h2{font-size:14px;margin:0 0 10px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:5px 6px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-weight:500}
.num{text-align:right;font-variant-numeric:tabular-nums}.badge{display:inline-block;padding:1px 7px;border-radius:99px;font-size:12px;border:1px solid var(--line)}
.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.muted{color:var(--muted)}
.kpis{display:flex;gap:12px;flex-wrap:wrap}.kpi{flex:1;min-width:90px}.kpi b{display:block;font-size:22px}
.article{max-width:760px;margin:0 auto;padding:8px 0}.article h2{font-size:18px;text-transform:none;color:var(--fg);letter-spacing:0;margin-top:22px}
.paidline{border:0;border-top:2px dashed var(--warn);margin:24px 0 4px}.paidlabel{color:var(--warn);font-size:12px}
form.inline{display:inline}button{font:inherit;padding:7px 14px;border-radius:7px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}button.danger{color:var(--bad)}
textarea,input{font:inherit;width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}textarea{min-height:360px;font-family:ui-monospace,monospace;font-size:13px}
.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start}.actions form{flex:1;min-width:200px}
img.cover{max-width:100%;border-radius:8px;border:1px solid var(--line)}
@media (max-width:640px){main,header{padding:12px 16px}main{grid-template-columns:1fr}}
`;

export function layout(title: string, body: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head>
<body><header><h1>AI Note Company</h1><a href="/">Dashboard</a><span class="muted">${esc(title)}</span></header>${body}</body></html>`;
}

const statusClass = (s: string) => (/FAILED|error|REJECTED/.test(s) ? "bad" : /RETRYING|WAITING|running|PENDING/.test(s) ? "warn" : /COMPLETED|PUBLISHED|idle|APPROVED/.test(s) ? "ok" : "");
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '<span class="muted">取得不可</span>' : n.toLocaleString("ja-JP"));
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ja-JP") : "-");

function taskRow(t: Task, csrf: string): string {
  const retry = t.status === "FAILED" ? `<form class="inline" method="post" action="/tasks/${esc(t.task_id)}/retry"><input type="hidden" name="csrf" value="${csrf}"><button>再実行</button></form>` : "";
  return `<tr><td>${esc(t.type)}</td><td>${esc(t.agent)}</td><td class="${statusClass(t.status)}">${esc(t.status)}</td><td class="num">${t.retry_count}</td><td>${time(t.scheduled_at ?? t.created_at)}</td><td class="muted">${esc((t.error ?? "").slice(0, 120))} ${retry}</td></tr>`;
}

export function dashboardPage(c: Company, health: HealthReport, kb: KnowledgeSummary, csrf: string): string {
  const totals = c.repo.analyticsTotals();
  const current = c.tasks.list({ status: ["PENDING", "RUNNING", "RETRYING", "WAITING_APPROVAL"] });
  const recent = c.tasks.list({ limit: 1000 }).slice(-15).reverse();
  const approvals = c.repo.pendingApprovals();
  const published = c.repo.listPublished(20);
  const errors = c.repo.listEvents({ level: "error", limit: 10 });
  const feedback = c.repo.listFeedback(12);

  const agents = health.agents.length
    ? health.agents.map((a) => `<tr><td>${esc(a.agent)}</td><td class="${a.stale ? "bad" : statusClass(a.status)}">${esc(a.status)}${a.stale ? " (STALE)" : ""}</td><td>${time(a.last_heartbeat)}</td><td class="num">${a.restarts}</td><td class="muted">${esc((a.last_error ?? "").slice(0, 80))}</td></tr>`).join("")
    : `<tr><td colspan="5" class="muted">まだどのAgentも動いていません</td></tr>`;

  return layout(
    "Dashboard",
    `<main>
<section class="wide"><h2>Overview</h2><div class="kpis">
<div class="kpi"><span class="muted">Mode</span><b>${esc(c.config.runMode.toUpperCase())}</b></div>
<div class="kpi"><span class="muted">Auto publish</span><b class="${c.config.note.autoPublish ? "warn" : "ok"}">${c.config.note.autoPublish ? "ON" : "OFF"}</b></div>
<div class="kpi"><span class="muted">Today</span><b>${health.articles_today}/${health.daily_limit}</b></div>
<div class="kpi"><span class="muted">Views</span><b>${totals.views.toLocaleString()}</b></div>
<div class="kpi"><span class="muted">Likes</span><b>${totals.likes.toLocaleString()}</b></div>
<div class="kpi"><span class="muted">Comments</span><b>${totals.comments.toLocaleString()}</b></div>
<div class="kpi"><span class="muted">Sales</span><b>${totals.sales.toLocaleString()}</b></div>
<div class="kpi"><span class="muted">Revenue</span><b>¥${totals.revenue.toLocaleString()}</b></div>
</div>${c.config.runMode === "mock" ? '<p class="warn">MOCKモード: 数値はすべてシミュレーションです。</p>' : ""}</section>

<section><h2>Pending Approval (${approvals.length})</h2>${
      approvals.length
        ? `<table>${approvals.map((a: Approval) => { const art = c.repo.getArticle(a.article_id); return `<tr><td><a href="/approvals/${esc(a.approval_id)}">${esc(art?.title)}</a></td><td class="num">${art?.price ? `¥${art.price}` : "無料"}</td><td class="num">${art?.quality_score ?? "-"}</td></tr>`; }).join("")}</table>`
        : '<p class="muted">承認待ちはありません</p>'
    }</section>

<section><h2>Agent Status</h2><table><tr><th>Agent</th><th>Status</th><th>Heartbeat</th><th>Restarts</th><th>Last error</th></tr>${agents}</table></section>

<section class="wide"><h2>Current Tasks (${current.length})</h2><table><tr><th>Type</th><th>Agent</th><th>Status</th><th>Retry</th><th>Scheduled</th><th>Error</th></tr>${current.map((t) => taskRow(t, csrf)).join("") || '<tr><td colspan="6" class="muted">なし</td></tr>'}</table>
<details><summary class="muted">最近のタスク</summary><table>${recent.map((t) => taskRow(t, csrf)).join("")}</table></details></section>

<section class="wide"><h2>Published Articles</h2><table><tr><th>Title</th><th>URL</th><th class="num">Views</th><th class="num">Likes</th><th class="num">Comments</th><th class="num">Sales</th><th class="num">Score</th></tr>${
      published
        .map((p) => {
          const a = c.repo.latestAnalytics(p.article_id);
          return `<tr><td>${esc(p.title)}${p.is_mock ? ' <span class="badge">MOCK</span>' : ""}</td><td><a href="${esc(p.note_url)}">${esc(p.note_url)}</a></td><td class="num">${fmt(a?.views)}</td><td class="num">${fmt(a?.likes)}</td><td class="num">${fmt(a?.comments)}</td><td class="num">${fmt(a?.sales)}</td><td class="num">${a ? a.performance_score : '<span class="muted">未分析</span>'}</td></tr>`;
        })
        .join("") || '<tr><td colspan="7" class="muted">まだ公開記事はありません</td></tr>'
    }</table></section>

<section><h2>Errors</h2>${errors.length ? `<table>${errors.map((e) => `<tr><td>${time(e.created_at)}</td><td>${esc(e.agent ?? e.type)}</td><td class="bad">${esc(e.message.slice(0, 200))}</td></tr>`).join("")}</table>` : '<p class="ok">エラーはありません</p>'}</section>

<section><h2>Latest Feedback</h2>${feedback.length ? `<table>${feedback.map((f) => `<tr><td>${esc(f.source)}</td><td>${esc(f.kind)}</td><td>${esc(f.message.slice(0, 160))}</td></tr>`).join("")}</table>` : '<p class="muted">なし</p>'}</section>

<section><h2>Knowledge Base (${kb.article_count}記事)</h2>
${kb.insights.map((i) => `<p>📈 ${esc(i.statement)} <span class="muted">(n=${i.sample_size}, 信頼度${i.confidence})</span></p>`).join("")}
${kb.top_topics.length ? `<p><b>伸びたテーマ</b><br>${kb.top_topics.map((t) => `${esc(t.topic)} (${t.performance_score})`).join("<br>")}</p>` : ""}
${kb.weak_topics.length ? `<p><b>伸びなかったテーマ</b><br>${kb.weak_topics.map((t) => `${esc(t.topic)} (${t.performance_score})`).join("<br>")}</p>` : ""}
${kb.notes.map((n) => `<p class="muted">※ ${esc(n)}</p>`).join("")}</section>

<section><h2>Health</h2><table>
<tr><td>Stuck tasks</td><td class="${health.stuck_tasks.length ? "bad" : "ok"}">${health.stuck_tasks.length}</td></tr>
<tr><td>Missing article files</td><td class="${health.missing_article_files.length ? "bad" : "ok"}">${health.missing_article_files.length}</td></tr>
<tr><td>Published w/o analytics</td><td>${health.published_without_analytics.length}</td></tr>
<tr><td>Failed tasks</td><td class="${health.failed_tasks.length ? "bad" : "ok"}">${health.failed_tasks.length}</td></tr>
<tr><td>Next article today?</td><td>${health.should_create_next_article ? "yes" : "no (limit reached)"}</td></tr>
</table></section>
</main>`,
  );
}

export function approvalPage(c: Company, approval: Approval, csrf: string, message = ""): string {
  const a = c.repo.getArticle(approval.article_id);
  if (!a) return layout("Not found", "<main><section>記事が見つかりません</section></main>");
  const idea = c.repo.getIdea(a.idea_id);
  const strategy = c.repo.getStrategy(a.strategy_id);
  const qc = c.repo.latestQualityReport(a.article_id);
  const draft = c.repo.latestDraft(a.article_id);
  const free = markdownToHtml(a.free_part.replace(/^#\s+.+\n+/, ""));
  const paid = a.paid_part ? `<hr class="paidline"><div class="paidlabel">ここから有料（¥${a.price}）</div>${markdownToHtml(a.paid_part)}` : "";
  const editable = a.paid_part ? `${a.free_part}\n\n${PAID_MARKER}\n\n${a.paid_part}` : a.free_part;
  const pending = approval.status === "PENDING";
  const hidden = `<input type="hidden" name="csrf" value="${csrf}">`;

  return layout(
    `Approval: ${a.title}`,
    `<main>
${message ? `<section class="wide"><p class="warn">${esc(message)}</p></section>` : ""}
<section class="wide"><h2>判断材料</h2><table>
<tr><th>Title</th><td><b>${esc(a.title)}</b></td></tr>
<tr><th>Status</th><td><span class="${statusClass(approval.status)}">${esc(approval.status)}</span> / article ${esc(a.status)}</td></tr>
<tr><th>Price</th><td>${a.price > 0 ? `¥${a.price}` : "無料"} (${esc(a.mode)})</td></tr>
<tr><th>Tags</th><td>${a.tags.map((t) => `<span class="badge">#${esc(t)}</span>`).join(" ")}</td></tr>
<tr><th>Quality Score</th><td class="${(a.quality_score ?? 0) >= c.config.qualityThreshold ? "ok" : "bad"}">${a.quality_score ?? "-"} / 100</td></tr>
<tr><th>Research理由</th><td>${esc(idea?.trend_reason)}<br><span class="muted">読者: ${esc(idea?.target_reader)} / 悩み: ${esc(idea?.reader_problem)}</span><br><span class="muted">sources: ${esc((idea?.sources ?? []).join(", "))}</span></td></tr>
<tr><th>企画</th><td>${esc(strategy?.purpose)}<br><span class="muted">無料の価値: ${esc(strategy?.free_value)}${strategy?.paid_value ? ` / 有料の価値: ${esc(strategy.paid_value)}` : ""}</span></td></tr>
<tr><th>note下書き</th><td>${draft?.edit_url ? `<a href="${esc(draft.edit_url)}">${esc(draft.edit_url)}</a>${draft.is_mock ? " (MOCK)" : ""}` : "-"}</td></tr>
<tr><th>QC指摘</th><td>${(qc?.issues ?? []).map((i) => `<div class="${i.severity === "critical" || i.severity === "major" ? "warn" : "muted"}">[${esc(i.severity)}] ${esc(i.check)}: ${esc(i.message)}</div>`).join("") || '<span class="ok">なし</span>'}</td></tr>
</table></section>

${pending ? `<section class="wide"><h2>Decision</h2><div class="actions">
<form method="post" action="/approvals/${esc(approval.approval_id)}/decide">${hidden}<input type="hidden" name="action" value="APPROVE"><input name="comment" placeholder="コメント（任意）"><p><button class="primary">APPROVE（公開へ進む）</button></p></form>
<form method="post" action="/approvals/${esc(approval.approval_id)}/decide">${hidden}<input type="hidden" name="action" value="REGENERATE"><input name="comment" placeholder="書き直しの指示"><p><button>REGENERATE</button></p></form>
<form method="post" action="/approvals/${esc(approval.approval_id)}/decide">${hidden}<input type="hidden" name="action" value="REJECT"><input name="comment" placeholder="却下理由"><p><button class="danger">REJECT</button></p></form>
</div></section>` : ""}

<section class="wide"><h2>アイキャッチ / 本文</h2>
${a.cover_image ? `<img class="cover" src="/files/${esc(a.article_id)}/cover" alt="cover">` : '<p class="muted">アイキャッチなし</p>'}
<div class="article"><h1>${esc(a.title)}</h1>${free}${paid}</div></section>

${pending ? `<section class="wide"><h2>EDIT（編集して再チェック → 下書き更新 → 再承認）</h2>
<form method="post" action="/approvals/${esc(approval.approval_id)}/decide">${hidden}<input type="hidden" name="action" value="EDIT">
<p><label>Title<input name="title" value="${esc(a.title)}"></label></p>
<p><label>Price（円, 無料は0）<input name="price" type="number" min="0" value="${a.price}"></label></p>
<p><label>Tags（カンマ区切り）<input name="tags" value="${esc(a.tags.join(", "))}"></label></p>
<p><label>Body（Markdown。有料ラインは ${esc(PAID_MARKER)}）<textarea name="body">${esc(editable)}</textarea></label></p>
<p><input name="comment" placeholder="編集メモ（任意）"></p><button>EDIT を保存して再チェック</button></form></section>` : ""}
</main>`,
  );
}
