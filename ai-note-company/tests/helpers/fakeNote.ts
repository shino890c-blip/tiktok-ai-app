import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A tiny local imitation of note.com's *UI* (login redirect, editor, publish
 * settings, article page, stats). It lets the real Playwright publisher run
 * end-to-end in tests without touching note.com.
 */
export interface FakeNote {
  baseUrl: string;
  notes: Map<string, { title: string; html: string; published: boolean; tags: string[]; price: number; paid: boolean; lineAfter: string | null }>;
  close(): Promise<void>;
}

const page = (title: string, body: string) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function startFakeNote(opts: { variant?: "normal" | "changed-ui" | "publish-breaks" } = {}): Promise<FakeNote> {
  const notes: FakeNote["notes"] = new Map();
  let seq = 0;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const loggedIn = /fake_session=1/.test(req.headers.cookie ?? "");
    const send = (status: number, html: string, type = "text/html; charset=utf-8") => {
      res.writeHead(status, { "content-type": type });
      res.end(html);
    };
    const redirect = (to: string) => {
      res.writeHead(302, { location: to });
      res.end();
    };
    const body = async () => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    };
    const p = url.pathname;

    if (p === "/login") return send(200, page("ログイン", `<button>ログイン</button><input type="password">`));
    if (p === "/") return send(200, page("note", loggedIn ? `<button aria-label="アカウント">me</button>` : `<a href="/login">ログイン</a>`));
    if (p === "/sitesettings/stats") {
      if (!loggedIn) return redirect("/login?redirectPath=%2Fsitesettings%2Fstats");
      const rows = [...notes.values()].filter((n) => n.published).map((n, i) => `<tr><td>${esc(n.title)}</td><td>${120 + i}</td><td>3</td><td>17</td></tr>`).join("");
      return send(200, page("stats", `<table><tr><th>記事</th><th>ビュー</th><th>コメント</th><th>スキ</th></tr>${rows}</table>`));
    }
    if (!loggedIn && p.startsWith("/notes")) return redirect("/login");
    if (p === "/notes/new") {
      const key = `n${(++seq).toString(36)}abc`;
      notes.set(key, { title: "", html: "", published: false, tags: [], price: 0, paid: false, lineAfter: null });
      return redirect(`/notes/${key}/edit/`);
    }
    let m = /^\/notes\/(n[0-9a-z]+)\/edit\/?$/.exec(p);
    if (m) {
      const n = notes.get(m[1]);
      if (!n) return send(404, page("404", "not found"));
      const placeholder = opts.variant === "changed-ui" ? "Title here" : "記事タイトル";
      return send(
        200,
        page(
          "editor",
          `<textarea placeholder="${placeholder}">${esc(n.title)}</textarea>
<button aria-label="画像を追加">img</button>
<div class="ProseMirror" contenteditable="true" style="min-height:200px">${n.html}</div>
<button id="save">下書き保存</button><button id="go">公開に進む</button><div id="msg"></div>
<script>
const ed = document.querySelector('.ProseMirror');
ed.addEventListener('paste', (e) => { e.preventDefault(); ed.innerHTML += e.clipboardData.getData('text/html'); });
document.getElementById('save').onclick = async () => {
  await fetch(location.pathname.replace(/edit\\/?$/, 'save'), { method: 'POST', body: JSON.stringify({ title: document.querySelector('textarea').value, html: ed.innerHTML }) });
  document.getElementById('msg').textContent = '下書きを保存しました';
};
document.getElementById('go').onclick = () => { location.href = location.pathname.replace(/edit\\/?$/, 'publish'); };
</script>`,
        ),
      );
    }
    m = /^\/notes\/(n[0-9a-z]+)\/save$/.exec(p);
    if (m && req.method === "POST") {
      const n = notes.get(m[1])!;
      const b = await body();
      n.title = b.title;
      n.html = b.html;
      return send(200, "{}", "application/json");
    }
    m = /^\/notes\/(n[0-9a-z]+)\/publish$/.exec(p);
    if (m && req.method === "GET") {
      const n = notes.get(m[1])!;
      const blocks = (n.html.match(/<(p|h2|h3)>[\s\S]*?<\/\1>/g) ?? []).map((b) => `<div class="block">${b}</div><button class="line">ラインをこの場所に変更</button>`).join("");
      return send(
        200,
        page(
          "publish",
          `<input placeholder="ハッシュタグを追加する" id="tag"><div id="tags"></div>
<label><input type="radio" name="pay" value="free" checked>無料</label><label><input type="radio" name="pay" value="paid">有料</label>
<label>価格<input id="price" type="number"></label>
<button id="area">有料エリア設定</button><div id="blocks" hidden>${blocks}</div>
<button id="publish">投稿する</button>
<script>
const tags = []; let lineAfter = null;
document.getElementById('tag').addEventListener('keydown', (e) => { if (e.key === 'Enter') { tags.push(e.target.value); e.target.value=''; document.getElementById('tags').textContent = tags.join(','); } });
document.getElementById('area').onclick = () => { document.getElementById('blocks').hidden = false; };
document.querySelectorAll('button.line').forEach((b) => b.onclick = () => { lineAfter = b.previousElementSibling.textContent; });
document.getElementById('publish').onclick = async () => {
  const paid = document.querySelector('input[value=paid]').checked;
  const r = await fetch(location.pathname, { method: 'POST', body: JSON.stringify({ tags, paid, price: Number(document.getElementById('price').value || 0), lineAfter }) });
  const j = await r.json(); if (j.url) location.href = j.url;
};
</script>`,
        ),
      );
    }
    if (m && req.method === "POST") {
      const n = notes.get(m[1])!;
      const b = await body();
      Object.assign(n, { tags: b.tags, paid: b.paid, price: b.price, lineAfter: b.lineAfter });
      if (opts.variant === "publish-breaks") return send(200, JSON.stringify({}), "application/json");
      n.published = true;
      return send(200, JSON.stringify({ url: `http://${req.headers.host}/fakeuser/n/${m[1]}` }), "application/json");
    }
    m = /^\/fakeuser\/n\/(n[0-9a-z]+)$/.exec(p);
    if (m) {
      const n = notes.get(m[1]);
      if (!n?.published) return send(404, page("404", "not found"));
      return send(200, page(n.title, `<h1>${esc(n.title)}</h1>${n.html}<button>スキ 17</button>`));
    }
    send(404, page("404", "not found"));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    notes,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

export function fakeStorageState(): string {
  return JSON.stringify({
    cookies: [{ name: "fake_session", value: "1", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }],
    origins: [],
  });
}
