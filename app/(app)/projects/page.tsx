import { NewProjectButton, ProjectCard } from "@/components/project-panels";
import { EmptyState, PageHeader, Tile } from "@/components/ui";
import { listProjects } from "@/lib/queries";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await requireUser();
  const projects = listProjects();
  const active = projects.filter((project) => project.status === "active");
  const rest = projects.filter((project) => project.status !== "active");

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Projects"
        subtitle={`${active.length} active · each one holds its own tasks and notes`}
        actions={<NewProjectButton />}
      />

      {projects.length === 0 ? (
        <Tile>
          <EmptyState
            title="No projects yet"
            hint="A project is just a bucket for a piece of work — its tasks and its notes live inside it."
          />
        </Tile>
      ) : (
        <div className="flex flex-col gap-6">
          {active.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {active.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="tile-title">Not active</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {rest.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
