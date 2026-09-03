import { SettingsForm } from "@/components/settings-form";
import { PageHeader, Tile } from "@/components/ui";
import { getSettings, listAreas, listTags } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const settings = getSettings();
  const areas = listAreas();
  const tags = listTags();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" subtitle="Everything is stored locally in data/growly.db" />
      <SettingsForm settings={settings} areas={areas} />

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
