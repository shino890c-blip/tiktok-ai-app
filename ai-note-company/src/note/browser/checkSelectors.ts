import type { AppConfig } from "../../config";
import { AuthRequiredError, isLoggedIn } from "../auth/auth";
import { NOTE_PATHS, SELECTORS } from "../selectors";
import { launchBrowser } from "./browser";
import { probe } from "./resolve";

/**
 * Opens the note editor (logged in) and reports which selectors resolve.
 * It never saves or publishes anything: the new-note page is left untouched.
 * Publish-page selectors can only be probed inside a real draft, so they are
 * reported as "not checked" here.
 */
export async function checkSelectors(config: AppConfig): Promise<{ name: string; matched: number | null }[]> {
  const s = await launchBrowser(config);
  try {
    if (!(await isLoggedIn(s.page, config))) throw new AuthRequiredError();
    const out: { name: string; matched: number | null }[] = [];
    out.push(await probe(s.page, SELECTORS.auth.loggedInIndicator));
    await s.page.goto(config.note.baseUrl + NOTE_PATHS.newNote, { waitUntil: "domcontentloaded" });
    await s.page.waitForTimeout(4000);
    for (const key of ["titleInput", "bodyEditor", "saveDraftButton", "proceedToPublishButton", "coverImageButton"] as const) {
      out.push(await probe(s.page, SELECTORS.editor[key]));
    }
    return out;
  } finally {
    await s.close();
  }
}
