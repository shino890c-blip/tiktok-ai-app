"use client";

import { Droppable } from "@hello-pangea/dnd";
import { PlusIcon } from "@/components/icons";
import { TaskCard } from "./TaskCard";
import type { ProductionColumn, ProductionTask } from "./types";

interface BoardColumnProps {
  column: ProductionColumn;
  tasks: ProductionTask[];
  onAddTask: (status: ProductionColumn["id"]) => void;
}

export function BoardColumn({ column, tasks, onAddTask }: BoardColumnProps) {
  return (
    <div className="flex flex-col w-72 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-1 h-4 rounded-full ${column.color}`} />
          <h3 className="text-sm font-bold text-[#2D2B55]">{column.title}</h3>
          <span className="text-xs text-[#6B6885] bg-[#F8F7FA] px-2 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
        <button
          type="button"
          aria-label={`${column.title}にタスクを追加`}
          onClick={() => onAddTask(column.id)}
          className="text-[#6B6885] hover:text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] rounded p-1 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 space-y-3 min-h-[120px] rounded-lg p-1 transition-colors ${
              snapshot.isDraggingOver ? "bg-[#F3F0FF]" : ""
            }`}
          >
            {tasks.map((task, index) => (
              <TaskCard key={task.id} task={task} index={index} />
            ))}
            {provided.placeholder}
            {tasks.length === 0 && (
              <div className="text-xs text-[#6B6885] text-center py-6 border border-dashed border-[#E8E6F0] rounded-lg">
                タスクなし
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
