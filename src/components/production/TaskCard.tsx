"use client";

import { Draggable } from "@hello-pangea/dnd";
import { useRouter } from "next/navigation";
import type { ProductionTask } from "./types";

interface TaskCardProps {
  task: ProductionTask;
  index: number;
}

export function TaskCard({ task, index }: TaskCardProps) {
  const router = useRouter();

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <article
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => router.push(`/assets/${task.ideaId}`)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              router.push(`/assets/${task.ideaId}`);
            }
          }}
          className={`bg-white rounded-lg border border-[#E8E6F0] p-3 shadow-sm hover:shadow-md hover:border-[#7C3AED] transition-shadow cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] ${
            snapshot.isDragging ? "shadow-lg ring-2 ring-[#7C3AED]" : ""
          }`}
        >
          <h4 className="text-sm font-semibold text-[#2D2B55] leading-snug">{task.title}</h4>
          <p className="text-xs text-[#6B6885] mt-1.5 line-clamp-2">{task.assigneeMemo}</p>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="inline-flex items-center rounded-full bg-[#F3F0FF] px-2.5 py-0.5 text-xs font-medium text-[#7C3AED]">
              {task.genre}
            </span>
          </div>
        </article>
      )}
    </Draggable>
  );
}
