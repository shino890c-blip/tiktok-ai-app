import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { buildChatGPTPrompt, fixablePipelines, importChatGPTAnswer, remainingToday } from "../chatgpt/index.js";
import type { Company } from "../core/company.js";
import { errorMessage, InvalidInputError } from "../core/errors.js";

function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

async function readBody(req: IncomingMessage, limit = 16_384): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new InvalidInputError("Request body too large");
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new InvalidInputError("Invalid JSON body");
  }
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8"): void {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

/**
 * Minimal local dashboard: read-only status for everyone who can reach it, and
 * write actions (approve / reject / new goal) only from loopback or with DASHBOARD_TOKEN.
 */
export function startDashboard(company: Company, opts: { host: string; port: number; token?: string; htmlPath?: string }): Promise<Server> {
  const { ctx, supervisor } = company;
  const htmlPath = opts.htmlPath ?? path.join(ctx.config.rootDir, "dashboard", "index.html");
  const log = ctx.logger.child({ agent: "dashboard" });

  const authorized = (req: IncomingMessage): boolean => {
    if (opts.token) {
      const header = req.headers.authorization ?? "";
      return header.startsWith("Bearer ") && safeEqual(header.slice(7), opts.token);
    }
    return isLoopback(opts.host);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://dashboard.local");
    try {
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        return send(res, 200, readFileSync(htmlPath, "utf8"), "text/html; charset=utf-8");
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        return send(res, 200, await supervisor.statusReport());
      }
      if (req.method === "GET" && url.pathname === "/api/events") {
        const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50) || 50);
        return send(res, 200, await ctx.repos.events.list({ limit }));
      }
      if (req.method === "GET" && url.pathname === "/api/chatgpt/prompt") {
        const fix = url.searchParams.get("fix") ?? undefined;
        return send(res, 200, { prompt: await buildChatGPTPrompt(ctx, { fixPipelineId: fix }), remaining_today: await remainingToday(ctx) });
      }
      if (req.method === "GET" && url.pathname === "/api/chatgpt/fixable") {
        return send(res, 200, (await fixablePipelines(ctx)).map((p) => ({ pipeline_id: p.pipeline_id, goal: p.goal, error: p.error })));
      }
      if (req.method === "GET" && url.pathname === "/api/knowledge") {
        return send(res, 200, await ctx.knowledge.list({ limit: 100 }));
      }

      if (req.method === "POST") {
        if (!authorized(req)) return send(res, 401, { error: "unauthorized" });
        const body = await readBody(req, url.pathname === "/api/chatgpt/import" ? 1_000_000 : 16_384);
        const by = typeof body.by === "string" && body.by.trim() ? `dashboard:${body.by.trim()}` : "dashboard:human";
        const m = url.pathname.match(/^\/api\/approvals\/([\w-]+)\/(approve|reject)$/);
        if (m) {
          const [, id, action] = m;
          const note = typeof body.note === "string" ? body.note : undefined;
          const result =
            action === "approve"
              ? await ctx.approvals.approve(id!, by, { note })
              : await ctx.approvals.reject(id!, by, note ?? "Rejected from dashboard");
          log.info("dashboard.approval", `${action} ${id} by ${by}`);
          return send(res, 200, result);
        }
        if (url.pathname === "/api/chatgpt/import") {
          if (typeof body.text !== "string" || !body.text.trim()) throw new InvalidInputError("ChatGPTの回答を貼り付けてください");
          const r = await importChatGPTAnswer(ctx, body.text);
          log.info("dashboard.chatgpt_import", `Imported ${r.imported.length} script(s), skipped ${r.skipped.length}`);
          return send(res, 200, r);
        }
        if (url.pathname === "/api/goal") {
          const goal = typeof body.goal === "string" && body.goal.trim() ? body.goal.trim() : "新しい動画を作る";
          const r = await supervisor.startPipeline(goal);
          return send(res, r.pipeline ? 200 : 409, r);
        }
      }
      return send(res, 404, { error: "not found" });
    } catch (err) {
      const status = err instanceof InvalidInputError ? 400 : 500;
      log.error("dashboard.error", errorMessage(err), { path: url.pathname });
      return send(res, status, { error: errorMessage(err) });
    }
  });

  if (!isLoopback(opts.host) && !opts.token) {
    log.warn("dashboard.insecure", "Dashboard bound to a non-loopback host without DASHBOARD_TOKEN: write actions are disabled");
  }
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : opts.port;
      log.info("dashboard.started", `Dashboard: http://${opts.host}:${port}`);
      resolve(server);
    });
  });
}
