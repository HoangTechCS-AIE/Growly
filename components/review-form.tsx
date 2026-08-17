"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReview } from "@/lib/actions";
import { Card } from "./ui";

export function ReviewForm({
  kind,
  periodKey,
  fields,
  initial,
}: {
  kind: "daily" | "weekly" | "monthly";
  periodKey: string;
  fields: { key: string; label: string; placeholder?: string; rows?: number }[];
  initial: Record<string, string>;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? ""])),
  );
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <Card
      title={`${kind[0].toUpperCase()}${kind.slice(1)} review · ${periodKey}`}
      hint="Answers are kept, so you can compare periods later"
      action={saved ? <span className="text-[11.5px] text-accent">Saved</span> : null}
    >
      <div className="flex flex-col gap-3">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="label" htmlFor={field.key}>
              {field.label}
            </label>
            <textarea
              id={field.key}
              rows={field.rows ?? 3}
              value={form[field.key] ?? ""}
              placeholder={field.placeholder}
              onChange={(e) => {
                setForm({ ...form, [field.key]: e.target.value });
                setSaved(false);
              }}
              className="input resize-y"
            />
          </div>
        ))}
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await saveReview(kind, periodKey, form);
                setSaved(true);
                router.refresh();
              })
            }
          >
            Save review
          </button>
        </div>
      </div>
    </Card>
  );
}
