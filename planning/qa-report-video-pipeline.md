# 動画制作支援パイプライン E2Eテストレポート

- テスト対象: TikTok AI動画メディア管理アプリ「動画制作支援パイプライン」
- 対象パス: `C:\Users\znshi\projects\tiktok-ai-app`
- テスト環境: http://localhost:3000 (next dev, Next.js 16.3.0)
- プロバイダー設定: `VIDEO_GENERATOR_PROVIDER` 未設定 → 既定値 `openai` だが `OPENAI_API_KEY` 未設定のため全経路がモック実装にフォールバック（`isMock: true`）

## サマリー

| カテゴリ | PASS | FAIL | 備考 |
|---|---|---|---|
| バックエンドAPI 正常系 | 4/4 | 0 | 全エンドポイント200、期待形状のレスポンス |
| バックエンドAPI 異常系 | 4/4 | 0 | 全エンドポイント400+日本語エラー、統一的 |
| フロントエンドUI | 9/9 | 0 | 全コンポーネント動作確認 |
| **設計上の懸念（FAILではないが要報告）** | - | - | HTTP 207（部分失敗）が実質到達不能 |

---

## 1. バックエンドAPI テスト結果

### 1.1 正常系（有効な `Script` スキーマ: `hook` / `narration` / `structure[{time,content}]` / `video_prompt`）

> **重要な発見**: タスクで提供されたサンプル台本データ（`scenes: [{time, narration, visualNote}], cta`）は、実装の `Script` 型（`src/lib/video-generator/types.ts`）とスキーマが異なります。実装が要求する形式に変換したデータで正常系テストを実施しました。

| # | エンドポイント | 結果 | HTTPステータス | 備考 |
|---|---|---|---|---|
| 1 | POST `/api/video/generate-prompts` | PASS | 200 | `scenes[]` に `sceneIndex/time/startSec/endSec/content/prompt` が正しく生成 |
| 2 | POST `/api/video/generate-voice` | PASS | 200 | `audioUrl: /generated/audio/sample-idea.mock.txt` を返却 |
| 3 | POST `/api/video/generate-subtitles` | PASS | 200 | SRT形式のタイムコード（`00:00:00,000 --> 00:00:05,000`等）が正しく生成 |
| 4 | POST `/api/video/generate-all` | PASS | 200 | 3ステップ全て`status:"success"`、`assets`に全素材を格納 |

### 1.2 異常系

| # | エンドポイント | 入力 | 結果 | HTTPステータス | メッセージ |
|---|---|---|---|---|---|
| 1 | 全4エンドポイント | 空オブジェクト `{}` | PASS | 400 | 「台本データの hook（冒頭フック文）が不正です。」 |
| 2 | generate-prompts | タスク記載のサンプルデータ（`scenes`/`cta`形式、実スキーマ非対応） | PASS | 400 | 「台本データの narration（ナレーション原稿）が不正です。」 |
| 3 | generate-prompts | `structure`の要素に`content`欠落 | PASS | 400 | 「台本データの structure の各要素には time と content が必要です。」 |
| 4 | generate-prompts | 不正なJSON文字列 | PASS | 400 | 「リクエストボディのJSON解析に失敗しました。」 |

**所見**: `validateScript`（`src/lib/video-generator/validate.ts`）による検証が4エンドポイント全てで一貫して適用されており、日本語エラーメッセージも統一されています。

### 1.3 設計上の懸念：HTTP 207（部分失敗）が実質到達不能

`generate-all`のコード（`src/app/api/video/generate-all/route.ts`）を確認したところ、以下の理由で207レスポンスを黒箱テストで再現することができませんでした。

- `OpenAIVideoGenerator.generatePrompts` / `generateVoice`（`src/lib/video-generator/openai.ts`）は、OpenAI API呼び出しが失敗した場合も**すべて`catch`でモック実装にフォールバック**し、例外を再スローしません。そのため`generate-all`側の`try/catch`が失敗を検知することはなく、常に`status:"success"`になります。
- `generateSubtitles`（`src/lib/video-generator/subtitles.ts`）はローカルのファイルI/Oのみで、`validateScript`を通過した入力では失敗しません（ディスク書き込みエラー等の環境要因を除く）。

**結論**: 現在の実装では、通常のAPIリクエストで207を発生させる経路が存在しません。これは仕様なのか不具合なのか要確認です。もし「部分失敗時に207を返す」という要件がある場合、OpenAI呼び出し失敗時にフォールバックするだけでなく、失敗情報を`generate-all`側に伝播する仕組みが必要です。

---

## 2. フロントエンドUI テスト結果

テストURL: http://localhost:3000/scripts/sample-idea （`/scripts/[ideaId]`の動的ルート、`ideaId=sample-idea`）

| # | テスト項目 | 結果 | 詳細 |
|---|---|---|---|
| 1 | ページ表示 | PASS | 「台本作成」画面が正常表示。ネタID: sample-idea 表示確認 |
| 2 | ScriptEditor（台本入力フォーム） | PASS | フック/ナレーション/秒数構成（3行追加）/映像プロンプトの入力が正常動作 |
| 3 | 「素材を自動生成」ボタン | PASS | クリックで「生成中...」に変化、3ステップの進捗（ステップ1/3→3/3）が順次緑チェックに変化 |
| 4 | GenerationProgress | PASS | 3ステップ全て成功表示 |
| 5 | ScenePromptList（映像プロンプト一覧） | PASS | 入力した3シーン分のプロンプトが正しい内容で表示 |
| 6 | 映像プロンプトのコピーボタン | PASS | クリックで実際に`navigator.clipboard`へ書き込まれることを確認（クリップボード内容を検証）。ボタン表示も「コピー」→「✓ コピー済み」に変化（2秒後に自動リセット） |
| 7 | AudioPlayer（音声プレーヤー） | PASS | `<audio>`要素とダウンロードリンクが表示 |
| 8 | SubtitlePreview（字幕プレビュー） | PASS | SRT内容（3ブロック、正しいタイムコード）がプレビュー表示、ダウンロードリンクあり |
| 9 | モックデータ注記 | PASS | 「現在はモックデータで生成されています。実データを生成するには、APIキーの設定が必要です。」を表示 |
| 10 | GensparkGuide | PASS | 6ステップの操作ガイドと「Gensparkを開く」外部リンクを表示 |
| 11 | VideoRegistration（動画URL登録） | PASS | URL未入力時は「承認して登録」が無効化、入力後に有効化。確認ダイアログ表示→承認→「動画を承認し、登録しました。」の成功メッセージ表示 |

### UIテスト時の注意点（テスト実施上の所見、アプリの不具合ではない）
- コピー機能の検証中、自動クリックからスクリーンショット取得までのタイムラグにより「コピー済み」表示（2秒で自動的に元の状態に戻る）を最初は捉えられませんでした。クリック直後に即時スクリーンショットを取ることで正常動作を確認できました。実際のユーザー操作では問題になりません。

---

## 3. 環境に関する所見

- テスト開始時、ポート3000で以前のdevサーバープロセス（PID 14592, メモリ2.5GB）が応答不能な状態でリスンしていました（`curl`が接続タイムアウト）。プロセスを終了し、`npm run dev`を再起動することで解消しました。次回同様の問題が起きた場合は、まず該当プロセスの応答性を確認することを推奨します。
- `npx tsc --noEmit` を実行し、型エラーが0件であることを確認済みです。

---

## 4. 総合結論

- **バックエンドAPI（4エンドポイント）**: 正常系・異常系ともに全てPASS。日本語エラーメッセージ、HTTPステータスコードは仕様通り一貫している。
- **フロントエンドUI**: 全9項目PASS。台本入力から素材自動生成、コピー、音声/字幕プレビュー、Gensparkガイド、動画登録までのE2Eフローは問題なく動作。
- **FAILなし。** ただし、`generate-all`のHTTP 207（部分失敗）パスが現状の実装では到達不能である点は、仕様確認または実装見直しの対象として報告します。
