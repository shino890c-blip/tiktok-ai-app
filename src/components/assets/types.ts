export type Asset = {
  id: string;
  ideaId: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  audioUrl: string | null;
  imageUrls: string[];
  subtitleText: string | null;
  rightsChecked: boolean;
  isApproved: boolean;
  approvedAt: string | null;
};

export type IdeaSummary = {
  ideaId: string;
  title: string;
  overview: string;
  genre: string;
};

export const IDEA_SUMMARIES: Record<string, IdeaSummary> = {
  "idea-1": {
    ideaId: "idea-1",
    title: "深夜のドライブで聴きたい曲",
    overview: "夜のドライブシーンに合う洋楽・邦楽の名曲を紹介し、プレイリスト形式で視聴者の共感を誘う動画。",
    genre: "音楽・プレイリスト",
  },
  "idea-2": {
    ideaId: "idea-2",
    title: "毛穴を消すスキンケア3選",
    overview: "毛穴の目立ちを軽減する市販スキンケアアイテムを3つ厳選し、使用手順とビフォーアフターを紹介。",
    genre: "美容・スキンケア",
  },
  "idea-3": {
    ideaId: "idea-3",
    title: "時短家電がマジで便利",
    overview: "家事の時短に役立つ家電を実演を交えて紹介し、購入リンク導線につなげる動画。",
    genre: "ライフスタイル・家電",
  },
  "idea-4": {
    ideaId: "idea-4",
    title: "レンジで作る爆速レシピ",
    overview: "電子レンジのみで完成する簡単レシピを、調理工程を早回しで見せるショート動画。",
    genre: "料理・時短レシピ",
  },
  "idea-5": {
    ideaId: "idea-5",
    title: "夏に買うべき服TOP5",
    overview: "夏シーズンにおすすめのファッションアイテムをランキング形式で紹介する動画。",
    genre: "ファッション",
  },
  "idea-6": {
    ideaId: "idea-6",
    title: "沖縄旅行Vlog #1",
    overview: "沖縄旅行の様子を記録したVlogシリーズ第1話。観光スポットとグルメを中心に紹介。",
    genre: "旅行・Vlog",
  },
  "idea-7": {
    ideaId: "idea-7",
    title: "猫のかわいい瞬間集 #3",
    overview: "視聴者から寄せられた猫のかわいい動画・写真をまとめたコンピレーション動画の第3弾。",
    genre: "ペット・猫",
  },
  "idea-8": {
    ideaId: "idea-8",
    title: "集中力が上がる勉強法",
    overview: "科学的根拠に基づいた集中力向上テクニックを、実演形式でわかりやすく紹介する動画。",
    genre: "学習・自己啓発",
  },
  "idea-9": {
    ideaId: "idea-9",
    title: "東京ナイトスポット5選",
    overview: "夜の東京で楽しめる観光スポットを5つ厳選し、写真映えするロケーションを紹介。",
    genre: "旅行・観光",
  },
};

export const DEFAULT_IDEA_SUMMARY: IdeaSummary = {
  ideaId: "unknown",
  title: "未登録のネタ",
  overview: "このネタの概要情報はまだ登録されていません。",
  genre: "未分類",
};

export const INITIAL_ASSETS: Record<string, Asset> = {
  "idea-1": {
    id: "asset-1",
    ideaId: "idea-1",
    videoUrl: null,
    thumbnailUrl: null,
    audioUrl: "https://cdn.example.com/audio/idea-1-bgm.mp3",
    imageUrls: [],
    subtitleText: null,
    rightsChecked: false,
    isApproved: false,
    approvedAt: null,
  },
  "idea-7": {
    id: "asset-7",
    ideaId: "idea-7",
    videoUrl: "https://cdn.example.com/video/idea-7.mp4",
    thumbnailUrl: "https://cdn.example.com/thumbnails/idea-7.jpg",
    audioUrl: "https://cdn.example.com/audio/idea-7-narration.mp3",
    imageUrls: [
      "https://cdn.example.com/images/idea-7-1.jpg",
      "https://cdn.example.com/images/idea-7-2.jpg",
    ],
    subtitleText: "猫たちのかわいい瞬間を集めました。今回はお昼寝シーン特集です。",
    rightsChecked: true,
    isApproved: false,
    approvedAt: null,
  },
  "idea-9": {
    id: "asset-9",
    ideaId: "idea-9",
    videoUrl: "https://cdn.example.com/video/idea-9.mp4",
    thumbnailUrl: "https://cdn.example.com/thumbnails/idea-9.jpg",
    audioUrl: "https://cdn.example.com/audio/idea-9-narration.mp3",
    imageUrls: [
      "https://cdn.example.com/images/idea-9-1.jpg",
      "https://cdn.example.com/images/idea-9-2.jpg",
      "https://cdn.example.com/images/idea-9-3.jpg",
    ],
    subtitleText: "東京の夜を彩る絶景スポットを5つ紹介します。",
    rightsChecked: true,
    isApproved: true,
    approvedAt: "2025-05-15T10:30:00+09:00",
  },
};

export function createEmptyAsset(ideaId: string): Asset {
  return {
    id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ideaId,
    videoUrl: null,
    thumbnailUrl: null,
    audioUrl: null,
    imageUrls: [],
    subtitleText: null,
    rightsChecked: false,
    isApproved: false,
    approvedAt: null,
  };
}
