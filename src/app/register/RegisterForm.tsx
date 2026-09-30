"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register } from "@/app/actions/auth";

export function RegisterForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(register, undefined);

  return (
    <form action={action} className="card mx-4 mt-8 flex max-w-sm flex-col gap-4 self-stretch sm:mx-auto sm:w-full sm:self-center">
      <h1 className="text-xl font-semibold">Create your account</h1>
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="username" className="label">Username</label>
        <input id="username" name="username" className="input mt-1" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" />
        <p className="mt-1 text-xs text-muted">Letters, numbers and underscores. Shown as @username.</p>
      </div>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" className="input mt-1" autoComplete="email" required />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" className="input mt-1" autoComplete="new-password" required minLength={8} />
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Sign up"}
      </button>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
