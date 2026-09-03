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
    tone: "text-danger",
  },
  {
    key: "schedule",
    title: "Schedule",
    hint: "Important · not urgent — where long-term goals actually move",
    important: true,
    urgent: false,
    tone: "text-accent",
  },
  {
    key: "delegate",
    title: "Delegate / batch",
    hint: "Urgent · not important",
    important: false,
    urgent: true,
    tone: "text-warn",
  },
  {
    key: "drop",
    title: "Drop",
    hint: "Neither — question why it exists",
    important: false,
    urgent: false,
    tone: "text-muted",
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {QUADRANTS.map((q) => {
        const bucket = tasks.filter(
          (t) => (t.important === 1) === q.important && (t.urgent === 1) === q.urgent,
        );
        return (
          <section
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
            className={cn("tile min-h-[240px] transition", over === q.key && "border-accent bg-accent/5")}
          >
            <header className="tile-head">
              <div>
                <h3 className={cn("text-lg font-extrabold tracking-tight", q.tone)}>{q.title}</h3>
                <p className="text-xs text-muted">{q.hint}</p>
              </div>
              <span className="tag tabular-nums">{bucket.length}</span>
            </header>
            <div className="flex flex-col gap-2">
              {bucket.length ? (
                bucket.map((task) => (
                  <TaskRow key={task.id} task={task} today={today} draggable compact />
                ))
              ) : (
                <p className="rounded-inner border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
                  Drag tasks here to reclassify them.
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
