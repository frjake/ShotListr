"use client";

import { useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";
import { saveShotlist } from "@/app/actions/shotlists";
import {
  ANGLE_OPTIONS,
  FRAMING_OPTIONS,
  INT_EXT_OPTIONS,
  ROW_KIND,
  TIME_OPTIONS,
  type CellOption,
  type RowKind,
} from "@/lib/constants";
import {
  blockEnd,
  cleanRow,
  deleteRows,
  dropTargets,
  emptyRow,
  moveRows,
  rowLabels,
  stepTarget,
  type RowData,
  type RowField,
} from "@/lib/rows";

type Column = { field: RowField; label: string; options?: CellOption[] };

const SCENE_COLUMNS: Column[] = [
  { field: "intExt", label: "Int./Ext.", options: INT_EXT_OPTIONS },
  { field: "location", label: "Location" },
  { field: "time", label: "Time", options: TIME_OPTIONS },
  { field: "characters", label: "Characters" },
];

const SHOT_COLUMNS: Column[] = [
  { field: "subject", label: "Subject" },
  { field: "framing", label: "Framing", options: FRAMING_OPTIONS },
  { field: "angle", label: "Angle", options: ANGLE_OPTIONS },
  { field: "description", label: "Description" },
];

const DATALISTS = [...SCENE_COLUMNS, ...SHOT_COLUMNS].filter((c) => c.options);

/** Number column + four data columns, shared by scene rows, shot rows and both header rows. */
const GRID = "grid grid-cols-[6rem_minmax(7rem,1fr)_minmax(9rem,1.5fr)_minmax(7rem,1fr)_minmax(13rem,2fr)]";
const CELL = "border-b border-r border-line last:border-r-0";

type EditorRow = RowData & { key: string };

const EMPTY_SHEET = "empty"; // focus target after deleting the last row

/** A block being dragged: rows [from, from + count), and the boundary it would land on. */
type Drag = { from: number; count: number; target: number };

export function ShotlistEditor({
  id,
  heading,
  initialTitle,
  initialRows,
}: {
  id?: string;
  heading: string;
  initialTitle: string;
  initialRows: RowData[];
}) {
  const [title, setTitle] = useState(initialTitle);
  const [rows, setRows] = useState<EditorRow[]>(() => initialRows.map((r, i) => ({ ...r, key: `r${i}` })));
  const nextKey = useRef(initialRows.length);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ key: string; viaKeyboard: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [state, action, pending] = useActionState(saveShotlist, undefined);

  const rowEls = useRef(new Map<string, HTMLDivElement>());
  const gripEls = useRef(new Map<string, HTMLButtonElement>());
  const scrollEl = useRef<HTMLDivElement>(null);
  const dialogEl = useRef<HTMLDialogElement>(null);
  const focusGripAfterRender = useRef<string | null>(null);

  const kinds = rows.map((r) => r.kind);
  const labels = rowLabels(kinds);
  const nounFor = (i: number) => (kinds[i] === ROW_KIND.SCENE ? "Scene" : "Shot");

  // Keyboard moves/deletes re-render rows; put focus back on a grip afterwards (or, when the
  // sheet is now empty, on the top "Insert Scene" button).
  useLayoutEffect(() => {
    const key = focusGripAfterRender.current;
    if (key === EMPTY_SHEET) scrollEl.current?.querySelector("button")?.focus();
    else if (key) gripEls.current.get(key)?.focus();
    focusGripAfterRender.current = null;
  }, [rows]);

  useEffect(() => {
    if (pendingDelete) dialogEl.current?.showModal();
  }, [pendingDelete]);

  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag]);

  function insertRow(index: number, kind: RowKind) {
    const key = `r${nextKey.current++}`;
    setRows((prev) => [...prev.slice(0, index), { ...emptyRow(kind), key }, ...prev.slice(index)]);
    setFocusKey(key);
  }

  function updateCell(key: string, field: RowField, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  /** Moves the block starting at `from` to boundary `to`; returns false if nothing changed. */
  function moveBlock(from: number, to: number, viaKeyboard: boolean) {
    const count = blockEnd(kinds, from) - from;
    if (to >= from && to <= from + count) return false;
    const key = rows[from].key;
    const next = moveRows(rows, from, count, to);
    const at = next.findIndex((r) => r.key === key);
    const extra = count > 1 ? ` and its ${count - 1} shot${count > 2 ? "s" : ""}` : "";
    setAnnouncement(`${nounFor(from)} ${labels[from]}${extra} moved; now ${nounFor(from).toLowerCase()} ${rowLabels(next.map((r) => r.kind))[at]}`);
    if (viaKeyboard) focusGripAfterRender.current = key;
    setRows(next);
    return true;
  }

  function removeRows(index: number, count: number, viaKeyboard: boolean) {
    const next = deleteRows(rows, index, count);
    const extra = count > 1 ? ` and its ${count - 1} shot${count > 2 ? "s" : ""}` : "";
    setAnnouncement(`Deleted ${nounFor(index).toLowerCase()} ${labels[index]}${extra}`);
    if (viaKeyboard) focusGripAfterRender.current = (next[index] ?? next[index - 1])?.key ?? EMPTY_SHEET;
    setRows(next);
  }

  function requestDelete(index: number, viaKeyboard: boolean) {
    const hasShots = kinds[index] === ROW_KIND.SCENE && blockEnd(kinds, index) - index > 1;
    if (hasShots) setPendingDelete({ key: rows[index].key, viaKeyboard });
    else removeRows(index, 1, viaKeyboard);
  }

  // ----- Pointer drag (the grip has pointer capture, so all move/up events come to it) -----

  function targetAt(clientY: number, from: number) {
    const rects = rows.map((r) => rowEls.current.get(r.key)!.getBoundingClientRect());
    const yOf = (b: number) => (b < rects.length ? rects[b].top : rects[rects.length - 1].bottom);
    return dropTargets(kinds, from).reduce((best, b) =>
      Math.abs(clientY - yOf(b)) < Math.abs(clientY - yOf(best)) ? b : best,
    );
  }

  function onGripPointerDown(e: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: index, count: blockEnd(kinds, index) - index, target: index });
  }

  function onGripPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const box = scrollEl.current?.getBoundingClientRect();
    if (box && e.clientY < box.top + 72) scrollEl.current!.scrollTop -= 12; // below the sticky header
    if (box && e.clientY > box.bottom - 32) scrollEl.current!.scrollTop += 12;
    const target = targetAt(e.clientY, drag.from);
    if (target !== drag.target) setDrag({ ...drag, target });
  }

  function onGripPointerUp() {
    if (drag) moveBlock(drag.from, drag.target, false);
    setDrag(null);
  }

  function onGripKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const to = stepTarget(kinds, index, e.key === "ArrowUp" ? -1 : 1);
    if (to !== null) moveBlock(index, to, true);
  }

  const payload = JSON.stringify(rows.map(cleanRow));
  const deleting = pendingDelete ? rows.findIndex((r) => r.key === pendingDelete.key) : -1;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <div className="ml-auto flex items-center gap-3">
          {state?.error ? (
            <p role="alert" className="text-sm text-red-300">{state.error}</p>
          ) : (
            state?.savedAt && (
              <p className="text-sm text-muted">Saved at {new Date(state.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
            )
          )}
          {/* Only the button is inside the form, so Enter in a cell doesn't submit. */}
          <form action={action}>
            {id && <input type="hidden" name="id" value={id} />}
            <input type="hidden" name="title" value={title} />
            <input type="hidden" name="rows" value={payload} />
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </form>
        </div>
      </div>

      <div>
        <label htmlFor="shotlist-title" className="label">Title</label>
        <input
          id="shotlist-title"
          className="input mt-1 max-w-md"
          placeholder="Untitled shotlist"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div
        ref={scrollEl}
        className={`max-h-[calc(100dvh-15rem)] min-h-64 overflow-auto rounded-lg border border-line ${drag ? "cursor-grabbing select-none" : ""}`}
      >
        <div className="min-w-[48rem] pb-12">
          <div className="sticky top-0 z-20 text-xs font-semibold uppercase tracking-wide">
            <HeaderRow className="bg-scene" number="Scene #" columns={SCENE_COLUMNS} />
            <HeaderRow className="bg-header text-muted" number="Shot #" columns={SHOT_COLUMNS} />
          </div>

          <InsertZone dragging={!!drag} dropHere={drag?.target === 0} onInsert={(kind) => insertRow(0, kind)} />
          {rows.map((row, i) => (
            <div key={row.key}>
              <SheetRow
                row={row}
                label={labels[i]}
                autoFocus={row.key === focusKey}
                lifted={!!drag && i >= drag.from && i < drag.from + drag.count}
                rowRef={(el) => {
                  if (!el) return;
                  rowEls.current.set(row.key, el);
                  return () => void rowEls.current.delete(row.key);
                }}
                gripRef={(el) => {
                  if (!el) return;
                  gripEls.current.set(row.key, el);
                  return () => void gripEls.current.delete(row.key);
                }}
                onChange={(field, value) => updateCell(row.key, field, value)}
                onGripPointerDown={(e) => onGripPointerDown(e, i)}
                onGripPointerMove={onGripPointerMove}
                onGripPointerUp={onGripPointerUp}
                onGripPointerCancel={() => setDrag(null)}
                onGripKeyDown={(e) => onGripKeyDown(e, i)}
                onDelete={(viaKeyboard) => requestDelete(i, viaKeyboard)}
              />
              <InsertZone dragging={!!drag} dropHere={drag?.target === i + 1} onInsert={(kind) => insertRow(i + 1, kind)} />
            </div>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">{announcement}</p>

      <dialog
        ref={dialogEl}
        onClose={() => setPendingDelete(null)}
        className="m-auto w-[min(34rem,calc(100%-2rem))] rounded-lg border border-line bg-surface p-5 text-foreground shadow-xl backdrop:bg-black/60"
      >
        {deleting >= 0 && (
          <DeleteSceneDialog
            label={labels[deleting]}
            shotCount={blockEnd(kinds, deleting) - deleting - 1}
            previousScene={labels.slice(0, deleting).findLast((_, j) => kinds[j] === ROW_KIND.SCENE) ?? null}
            onChoose={(withShots) => {
              const count = withShots ? blockEnd(kinds, deleting) - deleting : 1;
              removeRows(deleting, count, pendingDelete!.viaKeyboard);
              dialogEl.current?.close();
            }}
            onCancel={() => dialogEl.current?.close()}
          />
        )}
      </dialog>

      {DATALISTS.map((c) => (
        <datalist key={c.field} id={`options-${c.field}`}>
          {c.options!.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </datalist>
      ))}
    </div>
  );
}

function HeaderRow({ className, number, columns }: { className: string; number: string; columns: Column[] }) {
  return (
    <div className={`${GRID} ${className}`}>
      <div className={`${CELL} py-1.5 pl-7 pr-2`}>{number}</div>
      {columns.map((c) => (
        <div key={c.field} className={`${CELL} px-2 py-1.5`}>{c.label}</div>
      ))}
    </div>
  );
}

function SheetRow({
  row,
  label,
  autoFocus,
  lifted,
  rowRef,
  gripRef,
  onChange,
  onGripPointerDown,
  onGripPointerMove,
  onGripPointerUp,
  onGripPointerCancel,
  onGripKeyDown,
  onDelete,
}: {
  row: EditorRow;
  label: string;
  autoFocus: boolean;
  lifted: boolean;
  rowRef: React.RefCallback<HTMLDivElement>;
  gripRef: React.RefCallback<HTMLButtonElement>;
  onChange: (field: RowField, value: string) => void;
  onGripPointerDown: React.PointerEventHandler<HTMLButtonElement>;
  onGripPointerMove: React.PointerEventHandler<HTMLButtonElement>;
  onGripPointerUp: React.PointerEventHandler<HTMLButtonElement>;
  onGripPointerCancel: React.PointerEventHandler<HTMLButtonElement>;
  onGripKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
  onDelete: (viaKeyboard: boolean) => void;
}) {
  const isScene = row.kind === ROW_KIND.SCENE;
  const columns = isScene ? SCENE_COLUMNS : SHOT_COLUMNS;
  const noun = isScene ? "Scene" : "Shot";
  const reveal = "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus:opacity-100";
  const iconBtn = `flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 ${reveal}`;

  return (
    <div ref={rowRef} className={`group/row ${GRID} text-sm ${isScene ? "bg-scene font-medium" : ""} ${lifted ? "opacity-40" : ""}`}>
      <div className={`${CELL} flex items-center gap-0.5 px-1`}>
        <button
          ref={gripRef}
          type="button"
          aria-label={`Move ${noun.toLowerCase()} ${label}${isScene ? " and its shots" : ""}`}
          title="Drag to move (or focus and use ↑ ↓)"
          className={`${iconBtn} cursor-grab touch-none`}
          onPointerDown={onGripPointerDown}
          onPointerMove={onGripPointerMove}
          onPointerUp={onGripPointerUp}
          onPointerCancel={onGripPointerCancel}
          onKeyDown={onGripKeyDown}
        >
          <svg aria-hidden viewBox="0 0 10 16" className="h-4 w-2.5 fill-current">
            {[3, 8, 13].flatMap((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.4} />))}
          </svg>
        </button>
        <span className={`flex-1 tabular-nums ${isScene ? "font-semibold" : "text-muted"}`}>{label}</span>
        <button
          type="button"
          aria-label={`Delete ${noun.toLowerCase()} ${label}`}
          title={`Delete ${noun.toLowerCase()}`}
          className={iconBtn}
          // detail is 0 when the click came from the keyboard (Enter/Space).
          onClick={(e) => onDelete(e.detail === 0)}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 stroke-current" strokeWidth={1.75} strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      {columns.map((c, ci) => (
        <div key={c.field} className={CELL}>
          <input
            aria-label={`${noun} ${label} ${c.label}`}
            className="h-full w-full bg-transparent px-2 py-1.5 placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-foreground/70"
            list={c.options ? `options-${c.field}` : undefined}
            maxLength={1000}
            autoFocus={autoFocus && ci === 0} // focus the row the user just inserted
            value={row[c.field]}
            onChange={(e) => onChange(c.field, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

function DeleteSceneDialog({
  label,
  shotCount,
  previousScene,
  onChoose,
  onCancel,
}: {
  label: string;
  shotCount: number;
  previousScene: string | null;
  onChoose: (withShots: boolean) => void;
  onCancel: () => void;
}) {
  const shots = `${shotCount} shot${shotCount === 1 ? "" : "s"}`;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Delete scene {label}?</h2>
      <p className="text-sm text-muted">
        Scene {label} has {shots}. Do you want to delete {shotCount === 1 ? "it" : "them"} too?{" "}
        {previousScene
          ? `If you keep ${shotCount === 1 ? "it" : "them"}, ${shotCount === 1 ? "it joins" : "they join"} scene ${previousScene}.`
          : `If you keep ${shotCount === 1 ? "it" : "them"}, ${shotCount === 1 ? "it" : "they"} won't belong to any scene.`}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:whitespace-nowrap">
        <button type="button" className="btn-danger" onClick={() => onChoose(true)}>
          Delete scene and {shots}
        </button>
        <button type="button" className="btn-secondary" onClick={() => onChoose(false)}>
          Delete scene only
        </button>
        <button type="button" className="btn-ghost sm:mr-auto" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Invisible strip straddling a row boundary. Hovering (or tabbing into) it shows an insertion
 * line and an "Insert Scene / Insert Shot" pop-up centred on it. The pop-up must stay shorter
 * than a row so it never covers the neighbouring boundaries' strips. While a row is being
 * dragged the pop-ups are off and the line marks where the row will land.
 */
function InsertZone({
  dragging,
  dropHere,
  onInsert,
}: {
  dragging: boolean;
  dropHere: boolean;
  onInsert: (kind: RowKind) => void;
}) {
  const btn = "rounded px-2 py-0.5 text-xs font-medium hover:bg-foreground hover:text-background focus:bg-foreground focus:text-background focus:outline-none";
  const show = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";

  if (dragging) {
    return (
      <div className="relative h-0">
        {dropHere && <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 -translate-y-1/2 bg-foreground" />}
      </div>
    );
  }

  return (
    <div className="group relative h-0">
      <div className="absolute inset-x-0 -top-[5px] z-10 h-[10px] group-hover:z-30 group-focus-within:z-30">
        <div className={`pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-foreground ${show}`} />
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-1 rounded-md border border-line bg-surface p-0.5 shadow-lg group-hover:pointer-events-auto group-focus-within:pointer-events-auto ${show}`}
        >
          <button type="button" className={btn} onClick={() => onInsert(ROW_KIND.SCENE)}>Insert Scene</button>
          <button type="button" className={btn} onClick={() => onInsert(ROW_KIND.SHOT)}>Insert Shot</button>
        </div>
      </div>
    </div>
  );
}
