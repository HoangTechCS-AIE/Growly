import type { TaskView } from "@/lib/types";
import { cn } from "@/lib/util";
import { TaskRow } from "./task-row";

export function TaskList({
  tasks,
  today,
  empty = "Nothing here.",
  showFocus = false,
  showSchedule = true,
  draggable = false,
  compact = false,
  className,
}: {
  tasks: TaskView[];
  today: string;
  empty?: string;
  showFocus?: boolean;
  showSchedule?: boolean;
  draggable?: boolean;
  compact?: boolean;
  className?: string;
}) {
  if (!tasks.length) {
    return <p className="py-4 text-center text-sm text-muted">{empty}</p>;
  }
  return (
    <div className={cn("flex flex-col", compact && "gap-2", className)}>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          today={today}
          showFocus={showFocus}
          showSchedule={showSchedule}
          draggable={draggable}
          compact={compact}
        />
      ))}
    </div>
  );
}
