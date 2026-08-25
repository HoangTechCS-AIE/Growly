import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { searchAll } from "@/lib/queries";
import { snippetParts, type SearchHit } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  note: "Page",
  task: "Task",
  project: "Project",
  goal: "Goal",
};

/** Matched runs arrive fenced by control characters, so nothing here is HTML. */
function Snippet({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <p className="cp-snippet mt-0.5 text-[12px]">
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
        title={q ? `Search: ${q}` : "Search"}
        subtitle={
          q
            ? `${hits.length} result(s), best match first — accents are optional, so "ke hoach" finds "kế hoạch"`
            : "Full-text search across pages, tasks, projects and goals"
        }
      />

      <form action="/search" className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search pages, tasks, projects, goals…"
          className="input"
          autoFocus
        />
      </form>

      {!q && (
        <Card>
          <EmptyState
            title="Type something to search"
            hint="Press / to jump here, or Ctrl/Cmd+K for the quick palette."
          />
        </Card>
      )}

      {q && hits.length === 0 && (
        <Card>
          <EmptyState title="No matches" hint="Try a shorter word — the last one is matched as a prefix." />
        </Card>
      )}

      {hits.length > 0 && (
        <Card bodyClassName="p-1.5">
          <ul className="flex flex-col">
            {hits.map((hit) => (
              <li key={`${hit.kind}-${hit.id}`}>
                <Link href={hit.href} className="flex gap-2.5 rounded-lg px-2 py-2 transition hover:bg-surface-2">
                  <span className="shrink-0 text-[15px] leading-5" aria-hidden>
                    {hit.icon || (hit.kind === "note" ? "📄" : "•")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13.5px] font-medium">{hit.title || "Untitled"}</span>
                      <span className="chip chip-plain">{KIND_LABEL[hit.kind]}</span>
                      {hit.context && <span className="text-[11px] text-muted">{hit.context}</span>}
                    </span>
                    <Snippet text={hit.snippet} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
