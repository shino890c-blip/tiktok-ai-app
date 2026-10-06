import { runQualityControl } from "../../quality/qualityControl";
import type { Task } from "../../types";
import type { Agent, AgentContext, AgentResult } from "../base";
import { NonRetryableError } from "../base";

/** Runs CONTENT QUALITY CONTROL on an article and records the report. */
export class QualityAgent implements Agent {
  readonly name = "quality" as const;
  constructor(private readonly ctx: AgentContext) {}

  async handle(task: Task): Promise<AgentResult> {
    const { repo, config, llm } = this.ctx;
    const id = String(task.input.article_id ?? "");
    const article = repo.getArticle(id);
    if (!article) throw new NonRetryableError(`article not found: ${id}`);

    // Copy check against our own past articles (different ideas).
    const references = repo
      .listArticles(30)
      .filter((a) => a.article_id !== id && a.idea_id !== article.idea_id)
      .map((a) => ({ id: a.article_id, text: a.body_markdown }));

    const report = await runQualityControl(article, { threshold: config.qualityThreshold, references, llm });
    repo.saveQualityReport(report, article.revision);
    article.quality_score = report.score;
    article.status = report.passed ? "QC_PASSED" : "QC_FAILED";
    repo.updateArticle(article);
    for (const i of report.issues.filter((i) => i.severity !== "info")) repo.addFeedback(id, "quality", i.check, `[${i.severity}] ${i.message}`);
    return {
      kind: "completed",
      output: { article_id: id, score: report.score, passed: report.passed, safe_to_publish: report.safe_to_publish, revision: article.revision, issue_count: report.issues.length },
    };
  }
}
