import type { Locator } from "playwright";
import type { Root, SelectorDef } from "../selectors";

/** Thrown when note's UI does not match src/note/selectors.ts. Never retried blindly. */
export class SelectorNotFoundError extends Error {
  constructor(readonly selector: string, detail = "") {
    super(`note UI element not found: ${selector}. UIが変更された可能性があります。src/note/selectors.ts を確認してください。${detail}`);
    this.name = "SelectorNotFoundError";
  }
}

/** Returns the first candidate that becomes visible within timeoutMs. */
export async function findFirst(root: Root, def: SelectorDef, timeoutMs = 10000): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const c of def.candidates) {
      const loc = c(root).first();
      try {
        if (await loc.isVisible()) return loc;
      } catch {
        /* candidate invalid on this page — try next */
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new SelectorNotFoundError(def.name);
}

export async function tryFind(root: Root, def: SelectorDef, timeoutMs = 3000): Promise<Locator | null> {
  try {
    return await findFirst(root, def, timeoutMs);
  } catch {
    return null;
  }
}

/** Reports which candidates resolve (for check-selectors). */
export async function probe(root: Root, def: SelectorDef): Promise<{ name: string; matched: number | null }> {
  for (let i = 0; i < def.candidates.length; i++) {
    try {
      if (await def.candidates[i](root).first().isVisible()) return { name: def.name, matched: i };
    } catch {
      /* ignore */
    }
  }
  return { name: def.name, matched: null };
}

/** innerTexts of the first candidate that matches anything (for lists/tables). */
export async function allTexts(root: Root, def: SelectorDef): Promise<string[]> {
  for (const c of def.candidates) {
    const texts = await c(root).allInnerTexts().catch(() => [] as string[]);
    if (texts.length) return texts.map((x) => x.trim());
  }
  return [];
}
