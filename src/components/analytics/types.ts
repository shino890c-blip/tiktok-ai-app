export type Post = {
  id: string;
  ideaId: string;
  ideaTitle: string;
  accountName: string;
  platform: string;
  postedAt: string;
  genre: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
};

export type PeriodOption = "7d" | "30d" | "90d" | "custom";
