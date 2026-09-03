import "server-only";
import { all } from "../db";
import { clubConfig, contentLimits, providerDefaults } from "../config";

/**
 * Any OpenAI-compatible chat endpoint: OpenAI, Groq, Together, OpenRouter,
 * a local llama.cpp/Ollama shim — whatever answers `POST /chat/completions`.
 *
 * Settings rows win over env vars so the provider can be switched from the UI
 * without restarting the dev server.
 */
export interface ProviderConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
}

export const PROVIDER_KEYS = [
  "ai_base_url",
  "ai_model",
  "ai_api_key",
  "ai_temperature",
  "content_address",
] as const;

function settingsMap(): Record<string, string> {
  const rows = all<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN (${PROVIDER_KEYS.map(() => "?").join(",")})`,
    ...PROVIDER_KEYS,
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Settings rows win over `.env`, which supplies the defaults. */
export function getProviderConfig(): ProviderConfig {
  const map = settingsMap();
  const env = providerDefaults();
  const temperature = Number(map.ai_temperature);
  return {
    baseUrl: map.ai_base_url || env.baseUrl,
    model: map.ai_model || env.model,
    apiKey: map.ai_api_key || env.apiKey,
    temperature: Number.isFinite(temperature) ? temperature : env.temperature,
  };
}

/** What the browser is allowed to see — never the key itself. */
export interface PublicProviderConfig {
  baseUrl: string;
  model: string;
  temperature: number;
  hasKey: boolean;
  keyHint: string;
  keyFromEnv: boolean;
  address: string;
  /** What `.env` supplies when a Settings row is blank — shown as placeholders. */
  envDefaults: { baseUrl: string; model: string };
}

export function getPublicProviderConfig(): PublicProviderConfig {
  const map = settingsMap();
  const config = getProviderConfig();
  const env = providerDefaults();
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    hasKey: config.apiKey.length > 0,
    keyHint: config.apiKey ? `••••${config.apiKey.slice(-4)}` : "",
    keyFromEnv: !map.ai_api_key && Boolean(env.apiKey),
    address: map.content_address || clubConfig().address,
    envDefaults: { baseUrl: env.baseUrl, model: env.model },
  };
}

function endpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class ProviderError extends Error {}

export async function chat(
  messages: ChatMessage[],
  config: ProviderConfig,
  timeoutMs = contentLimits().requestTimeoutMs,
): Promise<string> {
  if (!config.apiKey) {
    throw new ProviderError(
      "Chưa có API key. Vào Settings → AI provider để điền, hoặc đặt OPENAI_API_KEY trong .env",
    );
  }
  if (!config.baseUrl) {
    throw new ProviderError("Chưa có base URL. Đặt OPENAI_BASE_URL trong .env hoặc điền ở Settings.");
  }
  if (!config.model) {
    throw new ProviderError("Chưa chọn model. Đặt OPENAI_MODEL trong .env hoặc điền ở Settings.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(endpoint(config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ProviderError(`Provider không trả lời trong ${timeoutMs / 1000}s.`);
    }
    throw new ProviderError(
      `Không gọi được ${endpoint(config.baseUrl)} — ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const body = await res.text();
  if (!res.ok) {
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      if (parsed.error?.message) detail = parsed.error.message;
    } catch {
      // Non-JSON error body — the raw text is the best detail available.
    }
    throw new ProviderError(`Provider trả về ${res.status}: ${detail}`);
  }

  let parsed: { choices?: { message?: { content?: string } }[] };
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ProviderError(`Provider trả về JSON không hợp lệ: ${body.slice(0, 200)}`);
  }

  const text = parsed.choices?.[0]?.message?.content?.trim();
  if (!text) throw new ProviderError("Provider trả về nội dung rỗng.");
  return text;
}
