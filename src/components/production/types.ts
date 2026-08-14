export type ProductionStatus = "planning" | "script" | "producing" | "review" | "done";

export type ProductionTask = {
  id: string;
  ideaId: string;
  title: string;
  status: ProductionStatus;
  assigneeMemo: string;
  genre: string;
  orderIndex: number;
};

export type ProductionColumn = {
  id: ProductionStatus;
  title: string;
  color: string;
};

export const PRODUCTION_COLUMNS: ProductionColumn[] = [
  { id: "planning", title: "企画", color: "bg-[#7C3AED]" },
  { id: "script", title: "台本", color: "bg-[#3B82F6]" },
  { id: "producing", title: "制作中", color: "bg-[#0EA5E9]" },
  { id: "review", title: "確認待ち", color: "bg-[#F59E0B]" },
  { id: "done", title: "完成", color: "bg-[#22C55E]" },
];

export const INITIAL_TASKS: ProductionTask[] = [
  { id: "task-1", ideaId: "idea-1", title: "深夜のドライブで聴きたい曲", status: "planning", assigneeMemo: "佐藤: BGM候補を3案リストアップ中", genre: "音楽・プレイリスト", orderIndex: 0 },
  { id: "task-2", ideaId: "idea-2", title: "毛穴を消すスキンケア3選", status: "planning", assigneeMemo: "田中: 商品提供の確認待ち", genre: "美容・スキンケア", orderIndex: 1 },
  { id: "task-3", ideaId: "idea-3", title: "時短家電がマジで便利", status: "script", assigneeMemo: "鈴木: フック文言を再検討", genre: "ライフスタイル・家電", orderIndex: 0 },
  { id: "task-4", ideaId: "idea-4", title: "レンジで作る爆速レシピ", status: "script", assigneeMemo: "高橋: 台本ドラフト完了", genre: "料理・時短レシピ", orderIndex: 1 },
  { id: "task-5", ideaId: "idea-5", title: "夏に買うべき服TOP5", status: "producing", assigneeMemo: "佐藤: 素材撮影中", genre: "ファッション", orderIndex: 0 },
  { id: "task-6", ideaId: "idea-6", title: "沖縄旅行Vlog #1", status: "producing", assigneeMemo: "山本: 編集7割完了", genre: "旅行・Vlog", orderIndex: 1 },
  { id: "task-7", ideaId: "idea-7", title: "猫のかわいい瞬間集 #3", status: "review", assigneeMemo: "鈴木: 最終確認待ち", genre: "ペット・猫", orderIndex: 0 },
  { id: "task-8", ideaId: "idea-8", title: "集中力が上がる勉強法", status: "review", assigneeMemo: "田中: サムネ差し替え検討", genre: "学習・自己啓発", orderIndex: 1 },
  { id: "task-9", ideaId: "idea-9", title: "東京ナイトスポット5選", status: "done", assigneeMemo: "高橋: 公開準備完了", genre: "旅行・観光", orderIndex: 0 },
];

export function createTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createIdeaId(): string {
  return `idea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
