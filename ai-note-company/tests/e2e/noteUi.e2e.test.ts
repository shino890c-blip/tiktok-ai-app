import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { toPostInput } from "../../src/agents/publisher/publisherAgent";
import { NoteStatsCollector } from "../../src/analytics/collectors";
import { Logger } from "../../src/logger";
import { AuthRequiredError } from "../../src/note/auth/auth";
import { SelectorNotFoundError } from "../../src/note/browser/resolve";
import { PlaywrightNotePublisher } from "../../src/note/publisher/playwrightPublisher";
import { PublishUnverifiedError } from "../../src/note/publisher/types";
import { fakeStorageState, startFakeNote, type FakeNote } from "../helpers/fakeNote";
import { makeCompany, testConfig, type TestCompany } from "../helpers/company";
import { drain, runOne } from "../helpers/steps";

/**
 * Runs the REAL Playwright publisher (Chromium) against a local fake of note's
 * UI. Verifies login detection, editor input via paste, draft save, tags,
 * price, paid-line placement, publish and URL verification.
 */
let fake: FakeNote | undefined;
let t: TestCompany | undefined;
afterEach(async () => {
  await fake?.close();
  t?.cleanup();
  fake = undefined;
  t = undefined;
});

async function paidArticle() {
  t = makeCompany({ DEFAULT_ARTICLE_MODE: "PARTIAL_PAID" });
  await runOne(t.c, "research", { count: 1 });
  await drain(t.c, { only: ["strategy", "writing", "quality"] });
  return t.c.repo.listArticles(1)[0];
}

function publisherFor(baseUrl: string, withLogin = true) {
  const config = testConfig(t!.dir, { RUN_MODE: "live", NOTE_BASE_URL: baseUrl, BROWSER_HEADLESS: "true" });
  if (withLogin) {
    fs.mkdirSync(path.dirname(config.note.storageStatePath), { recursive: true });
    fs.writeFileSync(config.note.storageStatePath, fakeStorageState());
  }
  return { config, publisher: new PlaywrightNotePublisher(config, new Logger("test")) };
}

test("note UI: draft → publish (paid) through the browser, URL verified", { timeout: 120_000 }, async () => {
  const article = await paidArticle();
  fake = await startFakeNote();
  const { config, publisher } = publisherFor(fake.baseUrl);
  const input = toPostInput(article);

  const draft = await publisher.saveDraft(input);
  assert.equal(draft.status, "DRAFT");
  assert.match(draft.edit_url, /\/notes\/n[0-9a-z]+\/edit/);
  const stored = fake.notes.get(draft.note_key!)!;
  assert.equal(stored.title, article.title);
  assert.match(stored.html, /<h2>/, "markdown arrived as structured HTML");
  assert.equal(stored.published, false, "draft only");
  assert.ok(fs.statSync(config.note.storageStatePath).mode & 0o600);

  const res = await publisher.publish(input, draft.edit_url);
  assert.equal(res.status, "PUBLISHED");
  assert.equal(res.note_url, `${fake.baseUrl}/fakeuser/n/${draft.note_key}`);
  assert.equal(stored.published, true);
  assert.deepEqual(stored.tags, article.tags);
  assert.equal(stored.paid, true);
  assert.equal(stored.price, article.price);
  assert.match(stored.lineAfter ?? "", /続きをどうぞ/, "paid line placed right after the free part");

  const metrics = await new NoteStatsCollector(config).collect(article, { published_id: "p", article_id: article.article_id, status: "PUBLISHED", note_url: res.note_url, published_at: "", is_mock: false });
  assert.deepEqual({ v: metrics.views, c: metrics.comments, l: metrics.likes, s: metrics.sales }, { v: 120, c: 3, l: 17, s: null }, "unknown metrics stay null");
});

test("note UI: without a saved login the publisher stops and asks for a human login", { timeout: 60_000 }, async () => {
  const article = await paidArticle();
  fake = await startFakeNote();
  const { publisher } = publisherFor(fake.baseUrl, false);
  await assert.rejects(publisher.saveDraft(toPostInput(article)), AuthRequiredError);
});

test("note UI: when the UI changed, nothing is saved and the selector is named", { timeout: 60_000 }, async () => {
  const article = await paidArticle();
  fake = await startFakeNote({ variant: "changed-ui" });
  const { publisher } = publisherFor(fake.baseUrl);
  await assert.rejects(publisher.saveDraft(toPostInput(article)), (e: unknown) => e instanceof SelectorNotFoundError && /editor\.titleInput/.test((e as Error).message));
  assert.ok([...fake.notes.values()].every((n) => !n.title && !n.published));
});

test("note UI: if the article URL can't be confirmed after publishing, it is NOT reported as published", { timeout: 120_000 }, async () => {
  const article = await paidArticle();
  fake = await startFakeNote({ variant: "publish-breaks" });
  const { publisher } = publisherFor(fake.baseUrl);
  const input = toPostInput(article);
  const draft = await publisher.saveDraft(input);
  await assert.rejects(publisher.publish(input, draft.edit_url), PublishUnverifiedError);
});
