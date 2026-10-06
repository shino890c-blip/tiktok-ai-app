import fs from "node:fs";
import path from "node:path";
import { parseArticleMarkdown, renderArticleMarkdown } from "../agents/writer/articleFormat";
import type { AppConfig, ArticleMode } from "../config";
import type { Repository } from "../database/repositories";
import type { Approval, ApprovalAction, Task } from "../types";
import type { EventBus } from "./events/eventBus";
import type { TaskManager } from "./tasks/taskManager";

export interface ApprovalEdits {
  title?: string;
  /** Full article markdown (front matter optional). Use PAID_MARKER for the paid line. */
  body_markdown?: string;
  price?: number;
  tags?: string[];
  mode?: ArticleMode;
}

/**
 * HUMAN APPROVAL. Only APPROVE leads to a publish task.
 * REJECT stops, EDIT re-runs QC + draft update + new approval,
 * REGENERATE sends the article back to the Writer with the human comment.
 */
export class ApprovalService {
  constructor(
    private readonly config: AppConfig,
    private readonly repo: Repository,
    private readonly tasks: TaskManager,
    private readonly events: EventBus,
  ) {}

  private approvalTask(approvalId: string): Task | undefined {
    return this.tasks.list({ type: "approval", status: "WAITING_APPROVAL" }).find((t) => t.input.approval_id === approvalId);
  }

  decide(approvalId: string, action: ApprovalAction, opts: { comment?: string; edits?: ApprovalEdits } = {}): { approval: Approval; created: Task[] } {
    const approval = this.repo.getApproval(approvalId);
    if (!approval) throw new Error(`approval not found: ${approvalId}`);
    if (approval.status !== "PENDING") throw new Error(`approval ${approvalId} is already ${approval.status}`);
    const article = this.repo.getArticle(approval.article_id);
    if (!article) throw new Error(`article not found: ${approval.article_id}`);
    const task = this.approvalTask(approvalId);
    const pipelineId = task?.pipeline_id ?? this.repo.articlePipeline(article.article_id);
    const comment = opts.comment?.trim() || null;
    const created: Task[] = [];

    this.repo.db.transaction(() => {
      switch (action) {
        case "APPROVE": {
          this.repo.decideApproval(approvalId, "APPROVED", comment);
          article.status = "APPROVED";
          this.repo.updateArticle(article);
          created.push(this.tasks.create({ agent: "publisher", type: "publish", input: { article_id: article.article_id, approval_id: approvalId }, pipelineId }));
          break;
        }
        case "REJECT": {
          this.repo.decideApproval(approvalId, "REJECTED", comment);
          article.status = "REJECTED";
          this.repo.updateArticle(article);
          break;
        }
        case "REGENERATE": {
          this.repo.decideApproval(approvalId, "REGENERATE", comment);
          created.push(
            this.tasks.create({
              agent: "writer",
              type: "writing",
              input: { strategy_id: article.strategy_id, article_id: article.article_id, human_comment: comment ?? "全体的に書き直してください", issues: [] },
              pipelineId,
            }),
          );
          break;
        }
        case "EDIT": {
          const e = opts.edits ?? {};
          if (!Object.keys(e).length) throw new Error("EDIT requires edits");
          this.applyEdits(article.article_id, e);
          this.repo.decideApproval(approvalId, "EDITED", comment);
          created.push(this.tasks.create({ agent: "quality", type: "quality", input: { article_id: article.article_id, from_edit: true }, pipelineId }));
          break;
        }
      }
      if (comment) this.repo.addFeedback(article.article_id, "human", action.toLowerCase(), comment);
      if (task) this.tasks.complete(task.task_id, { decision: action, comment });
    });

    this.events.system("info", `approval.${action.toLowerCase()}`, `${action}: ${article.title}`, { task_id: task?.task_id ?? null });
    return { approval: this.repo.getApproval(approvalId)!, created };
  }

  private applyEdits(articleId: string, e: ApprovalEdits): void {
    const a = this.repo.getArticle(articleId)!;
    if (e.body_markdown !== undefined) {
      const hasFm = /^---\n/.test(e.body_markdown.trim());
      const src = hasFm ? e.body_markdown : `---\ntitle: ${e.title ?? a.title}\ndescription: ${a.seo.description}\ntags: ${(e.tags ?? a.tags).join(", ")}\nslug: ${a.seo.slug}\n---\n${e.body_markdown}`;
      const p = parseArticleMarkdown(src, a.seo.slug);
      a.title = p.title;
      a.free_part = p.free_part;
      a.paid_part = p.paid_part;
      a.seo = { title: p.title, description: p.description, tags: p.tags.length ? p.tags : a.tags, slug: p.slug };
    }
    if (e.title) {
      a.title = e.title;
      a.free_part = a.free_part.replace(/^#\s+.+$/m, `# ${e.title}`);
      a.seo.title = e.title;
    }
    if (e.tags) a.tags = e.tags;
    if (e.mode) a.mode = e.mode;
    if (e.price !== undefined) a.price = Math.max(0, Math.round(e.price));
    if (a.mode === "FREE" || a.mode === "DRAFT") a.price = 0;
    a.body_markdown = renderArticleMarkdown({ title: a.title, description: a.seo.description, tags: a.tags, slug: a.seo.slug, free_part: a.free_part, paid_part: a.paid_part });
    a.revision += 1;
    a.status = "WRITING";
    a.quality_score = null;
    const dir = path.join(this.config.dataDir, "articles", a.article_id);
    fs.mkdirSync(dir, { recursive: true });
    a.file_path = path.join(dir, `article.r${a.revision}.human.md`);
    fs.writeFileSync(a.file_path, a.body_markdown);
    fs.writeFileSync(path.join(dir, "article.md"), a.body_markdown);
    this.repo.updateArticle(a);
  }
}
