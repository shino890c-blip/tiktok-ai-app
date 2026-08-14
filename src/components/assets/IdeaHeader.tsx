import type { IdeaSummary } from "./types";

interface IdeaHeaderProps {
  idea: IdeaSummary;
}

export function IdeaHeader({ idea }: IdeaHeaderProps) {
  return (
    <section className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#2D2B55]">{idea.title}</h2>
          <p className="text-sm text-[#6B6885] mt-2 leading-relaxed">{idea.overview}</p>
        </div>
        <span className="shrink-0 inline-flex items-center rounded-full bg-[#F3F0FF] px-3 py-1 text-xs font-medium text-[#7C3AED]">
          {idea.genre}
        </span>
      </div>
    </section>
  );
}
