"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { autoScrollStep } from "@/lib/dragScroll";

/** The gap (0…items) a pointer at `clientY` is over: before the first item whose middle is below it. */
function gapAt(items: (HTMLLIElement | null)[], clientY: number) {
  const rects = items.filter((el): el is HTMLLIElement => el !== null).map((el) => el.getBoundingClientRect());
  const gap = rects.findIndex((r) => clientY < r.top + r.height / 2);
  return gap === -1 ? rects.length : gap;
}

/**
 * The shotlist's character list: a collapsible section above the sheet. Names can be reordered
 * (drag the ⠿ grip with pointer capture, or focus it and press ↑/↓; dragging near the list's top or
 * bottom edge scrolls it), renamed in place (Enter or
 * leaving the field commits, Escape reverts), removed, and added. The + in a name's box adds that
 * character to a scene by number (the box stays open for more). The editor owns the list and keeps
 * scene Characters cells in its order; refused renames/adds come back as a message.
 */
export function CharacterList({
  names,
  open,
  onToggle,
  onMove,
  onRename,
  onRemove,
  onAdd,
  onAddToScene,
}: {
  names: string[];
  open: boolean;
  onToggle: () => void;
  /** Moves the name at `from` so it ends up at index `to`. */
  onMove: (from: number, to: number) => void;
  /** Returns a message if the rename was refused. */
  onRename: (index: number, name: string) => string | null;
  onRemove: (index: number) => void;
  /** Returns a message if the name was refused. */
  onAdd: (name: string) => string | null;
  /** Adds a character to the scene with that number; says what happened. */
  onAddToScene: (name: string, sceneNumber: string) => { ok: boolean; message: string };
}) {
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  // The name whose "add to scene" box is open (one at a time), what's typed, and the last result.
  const [adding, setAdding] = useState<{ name: string; text: string; result: { ok: boolean; message: string } | null } | null>(null);
  // Dragging: the name's index and the gap (0..length) it would drop into.
  const [drag, setDrag] = useState<{ from: number; gap: number } | null>(null);
  const itemEls = useRef<(HTMLLIElement | null)[]>([]);
  const listEl = useRef<HTMLOListElement>(null);
  const pointerY = useRef(0);
  const dragging = drag !== null;
  const gripEls = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterMove = useRef<string | null>(null);

  // Keep focus on a name's grip after a keyboard move re-renders the list.
  useLayoutEffect(() => {
    if (focusAfterMove.current) gripEls.current.get(focusAfterMove.current)?.focus();
    focusAfterMove.current = null;
  }, [names]);

  // While dragging, keep scrolling the list (then the page) whenever the pointer is near or past its
  // visible top or bottom edge — even if the pointer is held still — and keep the drop gap in step.
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const step = () => {
      const y = pointerY.current;
      if (listEl.current && autoScrollStep(listEl.current, y)) setDrag((d) => d && { ...d, gap: gapAt(itemEls.current, y) });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [dragging]);

  function drop() {
    if (!drag) return;
    const to = drag.gap > drag.from ? drag.gap - 1 : drag.gap;
    if (to !== drag.from) onMove(drag.from, to);
    setDrag(null);
  }

  function commitName(input: HTMLInputElement, index: number) {
    if (input.value === names[index]) return;
    const message = onRename(index, input.value);
    setError(message);
    if (message) input.value = names[index];
  }

  const preview = names.slice(0, 6).join(", ") + (names.length > 6 ? ", …" : "");

  return (
    <section className="rounded-lg border border-line">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-scene/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/70"
        onClick={onToggle}
      >
        <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 shrink-0 fill-current transition-transform ${open ? "rotate-90" : ""}`}>
          <path d="M4 2l5 4-5 4z" />
        </svg>
        <span className="font-medium">Characters</span>
        <span className="text-muted">({names.length})</span>
        {!open && names.length > 0 && <span className="min-w-0 truncate text-muted">{preview}</span>}
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-line px-3 py-3">
          <p className="text-xs text-muted">
            Scenes list their characters in this order. Drag ⠿ (or focus it and press ↑ ↓) to reorder.
          </p>
          {names.length > 0 && (
            <ol ref={listEl} className={`max-h-72 max-w-md overflow-auto ${drag ? "cursor-grabbing select-none" : ""}`}>
              {names.map((name, i) => (
                <li
                  key={name}
                  ref={(el) => void (itemEls.current[i] = el)}
                  className={`group/char border-t-2 py-0.5 ${drag?.gap === i && drag.from !== i && drag.from !== i - 1 ? "border-foreground" : "border-transparent"} ${drag?.from === i ? "opacity-40" : ""} ${i === names.length - 1 && drag?.gap === names.length && drag.from !== i ? "border-b-2 border-b-foreground" : ""}`}
                >
                  <div className="flex items-center gap-1">
                  <button
                    ref={(el) => {
                      if (!el) return;
                      gripEls.current.set(name, el);
                      return () => void gripEls.current.delete(name);
                    }}
                    type="button"
                    aria-label={`Move ${name}`}
                    title="Drag to move (or focus and use ↑ ↓)"
                    className="flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70"
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      pointerY.current = e.clientY;
                      setDrag({ from: i, gap: i });
                    }}
                    onPointerMove={(e) => {
                      pointerY.current = e.clientY;
                      if (drag) setDrag({ ...drag, gap: gapAt(itemEls.current, e.clientY) });
                    }}
                    onPointerUp={drop}
                    onPointerCancel={() => setDrag(null)}
                    onKeyDown={(e) => {
                      const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
                      if (to === null) return;
                      e.preventDefault();
                      if (to < 0 || to >= names.length) return;
                      focusAfterMove.current = name;
                      onMove(i, to);
                    }}
                  >
                    <svg aria-hidden viewBox="0 0 10 16" className="h-4 w-2.5 fill-current">
                      {[3, 8, 13].flatMap((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.4} />))}
                    </svg>
                  </button>
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">{i + 1}.</span>
                  <div className="relative min-w-0 flex-1">
                    <input
                      key={name}
                      defaultValue={name}
                      aria-label={`Character ${i + 1} name`}
                      maxLength={200}
                      className="h-7 w-full rounded bg-transparent px-1.5 pr-7 text-sm hover:bg-foreground/10 focus:bg-background focus:outline-none focus:ring-2 focus:ring-foreground/70"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitName(e.currentTarget, i);
                        } else if (e.key === "Escape") {
                          e.currentTarget.value = name;
                        }
                      }}
                      onBlur={(e) => commitName(e.currentTarget, i)}
                    />
                    <button
                      type="button"
                      aria-label={`Add ${name} to a scene`}
                      aria-expanded={adding?.name === name}
                      className="group/plus absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted opacity-0 hover:bg-foreground/15 hover:text-foreground focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 group-hover/char:opacity-100 group-focus-within/char:opacity-100"
                      onClick={() => setAdding(adding?.name === name ? null : { name, text: "", result: null })}
                    >
                      <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 stroke-current" strokeWidth={1.75} strokeLinecap="round">
                        <path d="M8 3v10M3 8h10" />
                      </svg>
                      {/* Shown on hover/focus (to the left, so the list's scrolling can't clip it). */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-xs font-medium text-background shadow group-hover/plus:block group-focus-visible/plus:block"
                      >
                        Add to scene
                      </span>
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    title="Remove from the list and from every scene"
                    className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted opacity-0 hover:text-foreground focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 group-hover/char:opacity-100 group-focus-within/char:opacity-100"
                    onClick={() => {
                      setError(null);
                      onRemove(i);
                    }}
                  >
                    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 stroke-current" strokeWidth={1.75} strokeLinecap="round">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                  </div>
                  {adding?.name === name && (
                    <form
                      className="ml-12 mt-1 flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const result = onAddToScene(name, adding.text);
                        setAdding({ name, text: result.ok ? "" : adding.text, result });
                      }}
                    >
                      <input
                        autoFocus
                        aria-label={`Scene number to add ${name} to`}
                        placeholder="Scene #"
                        inputMode="decimal"
                        maxLength={40}
                        className="input w-24 py-1"
                        value={adding.text}
                        onChange={(e) => setAdding({ ...adding, text: e.target.value, result: null })}
                        onKeyDown={(e) => e.key === "Escape" && setAdding(null)}
                      />
                      <button type="submit" className="btn-secondary px-3 py-1 text-sm" disabled={!adding.text.trim()}>Add</button>
                      <button type="button" className="text-sm text-muted hover:text-foreground" onClick={() => setAdding(null)}>Done</button>
                      <span role="status" className={`text-sm ${adding.result?.ok === false ? "text-red-300" : "text-muted"}`}>
                        {adding.result?.message}
                      </span>
                    </form>
                  )}
                </li>
              ))}
            </ol>
          )}
          <form
            className="flex max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const message = onAdd(newName);
              setError(message);
              if (!message) setNewName("");
            }}
          >
            <input
              aria-label="New character name"
              placeholder="Add a character"
              maxLength={200}
              className="input py-1.5"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="btn-secondary px-3 py-1.5 text-sm" disabled={!newName.trim()}>Add</button>
          </form>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        </div>
      )}
    </section>
  );
}
