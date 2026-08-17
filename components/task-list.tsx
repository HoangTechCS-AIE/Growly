import type { TaskView } from "@/lib/types";
import { TaskRow } from "./task-row";

export function TaskList({
  tasks,
  today,
  empty = "Nothing here.",
  showFocus = false,
  showSchedule = true,
  draggable = false,
}: {
  tasks: TaskView[];
  today: string;
  empty?: string;
  showFocus?: boolean;
  showSchedule?: boolean;
  draggable?: boolean;
}) {
  if (!tasks.length) {
    return <p className="px-2 py-6 text-center text-[12.5px] text-muted">{empty}</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-line/60">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          today={today}
          showFocus={showFocus}
          showSchedule={showSchedule}
          draggable={draggable}
        />
      ))}
    </div>
  );
}
