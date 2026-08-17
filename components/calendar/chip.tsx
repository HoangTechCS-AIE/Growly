"use client";

import Link from "next/link";
import type { TaskView } from "@/lib/types";
import { cn, dotTone } from "@/lib/util";

export function DraggableChip({ task }: { task: TaskView }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="flex cursor-grab items-center gap-1.5 truncate rounded-md border border-line bg-surface-2 px-2 py-1 text-[11.5px] transition hover:border-line-strong active:cursor-grabbing"
      title={task.goal_title ? `${task.title} · ${task.goal_title}` : task.title}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone(task.project_color))} />
      <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate">
        {task.title}
      </Link>
    </div>
  );
}
