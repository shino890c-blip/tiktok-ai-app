"use client";

import { Droppable } from "@hello-pangea/dnd";
import { AlertTriangleIcon } from "@/components/icons";
import { ScheduleCard } from "./ScheduleCard";
import type { Schedule } from "./types";

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - result.getDay());
  result.setHours(0, 0, 0, 0);
  return result;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

interface WeekViewProps {
  currentDate: Date;
  schedules: Schedule[];
  onDayClick: (date: Date) => void;
  onScheduleClick: (schedule: Schedule) => void;
}

export function WeekView({ currentDate, schedules, onDayClick, onScheduleClick }: WeekViewProps) {
  const today = new Date();
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });

  const schedulesByDay = new Map<string, Schedule[]>();
  for (const schedule of schedules) {
    const key = dateKey(new Date(schedule.scheduledAt));
    const list = schedulesByDay.get(key) ?? [];
    list.push(schedule);
    schedulesByDay.set(key, list);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
      {days.map((date, i) => {
        const key = dateKey(date);
        const daySchedules = (schedulesByDay.get(key) ?? []).sort(
          (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
        );
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
                className={`rounded-lg border p-2 min-h-[220px] flex flex-col gap-1.5 cursor-pointer transition-colors ${
                  isToday ? "border-[#7C3AED] bg-[#F3F0FF]/40" : "border-[#E8E6F0] bg-white"
                } ${snapshot.isDraggingOver ? "bg-[#F3F0FF]" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#6B6885]">{weekdayLabels[i]}</span>
                    <span
                      className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${
                        isToday ? "bg-[#7C3AED] text-white" : "text-[#2D2B55]"
                      }`}
                    >
                      {date.getDate()}
                    </span>
                  </div>
                  {hasUnapproved && (
                    <span title="未承認の投稿があります">
                      <AlertTriangleIcon className="w-3.5 h-3.5 text-[#F59E0B]" />
                    </span>
                  )}
                </div>

                {isCongested && (
                  <span className="text-[10px] font-semibold text-[#EF4444] bg-[#FEE2E2] rounded-full px-1.5 py-0.5 self-start">
                    投稿集中
                  </span>
                )}

                <div className="space-y-1.5 flex-1">
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
