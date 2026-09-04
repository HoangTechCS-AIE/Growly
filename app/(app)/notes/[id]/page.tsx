import { notFound } from "next/navigation";
import { NotePage } from "@/components/note-page";
import {
  getBacklinks, getNote, getNoteAncestors, getOutlinks, listChildNotes, listNotes, listProjects,
} from "@/lib/queries";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Page({ params }: PageProps<"/notes/[id]">) {
  await requireUser();
  const { id } = await params;
  const note = getNote(id);
  if (!note) notFound();

  const index = listNotes({ includeArchived: true }).map((item) => ({
    id: item.id,
    title: item.title,
    icon: item.icon,
  }));

  return (
    <NotePage
      note={note}
      ancestors={getNoteAncestors(id)}
      subpages={listChildNotes(id)}
      backlinks={getBacklinks(id)}
      outlinks={getOutlinks(id)}
      projects={listProjects()}
      noteIndex={index}
    />
  );
}
