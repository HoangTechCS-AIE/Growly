"use client";

import { useActionState } from "react";
import type { AuthState } from "@/lib/auth-actions";

/** The sign-in and first-run forms differ only in their copy and one field. */
export function AuthForm({
  action,
  title,
  hint,
  submitLabel,
  confirmPassword = false,
  next,
}: {
  action: (state: AuthState, form: FormData) => Promise<AuthState>;
  title: string;
  hint: string;
  submitLabel: string;
  confirmPassword?: boolean;
  next?: string;
}) {
  const [state, submit, pending] = useActionState<AuthState, FormData>(action, {});

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-inner bg-accent text-lg font-extrabold text-accent-ink">
            G
          </span>
          <span className="text-lg font-extrabold tracking-tight">Growly</span>
        </div>

        <form action={submit} className="tile">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted">{hint}</p>
          </div>

          {next && <input type="hidden" name="next" value={next} />}

          <div>
            <label className="label" htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              autoComplete={confirmPassword ? "new-password" : "current-password"}
              required
            />
          </div>

          {confirmPassword && (
            <div>
              <label className="label" htmlFor="confirm">Repeat password</label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                className="input"
                autoComplete="new-password"
                required
              />
            </div>
          )}

          {state.error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {state.error}
            </p>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={pending}>
            {pending ? "Working…" : submitLabel}
          </button>
        </form>
      </div>
    </div>
  );
}
