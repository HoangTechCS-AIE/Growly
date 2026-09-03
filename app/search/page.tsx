import Link from "next/link";
import { IconNote, IconSearch, IconTarget, IconTask } from "@/components/icons";
import { EmptyState, PageHeader, Tile } from "@/components/ui";
import { searchAll } from "@/lib/queries";
import { snippetParts, type SearchHit } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  note: "Page",
  task: "Task",
  project: "Project",
  goal: "Goal",
};

const KIND_ICON: Record<SearchHit["kind"], (p: { className?: string }) => React.ReactElement> = {
  note: IconNote,
  task: IconTask,
  project: IconTarget,
  goal: IconTarget,
};

/** Matched runs arrive fenced by control characters, so nothing here is HTML. */
function Snippet({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <p className="cp-snippet mt-0.5 text-sm">
      {snippetParts(text).map((part, index) =>
        part.hit ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
      )}
    </p>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const raw = params.q;
  const q = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const hits = searchAll(q, 60);

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title={q ? `“${q}”` : "Search"}
        eyebrow={q ? "Search" : undefined}
        subtitle={
          q
            ? `${hits.length} result${hits.length === 1 ? "" : "s"}, best match first — accents are optional, so "ke hoach" finds "kế hoạch"`
            : "Full-text search across pages, tasks, projects and goals"
        }
      />

      <form action="/search" className="relative mb-5">
        <IconSearch className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search pages, tasks, projects, goals…"
          aria-label="Search"
          className="input h-12 rounded-full bg-surface pl-12 text-base"
          autoFocus
        />
      </form>

      {!q && (
        <Tile>
          <EmptyState
            title="Type something to search"
            hint="Press / or Ctrl/Cmd+K anywhere for the quick palette."
          />
        </Tile>
      )}

      {q && hits.length === 0 && (
        <Tile>
          <EmptyState title="No matches" hint="Try a shorter word — the last one is matched as a prefix." />
        </Tile>
      )}

      {hits.length > 0 && (
        <Tile className="gap-0 p-2">
          <ul className="flex flex-col">
            {hits.map((hit) => {
              const Icon = KIND_ICON[hit.kind];
              return (
                <li key={`${hit.kind}-${hit.id}`}>
                  <Link href={hit.href} className="flex gap-3 rounded-inner px-3 py-3 transition hover:bg-surface-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center text-base text-muted" aria-hidden>
                      {hit.icon || <Icon className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold">{hit.title || "Untitled"}</span>
                        <span className="tag">{KIND_LABEL[hit.kind]}</span>
                        {hit.context && <span className="text-xs text-muted">{hit.context}</span>}
                      </span>
                      <Snippet text={hit.snippet} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Tile>
      )}
    </div>
  );
}
