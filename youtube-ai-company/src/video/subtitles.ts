/**
 * Builds an ASS subtitle script that draws the whole Shorts frame: per-scene background,
 * big telop, narration subtitles and a progress bar. Subtitles share the exact timing used
 * to assemble the narration audio, so audio and captions are in sync by construction.
 */

export interface TimedScene {
  start: number;
  end: number;
  telop: string;
  narration: string;
  isHook: boolean;
}

const BACKGROUNDS = ["1E293B", "0F766E", "7C2D12", "312E81", "831843", "14532D", "1E3A8A"]; // RGB hex

function assColor(rgb: string): string {
  const r = rgb.slice(0, 2), g = rgb.slice(2, 4), b = rgb.slice(4, 6);
  return `&H00${b}${g}${r}&`;
}

function ts(sec: number): string {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, "＼").replace(/[{}]/g, "").replace(/\r?\n/g, " ").trim();
}

/** Japanese has no spaces, so libass can't wrap it: insert hard breaks every `perLine` characters. */
export function wrapJa(text: string, perLine: number): string {
  const chars = [...escapeAss(text)];
  // Balance line lengths so a lone character never dangles on the last line.
  const per = Math.ceil(chars.length / Math.max(1, Math.ceil(chars.length / perLine)));
  const lines: string[] = [];
  for (let i = 0; i < chars.length; i += per) lines.push(chars.slice(i, i + per).join(""));
  return lines.join("\\N");
}

/** Splits narration into caption chunks at punctuation, each at most `max` characters. */
export function chunkNarration(text: string, max = 28): string[] {
  const parts = escapeAss(text).split(/(?<=[。！？!?、，,])/u).filter((p) => p.trim());
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ([...cur].length + [...p].length <= max) cur += p;
    else {
      if (cur) out.push(cur);
      let rest = p;
      while ([...rest].length > max) {
        out.push([...rest].slice(0, max).join(""));
        rest = [...rest].slice(max).join("");
      }
      cur = rest;
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

export function buildAss(scenes: TimedScene[], opts: { fontName: string; width?: number; height?: number }): string {
  const W = opts.width ?? 1080;
  const H = opts.height ?? 1920;
  const total = scenes.length ? scenes[scenes.length - 1]!.end : 0;
  const font = opts.fontName.replace(/,/g, " ");
  const lines: string[] = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: BG,${font},10,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: Telop,${font},96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,7,2,8,70,70,560,1`,
    `Style: Hook,${font},112,&H0000E5FF,&H0000E5FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,8,3,5,60,60,0,1`,
    `Style: Sub,${font},60,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,3,4,0,2,70,70,300,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  scenes.forEach((s, i) => {
    const bg = assColor(BACKGROUNDS[i % BACKGROUNDS.length]!);
    lines.push(`Dialogue: 0,${ts(s.start)},${ts(s.end)},BG,,0,0,0,,{\\pos(0,0)\\c${bg}\\p1}m 0 0 l ${W} 0 ${W} ${H} 0 ${H}{\\p0}`);
    const barW = total > 0 ? Math.max(1, Math.round((s.end / total) * W)) : W;
    lines.push(`Dialogue: 2,${ts(s.start)},${ts(s.end)},BG,,0,0,0,,{\\pos(0,${H - 24})\\c&H0000E5FF&\\p1}m 0 0 l ${barW} 0 ${barW} 24 0 24{\\p0}`);
    if (s.telop.trim()) {
      const style = s.isHook ? "Hook" : "Telop";
      lines.push(`Dialogue: 1,${ts(s.start)},${ts(s.end)},${style},,0,0,0,,${s.isHook ? "{\\fad(80,0)}" : "{\\fad(120,0)}"}${wrapJa(s.telop, s.isHook ? 8 : 9)}`);
    }
    const chunks = chunkNarration(s.narration);
    const totalChars = chunks.reduce((n, c) => n + Math.max(1, [...c].length), 0);
    let t = s.start;
    for (const c of chunks) {
      const d = ((s.end - s.start) * Math.max(1, [...c].length)) / totalChars;
      if (c.trim()) lines.push(`Dialogue: 1,${ts(t)},${ts(t + d)},Sub,,0,0,0,,${wrapJa(c, 15)}`);
      t += d;
    }
  });
  return lines.join("\n") + "\n";
}
