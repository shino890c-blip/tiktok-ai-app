import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { openDatabase } from "../../src/database/db";
import { Repository } from "../../src/database/repositories";
import { TABLES } from "../../src/database/schema";

test("database: migration creates all required tables and is idempotent", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-note-db-"));
  const file = path.join(dir, "x.db");
  const db = openDatabase(file);
  const names = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name);
  for (const t of TABLES) assert.ok(names.includes(t), `missing table ${t}`);
  db.close();
  const db2 = openDatabase(file); // re-open: no duplicate migration
  assert.equal(db2.all("SELECT * FROM schema_migrations").length, 1);
  db2.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("database: repository round-trips ideas, approvals, events, knowledge", () => {
  const db = openDatabase(":memory:");
  const repo = new Repository(db);
  repo.saveIdea({ idea_id: "idea_1", topic: "T", target_reader: "r", reader_problem: "p", trend_reason: "why", unique_angle: "u", title_candidates: ["a"], monetization_potential: 50, confidence: 60, sources: ["s"] }, "pipe_1");
  repo.markIdeaSelected("idea_1");
  assert.equal(repo.getIdea("idea_1")?.trend_reason, "why");
  assert.deepEqual(repo.recentTopics(), ["T"]);

  repo.addEvent({ level: "error", type: "x", agent: "writer", task_id: "t1", message: "boom", data: { a: 1 } });
  assert.equal(repo.listEvents({ level: "error" })[0].message, "boom");
  repo.addKnowledge("k", null, "topic", { v: 1 });
  assert.equal(repo.listKnowledge("k")[0].data.v, 1);

  // transaction rollback
  assert.throws(() =>
    db.transaction(() => {
      repo.addFeedback(null, "s", "k", "m");
      throw new Error("rollback");
    }),
  );
  assert.equal(repo.listFeedback().length, 0);
  db.close();
});
