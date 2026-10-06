import type { AppConfig } from "../config";
import type { Repository } from "../database/repositories";
import type { NotificationService } from "../notifications/notificationService";
import type { Task } from "../types";
import type { EventBus } from "./events/eventBus";
import { analyticsTime, scheduleFor } from "./scheduler/scheduler";
import type { TaskManager } from "./tasks/taskManager";

/**
 * Encodes the company workflow: which task follows which.
 *
 * research → strategy → writing → quality ─(<80)→ writing (revision, bounded)
 *                                         └(≥80)→ draft → approval (human) → publish → analytics → knowledge → next candidates
 *                                                       └(NOTE_AUTO_PUBLISH=true)→ publish
 */
export class Pipeline {
  constructor(
    private readonly config: AppConfig,
    private readonly tasks: TaskManager,
    private readonly repo: Repository,
    private readonly notifier: NotificationService,
    private readonly events: EventBus,
  ) {}

  async onTaskFinished(task: Task, output: Record<string, unknown>): Promise<Task[]> {
    const p = task.pipeline_id;
    const created: Task[] = [];
    const next = (t: Parameters<TaskManager["create"]>[0]) => {
      const c = this.tasks.create({ pipelineId: p, ...t });
      created.push(c);
      return c;
    };
    const sch = this.config.schedule;

    switch (task.type) {
      case "research":
        if (task.input.mode === "candidates" || !p) break; // next-article candidates only
        next({ agent: "strategist", type: "strategy", input: { idea_id: output.idea_id, mode: task.input.mode_override }, scheduledAt: scheduleFor("strategy", sch) });
        break;

      case "strategy":
        next({ agent: "writer", type: "writing", input: { strategy_id: output.strategy_id }, scheduledAt: scheduleFor("writing", sch) });
        break;

      case "writing":
        next({ agent: "quality", type: "quality", input: { article_id: output.article_id }, scheduledAt: task.input.article_id ? null : scheduleFor("quality", sch) });
        break;

      case "quality": {
        const article = this.repo.getArticle(String(output.article_id));
        if (!article) break;
        if (output.passed) {
          next({ agent: "publisher", type: "draft", input: { article_id: article.article_id }, scheduledAt: task.input.from_edit ? null : scheduleFor("draft", sch) });
        } else if (article.revision < this.config.maxRevisions) {
          const report = this.repo.latestQualityReport(article.article_id);
          this.events.system("info", "quality.sent_back", `QC ${output.score}点 < ${this.config.qualityThreshold}: Writerへ差し戻し (revision ${article.revision + 1})`, { task_id: task.task_id });
          next({ agent: "writer", type: "writing", input: { strategy_id: article.strategy_id, article_id: article.article_id, issues: report?.issues ?? [] } });
        } else {
          article.status = "FAILED";
          this.repo.updateArticle(article);
          this.events.system("error", "quality.gave_up", `品質基準を満たせませんでした（${output.score}点, 修正${article.revision}回）`, { task_id: task.task_id });
          await this.notifier.notify({ type: "ERROR", agent: "quality", task: task.task_id, error: `品質スコア${output.score}点で基準未達。修正上限(${this.config.maxRevisions})に到達`, retry: "停止（人間の確認が必要）" });
        }
        break;
      }

      case "draft": {
        const article = this.repo.getArticle(String(output.article_id));
        if (!article) break;
        if (this.config.note.autoPublish && article.mode !== "DRAFT") {
          this.events.system("info", "publish.auto", `NOTE_AUTO_PUBLISH=true: ${article.title} を公開キューへ`);
          next({ agent: "publisher", type: "publish", input: { article_id: article.article_id, auto: true } });
        } else {
          const approval = this.repo.createApproval(article.article_id, String(output.draft_id ?? "") || null);
          const t = next({ agent: "supervisor", type: "approval", input: { article_id: article.article_id, approval_id: approval.approval_id } });
          this.tasks.waitApproval(t.task_id, { approval_id: approval.approval_id });
          await this.notifier.notify({
            type: "APPROVAL_REQUIRED",
            title: article.title,
            url: String(output.edit_url ?? "") || null,
            price: article.price,
            qualityScore: article.quality_score,
            approvalId: approval.approval_id,
            dashboardUrl: `http://${this.config.dashboard.host}:${this.config.dashboard.port}/approvals/${approval.approval_id}`,
          });
        }
        break;
      }

      case "publish":
        if (output.status === "PUBLISHED") {
          next({ agent: "analytics", type: "analytics", input: { article_id: output.article_id }, scheduledAt: analyticsTime(sch) });
        }
        break;

      case "analytics":
        next({ agent: "supervisor", type: "knowledge", input: { article_id: output.article_id } });
        break;

      case "knowledge":
        // 12. 次の記事候補生成 (doesn't count toward DAILY_ARTICLE_LIMIT)
        this.tasks.create({ agent: "researcher", type: "research", input: { mode: "candidates", count: 3 }, pipelineId: null });
        break;
    }
    return created;
  }
}
