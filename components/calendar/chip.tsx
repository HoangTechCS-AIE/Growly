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
      className="flex h-7 cursor-grab items-center gap-1.5 truncate rounded-full bg-surface-3 px-2.5 text-xs font-semibold transition hover:bg-line-strong/50 active:cursor-grabbing"
      title={task.project_title ? `${task.title} · ${task.project_title}` : task.title}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone(task.project_color))} />
      <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate">
        {task.title}
      </Link>
    </div>
  );
}
