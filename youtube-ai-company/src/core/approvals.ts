import type { Clock } from "./clock.js";
import { InvalidInputError } from "./errors.js";
import type { EventBus } from "./event-bus/index.js";
import { newId } from "./ids.js";
import type { TaskManager } from "./task-manager/index.js";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import type { Repositories } from "../database/repositories.js";
import type { ApprovalRecord } from "../database/types.js";
import type { Logger } from "../logging/logger.js";
import type { NotificationService } from "../notifications/index.js";

/** Human-in-the-loop gate between Quality Control and Publishing. */
export class ApprovalService {
  constructor(
    private readonly repos: Repositories,
    private readonly tasks: TaskManager,
    private readonly bus: EventBus,
    private readonly notifier: NotificationService,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async request(videoId: string, pipelineId: string | null, title: string): Promise<ApprovalRecord> {
    const existing = await this.repos.approvals.findOne({ video_id: videoId, status: "pending" });
    if (existing) return existing;
    const now = this.clock.now().toISOString();
    const approval = await this.repos.approvals.insert({
      approval_id: newId("apr"),
      video_id: videoId,
      pipeline_id: pipelineId,
      status: "pending",
      requested_at: now,
      decided_at: null,
      decided_by: null,
      note: null,
    });
    this.bus.emit("approval.requested", { approvalId: approval.approval_id, videoId });
    await this.notifier.notify({
      level: "INFO",
      title: `承認待ち: 「${title}」`,
      agent: "publisher",
      action: `npm run approve -- ${approval.approval_id}  /  npm run reject -- ${approval.approval_id} --note "理由"  (またはDashboard)`,
    });
    return approval;
  }

  /** Accepts an approval id or a video id. */
  async resolve(idOrVideoId: string): Promise<ApprovalRecord> {
    const a =
      (await this.repos.approvals.get(idOrVideoId)) ??
      (await this.repos.approvals.findOne({ video_id: idOrVideoId, status: "pending" })) ??
      (await this.repos.approvals.findOne({ video_id: idOrVideoId }));
    if (!a) throw new InvalidInputError(`Approval not found: ${idOrVideoId}`);
    return a;
  }

  async approve(idOrVideoId: string, decidedBy: string, opts: { note?: string; videoFilePath?: string } = {}): Promise<ApprovalRecord> {
    const a = await this.resolve(idOrVideoId);
    if (a.status !== "pending") throw new InvalidInputError(`Approval ${a.approval_id} is already ${a.status}`);
    if (opts.videoFilePath) {
      const abs = path.resolve(opts.videoFilePath);
      if (!existsSync(abs) || !statSync(abs).isFile()) throw new InvalidInputError(`Video file not found: ${abs}`);
      await this.repos.videos.update(a.video_id, { video_file_path: abs });
    }
    const now = this.clock.now().toISOString();
    const ok = await this.repos.approvals.updateIf(a.approval_id, { status: "pending" }, {
      status: "approved",
      decided_at: now,
      decided_by: decidedBy,
      note: opts.note ?? null,
    });
    if (!ok) throw new InvalidInputError(`Approval ${a.approval_id} changed concurrently`);
    await this.repos.videos.update(a.video_id, { status: "approved" });
    const matching = (await this.repos.tasks.list({ where: { type: "publish", status: "WAITING_APPROVAL" } })).find(
      (t) => t.input.videoId === a.video_id,
    );
    if (matching) await this.tasks.release(matching.task_id);
    if (a.pipeline_id) await this.repos.pipelines.update(a.pipeline_id, { stage: "PUBLISH", status: "ACTIVE" });
    this.logger.info("approval.approved", `Video ${a.video_id} approved by ${decidedBy}`, { approval_id: a.approval_id });
    this.bus.emit("approval.decided", { approvalId: a.approval_id, videoId: a.video_id, approved: true });
    return (await this.repos.approvals.get(a.approval_id))!;
  }

  async reject(idOrVideoId: string, decidedBy: string, note: string): Promise<ApprovalRecord> {
    const a = await this.resolve(idOrVideoId);
    if (a.status !== "pending") throw new InvalidInputError(`Approval ${a.approval_id} is already ${a.status}`);
    const now = this.clock.now().toISOString();
    await this.repos.approvals.update(a.approval_id, { status: "rejected", decided_at: now, decided_by: decidedBy, note });
    await this.repos.videos.update(a.video_id, { status: "rejected" });
    const tasks = await this.repos.tasks.list({ where: { type: "publish", status: "WAITING_APPROVAL" } });
    for (const t of tasks.filter((t) => t.input.videoId === a.video_id)) await this.tasks.cancel(t.task_id, `Rejected: ${note}`);
    this.logger.info("approval.rejected", `Video ${a.video_id} rejected by ${decidedBy}`, { approval_id: a.approval_id, note });
    this.bus.emit("approval.decided", { approvalId: a.approval_id, videoId: a.video_id, approved: false });
    return (await this.repos.approvals.get(a.approval_id))!;
  }

  async pending(): Promise<ApprovalRecord[]> {
    return this.repos.approvals.list({ where: { status: "pending" }, orderBy: "requested_at ASC" });
  }
}
