import type { IdeaStatus } from "@/components/ideas/types";
import { STATUS_COLORS, STATUS_LABELS } from "@/components/ideas/types";

interface StatusBadgeProps {
  status: IdeaStatus;
}

/** ネタの審査ステータスを表すバッジ。 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${color.bg} ${color.text}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
