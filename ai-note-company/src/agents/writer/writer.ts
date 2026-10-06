import fs from "node:fs";
import path from "node:path";
import { createImageProvider, type ImageProvider } from "../../images";
import { revisionPrompt, writingPrompt } from "../../prompts";
import type { Article, QualityIssue, Task } from "../../types";
import { errorMessage, newId } from "../../utils";
import type { Agent, AgentContext, AgentResult } from "../base";
import { NonRetryableError, throwIfAborted } from "../base";
import { parseArticleMarkdown, renderArticleMarkdown, type ParsedArticle } from "./articleFormat";

/**
 * WRITER / EDITOR: writes an original article from the strategy, or revises
 * an existing one using QC issues / human comments. Saves Markdown + images.
 */
export class Writer implements Agent {
  readonly name = "writer" as const;
  private readonly images: ImageProvider;

  constructor(private readonly ctx: AgentContext, images?: ImageProvider) {
    this.images = images ?? createImageProvider(ctx.config);
  }

  async handle(task: Task, signal: AbortSignal): Promise<AgentResult> {
    const { repo, llm, logger } = this.ctx;
    const strategyId = String(task.input.strategy_id ?? "");
    const strategy = repo.getStrategy(strategyId);
    if (!strategy) throw new NonRetryableError(`strategy not found: ${strategyId}`);
    const idea = repo.getIdea(strategy.idea_id);
    if (!idea) throw new NonRetryableError(`idea not found: ${strategy.idea_id}`);

    const existingId = task.input.article_id ? String(task.input.article_id) : null;
    const existing = existingId ? repo.getArticle(existingId) : undefined;
    if (existingId && !existing) throw new NonRetryableError(`article not found: ${existingId}`);

    let raw: string;
    if (existing) {
      const issues = (task.input.issues as QualityIssue[] | undefined) ?? repo.latestQualityReport(existing.article_id)?.issues ?? [];
      const ctx = {
        strategy,
        idea,
        previousMarkdown: existing.body_markdown,
        issues,
        humanComment: task.input.human_comment ? String(task.input.human_comment) : undefined,
      };
      const p = revisionPrompt(ctx);
      raw = await llm.generateText({ task: "revision", system: p.system, prompt: p.prompt, context: ctx });
    } else {
      const ctx = { strategy, idea };
      const p = writingPrompt(ctx);
      raw = await llm.generateText({ task: "writing", system: p.system, prompt: p.prompt, context: ctx });
    }
    throwIfAborted(signal);

    const parsed = parseArticleMarkdown(raw, `note-${Date.now().toString(36)}`);
    this.assertStructure(parsed, strategy.content_type === "paid");

    const articleId = existing?.article_id ?? newId("art");
    const articleDir = path.join(this.ctx.config.dataDir, "articles", articleId);
    fs.mkdirSync(articleDir, { recursive: true });

    const tags = parsed.tags;
    const paidPart = strategy.content_type === "paid" ? parsed.paid_part : "";
    const freePart = strategy.content_type === "paid" ? parsed.free_part : [parsed.free_part, parsed.paid_part].filter(Boolean).join("\n\n");
    const markdown = renderArticleMarkdown({ title: parsed.title, description: parsed.description, tags, slug: parsed.slug, free_part: freePart, paid_part: paidPart });
    const revision = existing ? existing.revision + 1 : 0;
    const filePath = path.join(articleDir, `article.r${revision}.md`);
    fs.writeFileSync(filePath, markdown);
    fs.writeFileSync(path.join(articleDir, "article.md"), markdown);

    let cover = existing?.cover_image ?? null;
    if (!cover) {
      try {
        const img = await this.images.generate({
          kind: "cover",
          title: parsed.title,
          prompt: `note記事のアイキャッチ画像。文字なし。テーマ: ${idea.topic}。落ち着いた配色、シンプルなイラスト。`,
          outPathBase: path.join(articleDir, "cover"),
          width: 1280,
          height: 670,
        });
        cover = img.path;
      } catch (e) {
        // Cover is optional; never block the article on it.
        logger.warn(`cover generation failed: ${errorMessage(e)}`);
      }
    }

    const article: Article = {
      article_id: articleId,
      strategy_id: strategy.strategy_id,
      idea_id: idea.idea_id,
      title: parsed.title,
      body_markdown: markdown,
      free_part: freePart,
      paid_part: paidPart,
      mode: strategy.article_mode,
      price: strategy.content_type === "paid" ? (existing?.price ?? strategy.price) : 0,
      tags,
      seo: { title: parsed.title, description: parsed.description, tags, slug: parsed.slug },
      cover_image: cover,
      body_images: existing?.body_images ?? [],
      quality_score: null,
      status: "WRITING",
      revision,
      file_path: filePath,
    };
    if (existing) repo.updateArticle(article);
    else repo.saveArticle(article, task.pipeline_id);

    return { kind: "completed", output: { article_id: articleId, revision, file_path: filePath } };
  }

  private assertStructure(p: ParsedArticle, paid: boolean): void {
    if (!/^##\s+/m.test(p.free_part)) throw new Error("article has no sections (## headings)");
    if (paid && p.paid_part.replace(/\s/g, "").length < 200) {
      throw new Error("paid article is missing a substantial paid part after the paid marker");
    }
  }
}
