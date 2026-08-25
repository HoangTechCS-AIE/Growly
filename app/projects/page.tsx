import { NewProjectButton, ProjectCard } from "@/components/project-panels";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { listProjects } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = listProjects();
  const active = projects.filter((project) => project.status === "active");
  const rest = projects.filter((project) => project.status !== "active");

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="My projects"
        subtitle="Each project holds its own small tasks and notes"
        actions={<NewProjectButton />}
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            title="No projects yet"
            hint="A project is just a bucket for a piece of work — its tasks and its notes live inside it."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {active.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {active.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <section>
              <h2 className="section-title mb-2">Not active</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
