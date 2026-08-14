"use client";

import { Draggable } from "@hello-pangea/dnd";
import type { Schedule } from "./types";

const statusStyles: Record<Schedule["status"], { label: string; className: string }> = {
  planned: { label: "予定", className: "bg-[#F3F0FF] text-[#7C3AED]" },
  published: { label: "公開済み", className: "bg-[#DCFCE7] text-[#22C55E]" },
  cancelled: { label: "中止", className: "bg-[#F1F0F4] text-[#6B6885]" },
};

interface ScheduleCardProps {
  schedule: Schedule;
  index: number;
  onClick: () => void;
}

export function ScheduleCard({ schedule, index, onClick }: ScheduleCardProps) {
  const status = statusStyles[schedule.status];
  const time = new Date(schedule.scheduledAt).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Draggable draggableId={schedule.id} index={index}>
      {(provided, snapshot) => (
        <button
          type="button"
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`w-full text-left rounded-md border border-[#E8E6F0] bg-white px-2 py-1.5 shadow-sm hover:border-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors ${
            snapshot.isDragging ? "shadow-lg ring-2 ring-[#7C3AED]" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-semibold text-[#6B6885]">{time}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${status.className}`}>
              {status.label}
            </span>
          </div>
          <p className="text-xs font-semibold text-[#2D2B55] truncate mt-0.5">{schedule.ideaTitle}</p>
          <p className="text-[10px] text-[#6B6885] truncate">{schedule.accountName}</p>
        </button>
      )}
    </Draggable>
  );
}
