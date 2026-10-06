import type { Company } from "../../src/company";
import type { Task, TaskType } from "../../src/types";

/** Runs runnable tasks (ignoring schedule) until one of `stopAt` types finishes or nothing is left. */
export async function drain(c: Company, opts: { max?: number; only?: TaskType[] } = {}): Promise<Task[]> {
  const ran: Task[] = [];
  for (let i = 0; i < (opts.max ?? 50); i++) {
    const next = c.tasks.list({ status: ["PENDING", "RETRYING"] }).find((t) => !opts.only || opts.only.includes(t.type));
    if (!next) break;
    ran.push(await c.runner.run(next));
  }
  return ran;
}

export async function runOne(c: Company, type: TaskType, input: Record<string, unknown>, pipelineId: string | null = "pipe_test"): Promise<Task> {
  const agent = ({ research: "researcher", strategy: "strategist", writing: "writer", quality: "quality", draft: "publisher", publish: "publisher", analytics: "analytics", knowledge: "supervisor", approval: "supervisor" } as const)[type];
  const t = c.tasks.create({ agent, type, input, pipelineId });
  return c.runner.run(t);
}
