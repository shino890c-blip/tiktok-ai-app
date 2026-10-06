import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import { createDashboardServer } from "../../src/dashboard/server";
import { makeCompany, type TestCompany } from "../helpers/company";
import { drain, runOne } from "../helpers/steps";

let t: TestCompany;
afterEach(() => t?.cleanup());

test("dashboard: shows status + approval screen; APPROVE via form requires CSRF token", async () => {
  t = makeCompany();
  await runOne(t.c, "research", { count: 1 });
  await drain(t.c);
  const ap = t.c.repo.pendingApprovals()[0];
  const server = createDashboardServer(t.c);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const home = await (await fetch(base + "/")).text();
    for (const s of ["Agent Status", "Current Tasks", "Pending Approval", "Published Articles", "Views", "Likes", "Comments", "Sales", "Errors", "Latest Feedback", "Knowledge Base"]) assert.ok(home.includes(s), s);

    const page = await (await fetch(`${base}/approvals/${ap.approval_id}`)).text();
    for (const s of ["APPROVE", "REJECT", "EDIT", "REGENERATE", "Quality Score", "Research理由", "Tags", "Price"]) assert.ok(page.includes(s), s);
    const csrf = /name="csrf" value="([0-9a-f]+)"/.exec(page)![1];

    const forged = await fetch(`${base}/approvals/${ap.approval_id}/decide`, { method: "POST", body: new URLSearchParams({ action: "APPROVE", csrf: "bad" }), redirect: "manual" });
    assert.equal(forged.status, 403);
    assert.equal(t.c.repo.getApproval(ap.approval_id)!.status, "PENDING");

    const ok = await fetch(`${base}/approvals/${ap.approval_id}/decide`, { method: "POST", body: new URLSearchParams({ action: "APPROVE", csrf }), redirect: "manual" });
    assert.equal(ok.status, 303);
    assert.equal(t.c.repo.getApproval(ap.approval_id)!.status, "APPROVED");

    const status = await (await fetch(base + "/api/status")).json();
    assert.ok(status.health && status.totals);
    const cover = await fetch(`${base}/files/${ap.article_id}/cover`);
    assert.equal(cover.headers.get("content-type"), "image/png");
  } finally {
    await new Promise((r) => setTimeout(r, 100)); // let the kicked tick finish
    server.close();
  }
});
