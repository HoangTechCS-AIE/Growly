import { TaskForm } from "@/components/task-form";
import { PageHeader } from "@/components/ui";
import { listAreas, listGoals, listProjects } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ searchParams }: PageProps<"/tasks/new">) {
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const date = single("date");
  const start = single("start");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New task"
        subtitle="Name the short-term outcome and the long-term contribution — that is what keeps daily work honest."
      />
      <TaskForm
        goals={listGoals()}
        projects={listProjects()}
        areas={listAreas()}
        defaultDate={date}
        defaultStart={start}
      />
    </div>
  );
}
