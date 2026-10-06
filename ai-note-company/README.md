# AI Note Company

note（note.com）の運営を、AIエージェントのチームで回すためのシステムです。毎回人間が記事を書くのではなく、次の流れをエージェントが担当します。

```
Research → 企画 → 執筆 → 編集 → 品質チェック → note下書き作成 → 人間の承認 → 公開 → 記事分析 → 改善（Knowledge）→ 次の記事
```

- **自動公開はデフォルトOFF**です。下書き作成までを自動化し、公開は人間の承認後に行います。
- noteには一般向けの公式投稿APIがないため、投稿は **PlaywrightによるブラウザUI操作**で行います。noteの非公開内部APIは使いません。
- noteのUIに関する知識は **`src/note/selectors.ts` の1ファイルに集約**しています。UIが変わったときはここだけを直します。
- 「成功した」と偽って報告しません。公開URLを実際に開いて確認できた場合だけ `PUBLISHED` にします。下書きは `DRAFT` のままです。
- **MOCKモード**では、APIキーもnoteログインもなしで、全工程（Research → … → Knowledge → 次の企画）を通して動かせます。

---

## 目次

1. [セットアップ](#1-セットアップ)
2. [Claude Codeでの使い方](#2-claude-codeでの使い方)
3. [LLM設定](#3-llm設定)
4. [noteログイン](#4-noteログイン)
5. [Playwright設定](#5-playwright設定)
6. [下書き作成](#6-下書き作成)
7. [承認](#7-承認)
8. [自動公開](#8-自動公開)
9. [Dashboard](#9-dashboard)
10. [エラー対応](#10-エラー対応)
11. [セレクタの直し方](#11-セレクタの直し方)
12. [APIを使わない理由](#12-apiを使わない理由)
13. [自動化の注意点](#13-自動化の注意点)
14. [アーキテクチャ](#14-アーキテクチャ)
15. [テスト](#15-テスト)
16. [未実装の機能と今後の改善](#16-未実装の機能と今後の改善)

---

## 1. セットアップ

必要なもの：Node.js **22.5以上**（組み込みの `node:sqlite` を使うため。ネイティブモジュールのビルドは不要です）。

**最短手順（自分のPCで）：**

```bash
cd ai-note-company
npm run setup
```

このコマンドは、依存関係のインストール → Chromiumのインストール → `.env` の作成（既にあれば上書きしません）→ ブラウザが開いてnoteにログイン（ここだけ人間が操作）→ セレクタの確認、までを続けて行います。

手動で進める場合は次のとおりです。

```bash
cd ai-note-company
npm install
npx playwright install chromium   # ローカルPCで初回のみ（下記「Playwright設定」参照）
cp .env.example .env              # 必要に応じて編集
npm run build
npm run test
npm run e2e
```

まずはMOCKモードのまま動かしてみてください（`.env` の既定値は `RUN_MODE=mock`）。

```bash
npm run dev            # Supervisorループ + Dashboard（http://127.0.0.1:3939）
```

すぐに1記事を通して見たい場合は、時刻待ちをしない設定にして手動で進めます：

```bash
SCHEDULE_MODE=immediate npx tsx src/cli/index.ts pipeline   # Research〜下書きまで
npm run approve                                               # 承認待ち一覧
npm run approve -- --id <approval_id> --action approve        # 承認 → 公開（MOCK）
npm run analytics                                             # 分析 → Knowledge更新
npm run status
```

### コマンド一覧

| コマンド | 内容 |
|---|---|
| `npm run dev` | Supervisorループ + Dashboard（tsxで直接実行） |
| `npm run start` | buildしてから Supervisorループ + Dashboard |
| `npm run supervisor` | Supervisorループのみ |
| `npm run research` | 今日の記事のResearchを今すぐ実行（`DAILY_ARTICLE_LIMIT` 内） |
| `npm run write` | Strategy → Writing → Quality を今すぐ実行 |
| `npm run draft` | note下書き作成を今すぐ実行 |
| `npm run publish` | 承認済みの公開タスクを実行 |
| `npm run analytics` | Analytics → Knowledge更新を今すぐ実行（`-- --all` で公開済み全記事を再分析） |
| `npm run status` | Agent・Task・承認待ち・公開記事・Knowledgeを表示 |
| `npm run approve` | 承認待ち一覧／`-- --id … --action approve\|reject\|regenerate\|edit` |
| `npm run setup` | 初回セットアップ（依存関係・Chromium・`.env` → ログイン → セレクタ確認） |
| `npm run login` | noteへの初回ログイン（人間が操作） |
| `npm run dashboard` | Dashboardのみ |
| `npm run test` / `npm run e2e` | ユニットテスト / E2Eテスト |
| `npx tsx src/cli/index.ts pipeline` | 1記事をResearchから承認待ちまで一気に進める |
| `npx tsx src/cli/index.ts check-selectors` | noteのセレクタが今も解決できるか確認（要ログイン） |

手動コマンド（`research` / `write` / `draft` など）は、スケジュール時刻を待たずにその場で実行します。

## 2. Claude Codeでの使い方

このディレクトリをClaude Codeで開き、次のように頼むのが基本の使い方です。

- 「`npm run status` を実行して、止まっているタスクやエラーがあれば原因を調べて」
- 「承認待ちの記事を読んで、気になる点を教えて」→ 内容を確認してから `npm run approve -- --id … --action approve`
- 「noteのUIが変わって下書き保存が失敗している。`src/note/selectors.ts` を直して」（エラーメッセージに壊れたセレクタ名が出ます）
- 「`src/prompts/index.ts` の文体ルールに◯◯を追加して、`npm test` で確認して」
- 「Knowledge Baseの内容から、次に書くべきテーマを提案して」（`npm run status` / Dashboard の Knowledge 欄）

人間の確認が必要なのは次の3つだけです：**noteへの初回ログイン**、**公開の承認**、**APIキーなどの秘密情報の設定**（`.env`）。

## 3. LLM設定

`.env` で設定します。

```ini
RUN_MODE=live
LLM_PROVIDER=anthropic      # mock | anthropic | openai
LLM_MODEL=claude-opus-5-5   # 省略時: anthropic→claude-opus-5-5, openai→gpt-4.1
LLM_API_KEY=sk-ant-...      # .env にのみ書く（Git管理外）
```

- `anthropic`：公式SDK（`@anthropic-ai/sdk`）を使用。ストリーミングで受信し、執筆・推敲は effort `high`、それ以外は `medium` です。対応モデルでは、安全分類器による拒否時に別モデルへ自動で切り替えるサーバー側フォールバック（`fallbacks: "default"`）を有効にしています。`LLM_API_KEY` が空ならSDKが `ANTHROPIC_API_KEY` を読みます。
- `openai`：Chat Completions APIを `fetch` で呼び出す最小実装です。
- `mock`：オフラインで決まった結果を返す実装です。テストとMOCKモードで使います。

プロンプトは `src/prompts/index.ts` にまとめています（Research / Strategy / Writing / Revision / Quality Review / Analytics Review）。LLMの出力はJSON・Markdownとして検証し、不正なら1回だけ聞き直します。それでも不正ならタスク失敗として扱い、リトライの対象になります。

## 4. noteログイン

```bash
npm run login
```

1. 画面ありのChromiumが起動し、noteのログインページが開きます。
2. **人間が**普段どおりログインします。このツールはパスワードを読まず、入力もせず、保存もしません。
3. ログイン後のページ遷移を検知すると、ログイン状態を別タブで確認し、Playwrightの `storageState`（Cookie）を `./.auth/note-storage.json` に保存します（パーミッションは `600`）。
4. 以降の下書き作成・公開・統計取得は、このセッションを再利用します。

- `.auth/` は `.gitignore` 済みです。**このファイルは絶対にコミットしないでください**（Cookieはパスワードと同じ扱いです）。
- セッションが切れると、Publisherは `AuthRequiredError` で止まり、通知を出します。もう一度 `npm run login` を実行してください。
- 待機時間は `NOTE_LOGIN_TIMEOUT_MINUTES`（既定10分）で変えられます。

## 5. Playwright設定

| 変数 | 既定値 | 説明 |
|---|---|---|
| `BROWSER_HEADLESS` | `false` | 公開操作を目で確認できるよう、既定では画面ありで起動します |
| `NOTE_BASE_URL` | `https://note.com` | テストではローカルの偽note UIを指定します |
| `NOTE_STORAGE_STATE` | `./.auth/note-storage.json` | セッションの保存先 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE` | なし | インストール済みChromiumを使う場合に指定します |

ローカルPCでは `npx playwright install chromium` を1回実行してください。`playwright` のバージョンは `1.56.1` に固定しています。

## 6. 下書き作成

`RUN_MODE=live` の場合、品質チェックに合格した記事に対して Publisher が次の操作を行います：

1. 保存済みセッションでブラウザを起動し、ログイン状態を確認します（未ログインなら停止して通知）。
2. 新規記事の編集画面を開き、タイトルを入力します。
3. 本文はMarkdownをHTMLに変換し、**ユーザーがクリップボードから貼り付けたときと同じ paste イベント**としてエディタに渡します。貼り付けが反映されなかった場合は、段落ごとにキーボード入力します。
4. アイキャッチ画像をアップロードします（失敗しても下書きは保存し、警告を残します）。
5. 「下書き保存」を押し、編集画面のURLを保存します（`drafts.edit_url`）。

記事は `data/articles/<article_id>/article.md`（改稿ごとに `article.r<N>.md`）にMarkdownで保存します。有料記事では `<!-- paid -->` の行が有料ラインになります。

タグ・価格・有料ラインは、noteの仕様上公開設定画面で入力するため、公開時に設定します。

## 7. 承認

下書きができると `[NOTE APPROVAL REQUIRED]` 通知が出て、承認タスクが `WAITING_APPROVAL` になります。

- **Dashboard**：`http://127.0.0.1:3939/approvals/<approval_id>`
  タイトル・本文（無料／有料の境界つき）・価格・タグ・アイキャッチ・品質スコアとQCの指摘・Researchの理由と出典・企画意図・note下書きURLを表示します。
  ボタンは **APPROVE / REJECT / EDIT / REGENERATE** の4つです。
- **CLI**：`npm run approve`（一覧）、`npm run approve -- --id <id> --action approve`

| ボタン | 動作 |
|---|---|
| APPROVE | 公開タスクを作成します。**公開に進むのはこれだけです** |
| REJECT | 記事を `REJECTED` にして止めます。理由はフィードバックとして記録します |
| EDIT | 人間の編集（タイトル・本文・価格・タグ）を反映 → 品質チェックをやり直す → 同じnote下書きを更新 → 再度承認を依頼 |
| REGENERATE | コメントを添えてWriterに書き直しを依頼 → 品質チェック → 下書き更新 → 再度承認を依頼 |

## 8. 自動公開

```ini
NOTE_AUTO_PUBLISH=true
```

`true` にすると、下書き保存のあと人間の承認を待たずに公開へ進みます。ただし公開の直前に、次のチェックを必ず行います。

1. 品質チェック（`QUALITY_THRESHOLD` 以上）と安全チェック（critical な指摘がないこと）を再実行し、不合格なら公開しません。
2. 下書きのタイトルが記事と一致することを確認します（別の記事を公開しないため）。
3. 公開ボタン・料金設定・有料ライン位置など、UIが想定と違えば**公開ボタンを押す前に中断**します。
4. 公開後に記事URLを開き、タイトルが表示されることを確認できた場合だけ `PUBLISHED` にします。

記事モードが `DRAFT` の記事は、承認されても公開しません。公開ボタンを押したあとに結果を確認できなかった場合は、二重投稿を防ぐため自動リトライしません（noteの管理画面で状態を確認してください）。

### 記事モード

| モード | 内容 |
|---|---|
| `FREE` | 無料記事 |
| `PARTIAL_PAID` | 無料部分 →「ここから先では〜」→ 有料部分 |
| `PAID` | 有料記事（noteの仕様上、有料ラインより前は無料で読めます。導入だけを無料にする構成です） |
| `DRAFT` | 下書きまで作成し、公開はしません |

既定値は `DEFAULT_ARTICLE_MODE=FREE`、`DEFAULT_ARTICLE_PRICE=980` です。有料記事では、品質チェックが「価格に見合う具体的な価値があるか」を確認します（有料部分の分量、手順やテンプレートなど実行できる内容の有無、無料部分の水増しではないか、無料部分だけでも価値があるか）。

## 9. Dashboard

`npm run dev` / `npm run start` / `npm run dashboard` で起動します。既定のアドレスは `127.0.0.1:3939` で、ローカルからのみアクセスできます。フォームからの送信はCSRFトークンで保護しています。

表示内容：Agent Status（heartbeat・再起動回数・直近のエラー）／Current Tasks（失敗したタスクは「再実行」ボタンで再投入）／Pending Approval／Published Articles（views・likes・comments・sales・スコア）／Views・Likes・Comments・Sales・Revenue の合計／Errors／Latest Feedback／Knowledge Base／Health。

JSON形式では `GET /api/status` で取得できます。

## 10. エラー対応

各タスクは `PENDING / RUNNING / WAITING_APPROVAL / COMPLETED / FAILED / RETRYING / CANCELLED` のいずれかの状態を持ちます。

**リトライ**：一時的なエラー（ネットワーク、レート制限、LLMの不正出力など）は、指数バックオフで最大 `MAX_RETRIES`（既定3）回までリトライします。上限に達したら `FAILED` にして `[NOTE ERROR]` を通知します。無限にリトライすることはありません。

**リトライしないエラー**（すぐに `FAILED` にして通知します）：

| エラー | 意味 | 対応 |
|---|---|---|
| `AuthRequiredError` | noteにログインしていない、またはセッション切れ | `npm run login` |
| `SelectorNotFoundError` | noteのUIが変わった | [セレクタの直し方](#11-セレクタの直し方) |
| `PublishUnverifiedError` | 公開ボタンを押したが記事URLを確認できなかった | noteの管理画面で確認します。二重投稿を防ぐため自動リトライはしません |
| 承認なしでの公開 | `NOTE_AUTO_PUBLISH=false` で未承認 | Dashboardで承認します |
| LLMの認証エラー・リクエスト拒否 | APIキーの誤り、またはモデルが応答を拒否した | `.env` を確認します |

**Watchdog**：各Agentは実行中、`HEARTBEAT_INTERVAL_SECONDS`（既定60秒）ごとにheartbeatを記録します。`AGENT_TIMEOUT_MINUTES`（既定30分）を超えてheartbeatが途絶えると、次の順に対応します。

1. タスクの状態を確認する
2. 関連するログ（system_events）を確認する
3. エラー内容を確認する
4. 実行を中断してリトライする
5. Agentを再起動する（新しいインスタンスに置き換える）
6. 上限に達していたら `FAILED` にする
7. Supervisorに報告する（system_event）
8. 人間に通知する

プロセスが落ちて `RUNNING` のまま残ったタスクも、起動時に回収します。

**手動で再実行**：Dashboardの「再実行」ボタンで、`FAILED` のタスクをリトライ回数をリセットして再投入できます。

**ログ**：`logs/app.log`（JSON Lines形式。パスワード・トークン・Cookie・APIキーなどのキーは自動で伏せ字にします）と、DBの `system_events` テーブルに残ります。

## 11. セレクタの直し方

noteのUIに関する知識は `src/note/selectors.ts` だけにあります。

```ts
titleInput: def(
  "editor.titleInput",
  (r) => r.getByPlaceholder("記事タイトル"),          // 候補1
  (r) => r.getByRole("textbox", { name: /タイトル/ }), // 候補2
  (r) => r.locator('textarea[placeholder*="タイトル"]'),
),
```

- 各要素には複数の候補があり、**最初に表示されたもの**を使います。
- 固定座標でのクリックは使いません。`getByRole` / `getByLabel` / `getByPlaceholder` / `getByText` / `data-testid` / 安定したCSSセレクタだけを使います。
- URLのパターン（エディタ・公開設定・記事・ログイン）も `NOTE_URL_PATTERNS` としてこのファイルにまとめています。

手順：

1. エラーメッセージに出たセレクタ名（例：`editor.titleInput`）を確認します。
2. `npm run login` を実行したあと、`npx tsx src/cli/index.ts check-selectors` で、どのセレクタが解決できないかを確認します。
3. 実際のnote画面を開発者ツールで調べ、**新しい候補を配列の先頭に追加**します。古い候補はしばらく残しておきます。
4. `npm run e2e` を実行します（ローカルの偽note UIに対して、実際のPlaywright操作を検証します）。

> `check-selectors` は新規記事の画面を開くだけで、何も保存しません。公開設定画面のセレクタは実際の下書きの中でしか確認できないため、このコマンドの対象外です。

## 12. APIを使わない理由

- noteには、一般ユーザーが記事を投稿するための**公式APIが公開されていません**。
- noteのWebアプリが内部で使っている非公開APIを解析して再現する方法は、仕様が予告なく変わるうえ、利用規約上の位置づけもはっきりしません。アカウントへの影響も読めないため、採用しませんでした。
- このシステムは、**人間が普段使っているブラウザUIを、人間と同じ手順で操作**します。UIの変更は `selectors.ts` で吸収し、想定外の画面になったら操作を止めます。
- Researchで扱うのも、公開ページの**記事タイトル**（任意設定の `RESEARCH_NOTE_BROWSE=true`）と公式APIや公開RSS（Googleトレンド、Googleニュース、YouTube Data API）だけです。本文の収集やコピーはしません。

## 13. 自動化の注意点

- **公開は人間が承認するのが基本です。** `NOTE_AUTO_PUBLISH=true` は、品質と運用が安定してから使ってください。
- noteの利用規約・ガイドラインに従ってください。短時間に大量投稿しないでください（`DAILY_ARTICLE_LIMIT` の既定は1日1記事）。
- AIが書いた記事でも、**内容の責任は公開した人にあります**。特に、医療・投資・法律などの断定的な助言、統計の出典、古い情報には注意してください。品質チェックはこれらを検出しようとしますが、完全ではありません。
- 他人の記事をコピーしないでください。品質チェックは、過去の自分の記事との重複も検出します。
- `.auth/note-storage.json` と `.env` はGitに入れないでください（どちらも `.gitignore` 済みです）。
- MOCKモードのAnalytics・Knowledgeの数値はシミュレーションです（`is_simulated` フラグと画面の表示で区別できます）。実際の判断には使わないでください。
- 取得できなかった指標は `null`（Dashboardでは「取得不可」）として扱い、推測で埋めません。Knowledgeの傾向は、比べる各グループに5記事以上あり、差が20%以上ある場合にだけ「暫定」として表示します。

## 14. アーキテクチャ

### エージェント

| Agent | 担当 | 実装 |
|---|---|---|
| 1. Researcher | トレンドシグナルの収集（公開RSS・YouTube・手動入力・過去記事・前回の候補）と、「なぜ読まれるか」の分析 | `src/agents/researcher/` |
| 2. Strategist | 無料か有料か、タイトル、構成、無料部分と有料部分の価値、価格、CTA | `src/agents/strategist/` |
| 3. Writer / Editor | オリジナル記事の執筆、品質チェックの指摘や人間のコメントを反映した改稿、SEO項目、アイキャッチ | `src/agents/writer/` |
| (QC) | 公開前の品質チェック（100点満点、80点未満は差し戻し） | `src/quality/`, `src/agents/quality/` |
| 4. Publisher / Analytics | noteの下書き作成・公開（Playwright）、指標の取得と評価 | `src/agents/publisher/`, `src/agents/analytics/`, `src/note/`, `src/analytics/` |
| 5. Supervisor / Watchdog | 日次ループ、タスクの連鎖、Knowledge更新、ヘルスチェック、heartbeatの監視と復旧 | `src/agents/supervisor/`, `src/core/` |

### パイプライン

```
research ─▶ strategy ─▶ writing ─▶ quality ─┬─(<80点)─▶ writing（改稿、最大 MAX_REVISIONS 回）
                                            └─(≥80点)─▶ draft ─┬─▶ approval（人間）─APPROVE─▶ publish
                                                               └─(AUTO_PUBLISH)─────────────▶ publish
publish ─▶（ANALYTICS_DELAY_HOURS 後）analytics ─▶ knowledge ─▶ 次の記事候補（research: candidates）
```

日次スケジュール（`SCHEDULE_MODE=daily`）：08:00 Research → 09:00 Strategy → 10:00 Writing → 11:00 Quality Check → 11:30 note下書き → 人間の承認 → Publish → 翌日 Analytics。時刻は `.env` で変更できます。前のステップが指定時刻より後に終わった場合、次のステップはすぐに実行します。

### データベース（SQLite）

`agents`, `tasks`, `ideas`, `strategies`, `articles`, `drafts`, `published_articles`, `analytics`, `feedback`, `knowledge`, `approvals`, `system_events`（と `quality_reports`, `schema_migrations`）。

PostgreSQLへの移行を考えて、型は `TEXT / INTEGER / REAL` だけを使い、時刻はISO8601、JSONは `TEXT` に保存しています。SQLはプレースホルダ `?` を使う移植しやすい書き方に限り、すべて `src/database/repositories.ts` と `Db` インターフェース経由で実行します。PostgreSQLに移すときは、`Db` を実装するアダプタ（`?`→`$n` の変換）を1つ追加すれば済みます。

### ディレクトリ

```
src/
  agents/       researcher/ strategist/ writer/ quality/ publisher/ analytics/ supervisor/
  core/         tasks/ scheduler/ watchdog/ events/  pipeline.ts runner.ts approvals.ts
  note/         selectors.ts  browser/ auth/ publisher/
  llm/          provider.ts anthropic.ts openai.ts mock.ts
  database/     knowledge/  analytics/  notifications/  images/  quality/  dashboard/  prompts/  cli/
data/           記事Markdown・画像・SQLite（Git管理外）
logs/           app.log（Git管理外）
.auth/          noteセッション（Git管理外）
tests/unit/     tests/e2e/
```

### 画像

`src/images/imageProvider.ts` の `ImageProvider` インターフェースで、画像の生成元を差し替えられます。APIを設定していない場合は、`PlaceholderImageProvider` がグラデーションのPNG（アップロード用）とタイトル入りのSVG（プレビュー用）を作ります。`IMAGE_PROVIDER=openai` と `IMAGE_API_KEY` を設定すると、OpenAI Images APIを使います。

### 通知

`NotificationService` を経由して送ります。`NOTIFICATION_PROVIDER=console`（既定）／`discord`／`slack` から選べます（後の2つは `NOTIFICATION_WEBHOOK_URL` に送信します）。送信に失敗した場合はコンソールに出力し、`system_events` に記録します。メールでの通知はまだ実装していません。

## 15. テスト

```bash
npm run test   # ユニットテスト 54件
npm run e2e    # E2Eテスト 6件
```

- Unit：Database／Task Manager／Retry／Watchdog／Researcher／Strategy／Writer／Quality Control／Knowledge Base／Approval／Mock Publisher／Dashboard／設定・スケジューラ・通知・ロガー（秘密情報の伏せ字化）
- E2E（`tests/e2e/pipeline.e2e.test.ts`）：AI Note Companyを起動 → Research → 企画 → 記事作成 → Quality Control → Approval → Mock Note Publish → Analytics → Knowledge更新 → 次回の企画生成。`NOTE_AUTO_PUBLISH=true` の経路も検証します。
- E2E（`tests/e2e/noteUi.e2e.test.ts`）：**実際のPlaywright Publisher（Chromium）**を、ローカルに立てた偽のnote UIに対して動かします。ログイン検知、エディタへの貼り付け、下書き保存、タグ、価格、有料ライン、公開、URL確認、統計の読み取りを検証します。あわせて、未ログイン時・UI変更時・公開結果を確認できない時に、正しく停止することも確認します。

## 16. 未実装の機能と今後の改善

未実装または制限があるもの：

- **本物のnote.comに対する動作確認はまだしていません。** セレクタは、執筆時点で把握しているnoteのUIを前提にした初期値です。初回は `npm run login` → `check-selectors` → `NOTE_AUTO_PUBLISH=false` のまま下書き作成、の順に確認し、必要に応じて `selectors.ts` を直してください。
- Analyticsでは、売上（sales / revenue）とフォロワーの増加数を自動で取得していません（`null` になります）。views / comments / likes は、ダッシュボードの統計表と記事ページから読み取ります。
- Xのトレンドには無料の公式APIがないため、`data/manual-trends.json`（`data/manual-trends.example.json` をコピー）に人間が入力する方式です。
- 本文中の画像の自動挿入（`body_images` を保存する場所はあります）。
- メール通知。
- Dashboardの認証（現状はlocalhostからのアクセスに限定する前提です）。

今後の改善案：

- note側のUI変更を早く見つけるため、`check-selectors` を定期的に実行して通知する
- 売上ページとフォロワー数の取得（セレクタを追加する）
- LLMによるQCレビューのプロンプト改善と、ルールベースの採点との重み付けの調整
- Knowledgeが溜まってきたら、タイトル・構成・価格についてA/Bの比較を取り入れる
- PostgreSQLアダプタの追加と、Supervisorを複数プロセスで動かす場合のタスクのロック
