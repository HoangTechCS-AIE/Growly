"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTask } from "@/lib/actions";
import type { TaskView } from "@/lib/types";
import { cn } from "@/lib/util";
import { TaskRow } from "./task-row";

const QUADRANTS = [
  {
    key: "do",
    title: "Do now",
    hint: "Important · urgent",
    important: true,
    urgent: true,
    accent: "border-danger/30",
  },
  {
    key: "schedule",
    title: "Schedule",
    hint: "Important · not urgent — where long-term goals actually move",
    important: true,
    urgent: false,
    accent: "border-accent/30",
  },
  {
    key: "delegate",
    title: "Delegate / batch",
    hint: "Urgent · not important",
    important: false,
    urgent: true,
    accent: "border-warn/30",
  },
  {
    key: "drop",
    title: "Drop",
    hint: "Neither — question why it exists",
    important: false,
    urgent: false,
    accent: "border-line",
  },
] as const;

export function Matrix({ tasks, today }: { tasks: TaskView[]; today: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<string | null>(null);

  function move(taskId: string, important: boolean, urgent: boolean) {
    startTransition(async () => {
      await updateTask(taskId, { important, urgent });
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {QUADRANTS.map((q) => {
        const bucket = tasks.filter(
          (t) => (t.important === 1) === q.important && (t.urgent === 1) === q.urgent,
        );
        return (
          <div
            key={q.key}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(q.key);
            }}
            onDragLeave={() => setOver((k) => (k === q.key ? null : k))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/task-id");
              if (id) move(id, q.important, q.urgent);
            }}
            className={cn(
              "flex min-h-[220px] flex-col rounded-xl border bg-surface/60 transition",
              over === q.key ? "border-accent/60 bg-surface-2" : q.accent,
            )}
          >
            <header className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
              <div>
                <h3 className="text-[12.5px] font-semibold">{q.title}</h3>
                <p className="text-[10.5px] text-muted">{q.hint}</p>
              </div>
              <span className="text-[11px] tabular-nums text-muted">{bucket.length}</span>
            </header>
            <div className="flex flex-col gap-1 p-1.5">
              {bucket.length ? (
                bucket.map((task) => (
                  <TaskRow key={task.id} task={task} today={today} draggable className="bg-surface" />
                ))
              ) : (
                <p className="px-2 py-6 text-center text-[12px] text-muted">
                  Drag tasks here to reclassify them.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
