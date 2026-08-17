import { SettingsForm } from "@/components/settings-form";
import { Card, PageHeader } from "@/components/ui";
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
        <Card title="Tags" hint={`${tags.length} tag(s)`} className="mt-4">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag.id} className="chip chip-plain">
                #{tag.name} · {tag.usage}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
