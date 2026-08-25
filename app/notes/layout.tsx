import { NoteTree } from "@/components/note-tree";
import { listNoteTree } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <NoteTree items={listNoteTree()} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
