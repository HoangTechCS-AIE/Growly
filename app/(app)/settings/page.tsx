import { SettingsForm } from "@/components/settings-form";
import { PageHeader, Tile } from "@/components/ui";
import { getSettings, listAreas, listTags } from "@/lib/queries";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = getSettings();
  const areas = listAreas();
  const tags = listTags();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" subtitle="Everything is stored locally in data/growly.db" />
      <SettingsForm settings={settings} areas={areas} />

      <Tile title="Account" hint="The login that opens Growly" className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold">{user.username}</span>
          <form action={signOut}>
            <button type="submit" className="btn btn-outline btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </Tile>

      {tags.length > 0 && (
        <Tile title="Tags" action={<span className="tag tabular-nums">{tags.length}</span>} className="mt-4">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag.id} className="tag">
                #{tag.name} · {tag.usage}
              </span>
            ))}
          </div>
        </Tile>
      )}
    </div>
  );
}
