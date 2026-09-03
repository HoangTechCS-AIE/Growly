import Link from "next/link";
import { IconChevronLeft } from "@/components/icons";
import { TaskForm } from "@/components/task-form";
import { PageHeader } from "@/components/ui";
import { listAreas, listProjects } from "@/lib/queries";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ searchParams }: PageProps<"/tasks/new">) {
  await requireUser();
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const date = single("date");
  const start = single("start");

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-4 flex items-center gap-1 text-sm font-semibold text-muted" aria-label="Breadcrumb">
        <Link href="/tasks" className="inline-flex items-center gap-1 rounded-full py-1 pr-2 transition hover:text-ink">
          <IconChevronLeft className="h-4 w-4" />
          Tasks
        </Link>
      </nav>
      <PageHeader
        title="New task"
        subtitle="Give it a name, a project and a first step."
      />
      <TaskForm
        projects={listProjects()}
        areas={listAreas()}
        defaultDate={date}
        defaultStart={start}
      />
    </div>
  );
}
