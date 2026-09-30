import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-foreground/20">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          ShotListr
        </Link>
        <nav className="ml-auto flex items-center gap-4 text-sm">
          <Link href="/" className="navlink">Home</Link>
          <Link href="/shotlists" className="navlink">My Shotlists</Link>
        </nav>
      </div>
    </header>
  );
}
