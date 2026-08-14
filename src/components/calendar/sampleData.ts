import type { AccountOption, IdeaOption, Schedule } from "./types";

export const sampleIdeas: IdeaOption[] = [
  { id: "idea-1", title: "AI動画の作り方" },
  { id: "idea-2", title: "毛穴を消すスキンケア3選" },
  { id: "idea-3", title: "時短家電がマジで便利" },
  { id: "idea-4", title: "レンジで作る爆速レシピ" },
  { id: "idea-5", title: "夏に買うべき服TOP5" },
  { id: "idea-6", title: "猫のかわいい瞬間集 #3" },
  { id: "idea-7", title: "集中力が上がる勉強法" },
  { id: "idea-8", title: "東京ナイトスポット5選" },
];

export const sampleAccounts: AccountOption[] = [
  { id: "acc-1", name: "AIクッキングラボ", platform: "TikTok" },
  { id: "acc-2", name: "ビューティー研究所", platform: "TikTok" },
  { id: "acc-3", name: "ライフハック部", platform: "Instagram" },
  { id: "acc-4", name: "旅とグルメ", platform: "YouTube" },
];

function isoAt(daysFromToday: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString();
}

export const initialSchedules: Schedule[] = [
  {
    id: "sch-1",
    ideaId: "idea-1",
    ideaTitle: "AI動画の作り方",
    accountId: "acc-1",
    accountName: "AIクッキングラボ",
    platform: "TikTok",
    scheduledAt: isoAt(0, 20, 0),
    status: "planned",
  },
  {
    id: "sch-2",
    ideaId: "idea-2",
    ideaTitle: "毛穴を消すスキンケア3選",
    accountId: "acc-2",
    accountName: "ビューティー研究所",
    platform: "TikTok",
    scheduledAt: isoAt(0, 12, 0),
    status: "published",
  },
  {
    id: "sch-3",
    ideaId: "idea-3",
    ideaTitle: "時短家電がマジで便利",
    accountId: "acc-3",
    accountName: "ライフハック部",
    platform: "Instagram",
    scheduledAt: isoAt(2, 18, 30),
    status: "planned",
  },
  {
    id: "sch-4",
    ideaId: "idea-4",
    ideaTitle: "レンジで作る爆速レシピ",
    accountId: "acc-1",
    accountName: "AIクッキングラボ",
    platform: "TikTok",
    scheduledAt: isoAt(2, 19, 0),
    status: "planned",
  },
  {
    id: "sch-5",
    ideaId: "idea-5",
    ideaTitle: "夏に買うべき服TOP5",
    accountId: "acc-3",
    accountName: "ライフハック部",
    platform: "Instagram",
    scheduledAt: isoAt(2, 21, 0),
    status: "planned",
  },
  {
    id: "sch-6",
    ideaId: "idea-6",
    ideaTitle: "猫のかわいい瞬間集 #3",
    accountId: "acc-4",
    accountName: "旅とグルメ",
    platform: "YouTube",
    scheduledAt: isoAt(5, 9, 0),
    status: "planned",
  },
  {
    id: "sch-7",
    ideaId: "idea-7",
    ideaTitle: "集中力が上がる勉強法",
    accountId: "acc-2",
    accountName: "ビューティー研究所",
    platform: "TikTok",
    scheduledAt: isoAt(-1, 15, 0),
    status: "cancelled",
  },
  {
    id: "sch-8",
    ideaId: "idea-8",
    ideaTitle: "東京ナイトスポット5選",
    accountId: "acc-4",
    accountName: "旅とグルメ",
    platform: "YouTube",
    scheduledAt: isoAt(7, 20, 0),
    status: "planned",
  },
];
