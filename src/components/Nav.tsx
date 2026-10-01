import { getCurrentUser } from "@/lib/auth";
import { GuardedLink, LogoutButton } from "./NavigationGuard";

export async function Nav() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-foreground/20">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <GuardedLink href="/" className="text-lg font-semibold tracking-tight">
          ShotListr
        </GuardedLink>
        <nav className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 whitespace-nowrap text-sm sm:gap-x-4">
          <GuardedLink href="/" className="navlink">Home</GuardedLink>
          <GuardedLink href="/shotlists/new" className="navlink">New Shotlist</GuardedLink>
          <GuardedLink href="/shotlists" className="navlink">My Shotlists</GuardedLink>
          {user ? (
            <>
              <span className="text-muted">@{user.username}</span>
              <LogoutButton className="navlink" />
            </>
          ) : (
            <>
              <GuardedLink href="/login" className="navlink">Log in</GuardedLink>
              <GuardedLink href="/register" className="btn-primary px-3 py-1.5 text-sm">Sign up</GuardedLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
