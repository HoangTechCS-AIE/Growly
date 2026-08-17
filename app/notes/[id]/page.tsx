import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/note-editor";
import { Card } from "@/components/ui";
import {
  getBacklinks, getNote, getOutlinks, listGoals, listNotes, listProjects,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: PageProps<"/notes/[id]">) {
  const { id } = await params;
  const note = getNote(id);
  if (!note) notFound();

  const backlinks = getBacklinks(id);
  const outlinks = getOutlinks(id);
  const index = listNotes({ includeArchived: true }).map((n) => ({ id: n.id, title: n.title }));
  const recent = listNotes({ limit: 12 });

  return (
    <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)_240px]">
      <aside className="hidden xl:block">
        <Card title="Recent notes" bodyClassName="p-1.5">
          <ul className="flex flex-col">
            {recent.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/notes/${item.id}`}
                  className={`block truncate rounded-lg px-2 py-1.5 text-[12.5px] transition hover:bg-surface-2 ${
                    item.id === id ? "bg-surface-3 text-ink" : "text-muted"
                  }`}
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </aside>

      <div className="min-w-0">
        <NoteEditor note={note} projects={listProjects()} goals={listGoals()} noteIndex={index} />
      </div>

      <aside className="flex flex-col gap-3">
        <Card title="Backlinks" hint={`${backlinks.length} note(s) link here`}>
          {backlinks.length ? (
            <ul className="flex flex-col gap-1 text-[12.5px]">
              {backlinks.map((item) => (
                <li key={item.id}>
                  <Link href={`/notes/${item.id}`} className="hover:text-accent">
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-muted">
              Write <code className="text-accent">[[Note title]]</code> in another note to link here.
            </p>
          )}
        </Card>

        {outlinks.length > 0 && (
          <Card title="Links out">
            <ul className="flex flex-col gap-1 text-[12.5px]">
              {outlinks.map((item) => (
                <li key={item.id}>
                  <Link href={`/notes/${item.id}`} className="hover:text-accent">
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </aside>
    </div>
  );
}
