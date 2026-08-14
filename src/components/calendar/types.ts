export type ScheduleStatus = "planned" | "published" | "cancelled";

export type Schedule = {
  id: string;
  ideaId: string;
  ideaTitle: string;
  accountId: string;
  accountName: string;
  platform: string;
  scheduledAt: string; // ISO日時
  status: ScheduleStatus;
};

export type IdeaOption = {
  id: string;
  title: string;
};

export type AccountOption = {
  id: string;
  name: string;
  platform: string;
};
