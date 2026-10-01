"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteShotlist } from "@/app/actions/shotlists";
import { LocalTime } from "@/components/LocalTime";

export type ShotlistSummary = { id: string; title: string; savedAt: string };

/** The My Shotlists grid: one card per shotlist, each with a delete button that asks first. */
export function ShotlistCards({ shotlists }: { shotlists: ShotlistSummary[] }) {
  const [confirming, setConfirming] = useState<ShotlistSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const dialogEl = useRef<HTMLDialogElement>(null);
  const cancelEl = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirming || dialogEl.current?.open) return;
    dialogEl.current?.showModal();
    // showModal focuses the first button (Delete); start on Cancel so Enter by reflex doesn't delete.
    cancelEl.current?.focus();
  }, [confirming]);

  function close() {
    setConfirming(null);
    setError(null);
    dialogEl.current?.close();
  }

  function confirmDelete(shotlist: ShotlistSummary) {
    startDelete(async () => {
      const result = await deleteShotlist(shotlist.id);
      // The action revalidates the page, so the card disappears in this same transition.
      if (result.error) setError(result.error);
      else close();
    });
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shotlists.map((s) => (
          <li key={s.id} className="relative min-w-0">
            <Link href={`/shotlists/${s.id}`} className="card block pr-11 transition-colors hover:bg-scene">
              <h2 className="truncate font-semibold">{s.title}</h2>
              <p className="mt-1 text-sm text-muted">
                Saved <LocalTime iso={s.savedAt} />
              </p>
            </Link>
            {/* A sibling of the link, not inside it, so clicking it never opens the shotlist. */}
            <button
              type="button"
              aria-label={`Delete ${s.title}`}
              title="Delete shotlist"
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-foreground/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70"
              onClick={() => setConfirming(s)}
            >
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 stroke-current" strokeWidth={1.75} strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogEl}
        // Escape closes it; ignore the queued close event if it arrives after reopening.
        onClose={(e) => {
          if (e.currentTarget.open) return;
          setConfirming(null);
          setError(null);
        }}
        className="m-auto w-[min(34rem,calc(100%-2rem))] rounded-lg border border-line bg-surface p-5 text-foreground shadow-xl backdrop:bg-black/60"
      >
        {confirming && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Delete “{confirming.title}”?</h2>
            <p className="text-sm text-muted">
              This permanently deletes the shotlist and all of its scenes and shots. It can&apos;t be undone.
            </p>
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <div className="flex gap-2">
              <button type="button" className="btn-danger flex-1" disabled={deleting} onClick={() => confirmDelete(confirming)}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button ref={cancelEl} type="button" className="btn-secondary flex-1" onClick={close}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
