"use client";

import { Droppable } from "@hello-pangea/dnd";
import { AlertTriangleIcon } from "@/components/icons";
import { ScheduleCard } from "./ScheduleCard";
import type { Schedule } from "./types";

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function buildMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    return date;
  });
}

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

interface MonthViewProps {
  currentDate: Date;
  schedules: Schedule[];
  onDayClick: (date: Date) => void;
  onScheduleClick: (schedule: Schedule) => void;
}

export function MonthView({ currentDate, schedules, onDayClick, onScheduleClick }: MonthViewProps) {
  const today = new Date();
  const days = buildMonthGrid(currentDate.getFullYear(), currentDate.getMonth());

  const schedulesByDay = new Map<string, Schedule[]>();
  for (const schedule of schedules) {
    const key = dateKey(new Date(schedule.scheduledAt));
    const list = schedulesByDay.get(key) ?? [];
    list.push(schedule);
    schedulesByDay.set(key, list);
  }

  return (
    <div className="grid grid-cols-7 gap-px bg-[#E8E6F0] rounded-lg overflow-hidden border border-[#E8E6F0]">
      {weekdayLabels.map((label) => (
        <div
          key={label}
          className="bg-[#F8F7FA] text-center text-xs font-semibold text-[#6B6885] py-2"
        >
          {label}
        </div>
      ))}

      {days.map((date) => {
        const key = dateKey(date);
        const daySchedules = (schedulesByDay.get(key) ?? []).sort(
          (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
        );
        const isCurrentMonth = date.getMonth() === currentDate.getMonth();
        const isToday = isSameDay(date, today);
        const hasUnapproved = daySchedules.some((s) => s.status === "planned");
        const isCongested = daySchedules.length >= 3;

        return (
          <Droppable droppableId={key} key={key}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                onClick={() => onDayClick(date)}
                className={`min-h-[110px] p-1.5 flex flex-col gap-1 cursor-pointer transition-colors ${
                  isCurrentMonth ? "bg-white" : "bg-[#FAFAFB] text-[#B9B7C7]"
                } ${snapshot.isDraggingOver ? "bg-[#F3F0FF]" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? "bg-[#7C3AED] text-white" : isCurrentMonth ? "text-[#2D2B55]" : "text-[#B9B7C7]"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  <div className="flex items-center gap-1">
                    {hasUnapproved && (
                      <span title="未承認の投稿があります">
                        <AlertTriangleIcon className="w-3.5 h-3.5 text-[#F59E0B]" />
                      </span>
                    )}
                  </div>
                </div>

                {isCongested && (
                  <span className="text-[10px] font-semibold text-[#EF4444] bg-[#FEE2E2] rounded-full px-1.5 py-0.5 self-start">
                    投稿集中
                  </span>
                )}

                <div className="space-y-1 flex-1">
                  {daySchedules.map((schedule, index) => (
                    <div key={schedule.id} onClick={(event) => event.stopPropagation()}>
                      <ScheduleCard
                        schedule={schedule}
                        index={index}
                        onClick={() => onScheduleClick(schedule)}
                      />
                    </div>
                  ))}
                </div>
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        );
      })}
    </div>
  );
}
