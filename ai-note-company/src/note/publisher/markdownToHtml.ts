const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

/** Small Markdown → HTML converter for pasting into note's editor. */
export function markdownToHtml(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    if (/^<!--.*-->$/.test(line.trim())) continue;
    let m: RegExpExecArray | null;
    if ((m = /^(#{2,3})\s+(.+)$/.exec(line))) {
      closeList();
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    } else if ((m = /^\s*[-*]\s+(.+)$/.exec(line))) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = /^\s*\d+[.)]\s+(.+)$/.exec(line))) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      closeList();
      out.push(`<blockquote><p>${inline(m[1])}</p></blockquote>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}
