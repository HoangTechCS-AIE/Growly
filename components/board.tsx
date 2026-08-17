"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTask, updateTask } from "@/lib/actions";
import { STATUS_LABEL, TASK_STATUSES, type TaskStatus, type TaskView } from "@/lib/types";
import { cn } from "@/lib/util";
import { TaskRow } from "./task-row";

const COLUMN_HINT: Record<TaskStatus, string> = {
  inbox: "Captured, not sorted yet",
  planned: "Committed, has a slot",
  doing: "In progress right now",
  waiting: "Blocked on someone else",
  done: "Completed",
};

export function Board({ tasks, today }: { tasks: TaskView[]; today: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  function move(taskId: string, status: TaskStatus) {
    startTransition(async () => {
      await updateTask(taskId, { status });
      router.refresh();
    });
  }

  function add(status: TaskStatus) {
    const title = (draft[status] ?? "").trim();
    if (!title) return;
    setDraft((d) => ({ ...d, [status]: "" }));
    startTransition(async () => {
      await createTask({ title, status });
      router.refresh();
    });
  }

  return (
    <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 sm:-mx-5 sm:px-5 xl:mx-0 xl:grid xl:grid-cols-5 xl:overflow-visible xl:px-0">
      {TASK_STATUSES.map((status) => {
        const column = tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            data-column={status}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(status);
            }}
            onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const id = e.dataTransfer.getData("text/task-id");
              if (id) move(id, status);
            }}
            className={cn(
              "flex min-h-[180px] w-[80vw] max-w-[300px] shrink-0 snap-start flex-col rounded-xl",
              "border bg-surface/60 transition sm:w-[300px] xl:w-auto xl:max-w-none xl:shrink",
              dragOver === status ? "border-accent/60 bg-surface-2" : "border-line",
            )}
          >
            <header className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
              <div>
                <h3 className="text-[12.5px] font-semibold">{STATUS_LABEL[status]}</h3>
                <p className="text-[10.5px] text-muted">{COLUMN_HINT[status]}</p>
              </div>
              <span className="text-[11px] tabular-nums text-muted">{column.length}</span>
            </header>

            <div className="flex flex-1 flex-col gap-1 p-1.5">
              {column.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  today={today}
                  draggable
                  className="border-line/70 bg-surface"
                />
              ))}
            </div>

            <div className="p-1.5">
              <input
                value={draft[status] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [status]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add(status);
                }}
                placeholder="+ Add task"
                className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[12.5px] text-ink placeholder:text-muted/60 outline-none transition hover:border-line focus:border-line-strong focus:bg-surface-2"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
