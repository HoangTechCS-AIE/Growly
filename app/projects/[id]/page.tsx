import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectHeader, ProjectNotes, ProjectTasks } from "@/components/project-panels";
import { getProject, listNotes, listTasks } from "@/lib/queries";
import { todayISO } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  const today = todayISO();
  const tasks = listTasks({ projectId: id, includeDone: true, parentId: null }, today);
  const notes = listNotes({ projectId: id });

  return (
    <div className="mx-auto max-w-[900px]">
      <nav className="mb-3 flex items-center gap-1 text-[11.5px] text-muted">
        <Link href="/projects" className="rounded px-1 py-0.5 transition hover:bg-surface-2 hover:text-ink">
          My projects
        </Link>
        <span className="px-0.5 text-muted/60">/</span>
        <span className="truncate text-ink">{project.title}</span>
      </nav>

      <ProjectHeader project={project} />

      <div className="mt-5 flex flex-col gap-5">
        <ProjectTasks project={project} tasks={tasks} today={today} />
        <ProjectNotes project={project} notes={notes} />
      </div>
    </div>
  );
}
