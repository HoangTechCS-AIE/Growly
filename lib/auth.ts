import "server-only";
import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { get, run } from "./db";
import { newId, nowISO } from "./util";
import { SESSION_COOKIE, SESSION_TTL_MS, readToken, signToken } from "./auth-token";

export interface User {
  id: string;
  username: string;
  created_at: string;
}

const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function checkPassword(password: string, stored: string): boolean {
  const [scheme, N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const given = crypto.scryptSync(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(expected, given);
}

/** True once the first account exists; until then the app opens on /setup. */
export function hasAccount(): boolean {
  return (get<{ n: number }>("SELECT COUNT(*) AS n FROM users")?.n ?? 0) > 0;
}

export function createAccount(username: string, password: string): User {
  const now = nowISO();
  const user: User = { id: newId(), username, created_at: now };
  run(
    "INSERT INTO users(id, username, password_hash, created_at, updated_at) VALUES(?, ?, ?, ?, ?)",
    user.id,
    username,
    hashPassword(password),
    now,
    now,
  );
  return user;
}

/** The account for these credentials, or null. Constant work either way, so a
    wrong username is not faster to probe than a wrong password. */
export function authenticate(username: string, password: string): User | null {
  const row = get<User & { password_hash: string }>(
    "SELECT id, username, password_hash, created_at FROM users WHERE username = ? COLLATE NOCASE",
    username,
  );
  const stored = row?.password_hash ?? hashPassword(crypto.randomUUID());
  if (!checkPassword(password, stored) || !row) return null;
  return { id: row.id, username: row.username, created_at: row.created_at };
}

export async function startSession(userId: string) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const id = newId();
  run("DELETE FROM sessions WHERE expires_at <= ?", nowISO());
  run(
    "INSERT INTO sessions(id, user_id, created_at, expires_at) VALUES(?, ?, ?, ?)",
    id,
    userId,
    nowISO(),
    new Date(expiresAt).toISOString(),
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, signToken(id, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function endSession() {
  const store = await cookies();
  const sessionId = readToken(store.get(SESSION_COOKIE)?.value);
  if (sessionId) run("DELETE FROM sessions WHERE id = ?", sessionId);
  store.delete(SESSION_COOKIE);
}

/** The signed-in account, checked against the session table rather than the
    cookie alone. Memoised so a render pass costs one query. */
export const getUser = cache(async (): Promise<User | null> => {
  const store = await cookies();
  const sessionId = readToken(store.get(SESSION_COOKIE)?.value);
  if (!sessionId) return null;

  const row = get<User & { expires_at: string }>(
    `SELECT u.id, u.username, u.created_at, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    sessionId,
  );
  if (!row || row.expires_at <= nowISO()) return null;
  return { id: row.id, username: row.username, created_at: row.created_at };
});

/** The check to run wherever a page or layout reads private data. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
