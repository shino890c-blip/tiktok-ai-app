# AI YouTube Company 🎬🤖

複数のAIエージェントが協力して **YouTube Shorts のリサーチ → 企画 → 台本 → 品質チェック → 動画生成 → (人間の承認) → 投稿 → 分析 → 学習** を回し続ける「AI YouTube動画制作会社」です。

- 5人のAI社員（独立したAgent）＋ Supervisor（オーケストレーター）＋ 独立Watchdog
- APIキーなしで **Mockモード** のまま全工程が動く（E2Eテスト済み）
- **自動公開はデフォルトOFF**。投稿前に必ず人間の承認を挟む
- LLM / YouTube / DB / 通知はすべてインターフェースで抽象化（差し替え可能）

> 生成される動画は「AI音声ナレーション＋大きなテロップ＋字幕＋場面ごとの背景色＋進行バー」の縦型(1080×1920)動画です。実写・素材映像は使いません（著作権リスクを避けるため）。

---

## 📦 いちばん簡単な使い方：完成動画を納品してもらう（APIキー不要）

デフォルトは **納品モード**（`PUBLISH_TARGET=delivery`）です。AIが動画を完成させて `deliveries/` フォルダに置くので、あなたはそれをYouTubeアプリで投稿するだけです。**YouTube API・Google Cloud の設定は不要です。**

```bash
cd youtube-ai-company
npm install
npm run autopilot      # 1日3本まで、自動で作り続けて納品（Ctrl+Cで停止）
npm run deliveries     # 納品された動画の一覧
```

納品フォルダの中身（1本ごと）:

```
deliveries/2026-10-06_1354_玉ねぎで涙が出にくくなる切り方/
├── video.mp4               ← そのまま投稿する縦型動画
├── サムネイル.jpg
├── アップロード情報.txt     ← タイトル・説明文・タグ（コピペ用）と投稿手順
└── 台本.json
```

投稿して数日たったら、YouTube Studio の数字を入れるとAIが分析して次の動画に活かします（任意）:

```bash
npm run report -- <動画ID> --views 1200 --likes 40 --comments 3 --avg-percent 65
```

### もっと良くするには（どちらも任意）

| やること | 効果 | 難しさ |
|---|---|---|
| 無料アプリ [VOICEVOX](https://voicevox.hiroshiba.jp/) をインストールして起動したままにし、`.env` に `TTS_PROVIDER=voicevox` | 動画にナレーション（声）が入る。**キーも登録も不要** | かんたん |
| [Anthropic](https://console.anthropic.com/) のAPIキーを1つ取り、`.env` に `MOCK_MODE=false` / `LLM_PROVIDER=anthropic` / `LLM_MODEL=claude-sonnet-5-5` / `ANTHROPIC_API_KEY=...` | 毎回新しい企画・台本を考える（キーなしだと内蔵サンプル5テーマの繰り返し） | 5分 |

`npm run doctor` を実行すると、今の設定で何ができて、何を足せばよくなるかが表示されます。

---

## 🚀 YouTubeへの自動投稿まで全自動にする（上級者向け）

`.env` で `PUBLISH_TARGET=youtube` にすると、納品ではなくYouTube APIで直接投稿します。

```bash
npm run doctor      # 何が設定済みで、あと何をすればいいかを表示
npm run autopilot   # 全自動で回し続ける（Ctrl+Cで停止）
```

`npm run autopilot` は **調査 → 台本 → 品質チェック → 動画生成 → 投稿 → 分析 → 学習 → 次の動画** を人の操作なしで繰り返します（`AUTO_PUBLISH` と `AUTO_CONTINUE` を自動でONにします）。暴走しないように次の歯止めがあります:

- 1日 `DAILY_VIDEO_LIMIT`（3）本まで、`AUTOPILOT_MIN_INTERVAL_MINUTES`（180）分間隔
- 連続 `AUTOPILOT_MAX_CONSECUTIVE_FAILURES`（2）回失敗すると自動停止してあなたに通知
- 投稿は `YOUTUBE_ALLOW_PUBLIC=true` にするまで **非公開(private)**
- 投稿が成功したか不明な状態になったら中止（二重投稿しない）

### 本番で全自動にするまでの手順（あなたにしかできない部分）

| # | やること | 所要時間 |
|---|---|---|
| 1 | AIのAPIキーを取得（[Anthropic](https://console.anthropic.com/) または OpenAI）→ `.env` に `ANTHROPIC_API_KEY=...` | 5分 |
| 2 | Google Cloud で YouTube API を有効化し、APIキーと OAuthクライアントを作成 →`.env` に設定（[手順](#youtube-api-設定方法)） | 15分 |
| 3 | `npm run youtube:auth`（Dockerなら下記コマンド）を **1回だけ** 実行し、ブラウザで投稿用チャンネルを許可 | 2分 |
| 4 | `.env` で `PUBLISH_TARGET=youtube` / `MOCK_MODE=false` / `LLM_PROVIDER=anthropic` / `LLM_MODEL=...` / `YOUTUBE_PROVIDER=youtube` / `YOUTUBE_UPLOAD_ENABLED=true` | 1分 |
| 5 | （任意）スマホ通知: Discordのウェブフックを作り `DISCORD_WEBHOOK_URL=...` と `NOTIFY_CHANNELS=console,discord` | 3分 |
| 6 | `npm run doctor` で全部 ✔ になったら、常時起動のPC/サーバーで `docker compose up -d --build` | 5分 |

最初の数本は非公開で投稿されるので、YouTube Studio で確認してから `YOUTUBE_ALLOW_PUBLIC=true` と `YOUTUBE_DEFAULT_PRIVACY=public` で公開に切り替えてください。

### 24時間動かす（Docker）

PCを閉じると止まるので、常時起動のマシン（自宅PC / 月数百円〜のVPS）で Docker を使うのがおすすめです。`docker compose` が ffmpeg・日本語フォント・無料の日本語音声エンジン（VOICEVOX）込みで起動し、再起動後も自動で復帰します。

```bash
cp .env.example .env   # 編集して上の手順1〜5を設定
mkdir -p secrets
docker compose run --rm --service-ports app node dist/cli/index.js youtube:auth   # 初回だけ
docker compose up -d --build        # 起動
docker compose logs -f app          # 様子を見る
# Dashboard: http://127.0.0.1:3100/?token=<DASHBOARD_TOKEN>
docker compose down                 # 停止
```

`docker compose run ... node dist/cli/index.js doctor` で、コンテナ内の設定診断もできます。

---

## 目次
1. [アーキテクチャ](#アーキテクチャ)
2. [Agent一覧](#agent一覧)
3. [セットアップ](#セットアップ)
4. [Mockモード / デモ](#mockモード--デモ)
5. [実行方法（CLI）](#実行方法cli)
6. [Dashboard](#dashboard)
7. [Approval（人間の承認）](#approval人間の承認)
8. [自動投稿を有効にする方法](#自動投稿を有効にする方法)
9. [環境変数](#環境変数)
10. [YouTube API 設定方法](#youtube-api-設定方法)
11. [LLMの切り替え](#llmの切り替え)
12. [安全設計](#安全設計)
13. [テスト](#テスト)
14. [トラブルシューティング](#トラブルシューティング)

---

## アーキテクチャ

```
                         ┌──────────────────────────── Supervisor / Orchestrator ────────────────────────────┐
                         │  ワークフロー管理・成果物検証・停滞パイプライン復旧・日次上限・人間への通知          │
                         └───────┬───────────────────────────────────────────────────────────────▲─────────┘
                                 │ 次のTaskを作成（DB上の条件付き更新で重複防止）                    │ task.completed / failed
  Goal「新しい動画を作る」        ▼                                                                    │
  ──────────────▶  Researcher ─▶ Script Writer ─▶ Publisher(QC) ─▶ Publisher(Render) ─▶ [承認 or AUTO_PUBLISH] ─▶ Publisher(Publish) ─▶ Analyst ─▶ Supervisor(Feedback)
                     ▲             ▲  差し戻し(最大N回) │                                                         │
                     │             └───────────────────┘                                                         ▼
                     └──────────────────────── Knowledge Base / Experiments（次回のプロンプト・判断材料）◀────────┘

  Watchdog（独立）: heartbeat/timeout監視 → 安全に再実行（MAX_RETRIES まで）→ FAILED → Supervisorへ通知 → 人間へ通知
```

| レイヤー | 場所 | 内容 |
|---|---|---|
| Agents | `src/agents/*` | 5 Agent。`BaseAgent` が heartbeat・タイムアウト・構造化ログを共通化 |
| Agent間の契約 | `src/agents/schemas.ts` | zodスキーマ。LLM出力は必ず検証してから保存 |
| Task管理 | `src/core/task-manager` | `PENDING / RUNNING / WAITING_APPROVAL / COMPLETED / FAILED / RETRYING / CANCELLED`、有限リトライ＋指数バックオフ |
| Event Bus | `src/core/event-bus` | 型付きイベント（task.completed など） |
| Scheduler | `src/core/scheduler` | 重複実行しない周期ジョブ |
| Watchdog | `src/core/watchdog` | heartbeat/timeout 検知と復旧 |
| State Manager | `src/core/state-manager` | Agentの状態・heartbeat |
| 動画生成 | `src/video/` | `VideoRenderer`（ffmpeg）＋ `TTSProvider`（silent / VOICEVOX / OpenAI）＋ ASS字幕 |
| Worker | `src/core/worker.ts` | キューからTaskを取りAgentで実行。DBエラーで安全停止 |
| 承認 | `src/core/approvals.ts` | Human-in-the-loop |
| LLM | `src/llm/` | `LLMProvider` インターフェース：mock / anthropic / openai(互換) |
| YouTube | `src/youtube/` | `YouTubeProvider`：Mock / Google(Data API v3 + Analytics API v2, OAuth)、QuotaGuard |
| DB | `src/database/` | `SqlDatabase` インターフェース + SQLite実装（Node標準 `node:sqlite`）、マイグレーション |
| Knowledge | `src/knowledge/` | 経験の記録とプロンプト用ダイジェスト |
| Experiments | `src/experiments/` | 仮説・バリアント・指標・結果・結論 |
| 通知 | `src/notifications/` | Console / Discord / Slack（Webhook）、`[CRITICAL]` フォーマット |
| ログ | `src/logging/` | JSON構造化ログ（console / `logs/app-YYYY-MM-DD.log` / DB `system_events`） |
| Dashboard | `src/dashboard/server.ts` + `dashboard/index.html` | ローカルWeb UI |
| プロンプト | `prompts/*.md` | 各Agentの責任範囲・ルール・出力スキーマ |

### データ
- **SQLite テーブル**: `agents, tasks, pipelines, research, ideas, scripts, videos, analytics, feedback, system_events, approvals, knowledge, experiments, api_usage, schema_migrations`（全テーブルに `created_at / updated_at`）
- **JSON成果物**: `data/research/`, `data/scripts/`, `data/analytics/`, `data/feedback/`, `data/knowledge/knowledge-base.json`
- PostgreSQL へ移行する場合は `SqlDatabase` を実装したアダプタを追加し `openDatabase()` に登録します（SQLは `?` プレースホルダ・`RETURNING`・`ON CONFLICT` などPostgreSQL互換の書き方に限定済み。JSON列は `TEXT` → `JSONB` に変更）。

---

## Agent一覧

| # | Agent | 人格 | 担当Task | 成果物 |
|---|---|---|---|---|
| 1 | **YouTube Researcher** (`researcher`) | 市場調査のプロ | `research` | 急上昇Shorts・尺・タイトルパターン・上位コメント・自社の過去実績・Knowledgeを分析し、**伸びている理由を抽象化したオリジナル企画**を3〜5件、各企画に「作る価値」を付けて出力。既存タイトルと酷似した企画は自動で除外（コピー禁止）、過去に失敗したテーマも除外。最良の企画を選定し実験を割り当て。→ `data/research/*.json` |
| 2 | **Script Writer** (`scriptwriter`) | 視聴維持率を意識した脚本家 | `script` | タイトル候補3つ、0〜2秒フック、ナレーション、テロップ、シーン構成、映像/効果音/BGM指示、CTA、想定尺、視聴維持ポイント、事実確認メモ。QCからの差し戻しを反映して改稿。→ `data/scripts/*.json` |
| 3 | **Publisher / Quality Controller** (`publisher`) | 品質管理責任者 | `quality_check`, `render`, `publish` | ルールチェック（タイトル長、フック、尺、シーン連続性、**ナレーション速度による音声/字幕ズレ**、テロップ、誤字、CTA、説明文、ハッシュタグ、公開設定、**虚偽・誇大表現・医療系注意書き**）＋LLMレビュー。合格→**動画生成**（ナレーション音声→シーン長を音声に合わせて調整→テロップ/字幕/背景/進行バーを合成→ffprobeで検証）→ `READY_FOR_APPROVAL`、不合格→Script Writerへ差し戻し。→ `data/videos/*.mp4`投稿は **承認済みのみ**、二重投稿防止、状態不明なら中止。 |
| 4 | **Analytics & Growth Strategist** (`analyst`) | データ分析・成長戦略責任者 | `analytics` | 取得できた指標のみでスコア化（取れない指標は推測しない）、維持率の離脱点、過去比較、実験の成否判定、**次の動画で実行すべき改善事項**。Researcher / Script Writer 向けフィードバックを作成。→ `data/analytics/*.json`, `data/feedback/*.json` |
| 5 | **Supervisor / Orchestrator** (`supervisor`) | AI会社のオペレーション責任者 | `feedback` + オーケストレーション | 次に何をすべきか判断、Task作成、**成果物の存在検証**、停滞パイプラインの復旧、Knowledge Base への反映、実験結果の記録、日次上限、人間への通知。 |

**Watchdog**（Supervisorとは独立）: 一定間隔で全Agentの heartbeat と RUNNING Task を確認し、①Task状態確認 ②ログ確認 ③エラー確認 ④安全に再実行 ⑤⑥最大リトライ超過なら FAILED ⑦Supervisorへ通知 ⑧人間へ通知 を行います。

### Supervisor が検知する「処理したことになっているが成果物がない」状態

| 完了したTask | 確認内容 | 異常時の対応 |
|---|---|---|
| research | research DB行 + JSONファイル + 選定アイデア | Taskを再実行（上限内）、下流Taskをキャンセル、ステージを巻き戻し |
| script | script DB行 + JSONファイル | 同上 |
| quality_check | 合格なら video行 / 不合格なら QCレポート | 同上 |
| render | 動画ファイル（空でない）+ approval行 | 同上 |
| publish | **YouTube video ID** と `published` 状態 | **自動再実行しない**（二重投稿防止）→ FAILED + CRITICAL通知 |
| analytics | analytics DB行 + JSONファイル | 再実行 |
| feedback | Knowledge Base のエントリ | 再実行 / 完了済みパイプラインに反映が無ければ feedback を再キュー |

---

## セットアップ

必要環境: **Node.js 22.13 以上**（SQLite に Node 標準の `node:sqlite` を使うため、ネイティブビルド不要）、**ffmpeg**（動画生成。Mac: `brew install ffmpeg`、Docker利用時は不要）、日本語フォント

```bash
cd youtube-ai-company
npm install
cp .env.example .env        # そのままで Mockモードで動きます
npm run db:init             # SQLite DB 初期化 + Agent登録 + 実験シード
npm run demo                # Mockモードで全工程の E2E デモ
```

---

## Mockモード / デモ

`MOCK_MODE=true`（デフォルト）では LLM も YouTube もオフラインのモックに差し替わります。

- **MockLLMProvider**: 文脈から決定的にスキーマ準拠の出力を生成（サンプル内容です）
- **MockYouTubeProvider**: 急上昇動画・コメント・アップロード・アナリティクスをシミュレート。ID は `mock_…`、URL は `mock://…`。外部通信なし。実際のAPI同様、インプレッション/CTRは「取得不可」として扱います

`npm run demo` は **独立したデモ用DB**（`data/demo/<timestamp>/`）で次を順に実行し、各ステップの結果を表示します:

DB初期化 → Mockモード → 5 Agent起動 → Research Task作成 → Researcher → Script Writer → Quality Check → 承認待ち → （デモ用オペレーターが承認）→ Mock Publish → Mock Analytics → Feedback → Knowledge Base保存 → Supervisor全体確認

---

## 実行方法（CLI）

```bash
# 全自動（オートパイロット）
npm run doctor
npm run autopilot

# 常駐（承認は人間が行う）（Worker + Supervisor + Watchdog + Dashboard）
npm run start
npm run start -- --goal "新しい動画を作る"   # 起動と同時にGoalを与える
npm run dev                                   # ファイル変更で再起動

# プロセスを分けて動かす場合
npm run worker        # Agentがタスクを処理
npm run supervisor    # Supervisor + Watchdog
npm run dashboard     # Dashboardのみ

# Goal（1本の動画を作る）
npm run goal                      # パイプライン作成（常駐中のworkerが処理）
npm run goal -- --run             # その場で承認待ちまで実行

# 工程ごとの実行
npm run research      # 新しいパイプラインを作り Researcher だけ実行
npm run script        # 保留中の台本タスクを実行
npm run qc            # 保留中の品質チェックを実行
npm run publish       # 承認済みの投稿タスクを実行
npm run analyze -- [--video <video_id>] [--now]
npm run feedback
npm run cli -- run    # 実行可能な全タスクを処理

# 人間の操作
npm run approvals
npm run approve -- <approval_id> [--by 名前] [--note メモ] [--video-file 差し替え動画.mp4] [--run]
npm run reject  -- <approval_id> --note "理由"
npm run retry                     # FAILEDタスク一覧
npm run retry -- <task_id>        # 原因確認後に再実行
npm run cli -- cancel <task_id> --yes

# 情報
npm run status        # Agent/Task/パイプライン/承認待ち/KPI/次のアクション
npm run cli -- knowledge
npm run cli -- experiments
npm run cli -- config # 秘密情報はマスクして表示

# ビルド版で起動
npm run build && npm run start:prod
```

---

## Dashboard

`npm run start`（または `npm run dashboard`）で <http://127.0.0.1:3100> に表示されます（5秒ごとに自動更新）。

表示内容: Supervisorの状態と**次にやること**、Agentの状態/現在のTask/heartbeat、成功数・失敗数・リトライ数・実行中、投稿数・総再生数・平均再生数、本日の制作数/上限、承認待ち（承認/却下ボタン）、現在のTask、パイプライン、最新動画・最新分析（次回の改善事項）、実験、エラー。

- デフォルトは `127.0.0.1` のみで待ち受け
- 承認・Goal作成などの書き込み操作は、ループバック接続時か `DASHBOARD_TOKEN`（`Authorization: Bearer <token>`）がある場合のみ許可

---

## Approval（人間の承認）

1. QC合格 → 動画生成 → 動画レコードが `ready_for_approval`、publish Task は `WAITING_APPROVAL`、承認リクエストを通知（`data/videos/` の実際の動画を見て判断できます）
2. `npm run approvals` で内容と**確認事項チェックリスト**（動画ファイル添付、音声/字幕/映像の目視確認、BGMの権利、事実確認）を表示
3. `npm run approve -- <id>` または Dashboard で承認 → publish Task が `PENDING` になり Worker が投稿
4. `npm run reject -- <id> --note "理由"` → publish Task は `CANCELLED`

Publisher は投稿直前にも「承認済みか」を再確認し、承認がなければ投稿を中止します。

---

## 自動投稿を有効にする方法

段階的に、明示的に有効化します（すべてデフォルトOFF）。

| 設定 | 意味 |
|---|---|
| `MOCK_MODE=false` + `YOUTUBE_PROVIDER=youtube` | 実際の YouTube API を使う |
| `YOUTUBE_UPLOAD_ENABLED=true` | **実アップロードを許可**（false の間は承認されても送信しない） |
| `YOUTUBE_ALLOW_PUBLIC=true` + `YOUTUBE_DEFAULT_PRIVACY=public` | 公開(public)投稿を許可（それまでは強制的に private） |
| `AUTO_PUBLISH=true` | **人間の承認をスキップ**（承認は `system:auto_publish` として記録） |
| `AUTO_CONTINUE=true` | 1本完了後に次の制作を自動開始（`DAILY_VIDEO_LIMIT` で上限） |

推奨: まず `private` で数本アップロードして YouTube Studio で確認 → 問題なければ `unlisted` / `public` へ。`AUTO_PUBLISH=true` は品質が安定してからにしてください。APIエラーや状態不明（アップロード途中の切断など）の場合、投稿は中止され自動再投稿はしません。

---

## 環境変数

全項目は [`.env.example`](./.env.example) を参照。主なもの:

| 変数 | デフォルト | 説明 |
|---|---|---|
| `MOCK_MODE` | `true` | true なら LLM/YouTube をすべてモックに |
| `LLM_PROVIDER` / `LLM_MODEL` | `mock` / `mock-model` | `anthropic` / `openai`。モデル名はコードにハードコードしない |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | - | `.env` のみに記載 |
| `YOUTUBE_PROVIDER` | `mock` | `youtube` で実API |
| `YOUTUBE_API_KEY` | - | リサーチ（公開データ）用 |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | - | OAuth（アップロード・アナリティクス） |
| `YOUTUBE_UPLOAD_ENABLED` | `false` | 実アップロードの許可 |
| `YOUTUBE_ALLOW_PUBLIC` | `false` | public 投稿の許可 |
| `YOUTUBE_DAILY_QUOTA_UNITS` | `5000` | 1日のAPIクォータ使用上限（自主規制、DBに永続化） |
| `AUTO_PUBLISH` | `false` | true でのみ自動投稿 |
| `DAILY_VIDEO_LIMIT` | `3` | 1日に作る動画数の上限 |
| `MAX_RETRIES` | `3` | 最大リトライ（無限リトライなし） |
| `AGENT_TIMEOUT_MINUTES` | `30` | 1タスクの最大実行時間 |
| `HEARTBEAT_INTERVAL_SECONDS` | `60` | heartbeat 間隔（`× HEARTBEAT_MISS_TOLERANCE` で停止判定） |
| `MAX_SCRIPT_REVISIONS` | `2` | QC差し戻しの上限 |
| `DATABASE_URL` | `sqlite:./data/company.db` | DB |
| `NOTIFY_CHANNELS` | `console` | `console,discord,slack` |

---

## YouTube API 設定方法

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「APIとサービス」→ ライブラリで **YouTube Data API v3** と **YouTube Analytics API** を有効化
3. **APIキー**を作成 → `YOUTUBE_API_KEY`（リサーチ用。キーの利用APIを YouTube Data API v3 に制限推奨）
4. **OAuth 同意画面**を設定（テストユーザーに投稿用チャンネルのGoogleアカウントを追加）
5. **OAuth クライアントID**（種類: デスクトップ or ウェブ）を作成。ウェブの場合はリダイレクトURIに `http://127.0.0.1:53682/oauth2callback` を登録 → `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`
6. `.env` に設定し、`MOCK_MODE=false`、`YOUTUBE_PROVIDER=youtube`
7. `npm run youtube:auth` → 表示されたURLをブラウザで開いて許可 → `token.json` が保存されます（`.gitignore` 済み、権限 600）

要求スコープ: `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`

注意:
- `search.list` は 1回 100 ユニット、アップロードは 1600 ユニット消費します（デフォルト上限 10,000/日）。`YOUTUBE_DAILY_QUOTA_UNITS` で自主上限を設定しています
- 未審査の Google Cloud プロジェクトからアップロードした動画は、YouTube の仕様で **非公開に制限** される場合があります（API 監査の申請が必要）
- YouTube Analytics API は**インプレッション/CTRを提供しません**。これらは「取得不可」として扱い、推測しません
- 生成AIを使った動画のため、アップロード時に `containsSyntheticMedia=true`（改変・合成コンテンツの申告）を設定しています

---

## LLMの切り替え

```env
MOCK_MODE=false
LLM_PROVIDER=anthropic          # または openai
LLM_MODEL=claude-sonnet-5-5     # 使いたいモデル名
ANTHROPIC_API_KEY=...
```

OpenAI 互換API（ローカルLLM等）は `LLM_PROVIDER=openai` + `OPENAI_BASE_URL` で接続できます。新しいプロバイダーは `src/llm/providers/` に `LLMProvider` を実装し `createLLMProvider()` に追加するだけです。LLM の出力は必ず zod スキーマで検証し、不正なら1回だけ修正依頼、API の一時エラーは指数バックオフで再試行します。

---

## 安全設計

- APIキー等はコードに書かず `.env` から読み込み（`.env`, `credentials.json`, `token.json`, `*.secret` は `.gitignore` 済み。テストでソース中のキー混入も検査）
- 無限リトライ・無限ループなし（`MAX_RETRIES`、`runUntilIdle` の最大ラウンド、`DAILY_VIDEO_LIMIT`、`MAX_SCRIPT_REVISIONS`）
- YouTube API への過剰アクセス防止（`QuotaGuard`: 日次ユニット上限 + リクエスト間隔）
- 他人の動画のコピー禁止（類似度チェックで除外）、他者の著作物を使う前提の企画・素材は使わない指示
- 虚偽・誇大表現の自動検出（ブロッカー扱い）、医療・健康系の注意書きチェック、事実確認メモを承認チェックリストへ
- 投稿はデフォルトOFF・private・人間承認必須。状態不明時は中止し自動再投稿しない
- Knowledge Base は「経験の記録」のみ。モデル・プロンプトファイル・設定を自動で書き換えない
- 削除系操作はCLIで `--yes` 必須。デモは別DBを新規作成し既存データを消さない
- DBエラー時は処理停止＋CRITICAL通知

---

## テスト

```bash
npm test          # vitest（インメモリSQLite + Mock）
npm run typecheck
npm run build
```

カバー範囲: 納品モード（承認なしでフォルダ出力・YouTube呼び出しなし・手入力の再生数から学習・偽トレンドデータを使わない）、動画生成（ffmpegで実際に1080×1920動画を生成・検証、VOICEVOX連携、尺超過の拒否、字幕の折り返し）、オートパイロット（分析待ちでも次を制作・間隔・日次上限・連続失敗で停止）、Researcher正常終了／コピー除外、Script Writer正常終了／不正入力は非リトライ、QCルール、QC合格→承認待ち、QC不合格→差し戻し→上限でFAILED、承認・却下・未承認投稿の拒否・AUTO_PUBLISH、Mock Publish／二重投稿防止／状態不明時の中止、Analytics（取得不可指標を推測しない）、Knowledge Base保存、Supervisorのタスク追跡・停滞復旧、Watchdog（heartbeat喪失→再起動・再実行、タイムアウト→上限でFAILED、遅延完了の無視）、Retry、最大Retry超過でFAILED＋CRITICAL通知、成果物欠落検知（research JSON削除・publishのID欠落・KB未反映）、E2E、AUTO_CONTINUE＋日次上限、設定の安全デフォルト、構造化ログ、Dashboard API（トークン認可）。

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `node:sqlite` が見つからない | Node.js 22.13 以上にアップデート |
| `[CONFIG_ERROR] LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY` | `.env` にキーを設定するか `MOCK_MODE=true` |
| 承認したのに投稿されない | `npm run start` / `npm run worker` が起動しているか確認。単発なら `npm run publish` |
| `UPLOAD_DISABLED` | 実アップロードには `YOUTUBE_UPLOAD_ENABLED=true` が必要 |
| `NO_VIDEO_FILE` | 動画生成が完了していません。`npm run status` で render タスクを確認 |
| `FFMPEG_NOT_FOUND` | ffmpeg をインストール（Mac: `brew install ffmpeg`）するか Docker を使う |
| `VOICEVOXに接続できません` | VOICEVOX を起動（`docker compose up -d` なら自動）。または `TTS_PROVIDER=openai` |
| `NARRATION_TOO_LONG` | ナレーションが長すぎてShortsの尺に収まらない。台本が自動で短くならない場合は `SHORTS_MAX_DURATION_SEC` を見直し |
| オートパイロットが止まった | 連続失敗で安全停止しています。通知とログで原因を直し、`npm run goal -- --run` で1本成功させると再開 |
| 字幕の文字が □ になる | 日本語フォントを入れるか `VIDEO_FONT_NAME` を設定 |
| `PUBLISH_UNKNOWN_STATE` | アップロードが途中で切れた可能性。YouTube Studio で動画の有無を確認してから対応（自動再投稿はしません） |
| `QUOTA_EXCEEDED` | 日次クォータ上限。翌日（UTC）に再開、または `YOUTUBE_DAILY_QUOTA_UNITS` を見直し |
| `DAILY_VIDEO_LIMIT reached` | 1日の上限に到達。翌日（UTC）に自動で解除 |
| `OAUTH_EXPIRED` / token が無い | `npm run youtube:auth` を再実行 |
| タスクが FAILED のまま | `npm run retry` で一覧 → エラー内容を確認 → `npm run retry -- <task_id>` |
| Agent が `stalled` / heartbeat が古い | Watchdog が自動で再起動・再実行します。`logs/app-*.log` と Dashboard のエラー欄を確認 |
| `DATABASE_ERROR` で停止した | ディスク容量・DBファイルの権限/破損を確認してから再起動 |
| ポート 3100 が使用中 | `DASHBOARD_PORT` を変更 |
