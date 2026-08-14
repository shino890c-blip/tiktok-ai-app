interface ScoreBadgeProps {
  score: number | null;
}

function getScoreColor(score: number): { bg: string; text: string } {
  if (score >= 80) return { bg: "bg-[#DCFCE7]", text: "text-[#22C55E]" };
  if (score >= 60) return { bg: "bg-[#FEF3C7]", text: "text-[#F59E0B]" };
  return { bg: "bg-[#FEE2E2]", text: "text-[#EF4444]" };
}

/** AIスコアを色分けバッジで表示する。未採点はグレー表示。 */
export function ScoreBadge({ score }: ScoreBadgeProps) {
  if (score === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-[#F8F7FA] px-2.5 py-1 text-xs font-semibold text-[#6B6885]">
        未採点
      </span>
    );
  }

  const color = getScoreColor(score);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${color.bg} ${color.text}`}>
      {score}点
    </span>
  );
}
