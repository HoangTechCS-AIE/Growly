/* Signing and reading the session cookie. Kept free of database and
   `server-only` imports so `proxy.ts` can verify a cookie before a request
   ever reaches the app. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SESSION_COOKIE = "growly_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Mirrors lib/db.ts on purpose: importing it here would drag `server-only`
// and node:sqlite into the proxy.
const DB_PATH = process.env.GROWLY_DB ?? path.join(process.cwd(), "data", "growly.db");
const KEY_PATH = path.join(path.dirname(DB_PATH), ".session-key");

let cachedKey: Buffer | undefined;

/** The key that signs cookies. It lives beside the database so a restart does
    not sign everyone out; GROWLY_SECRET wins when it is set. */
function key(): Buffer {
  if (process.env.GROWLY_SECRET) return Buffer.from(process.env.GROWLY_SECRET, "utf8");
  if (cachedKey) return cachedKey;
  try {
    cachedKey = Buffer.from(fs.readFileSync(KEY_PATH, "utf8").trim(), "base64");
  } catch {
    const fresh = crypto.randomBytes(32);
    try {
      fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
      // "wx" so two workers starting at once cannot overwrite each other's key.
      fs.writeFileSync(KEY_PATH, fresh.toString("base64"), { mode: 0o600, flag: "wx" });
      cachedKey = fresh;
    } catch {
      cachedKey = Buffer.from(fs.readFileSync(KEY_PATH, "utf8").trim(), "base64");
    }
  }
  return cachedKey;
}

function sign(body: string): string {
  return crypto.createHmac("sha256", key()).update(body).digest("base64url");
}

/** `<session id>.<expiry>.<signature>` — everything the proxy needs to reject a
    forged cookie without touching the database. */
export function signToken(sessionId: string, expiresAtMs: number): string {
  const body = `${sessionId}.${expiresAtMs}`;
  return `${body}.${sign(body)}`;
}

/** The session id a cookie carries, or null when it is forged or expired. */
export function readToken(value: string | undefined): string | null {
  if (!value) return null;
  const [sessionId, expiry, signature] = value.split(".");
  if (!sessionId || !expiry || !signature) return null;

  const expected = Buffer.from(sign(`${sessionId}.${expiry}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;

  return Number(expiry) > Date.now() ? sessionId : null;
}
