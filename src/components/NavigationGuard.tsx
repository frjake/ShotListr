"use client";

// Blocks in-app navigation while a page has unsaved changes (see Next's Link `onNavigate` docs).
// A page with unsaved work registers a guard; guarded links and the Log out button hand the guard a
// `proceed` callback instead of navigating, and the page decides (e.g. after asking) whether to call it.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { logout } from "@/app/actions/auth";

type Guard = (proceed: () => void) => void;

const NavigationGuardContext = createContext<{ guard: Guard | null; setGuard: (guard: Guard | null) => void }>({
  guard: null,
  setGuard: () => {},
});

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const [guard, setGuardState] = useState<Guard | null>(null);
  // Stable, so pages can depend on it in effects. Wraps `g`: a function passed straight to a state
  // setter would be called as an updater.
  const setGuard = useCallback((g: Guard | null) => setGuardState(() => g), []);
  const value = useMemo(() => ({ guard, setGuard }), [guard, setGuard]);
  return <NavigationGuardContext.Provider value={value}>{children}</NavigationGuardContext.Provider>;
}

export function useNavigationGuard() {
  return useContext(NavigationGuardContext);
}

/** A Link that asks the registered guard before navigating. */
export function GuardedLink({ href, ...props }: React.ComponentProps<typeof Link> & { href: string }) {
  const { guard } = useNavigationGuard();
  const router = useRouter();
  return (
    <Link
      href={href}
      onNavigate={(e) => {
        if (!guard) return;
        e.preventDefault();
        guard(() => router.push(href));
      }}
      {...props}
    />
  );
}

/** The nav's Log out button, which asks the registered guard before logging out. */
export function LogoutButton({ className }: { className?: string }) {
  const { guard } = useNavigationGuard();
  const formEl = useRef<HTMLFormElement>(null);
  const approved = useRef(false);
  return (
    <form
      ref={formEl}
      action={logout}
      onSubmit={(e) => {
        if (!guard || approved.current) return;
        // A prevented submit doesn't run the form action.
        e.preventDefault();
        guard(() => {
          approved.current = true;
          formEl.current?.requestSubmit();
        });
      }}
    >
      <button type="submit" className={className}>Log out</button>
    </form>
  );
}
