"use client";

import { useState } from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import { PlusIcon } from "@/components/icons";
import { BoardColumn } from "./BoardColumn";
import { AddTaskModal } from "./AddTaskModal";
import { PRODUCTION_COLUMNS, createIdeaId, createTaskId } from "./types";
import type { ProductionStatus, ProductionTask } from "./types";

interface ProductionBoardProps {
  initialTasks: ProductionTask[];
}

export function ProductionBoard({ initialTasks }: ProductionBoardProps) {
  const [tasks, setTasks] = useState<ProductionTask[]>(initialTasks);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefaultStatus, setModalDefaultStatus] = useState<ProductionStatus>("planning");

  const tasksByStatus = (status: ProductionStatus) =>
    tasks.filter((task) => task.status === status).sort((a, b) => a.orderIndex - b.orderIndex);

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceStatus = source.droppableId as ProductionStatus;
    const destStatus = destination.droppableId as ProductionStatus;

    setTasks((prev) => {
      const moving = prev.find((task) => task.id === draggableId);
      if (!moving) return prev;

      const withoutMoving = prev.filter((task) => task.id !== draggableId);
      const destTasks = withoutMoving
        .filter((task) => task.status === destStatus)
        .sort((a, b) => a.orderIndex - b.orderIndex);

      destTasks.splice(destination.index, 0, { ...moving, status: destStatus });

      const updatedDest = destTasks.map((task, index) => ({ ...task, orderIndex: index }));
      const others = withoutMoving.filter((task) => task.status !== destStatus);

      if (sourceStatus !== destStatus) {
        const sourceTasks = others
          .filter((task) => task.status === sourceStatus)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((task, index) => ({ ...task, orderIndex: index }));
        const rest = others.filter((task) => task.status !== sourceStatus);
        return [...rest, ...sourceTasks, ...updatedDest];
      }

      return [...others, ...updatedDest];
    });
  };

  const handleOpenAddModal = (status: ProductionStatus) => {
    setModalDefaultStatus(status);
    setModalOpen(true);
  };

  const handleAddTask = (input: { title: string; assigneeMemo: string; genre: string; status: ProductionStatus }) => {
    setTasks((prev) => {
      const siblingCount = prev.filter((task) => task.status === input.status).length;
      const newTask: ProductionTask = {
        id: createTaskId(),
        ideaId: createIdeaId(),
        title: input.title,
        status: input.status,
        assigneeMemo: input.assigneeMemo,
        genre: input.genre || "未分類",
        orderIndex: siblingCount,
      };
      return [...prev, newTask];
    });
  };

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button
          type="button"
          onClick={() => handleOpenAddModal("planning")}
          className="flex items-center gap-2 px-4 py-2 bg-[#7C3AED] text-white rounded-lg text-sm font-semibold shadow-md hover:bg-[#6D28D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          新規タスク追加
        </button>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PRODUCTION_COLUMNS.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              tasks={tasksByStatus(column.id)}
              onAddTask={handleOpenAddModal}
            />
          ))}
        </div>
      </DragDropContext>

      <AddTaskModal
        open={modalOpen}
        defaultStatus={modalDefaultStatus}
        onClose={() => setModalOpen(false)}
        onAdd={handleAddTask}
      />
    </div>
  );
}
