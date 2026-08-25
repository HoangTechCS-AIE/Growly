import Link from "next/link";
import { NewNoteButtons } from "@/components/note-new";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { listNotes, listTags } from "@/lib/queries";
import { NOTE_KIND_LABEL, type NoteKind } from "@/lib/types";
import { cn } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const kind = pick("kind");
  const q = pick("q");
  const tag = pick("tag");
  const archived = pick("archived") === "1";

  const notes = listNotes({ kind, search: q, tagId: tag, includeArchived: archived });
  const tags = listTags();

  return (
    <div>
      <PageHeader
        title="Notes"
        subtitle="Every page lives in the tree on the left; search and filters live here"
        actions={<NewNoteButtons />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/notes" className="flex items-center gap-2">
          <input name="q" defaultValue={q ?? ""} placeholder="Search notes…" className="input w-64" />
          {kind && <input type="hidden" name="kind" value={kind} />}
          <button type="submit" className="btn btn-sm">
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-1">
          <Link
            href="/notes"
            className={cn("chip transition", !kind ? "border-accent/30 bg-accent/10 text-accent" : "chip-plain")}
          >
            All
          </Link>
          {Object.entries(NOTE_KIND_LABEL).map(([value, label]) => (
            <Link
              key={value}
              href={`/notes?kind=${value}`}
              className={cn(
                "chip transition",
                kind === value ? "border-accent/30 bg-accent/10 text-accent" : "chip-plain",
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 8).map((t) => (
              <Link
                key={t.id}
                href={`/notes?tag=${t.id}`}
                className={cn("chip transition", tag === t.id ? "border-accent/30 bg-accent/10 text-accent" : "chip-plain")}
              >
                #{t.name}
              </Link>
            ))}
          </div>
        )}

        <Link href={archived ? "/notes" : "/notes?archived=1"} className="btn btn-sm btn-ghost">
          {archived ? "Hide archived" : "Show archived"}
        </Link>
      </div>

      {notes.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {notes.map((note) => (
            <Link key={note.id} href={`/notes/${note.id}`} className="card-pad transition hover:border-line-strong">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold">
                  <span aria-hidden>{note.icon || "📄"}</span>
                  <span className="truncate">{note.title}</span>
                </h3>
                {note.pinned === 1 && <span className="text-warn">📌</span>}
              </div>
              <p className="mb-2 line-clamp-4 whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
                {note.content.slice(0, 260) || "Empty note"}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                <span className="chip chip-plain">{NOTE_KIND_LABEL[note.kind as NoteKind]}</span>
                {note.project_title && <span className="chip chip-plain">{note.project_title}</span>}
                {note.goal_title && <span className="chip chip-plain">{note.goal_title}</span>}
                {note.tags.map((t) => (
                  <span key={t.id} className="chip chip-plain">
                    #{t.name}
                  </span>
                ))}
                <span className="ml-auto">{note.updated_at.slice(0, 10)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No notes yet"
            hint="Capture a meeting, a decision or a raw idea. Any line can become a task later."
          />
        </Card>
      )}
    </div>
  );
}
