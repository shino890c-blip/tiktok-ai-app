function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[#＃【】「」『』（）()\[\]!！?？、。,.\s|｜:：…・〜~\-]/g, "");
}

function bigrams(s: string): Set<string> {
  const n = normalize(s);
  const out = new Set<string>();
  for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2));
  if (n.length === 1) out.add(n);
  return out;
}

/** Character-bigram Jaccard similarity (0..1). Works for Japanese without a tokenizer. */
export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
