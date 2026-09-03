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
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 xl:mx-0 xl:grid xl:grid-cols-5 xl:overflow-visible xl:px-0">
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
              "flex min-h-[220px] w-[82vw] max-w-[320px] shrink-0 snap-start flex-col gap-2 rounded-tile border p-2.5 transition sm:w-[300px] xl:w-auto xl:max-w-none xl:shrink",
              dragOver === status ? "border-accent bg-accent/5" : "border-transparent bg-surface-2/70",
            )}
          >
            <header className="flex items-start justify-between gap-2 px-1.5 pt-1">
              <div>
                <h3 className="text-sm font-bold">{STATUS_LABEL[status]}</h3>
                <p className="text-xs text-muted">{COLUMN_HINT[status]}</p>
              </div>
              <span className="tag tabular-nums">{column.length}</span>
            </header>

            <div className="flex flex-1 flex-col gap-2">
              {column.map((task) => (
                <TaskRow key={task.id} task={task} today={today} draggable compact />
              ))}
            </div>

            <input
              value={draft[status] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [status]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") add(status);
              }}
              placeholder="+ Add task"
              aria-label={`Add a task to ${STATUS_LABEL[status]}`}
              className="input input-sm rounded-full border-transparent bg-transparent hover:bg-surface focus:bg-surface"
            />
          </div>
        );
      })}
    </div>
  );
}
