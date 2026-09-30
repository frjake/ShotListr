import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";

export async function Nav() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-foreground/20">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          ShotListr
        </Link>
        <nav className="ml-auto flex items-center gap-3 whitespace-nowrap text-sm sm:gap-4">
          <Link href="/" className="navlink">Home</Link>
          <Link href="/shotlists" className="navlink">My Shotlists</Link>
          {user ? (
            <>
              <span className="text-muted">@{user.username}</span>
              <form action={logout}>
                <button type="submit" className="navlink">Log out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="navlink">Log in</Link>
              <Link href="/register" className="btn-primary px-3 py-1.5 text-sm">Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
