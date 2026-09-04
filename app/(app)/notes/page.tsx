import Link from "next/link";
import { IconNote, IconPin, IconSearch } from "@/components/icons";
import { NewNoteButtons } from "@/components/note-new";
import { EmptyState, PageHeader, SegLinks, Tile } from "@/components/ui";
import { listNotes, listTags } from "@/lib/queries";
import { NOTE_KIND_LABEL, type NoteKind } from "@/lib/types";
import { cn } from "@/lib/util";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** A readable preview: headings and list markers become plain text. */
function preview(content: string) {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "☐ ")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^::\w+.*$/gm, "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, 260);
}

export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  await requireUser();
  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const kind = pick("kind");
  const q = pick("q");
  const tag = pick("tag");
  const archived = pick("archived") === "1";

  // Only top-level pages get a card; children live inside their parent. A search still spans every page.
  const notes = listNotes({
    kind,
    search: q,
    tagId: tag,
    includeArchived: archived,
    parentId: q ? undefined : null,
  });
  const tags = listTags();

  const kinds = [
    { key: "", label: "All", href: "/notes" },
    ...Object.entries(NOTE_KIND_LABEL).map(([value, label]) => ({
      key: value,
      label,
      href: `/notes?kind=${value}`,
    })),
  ];

  return (
    <div>
      <PageHeader
        title="Notes"
        subtitle={`${notes.length} page${notes.length === 1 ? "" : "s"}${archived ? " · including archived" : ""}`}
        actions={<NewNoteButtons />}
      />

      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <form action="/notes" className="relative w-full sm:w-72">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search notes…"
              aria-label="Search notes"
              className="input input-sm rounded-full bg-surface pl-9"
            />
            {kind && <input type="hidden" name="kind" value={kind} />}
          </form>
          <SegLinks items={kinds} value={kind ?? ""} className="max-w-full overflow-x-auto" />
        </div>

        {(tags.length > 0 || archived) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.slice(0, 10).map((t) => (
              <Link
                key={t.id}
                href={tag === t.id ? "/notes" : `/notes?tag=${t.id}`}
                className={cn("tag transition hover:text-ink", tag === t.id && "tag-accent")}
              >
                #{t.name}
              </Link>
            ))}
            <Link href={archived ? "/notes" : "/notes?archived=1"} className="btn btn-ghost btn-sm ml-auto">
              {archived ? "Hide archived" : "Show archived"}
            </Link>
          </div>
        )}
      </div>

      {notes.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {notes.map((note) => (
            <Link key={note.id} href={`/notes/${note.id}`} className="tile gap-3 transition hover:border-line-strong">
              <div className="flex items-start gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-surface-3 text-base" aria-hidden>
                  {note.icon || <IconNote className="h-4 w-4 text-muted" />}
                </span>
                <h3 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight">{note.title || "Untitled"}</h3>
                {note.pinned === 1 && <IconPin className="h-4 w-4 shrink-0 text-warn" aria-label="Pinned" />}
              </div>
              <p className="line-clamp-3 text-sm leading-relaxed whitespace-pre-line text-muted">
                {preview(note.content) || "Empty page"}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span className="tag">{NOTE_KIND_LABEL[note.kind as NoteKind]}</span>
                {note.project_title && <span className="tag">{note.project_title}</span>}
                {note.tags.slice(0, 3).map((t) => (
                  <span key={t.id} className="tag">
                    #{t.name}
                  </span>
                ))}
                <span className="ml-auto">{note.updated_at.slice(0, 10)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Tile>
          <EmptyState
            title="No notes yet"
            hint="Capture a meeting, a decision or a raw idea. Any line can become a task later."
          />
        </Tile>
      )}
    </div>
  );
}
