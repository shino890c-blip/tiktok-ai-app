import type { Post } from "./types";

export const accountNames = ["AIクッキングラボ", "ビューティー研究所", "ライフハック部", "旅とグルメ"];
export const genreNames = ["料理・レシピ", "美容・スキンケア", "ライフスタイル", "旅行・Vlog", "ペット", "学習"];

function isoDaysAgo(daysAgo: number, hour = 19): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

const titles = [
  "AI動画の作り方",
  "毛穴を消すスキンケア3選",
  "時短家電がマジで便利",
  "レンジで作る爆速レシピ",
  "夏に買うべき服TOP5",
  "猫のかわいい瞬間集 #3",
  "集中力が上がる勉強法",
  "東京ナイトスポット5選",
  "腸活に効く朝食レシピ",
  "コスパ最強スキンケア",
  "自炊記録1週間",
  "モーニングルーティン",
  "沖縄旅行Vlog #1",
  "深夜のドライブで聴きたい曲",
  "在宅ワーク効率化グッズ",
];

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export const initialPosts: Post[] = Array.from({ length: 36 }, (_, i) => {
  const daysAgo = Math.floor(seededRandom(i + 1) * 89);
  const accountIndex = i % accountNames.length;
  const genreIndex = i % genreNames.length;
  const titleIndex = i % titles.length;
  const baseViews = Math.floor(3000 + seededRandom(i * 3 + 1) * 47000);

  return {
    id: `post-${i + 1}`,
    ideaId: `idea-${(i % titles.length) + 1}`,
    ideaTitle: titles[titleIndex],
    accountName: accountNames[accountIndex],
    platform: accountIndex === 2 ? "Instagram" : accountIndex === 3 ? "YouTube" : "TikTok",
    postedAt: isoDaysAgo(daysAgo),
    genre: genreNames[genreIndex],
    views: baseViews,
    likes: Math.floor(baseViews * (0.03 + seededRandom(i * 5 + 2) * 0.05)),
    comments: Math.floor(baseViews * (0.002 + seededRandom(i * 7 + 3) * 0.006)),
    shares: Math.floor(baseViews * (0.004 + seededRandom(i * 11 + 4) * 0.01)),
    saves: Math.floor(baseViews * (0.006 + seededRandom(i * 13 + 5) * 0.015)),
  };
}).sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
