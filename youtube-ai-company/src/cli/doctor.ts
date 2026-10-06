import { existsSync } from "node:fs";
import type { AppConfig } from "../config/index.js";
import { errorMessage } from "../core/errors.js";
import { run } from "../video/process.js";
import { VoicevoxTTS } from "../video/tts.js";

type Level = "ok" | "warn" | "fail" | "info";
interface Check {
  level: Level;
  label: string;
  detail: string;
  todo?: string;
}

const ICON: Record<Level, string> = { ok: "✔", warn: "⚠", fail: "✖", info: "•" };

/**
 * Pre-flight check for full automation. Prints what works, what is missing, and the
 * exact steps only a human can do (API keys, OAuth consent).
 */
export async function runDoctor(config: AppConfig): Promise<{ ready: boolean; checks: Check[] }> {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const live = !config.mockMode;
  const delivery = config.publishTarget === "delivery";

  const [major, minor] = process.versions.node.split(".").map(Number);
  add(major! > 22 || (major === 22 && minor! >= 13)
    ? { level: "ok", label: "Node.js", detail: process.versions.node }
    : { level: "fail", label: "Node.js", detail: process.versions.node, todo: "Node.js 22.13以上をインストール" });

  if (delivery) {
    add({ level: "ok", label: "モード", detail: `納品モード：完成動画を ${config.deliveryDir} に出力（YouTube APIは不要。投稿はあなたが行います）` });
  } else {
    add({ level: live ? "info" : "warn", label: "モード", detail: live ? "LIVE（実API）" : "MOCK（練習モード。YouTubeには何も投稿されません）", todo: live ? undefined : "本番にするなら .env で MOCK_MODE=false" });
  }

  // Video rendering
  if (config.video.renderer === "ffmpeg") {
    try {
      const { stdout } = await run(config.video.ffmpegPath, ["-version"], { timeoutMs: 10_000 });
      const filters = (await run(config.video.ffmpegPath, ["-hide_banner", "-filters"], { timeoutMs: 10_000 })).stdout;
      add(/\sass\s/.test(filters)
        ? { level: "ok", label: "ffmpeg（動画生成）", detail: stdout.split("\n")[0]!.slice(0, 60) }
        : { level: "fail", label: "ffmpeg（動画生成）", detail: "libass（字幕）なしのビルド", todo: "libass付きのffmpegをインストール（Dockerなら不要）" });
    } catch (err) {
      add({ level: "fail", label: "ffmpeg（動画生成）", detail: errorMessage(err), todo: "ffmpegをインストール（Mac: brew install ffmpeg / Docker利用なら不要）" });
    }
    try {
      const { stdout } = await run("fc-match", ["-f", "%{family}", "sans-serif:lang=ja"], { timeoutMs: 10_000 });
      add({ level: "ok", label: "日本語フォント", detail: config.video.fontName ?? stdout.split(",")[0]! });
    } catch {
      add({ level: config.video.fontName ? "ok" : "warn", label: "日本語フォント", detail: config.video.fontName ?? "fontconfigで確認できません", todo: config.video.fontName ? undefined : "日本語フォント（Noto Sans CJK JP等）を入れるか VIDEO_FONT_NAME を設定" });
    }
  } else {
    add({ level: live ? "fail" : "warn", label: "動画生成", detail: "VIDEO_RENDERER=placeholder（本物の動画を作りません）", todo: "VIDEO_RENDERER=ffmpeg" });
  }

  // TTS
  const tts = config.video.tts;
  if (tts.provider === "silent") {
    add({
      level: delivery ? "warn" : live ? "fail" : "info",
      label: "ナレーション音声",
      detail: "silent（無音の動画になります）",
      todo: delivery || live ? "声を入れるなら無料アプリVOICEVOXを起動して .env に TTS_PROVIDER=voicevox" : undefined,
    });
  } else if (tts.provider === "voicevox") {
    try {
      const v = await new VoicevoxTTS(tts.voicevoxUrl, tts.voicevoxSpeaker, tts.voicevoxSpeed, tts.voicevoxCredit).healthCheck();
      add({ level: "ok", label: "ナレーション音声", detail: `VOICEVOX ${v} @ ${tts.voicevoxUrl}` });
    } catch (err) {
      add({ level: "fail", label: "ナレーション音声", detail: `VOICEVOXに接続できません (${errorMessage(err).slice(0, 80)})`, todo: "VOICEVOXを起動（docker compose なら自動で起動）" });
    }
  } else {
    add({ level: config.llm.openaiApiKey ? "ok" : "fail", label: "ナレーション音声", detail: `OpenAI TTS (${tts.openaiModel}/${tts.openaiVoice})`, todo: config.llm.openaiApiKey ? undefined : "OPENAI_API_KEY を設定" });
  }

  // LLM
  if (config.llm.provider === "mock") {
    add(
      delivery
        ? { level: "warn", label: "AI（企画・台本）", detail: "内蔵サンプル（5テーマの繰り返し）", todo: "毎回新しい企画・台本にするなら Anthropic のAPIキーを1つ設定（任意）" }
        : { level: live ? "fail" : "info", label: "AI（企画・台本）", detail: "mock（サンプル文章）", todo: live ? "LLM_PROVIDER と APIキーを設定" : undefined },
    );
  } else {
    add({ level: "ok", label: "AI（企画・台本）", detail: `${config.llm.provider} / ${config.llm.model}` });
  }

  // YouTube
  const yt = config.youtube;
  if (delivery) {
    add({ level: "info", label: "YouTube", detail: "APIは使いません（トレンド調査なし・投稿は手動）" });
  } else if (yt.provider === "mock") {
    add({ level: live ? "fail" : "info", label: "YouTube", detail: "mock（投稿はシミュレーション）", todo: live ? "YOUTUBE_PROVIDER=youtube" : undefined });
  } else {
    add({ level: yt.apiKey ? "ok" : "warn", label: "YouTube リサーチ用APIキー", detail: yt.apiKey ? "設定済み" : "未設定（OAuthで代用）" });
    add(yt.clientId && yt.clientSecret
      ? { level: "ok", label: "YouTube OAuth クライアント", detail: "設定済み" }
      : { level: "fail", label: "YouTube OAuth クライアント", detail: "未設定", todo: "Google Cloudで OAuthクライアントを作り YOUTUBE_CLIENT_ID / SECRET を設定" });
    add(existsSync(yt.tokenPath)
      ? { level: "ok", label: "YouTube ログイン許可", detail: yt.tokenPath }
      : { level: "fail", label: "YouTube ログイン許可", detail: "token.json がありません", todo: "npm run youtube:auth を1回実行してブラウザで許可" });
    add(yt.uploadEnabled
      ? { level: "ok", label: "実アップロード", detail: "有効" }
      : { level: "fail", label: "実アップロード", detail: "無効", todo: "YOUTUBE_UPLOAD_ENABLED=true" });
    add({ level: "info", label: "公開設定", detail: yt.allowPublic ? `${yt.defaultPrivacy}（公開許可あり）` : "private（非公開で投稿）", todo: yt.allowPublic ? undefined : "誰でも見られる公開投稿にするなら YOUTUBE_ALLOW_PUBLIC=true と YOUTUBE_DEFAULT_PRIVACY=public" });
  }

  // Automation
  const p = config.pipeline;
  if (!delivery) add({ level: p.autoPublish ? "ok" : "warn", label: "自動投稿 (AUTO_PUBLISH)", detail: p.autoPublish ? "ON（人間の承認なしで投稿）" : "OFF（毎回あなたの承認待ちで止まります）", todo: p.autoPublish ? undefined : "全自動にするなら AUTO_PUBLISH=true" });
  add({ level: p.autoContinue ? "ok" : "warn", label: "連続制作 (AUTO_CONTINUE)", detail: p.autoContinue ? `ON（${p.autopilotMinIntervalMinutes}分間隔・1日${p.dailyVideoLimit}本まで）` : "OFF（1本作ったら止まります）", todo: p.autoContinue ? undefined : "全自動にするなら AUTO_CONTINUE=true" });
  const notify = config.notifications.channels.filter((c) => c !== "console" && c !== "none");
  add({ level: notify.length ? "ok" : "warn", label: "スマホ通知", detail: notify.length ? notify.join(", ") : "ターミナル表示のみ", todo: notify.length ? undefined : "Discordで通知を受けるなら DISCORD_WEBHOOK_URL と NOTIFY_CHANNELS=console,discord" });

  console.log("\n AI YouTube Company — セットアップ診断\n");
  for (const c of checks) console.log(` ${ICON[c.level]} ${c.label.padEnd(24)} ${c.detail}`);
  const todos = checks.filter((c) => c.todo && (c.level === "fail" || c.level === "warn"));
  const fails = checks.filter((c) => c.level === "fail");
  if (todos.length) {
    console.log("\n あなたがやること:");
    todos.forEach((c, i) => console.log(`  ${i + 1}. ${c.todo}`));
  }
  const ready = fails.length === 0;
  console.log(
    ready
      ? `\n ${live ? "✔ 本番の全自動運用の準備ができています → npm run autopilot（またはdocker compose up -d）" : "✔ Mockモードで動作可能です → npm run autopilot で練習運転"}\n`
      : `\n ✖ ${fails.length}件の問題を解決してください\n`,
  );
  return { ready, checks };
}
