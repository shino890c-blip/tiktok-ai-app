import { bodyForNote } from "../writer/articleFormat";
import type { NotePostInput, NotePublisher } from "../../note/publisher/types";
import { PublishUnverifiedError } from "../../note/publisher/types";
import type { NotificationService } from "../../notifications/notificationService";
import { runQualityControl } from "../../quality/qualityControl";
import type { Article, Draft, Task } from "../../types";
import { newId, nowIso } from "../../utils";
import type { Agent, AgentContext, AgentResult } from "../base";
import { NonRetryableError } from "../base";

export function toPostInput(a: Article): NotePostInput {
  const { free, paid } = bodyForNote(a.free_part, a.paid_part);
  return {
    article_id: a.article_id,
    title: a.title,
    free_body: free,
    paid_body: paid,
    tags: a.tags,
    cover_image: a.cover_image,
    price: a.price,
    publish_mode: a.mode,
  };
}

/**
 * PUBLISHER: saves note drafts and — only with approval (or NOTE_AUTO_PUBLISH
 * plus passing checks) — publishes them. Status becomes PUBLISHED only after
 * the public URL is verified.
 */
export class PublisherAgent implements Agent {
  readonly name = "publisher" as const;
  constructor(private readonly ctx: AgentContext, private readonly publisher: NotePublisher, private readonly notifier: NotificationService) {}

  async handle(task: Task): Promise<AgentResult> {
    if (task.type === "draft") return this.draft(task);
    if (task.type === "publish") return this.publish(task);
    throw new NonRetryableError(`publisher cannot handle task type ${task.type}`);
  }

  private async draft(task: Task): Promise<AgentResult> {
    const { repo } = this.ctx;
    const article = this.requireArticle(task);
    if (article.status !== "QC_PASSED") throw new NonRetryableError(`article ${article.article_id} has not passed QC (status=${article.status})`);
    const previous = repo.latestDraft(article.article_id);
    const result = await this.publisher.saveDraft(toPostInput(article), previous?.edit_url ?? null);
    const draft: Draft = {
      draft_id: newId("draft"),
      article_id: article.article_id,
      status: "DRAFT",
      note_url: result.edit_url,
      edit_url: result.edit_url,
      is_mock: result.is_mock,
      created_at: nowIso(),
    };
    repo.saveDraft(draft);
    article.status = "DRAFT";
    repo.updateArticle(article);
    for (const w of result.warnings) repo.addFeedback(article.article_id, "publisher", "warning", w);
    await this.notifier.notify({ type: "DRAFT_SAVED", title: article.title, url: result.edit_url, simulated: result.is_mock });
    return { kind: "completed", output: { article_id: article.article_id, draft_id: draft.draft_id, edit_url: result.edit_url, status: "DRAFT", warnings: result.warnings } };
  }

  private async publish(task: Task): Promise<AgentResult> {
    const { repo, config } = this.ctx;
    const article = this.requireArticle(task);
    if (article.mode === "DRAFT") {
      return { kind: "cancelled", reason: "記事モードがDRAFTのため公開しません（下書きのまま）" };
    }
    if (repo.getPublished(article.article_id)) {
      return { kind: "cancelled", reason: "既に公開済みです（二重投稿防止）" };
    }

    // Gate 1: human approval unless auto-publish is explicitly enabled.
    if (!config.note.autoPublish) {
      const approved = repo.approvalsForArticle(article.article_id).some((a) => a.status === "APPROVED");
      if (!approved) throw new NonRetryableError("承認されていない記事は公開できません（NOTE_AUTO_PUBLISH=false）");
    }
    // Gate 2: quality + safety re-check right before publishing.
    const report = await runQualityControl(article, { threshold: config.qualityThreshold, llm: undefined });
    if (!report.passed || !report.safe_to_publish) {
      throw new NonRetryableError(`公開前チェックに不合格のため公開を中止しました（score=${report.score}, safe=${report.safe_to_publish}）`);
    }
    const draft = repo.latestDraft(article.article_id);
    if (!draft?.edit_url) throw new NonRetryableError("note下書きが見つかりません。先に draft を作成してください。");

    try {
      const result = await this.publisher.publish(toPostInput(article), draft.edit_url);
      repo.savePublished({ published_id: newId("pub"), article_id: article.article_id, status: "PUBLISHED", note_url: result.note_url, published_at: nowIso(), is_mock: result.is_mock });
      article.status = "PUBLISHED";
      repo.updateArticle(article);
      for (const w of result.warnings) repo.addFeedback(article.article_id, "publisher", "warning", w);
      await this.notifier.notify({ type: "PUBLISHED", title: article.title, url: result.note_url, simulated: result.is_mock });
      return { kind: "completed", output: { article_id: article.article_id, status: "PUBLISHED", note_url: result.note_url, is_mock: result.is_mock } };
    } catch (e) {
      if (e instanceof PublishUnverifiedError) {
        // The publish button may have been pressed: never retry automatically (double-post risk).
        repo.addFeedback(article.article_id, "publisher", "publish_unverified", e.message);
        throw new NonRetryableError(e.message);
      }
      throw e;
    }
  }

  private requireArticle(task: Task): Article {
    const id = String(task.input.article_id ?? "");
    const a = this.ctx.repo.getArticle(id);
    if (!a) throw new NonRetryableError(`article not found: ${id}`);
    return a;
  }
}
