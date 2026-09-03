import Link from "next/link";
import { notFound } from "next/navigation";
import { IconChevronLeft } from "@/components/icons";
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
    <div className="mx-auto max-w-[1200px]">
      <nav className="mb-4 flex items-center gap-1 text-sm font-semibold text-muted" aria-label="Breadcrumb">
        <Link href="/projects" className="inline-flex items-center gap-1 rounded-full py-1 pr-2 transition hover:text-ink">
          <IconChevronLeft className="h-4 w-4" />
          Projects
        </Link>
      </nav>

      <ProjectHeader project={project} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ProjectTasks project={project} tasks={tasks} today={today} />
        </div>
        <div className="lg:col-span-5">
          <ProjectNotes project={project} notes={notes} />
        </div>
      </div>
    </div>
  );
}
