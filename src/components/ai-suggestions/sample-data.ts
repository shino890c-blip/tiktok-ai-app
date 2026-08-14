import type { AiSuggestion } from "@/components/ai-suggestions/types";

export const SAMPLE_SUGGESTIONS: AiSuggestion[] = [
  {
    id: "sug-1",
    type: "next_idea",
    content: {
      title: "「3分でできる腸活朝ごはん」シリーズ",
      description:
        "直近1ヶ月で腸活・時短レシピ系の動画の平均再生数が他ジャンルより32%高い傾向があります。同フォーマットで新シリーズを立ち上げると伸びやすいと予測されます。",
      score: 82,
    },
    basisConfidence: "high",
    createdAt: "2025-07-20T09:00:00+09:00",
  },
  {
    id: "sug-2",
    type: "pattern_analysis",
    content: {
      description:
        "過去に再生数10万を超えた動画には共通して「冒頭3秒でのフック」「テンポの速いカット編集」「BGMのビート同期」が使われています。これらを組み合わせた動画は平均再生数が1.8倍になっています。",
      patterns: ["冒頭3秒のフック", "テンポの速いカット編集", "BGMのビート同期", "字幕の強調表示"],
    },
    basisConfidence: "high",
    createdAt: "2025-07-20T09:00:00+09:00",
  },
  {
    id: "sug-3",
    type: "improvement",
    content: {
      description:
        "最近の投稿は20時台の投稿が多いものの、フォロワーのアクティブ時間帯データでは21時〜22時台の方がエンゲージメント率が高い可能性があります。投稿時間を後ろにずらすことを検討してください。",
      advice: [
        "投稿時間を21時〜22時台にシフトする",
        "サムネイルのテキストをより大きくする",
        "動画冒頭に質問形式のフックを入れる",
      ],
    },
    basisConfidence: "low",
    createdAt: "2025-07-20T09:00:00+09:00",
  },
];
