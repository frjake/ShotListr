import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ShotlistCards } from "./ShotlistCards";

export const metadata: Metadata = { title: "My Shotlists" };

export default async function MyShotlists() {
  const user = await requireUser("/shotlists");
  const shotlists = await prisma.shotlist.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold">My Shotlists</h1>
        <Link href="/shotlists/new" className="btn-primary px-3 py-1.5 text-sm">Create new shotlist +</Link>
      </div>
      {shotlists.length === 0 ? (
        <p className="text-muted">You haven&apos;t saved any shotlists yet.</p>
      ) : (
        <ShotlistCards shotlists={shotlists.map((s) => ({ id: s.id, title: s.title, savedAt: s.updatedAt.toISOString() }))} />
      )}
    </div>
  );
}
