"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSettings } from "@/lib/actions";
import type { PublicProviderConfig } from "@/lib/content/provider";
import { Tile } from "./ui";

/**
 * Any OpenAI-compatible endpoint. The key is write-only from here: the server
 * hands back a masked hint, and an empty field on save leaves the stored key
 * alone rather than wiping it.
 */
export function AiSettingsForm({ config }: { config: PublicProviderConfig }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    ai_base_url: config.baseUrl,
    ai_model: config.model,
    ai_api_key: "",
    ai_temperature: String(config.temperature),
    content_address: config.address,
  });

  return (
    <Tile
      title="AI provider"
      hint="Used by Content — any endpoint that answers POST /chat/completions"
      className="mt-4"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="ai-base">
            Base URL
          </label>
          <input
            id="ai-base"
            className="input font-mono text-xs"
            placeholder={config.envDefaults.baseUrl || "https://<host>/v1"}
            value={form.ai_base_url}
            onChange={(e) => setForm({ ...form, ai_base_url: e.target.value })}
          />
          <p className="mt-1.5 text-xs text-muted">
            <code>/chat/completions</code> is appended when missing. Left blank,{" "}
            <code>OPENAI_BASE_URL</code> from <code>.env</code> is used.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="ai-model">
            Model
          </label>
          <input
            id="ai-model"
            className="input font-mono text-xs"
            placeholder={config.envDefaults.model || "model name"}
            value={form.ai_model}
            onChange={(e) => setForm({ ...form, ai_model: e.target.value })}
          />
        </div>

        <div>
          <label className="label" htmlFor="ai-key">
            API key
          </label>
          <input
            id="ai-key"
            type="password"
            autoComplete="off"
            className="input font-mono text-xs"
            placeholder={config.hasKey ? `Using ${config.keyHint} — blank keeps it` : "sk-…"}
            value={form.ai_api_key}
            onChange={(e) => setForm({ ...form, ai_api_key: e.target.value })}
          />
          <p className="mt-1.5 text-xs text-muted">
            {config.keyFromEnv
              ? "Currently taken from OPENAI_API_KEY in the environment."
              : config.hasKey
                ? "Stored in data/growly.db on this machine."
                : "No key yet — Content cannot reach the provider."}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="ai-temp">
            Temperature
          </label>
          <input
            id="ai-temp"
            type="number"
            step="0.1"
            min="0"
            max="2"
            className="input"
            value={form.ai_temperature}
            onChange={(e) => setForm({ ...form, ai_temperature: e.target.value })}
          />
          <p className="mt-1.5 text-xs text-muted">
            0.9 keeps the voice natural; lower reads flat and repetitive.
          </p>
        </div>

        <div className="md:col-span-2">
          <label className="label" htmlFor="ai-addr">
            Club address in the post footer
          </label>
          <input
            id="ai-addr"
            className="input"
            value={form.content_address}
            onChange={(e) => setForm({ ...form, content_address: e.target.value })}
          />
          <p className="mt-1.5 text-xs text-muted">
            Overrides <code>CLUB_ADDRESS</code>. Every post generated from here follows it.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const values: Record<string, string> = {
                ai_base_url: form.ai_base_url.trim(),
                ai_model: form.ai_model.trim(),
                ai_temperature: form.ai_temperature,
                content_address: form.content_address.trim(),
              };
              // An empty box means "leave the stored key alone", never "wipe it".
              if (form.ai_api_key.trim()) values.ai_api_key = form.ai_api_key.trim();
              await updateSettings(values);
              setForm({ ...form, ai_api_key: "" });
              setSaved(true);
              router.refresh();
            })
          }
        >
          Save provider
        </button>
        {saved && <span className="tag tag-accent">Saved</span>}
      </div>
    </Tile>
  );
}
