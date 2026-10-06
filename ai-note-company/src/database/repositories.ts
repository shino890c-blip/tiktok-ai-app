import type { Db } from "./db";
import { fromJson, toJson } from "./db";
import type {
  AnalyticsResult,
  Approval,
  ApprovalStatus,
  Article,
  ArticleMetrics,
  Draft,
  Idea,
  PublishedArticle,
  QualityReport,
  Strategy,
} from "../types";
import { newId, nowIso } from "../utils";

type Row = Record<string, unknown>;

export interface SystemEvent {
  event_id: string;
  level: "info" | "warn" | "error";
  type: string;
  agent: string | null;
  task_id: string | null;
  message: string;
  data: unknown;
  created_at: string;
}

export interface KnowledgeRecord {
  knowledge_id: string;
  article_id: string | null;
  kind: string;
  topic: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export interface FeedbackRecord {
  feedback_id: string;
  article_id: string | null;
  source: string;
  kind: string;
  message: string;
  created_at: string;
}

/** All persistence goes through here — agents never write SQL directly. */
export class Repository {
  constructor(readonly db: Db) {}

  // ---------- ideas ----------
  saveIdea(idea: Idea, pipelineId: string | null): void {
    this.db.run("INSERT INTO ideas (idea_id, pipeline_id, topic, data, selected, created_at) VALUES (?,?,?,?,0,?)", [
      idea.idea_id,
      pipelineId,
      idea.topic,
      toJson(idea),
      nowIso(),
    ]);
  }
  markIdeaSelected(ideaId: string): void {
    this.db.run("UPDATE ideas SET selected = 1 WHERE idea_id = ?", [ideaId]);
  }
  getIdea(ideaId: string): Idea | undefined {
    const r = this.db.get<Row>("SELECT data FROM ideas WHERE idea_id = ?", [ideaId]);
    return r ? fromJson<Idea>(r.data, undefined as unknown as Idea) : undefined;
  }
  listIdeas(limit = 50): (Idea & { selected: boolean; created_at: string })[] {
    return this.db
      .all<Row>("SELECT data, selected, created_at FROM ideas ORDER BY created_at DESC LIMIT ?", [limit])
      .map((r) => ({ ...fromJson<Idea>(r.data, {} as Idea), selected: r.selected === 1, created_at: String(r.created_at) }));
  }
  recentTopics(limit = 30): string[] {
    return this.db.all<Row>("SELECT topic FROM ideas WHERE selected = 1 ORDER BY created_at DESC LIMIT ?", [limit]).map((r) => String(r.topic));
  }

  // ---------- strategies ----------
  saveStrategy(s: Strategy): void {
    this.db.run("INSERT INTO strategies (strategy_id, idea_id, title, data, created_at) VALUES (?,?,?,?,?)", [
      s.strategy_id,
      s.idea_id,
      s.title,
      toJson(s),
      nowIso(),
    ]);
  }
  getStrategy(id: string): Strategy | undefined {
    const r = this.db.get<Row>("SELECT data FROM strategies WHERE strategy_id = ?", [id]);
    return r ? fromJson<Strategy>(r.data, {} as Strategy) : undefined;
  }

  // ---------- articles ----------
  saveArticle(a: Article, pipelineId: string | null): void {
    const now = nowIso();
    this.db.run(
      `INSERT INTO articles (article_id, pipeline_id, strategy_id, idea_id, title, status, mode, price, quality_score, revision, data, file_path, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [a.article_id, pipelineId, a.strategy_id, a.idea_id, a.title, a.status, a.mode, a.price, a.quality_score, a.revision, toJson(a), a.file_path, now, now],
    );
  }
  updateArticle(a: Article): void {
    this.db.run(
      "UPDATE articles SET title=?, status=?, mode=?, price=?, quality_score=?, revision=?, data=?, file_path=?, updated_at=? WHERE article_id=?",
      [a.title, a.status, a.mode, a.price, a.quality_score, a.revision, toJson(a), a.file_path, nowIso(), a.article_id],
    );
  }
  getArticle(id: string): Article | undefined {
    const r = this.db.get<Row>("SELECT data FROM articles WHERE article_id = ?", [id]);
    return r ? fromJson<Article>(r.data, {} as Article) : undefined;
  }
  listArticles(limit = 50): (Article & { created_at: string; pipeline_id: string | null })[] {
    return this.db
      .all<Row>("SELECT data, created_at, pipeline_id FROM articles ORDER BY created_at DESC LIMIT ?", [limit])
      .map((r) => ({ ...fromJson<Article>(r.data, {} as Article), created_at: String(r.created_at), pipeline_id: (r.pipeline_id as string) ?? null }));
  }
  articlePipeline(id: string): string | null {
    const r = this.db.get<Row>("SELECT pipeline_id FROM articles WHERE article_id = ?", [id]);
    return (r?.pipeline_id as string) ?? null;
  }

  // ---------- quality ----------
  saveQualityReport(r: QualityReport, revision: number): void {
    this.db.run("INSERT INTO quality_reports (report_id, article_id, revision, score, passed, data, created_at) VALUES (?,?,?,?,?,?,?)", [
      newId("qc"),
      r.article_id,
      revision,
      r.score,
      r.passed ? 1 : 0,
      toJson(r),
      nowIso(),
    ]);
  }
  latestQualityReport(articleId: string): QualityReport | undefined {
    const r = this.db.get<Row>("SELECT data FROM quality_reports WHERE article_id = ? ORDER BY created_at DESC, revision DESC LIMIT 1", [articleId]);
    return r ? fromJson<QualityReport>(r.data, {} as QualityReport) : undefined;
  }

  // ---------- drafts ----------
  saveDraft(d: Draft): void {
    this.db.run("INSERT INTO drafts (draft_id, article_id, status, note_url, edit_url, is_mock, created_at) VALUES (?,?,?,?,?,?,?)", [
      d.draft_id,
      d.article_id,
      d.status,
      d.note_url,
      d.edit_url,
      d.is_mock ? 1 : 0,
      d.created_at,
    ]);
  }
  latestDraft(articleId: string): Draft | undefined {
    const r = this.db.get<Row>("SELECT * FROM drafts WHERE article_id = ? AND status = 'DRAFT' ORDER BY created_at DESC LIMIT 1", [articleId]);
    return r ? rowToDraft(r) : undefined;
  }

  // ---------- published ----------
  savePublished(p: PublishedArticle): void {
    this.db.run("INSERT INTO published_articles (published_id, article_id, status, note_url, published_at, is_mock) VALUES (?,?,?,?,?,?)", [
      p.published_id,
      p.article_id,
      p.status,
      p.note_url,
      p.published_at,
      p.is_mock ? 1 : 0,
    ]);
  }
  getPublished(articleId: string): PublishedArticle | undefined {
    const r = this.db.get<Row>("SELECT * FROM published_articles WHERE article_id = ? ORDER BY published_at DESC LIMIT 1", [articleId]);
    return r
      ? {
          published_id: String(r.published_id),
          article_id: String(r.article_id),
          status: "PUBLISHED",
          note_url: String(r.note_url),
          published_at: String(r.published_at),
          is_mock: r.is_mock === 1,
        }
      : undefined;
  }
  listPublished(limit = 50): (PublishedArticle & { title: string })[] {
    return this.db
      .all<Row>(
        `SELECT p.*, a.title FROM published_articles p JOIN articles a ON a.article_id = p.article_id ORDER BY p.published_at DESC LIMIT ?`,
        [limit],
      )
      .map((r) => ({
        published_id: String(r.published_id),
        article_id: String(r.article_id),
        status: "PUBLISHED" as const,
        note_url: String(r.note_url),
        published_at: String(r.published_at),
        is_mock: r.is_mock === 1,
        title: String(r.title),
      }));
  }

  // ---------- analytics ----------
  saveAnalytics(result: AnalyticsResult, metrics: ArticleMetrics): void {
    this.db.run(
      `INSERT INTO analytics (analytics_id, article_id, performance_score, views, likes, comments, sales, revenue, follower_growth, is_simulated, data, collected_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        newId("an"),
        result.article_id,
        result.performance_score,
        metrics.views,
        metrics.likes,
        metrics.comments,
        metrics.sales,
        metrics.revenue,
        metrics.follower_growth,
        result.is_simulated ? 1 : 0,
        toJson(result),
        nowIso(),
      ],
    );
  }
  latestAnalytics(articleId: string): AnalyticsResult | undefined {
    const r = this.db.get<Row>("SELECT data FROM analytics WHERE article_id = ? ORDER BY collected_at DESC LIMIT 1", [articleId]);
    return r ? fromJson<AnalyticsResult>(r.data, {} as AnalyticsResult) : undefined;
  }
  analyticsTotals(): { views: number; likes: number; comments: number; sales: number; revenue: number; articles: number } {
    // Latest row per article only.
    const r = this.db.get<Row>(
      `SELECT COALESCE(SUM(views),0) views, COALESCE(SUM(likes),0) likes, COALESCE(SUM(comments),0) comments,
              COALESCE(SUM(sales),0) sales, COALESCE(SUM(revenue),0) revenue, COUNT(*) articles
       FROM analytics a WHERE collected_at = (SELECT MAX(collected_at) FROM analytics b WHERE b.article_id = a.article_id)`,
    );
    return {
      views: Number(r?.views ?? 0),
      likes: Number(r?.likes ?? 0),
      comments: Number(r?.comments ?? 0),
      sales: Number(r?.sales ?? 0),
      revenue: Number(r?.revenue ?? 0),
      articles: Number(r?.articles ?? 0),
    };
  }

  // ---------- approvals ----------
  createApproval(articleId: string, draftId: string | null): Approval {
    const a: Approval = {
      approval_id: newId("apv"),
      article_id: articleId,
      draft_id: draftId,
      status: "PENDING",
      comment: null,
      created_at: nowIso(),
      decided_at: null,
    };
    this.db.run("INSERT INTO approvals (approval_id, article_id, draft_id, status, comment, created_at) VALUES (?,?,?,?,?,?)", [
      a.approval_id,
      a.article_id,
      a.draft_id,
      a.status,
      null,
      a.created_at,
    ]);
    return a;
  }
  decideApproval(approvalId: string, status: ApprovalStatus, comment: string | null): void {
    this.db.run("UPDATE approvals SET status=?, comment=?, decided_at=? WHERE approval_id=?", [status, comment, nowIso(), approvalId]);
  }
  getApproval(id: string): Approval | undefined {
    const r = this.db.get<Row>("SELECT * FROM approvals WHERE approval_id = ?", [id]);
    return r ? rowToApproval(r) : undefined;
  }
  pendingApprovals(): Approval[] {
    return this.db.all<Row>("SELECT * FROM approvals WHERE status = 'PENDING' ORDER BY created_at ASC").map(rowToApproval);
  }
  approvalsForArticle(articleId: string): Approval[] {
    return this.db.all<Row>("SELECT * FROM approvals WHERE article_id = ? ORDER BY created_at DESC", [articleId]).map(rowToApproval);
  }

  // ---------- feedback ----------
  addFeedback(articleId: string | null, source: string, kind: string, message: string): void {
    this.db.run("INSERT INTO feedback (feedback_id, article_id, source, kind, message, created_at) VALUES (?,?,?,?,?,?)", [
      newId("fb"),
      articleId,
      source,
      kind,
      message,
      nowIso(),
    ]);
  }
  listFeedback(limit = 20): FeedbackRecord[] {
    return this.db.all<FeedbackRecord>("SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?", [limit]);
  }
  feedbackForArticle(articleId: string): FeedbackRecord[] {
    return this.db.all<FeedbackRecord>("SELECT * FROM feedback WHERE article_id = ? ORDER BY created_at ASC", [articleId]);
  }

  // ---------- knowledge ----------
  addKnowledge(kind: string, articleId: string | null, topic: string | null, data: Record<string, unknown>): void {
    this.db.run("INSERT INTO knowledge (knowledge_id, article_id, kind, topic, data, created_at) VALUES (?,?,?,?,?,?)", [
      newId("kn"),
      articleId,
      kind,
      topic,
      toJson(data),
      nowIso(),
    ]);
  }
  listKnowledge(kind?: string, limit = 200): KnowledgeRecord[] {
    const rows = kind
      ? this.db.all<Row>("SELECT * FROM knowledge WHERE kind = ? ORDER BY created_at DESC LIMIT ?", [kind, limit])
      : this.db.all<Row>("SELECT * FROM knowledge ORDER BY created_at DESC LIMIT ?", [limit]);
    return rows.map((r) => ({
      knowledge_id: String(r.knowledge_id),
      article_id: (r.article_id as string) ?? null,
      kind: String(r.kind),
      topic: (r.topic as string) ?? null,
      data: fromJson<Record<string, unknown>>(r.data, {}),
      created_at: String(r.created_at),
    }));
  }
  hasKnowledgeForArticle(articleId: string, kind: string): boolean {
    return !!this.db.get("SELECT 1 FROM knowledge WHERE article_id = ? AND kind = ?", [articleId, kind]);
  }

  // ---------- system events ----------
  addEvent(e: Omit<SystemEvent, "event_id" | "created_at">): void {
    this.db.run("INSERT INTO system_events (event_id, level, type, agent, task_id, message, data, created_at) VALUES (?,?,?,?,?,?,?,?)", [
      newId("ev"),
      e.level,
      e.type,
      e.agent,
      e.task_id,
      e.message,
      e.data === undefined ? null : toJson(e.data),
      nowIso(),
    ]);
  }
  listEvents(opts: { level?: string; limit?: number } = {}): SystemEvent[] {
    const limit = opts.limit ?? 50;
    const rows = opts.level
      ? this.db.all<Row>("SELECT * FROM system_events WHERE level = ? ORDER BY created_at DESC LIMIT ?", [opts.level, limit])
      : this.db.all<Row>("SELECT * FROM system_events ORDER BY created_at DESC LIMIT ?", [limit]);
    return rows.map((r) => ({
      event_id: String(r.event_id),
      level: r.level as SystemEvent["level"],
      type: String(r.type),
      agent: (r.agent as string) ?? null,
      task_id: (r.task_id as string) ?? null,
      message: String(r.message),
      data: fromJson(r.data, null),
      created_at: String(r.created_at),
    }));
  }
}

function rowToDraft(r: Row): Draft {
  return {
    draft_id: String(r.draft_id),
    article_id: String(r.article_id),
    status: r.status as Draft["status"],
    note_url: (r.note_url as string) ?? null,
    edit_url: (r.edit_url as string) ?? null,
    is_mock: r.is_mock === 1,
    created_at: String(r.created_at),
  };
}
function rowToApproval(r: Row): Approval {
  return {
    approval_id: String(r.approval_id),
    article_id: String(r.article_id),
    draft_id: (r.draft_id as string) ?? null,
    status: r.status as ApprovalStatus,
    comment: (r.comment as string) ?? null,
    created_at: String(r.created_at),
    decided_at: (r.decided_at as string) ?? null,
  };
}
