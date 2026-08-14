import type { Account } from "@/components/accounts/types";

export const SAMPLE_ACCOUNTS: Account[] = [
  {
    id: "acc-1",
    platform: "tiktok",
    name: "@nightdrive_music",
    memo: "深夜のドライブ・作業用BGMまとめ。20時台の投稿が伸びやすい。",
    createdAt: "2025-03-02",
  },
  {
    id: "acc-2",
    platform: "youtube",
    name: "旅するVlogチャンネル",
    memo: "国内旅行Vlog中心。ショート動画は本編への誘導リンクを固定コメントに設置。",
    createdAt: "2025-01-15",
  },
  {
    id: "acc-3",
    platform: "instagram",
    name: "@skincare.lab",
    memo: "美容・スキンケア系リール。ハッシュタグは#スキンケア #毛穴ケアが好調。",
    createdAt: "2025-02-20",
  },
  {
    id: "acc-4",
    platform: "twitter",
    name: "@lifehack_jp",
    memo: "時短家電・ライフハック系のスレッド投稿。画像付きツイートの反応が良い。",
    createdAt: "2025-04-10",
  },
  {
    id: "acc-5",
    platform: "note",
    name: "自己啓発の記録",
    memo: "学習法・集中力に関する長文記事。台本のリサーチ元として活用。",
    createdAt: "2025-05-01",
  },
];
