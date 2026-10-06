import { slugify } from "../../utils";

/** Marker separating the free part from the paid part. */
export const PAID_MARKER = "<!-- paid -->";

export interface ParsedArticle {
  title: string;
  description: string;
  tags: string[];
  slug: string;
  body: string; // markdown without front matter, including the H1
  free_part: string;
  paid_part: string;
}

/**
 * Parses the writer output format:
 * ---
 * title: ...
 * description: ...
 * tags: a, b, c
 * slug: ...
 * ---
 * # Title
 * ...free...
 * <!-- paid -->
 * ...paid...
 */
export function parseArticleMarkdown(raw: string, fallbackSlug: string): ParsedArticle {
  let text = raw.replace(/\r\n/g, "\n").trim();
  const fence = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/.exec(text);
  if (fence) text = fence[1].trim();

  const meta: Record<string, string> = {};
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
    text = text.slice(fm[0].length).trim();
  }

  const h1 = /^#\s+(.+)$/m.exec(text);
  const title = (meta.title || h1?.[1] || "").trim();
  if (!title) throw new Error("Article has no title");
  if (!h1) text = `# ${title}\n\n${text}`;

  const idx = text.indexOf(PAID_MARKER);
  const free_part = (idx >= 0 ? text.slice(0, idx) : text).trim();
  const paid_part = idx >= 0 ? text.slice(idx + PAID_MARKER.length).trim() : "";

  const tags = (meta.tags || "")
    .split(/[,、]/)
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 10);

  const plain = free_part.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim();
  return {
    title,
    description: meta.description || plain.slice(0, 110),
    tags,
    slug: slugify(meta.slug || "", fallbackSlug),
    body: text,
    free_part,
    paid_part,
  };
}

export function renderArticleMarkdown(a: { title: string; description: string; tags: string[]; slug: string; free_part: string; paid_part: string }): string {
  const fm = ["---", `title: ${a.title}`, `description: ${a.description}`, `tags: ${a.tags.join(", ")}`, `slug: ${a.slug}`, "---", ""].join("\n");
  return fm + a.free_part.trim() + (a.paid_part.trim() ? `\n\n${PAID_MARKER}\n\n${a.paid_part.trim()}` : "") + "\n";
}

/** Body without front matter, as it should be pasted into note. */
export function bodyForNote(free_part: string, paid_part: string): { free: string; paid: string } {
  const strip = (s: string) => s.replace(/^#\s+.+\n+/, "").trim(); // H1 becomes the note title
  return { free: strip(free_part), paid: paid_part.trim() };
}
