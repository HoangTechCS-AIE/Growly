"use server";

import { redirect } from "next/navigation";
import { authenticate, createAccount, endSession, hasAccount, startSession } from "./auth";

export interface AuthState {
  error?: string;
}

const MIN_PASSWORD = 8;

/* Five wrong guesses buy a pause. Per process and in memory on purpose: the
   only account here is the owner's, and a restart is not worth a table. */
const FAILURES = new Map<string, { count: number; until: number }>();
const MAX_TRIES = 5;
const LOCKOUT_MS = 30_000;

/** An internal path to land on after signing in, or "/" if it looks crafted. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { error: "Enter your username and password." };

  const strike = FAILURES.get(username.toLowerCase());
  if (strike && strike.until > Date.now()) {
    const seconds = Math.ceil((strike.until - Date.now()) / 1000);
    return { error: `Too many attempts. Try again in ${seconds}s.` };
  }

  const user = authenticate(username, password);
  if (!user) {
    const count = (strike?.count ?? 0) + 1;
    FAILURES.set(username.toLowerCase(), {
      count,
      until: count >= MAX_TRIES ? Date.now() + LOCKOUT_MS : 0,
    });
    return { error: "Wrong username or password." };
  }

  FAILURES.delete(username.toLowerCase());
  await startSession(user.id);
  redirect(safeNext(form.get("next")));
}

/** Only ever runs while the database has no account — the first visit sets one. */
export async function createFirstAccount(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (hasAccount()) return { error: "An account already exists. Sign in instead." };

  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (username.length < 3) return { error: "The username needs at least 3 characters." };
  if (password.length < MIN_PASSWORD) return { error: `The password needs at least ${MIN_PASSWORD} characters.` };
  if (password !== confirm) return { error: "The two passwords do not match." };

  const user = createAccount(username, password);
  await startSession(user.id);
  redirect("/");
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
