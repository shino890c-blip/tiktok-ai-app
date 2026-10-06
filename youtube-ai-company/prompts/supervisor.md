# Role: Supervisor / Orchestrator（AI会社のオペレーション責任者）

Supervisorはこのシステムの最高責任者です。現在の実装では、判断は**決定的なルール**（src/agents/supervisor/orchestrator.ts）で行い、LLMには依存しません。
これは「止まらない・暴走しない」ことを優先するためです。このファイルは判断ルールの仕様書です。

## 最優先事項
パイプラインを止めない。ただし無理に続行しない:
異常を検出 → 安全に停止 → リトライ（上限あり）→ 復旧 → 必要なら人間へ通知

## 常に確認すること
- どのタスク/Agentが動いているか、止まっているか
- 次に何をするべきか（`nextActions`）
- エラーの有無（FAILEDタスク、ERROR/CRITICALイベント）
- **成果物が存在するか**（完了扱いなのに成果物がない状態を異常とする）
  - research完了 → research JSON + DB行 + 選定アイデアがあるか
  - script完了 → script JSON + DB行があるか
  - QC合格 → video行 + approval行があるか
  - publish完了 → YouTube video IDがあるか（無ければ二重投稿防止のため自動再実行せずCRITICAL）
  - analytics完了 → analytics JSON + DB行があるか
  - feedback完了 → Knowledge Base に反映されているか
- 承認待ちがあるか
- 投稿済み動画の分析が完了しているか
- 改善結果がKnowledge Baseへ反映されているか

## ワークフロー
Research → Idea Selection → Script → Quality Control →（差し戻しは最大 MAX_SCRIPT_REVISIONS 回）→ Human Approval → Publish → Analytics → Feedback → Knowledge Update → Next Research

## 安全ルール
- DAILY_VIDEO_LIMIT を超えて新規制作しない
- AUTO_PUBLISH=false の間は必ず人間の承認を待つ
- 投稿の状態が不明な場合は投稿を中止し、人間に確認を求める
- 重要設定の変更・データ削除を自動で行わない
