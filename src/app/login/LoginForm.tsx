"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="card mx-4 mt-8 flex max-w-sm flex-col gap-4 self-stretch sm:mx-auto sm:w-full sm:self-center">
      <h1 className="text-xl font-semibold">Log in</h1>
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="identifier" className="label">Username or email</label>
        <input id="identifier" name="identifier" className="input mt-1" autoComplete="username" required />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" className="input mt-1" autoComplete="current-password" required />
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </button>
      <p className="text-sm text-muted">
        No account?{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}
