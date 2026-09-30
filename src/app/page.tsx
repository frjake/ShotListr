import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-center text-4xl font-semibold sm:text-5xl">Welcome to ShotListr</h1>
      <Link href="/shotlists/new" className="btn-primary">Create new shotlist +</Link>
    </div>
  );
}
