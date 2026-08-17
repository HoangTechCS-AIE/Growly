import Link from "next/link";
import { TaskList } from "@/components/task-list";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { search } from "@/lib/queries";
import { todayISO } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const raw = params.q;
  const q = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const today = todayISO();
  const results = search(q, today);
  const total =
    results.tasks.length + results.notes.length + results.projects.length + results.goals.length;

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title={q ? `Search: ${q}` : "Search"}
        subtitle={q ? `${total} result(s) across tasks, notes, projects and goals` : "Full-text search across everything"}
      />

      <form action="/search" className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search tasks, notes, projects, goals…"
          className="input"
          autoFocus
        />
      </form>

      {!q && <Card><EmptyState title="Type something to search" hint="Press / anywhere to jump here." /></Card>}

      {q && total === 0 && (
        <Card>
          <EmptyState title="No matches" hint="Try a shorter phrase, or check the archive filters." />
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {results.goals.length > 0 && (
          <Card title="Goals" hint={`${results.goals.length}`}>
            <ul className="flex flex-col gap-1 text-[13px]">
              {results.goals.map((goal) => (
                <li key={goal.id}>
                  <Link href={`/tasks?goal=${goal.id}`} className="hover:text-accent">
                    {goal.title}
                  </Link>
                  <span className="ml-2 text-[11px] text-muted">
                    {goal.task_done}/{goal.task_total} tasks
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {results.projects.length > 0 && (
          <Card title="Projects" hint={`${results.projects.length}`}>
            <ul className="flex flex-col gap-1 text-[13px]">
              {results.projects.map((project) => (
                <li key={project.id}>
                  <Link href={`/tasks?project=${project.id}`} className="hover:text-accent">
                    {project.title}
                  </Link>
                  <span className="ml-2 text-[11px] text-muted">{project.goal_title ?? "no goal"}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {results.tasks.length > 0 && (
          <Card title="Tasks" hint={`${results.tasks.length}`}>
            <TaskList tasks={results.tasks} today={today} />
          </Card>
        )}

        {results.notes.length > 0 && (
          <Card title="Notes" hint={`${results.notes.length}`}>
            <ul className="flex flex-col gap-2">
              {results.notes.map((note) => (
                <li key={note.id}>
                  <Link href={`/notes/${note.id}`} className="block rounded-lg px-2 py-1.5 hover:bg-surface-2">
                    <p className="text-[13px]">{note.title}</p>
                    <p className="line-clamp-2 text-[11.5px] text-muted">{note.content.slice(0, 200)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
