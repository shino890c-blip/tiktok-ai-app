import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { Company } from "../company";
import type { ApprovalAction } from "../types";
import { approvalPage, dashboardPage, esc, layout } from "./views";

async function readForm(req: http.IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 2_000_000) throw new Error("request too large");
    chunks.push(c as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

/**
 * Minimal local dashboard + approval UI (no framework).
 * Binds to 127.0.0.1 by default; POSTs require a per-process CSRF token.
 */
export function createDashboardServer(company: Company): http.Server {
  const csrf = crypto.randomBytes(16).toString("hex");
  const send = (res: http.ServerResponse, status: number, body: string, type = "text/html; charset=utf-8") => {
    res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-frame-options": "DENY" });
    res.end(body);
  };
  const redirect = (res: http.ServerResponse, to: string) => {
    res.writeHead(303, { location: to });
    res.end();
  };

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);

      if (req.method === "GET" && url.pathname === "/") {
        return send(res, 200, dashboardPage(company, company.supervisor.health(), company.knowledge.summarize(), csrf));
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        return send(
          res,
          200,
          JSON.stringify({ health: company.supervisor.health(), totals: company.repo.analyticsTotals(), approvals: company.repo.pendingApprovals(), knowledge: company.knowledge.summarize() }, null, 2),
          "application/json; charset=utf-8",
        );
      }
      if (req.method === "GET" && parts[0] === "approvals" && parts[1]) {
        const a = company.repo.getApproval(parts[1]);
        if (!a) return send(res, 404, layout("Not found", "<main><section>approval not found</section></main>"));
        return send(res, 200, approvalPage(company, a, csrf, url.searchParams.get("msg") ?? ""));
      }
      if (req.method === "GET" && parts[0] === "files" && parts[1] && parts[2] === "cover") {
        const art = company.repo.getArticle(parts[1]);
        const file = art?.cover_image;
        const root = path.resolve(company.config.dataDir);
        if (!file || !path.resolve(file).startsWith(root + path.sep) || !fs.existsSync(file)) return send(res, 404, "not found", "text/plain");
        res.writeHead(200, { "content-type": file.endsWith(".png") ? "image/png" : "application/octet-stream" });
        return fs.createReadStream(file).pipe(res);
      }

      if (req.method === "POST") {
        const form = await readForm(req);
        if (form.get("csrf") !== csrf) return send(res, 403, layout("Forbidden", "<main><section>invalid CSRF token. ページを再読み込みしてください。</section></main>"));

        if (parts[0] === "approvals" && parts[1] && parts[2] === "decide") {
          const action = String(form.get("action") ?? "").toUpperCase() as ApprovalAction;
          if (!["APPROVE", "REJECT", "EDIT", "REGENERATE"].includes(action)) return send(res, 400, "invalid action", "text/plain");
          try {
            const edits =
              action === "EDIT"
                ? {
                    title: form.get("title")?.trim() || undefined,
                    body_markdown: form.get("body") ?? undefined,
                    price: form.get("price") ? Number(form.get("price")) : undefined,
                    tags: form.get("tags") ? String(form.get("tags")).split(/[,、]/).map((t) => t.trim()).filter(Boolean) : undefined,
                  }
                : undefined;
            company.approvals.decide(parts[1], action, { comment: form.get("comment") ?? undefined, edits });
            // Kick the pipeline so the decision takes effect without waiting for the next tick.
            void company.supervisor.tick({ createDaily: false }).catch(() => undefined);
            return redirect(res, "/");
          } catch (e) {
            return redirect(res, `/approvals/${encodeURIComponent(parts[1])}?msg=${encodeURIComponent((e as Error).message)}`);
          }
        }
        if (parts[0] === "tasks" && parts[1] && parts[2] === "retry") {
          company.tasks.resetForManualRetry(parts[1]);
          return redirect(res, "/");
        }
      }
      return send(res, 404, layout("Not found", "<main><section>not found</section></main>"));
    } catch (e) {
      return send(res, 500, layout("Error", `<main><section class="bad">${esc((e as Error).message)}</section></main>`));
    }
  });
}

export function startDashboard(company: Company): Promise<http.Server> {
  const server = createDashboardServer(company);
  const { port, host } = company.config.dashboard;
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}
