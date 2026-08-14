export type Settings = {
  aiEnabled: boolean;
  timezone: string;
};

export const TIMEZONE_OPTIONS = [
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "America/New_York",
  "Europe/London",
  "UTC",
] as const;
