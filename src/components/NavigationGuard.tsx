"use client";

// Blocks in-app navigation while a page has unsaved changes (see Next's Link `onNavigate` docs).
// A page with unsaved work registers a guard; guarded links and the Log out button hand the guard a
// `proceed` callback instead of navigating, and the page decides (e.g. after asking) whether to call it.
//
// It also provides `resetKey`, which changes when a guarded link goes to the page you're already on
// (e.g. "New Shotlist" from a new shotlist). Next keeps a page's state across such a navigation, so
// pages that should start over key themselves on it.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { logout } from "@/app/actions/auth";

type Guard = (proceed: () => void) => void;

const NavigationGuardContext = createContext<{
  guard: Guard | null;
  setGuard: (guard: Guard | null) => void;
  resetKey: number;
  resetPage: () => void;
}>({ guard: null, setGuard: () => {}, resetKey: 0, resetPage: () => {} });

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const [guard, setGuardState] = useState<Guard | null>(null);
  // Stable, so pages can depend on it in effects. Wraps `g`: a function passed straight to a state
  // setter would be called as an updater.
  const setGuard = useCallback((g: Guard | null) => setGuardState(() => g), []);
  const [resetKey, setResetKey] = useState(0);
  const resetPage = useCallback(() => setResetKey((k) => k + 1), []);
  const value = useMemo(() => ({ guard, setGuard, resetKey, resetPage }), [guard, setGuard, resetKey, resetPage]);
  return <NavigationGuardContext.Provider value={value}>{children}</NavigationGuardContext.Provider>;
}

export function useNavigationGuard() {
  return useContext(NavigationGuardContext);
}

/** A Link that asks the registered guard before navigating, and starts the page over if it's the current one. */
export function GuardedLink({ href, ...props }: React.ComponentProps<typeof Link> & { href: string }) {
  const { guard, resetPage } = useNavigationGuard();
  const router = useRouter();
  const samePage = usePathname() === href;
  return (
    <Link
      href={href}
      onNavigate={(e) => {
        if (!guard) {
          if (samePage) resetPage();
          return;
        }
        e.preventDefault();
        guard(() => {
          if (samePage) resetPage();
          router.push(href);
        });
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
