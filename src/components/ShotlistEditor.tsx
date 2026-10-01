"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { saveShotlist } from "@/app/actions/shotlists";
import { ChoiceCard, ChoiceDialog } from "@/components/ChoiceDialog";
import { ComboboxInput } from "@/components/ComboboxInput";
import { useNavigationGuard } from "@/components/NavigationGuard";
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
  renumberAfterDelete,
  moveRows,
  planSceneAt,
  renumberScene,
  rowLabels,
  shiftScenes,
  stepTarget,
  type RowData,
  type DeleteRenumbering,
  type RowField,
  type RunShift,
  type ScenePlacement,
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

/** Number column + four data columns, shared by scene rows, shot rows and both header rows. */
const GRID = "grid grid-cols-[7rem_minmax(7rem,1fr)_minmax(9rem,1.5fr)_minmax(7rem,1fr)_minmax(13rem,2fr)]";
const CELL = "border-b border-r border-line last:border-r-0";

type EditorRow = RowData & { key: string };

/** A block being dragged: rows [from, from + count), and the boundary it would land on. */
type Drag = { from: number; count: number; target: number };

/** What to focus once rows re-render after a keyboard action. */
type FocusTarget = { key: string; part: "grip" | "number" } | "empty-sheet";

/** A choice the user has to make in the dialog before a change is applied. */
type Pending =
  | { type: "delete"; key: string; viaKeyboard: boolean }
  | { type: "insert"; boundary: number; placement: Extract<ScenePlacement, { type: "choose" }> }
  | { type: "move"; from: number; to: number; placement: Extract<ScenePlacement, { type: "choose" }>; viaKeyboard: boolean }
  // Saving without a title asks for one first; `proceed` is where to go afterwards, if leaving.
  | { type: "title"; proceed: (() => void) | null }
  // Leaving with unsaved changes: save first, leave anyway, or stay.
  | { type: "leave"; proceed: () => void };

/** The editor's save state: the server's answer plus what was saved, to tell when there are unsaved changes. */
type EditorSaveState = { error?: string; savedAt?: number; snapshot?: string } | undefined;

/** Everything a save sends, as one comparable string. */
const snapshotOf = (title: string, rowsJson: string) => `${title}\u0000${rowsJson}`;

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
  const [pendingChoice, setPendingChoice] = useState<Pending | null>(null);
  const [numberError, setNumberError] = useState<{ key: string; message: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Which boundary's Insert pop-up is open. Only one at a time: showing one closes any other at once.
  const [openZone, setOpenZone] = useState<number | null>(null);
  const zoneCloseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();
  const { setGuard } = useNavigationGuard();
  const saveFormEl = useRef<HTMLFormElement>(null);
  // Where to go once the save in flight succeeds ("Save and leave").
  const leaveAfterSave = useRef<(() => void) | null>(null);
  const [initialSnapshot] = useState(() => snapshotOf(initialTitle, JSON.stringify(initialRows.map(cleanRow))));

  const [state, action, pending] = useActionState(async (prev: EditorSaveState, formData: FormData): Promise<EditorSaveState> => {
    const leave = leaveAfterSave.current;
    leaveAfterSave.current = null;
    const result = await saveShotlist(undefined, formData);
    if (!result?.savedAt || !result.id) return { snapshot: prev?.snapshot, error: result?.error ?? "Couldn't save the shotlist" };
    if (leave) leave();
    else if (!id) router.replace(`/shotlists/${result.id}`); // a new shotlist moves to its own page
    return { savedAt: result.savedAt, snapshot: snapshotOf(String(formData.get("title")), String(formData.get("rows"))) };
  }, undefined);

  const rowEls = useRef(new Map<string, HTMLDivElement>());
  const gripEls = useRef(new Map<string, HTMLButtonElement>());
  const numberEls = useRef(new Map<string, HTMLInputElement>());
  const scrollEl = useRef<HTMLDivElement>(null);
  const dialogEl = useRef<HTMLDialogElement>(null);
  const focusAfterRender = useRef<FocusTarget | null>(null);

  const kinds = rows.map((r) => r.kind);
  const labels = rowLabels(rows);
  const nounFor = (i: number) => (kinds[i] === ROW_KIND.SCENE ? "Scene" : "Shot");
  const withShots = (count: number) => (count > 1 ? ` and its ${count - 1} shot${count > 2 ? "s" : ""}` : "");

  // Keyboard moves/deletes/renumbers re-render rows; put focus back where the user was (or, when
  // the sheet is now empty, on the top "Insert Scene" button).
  useLayoutEffect(() => {
    const target = focusAfterRender.current;
    focusAfterRender.current = null;
    if (target === "empty-sheet") scrollEl.current?.querySelector("button")?.focus();
    else if (target) (target.part === "grip" ? gripEls : numberEls).current.get(target.key)?.focus();
  }, [rows]);

  useEffect(() => {
    if (pendingChoice && !dialogEl.current?.open) dialogEl.current?.showModal();
  }, [pendingChoice]);

  useEffect(() => {
    if (!numberError) return;
    const timer = setTimeout(() => setNumberError(null), 5000);
    return () => clearTimeout(timer);
  }, [numberError]);

  useEffect(() => () => clearTimeout(zoneCloseTimer.current), []);

  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag]);

  // ----- Inserting -----

  function showZone(boundary: number) {
    clearTimeout(zoneCloseTimer.current);
    setOpenZone(boundary);
  }

  /** Closes a pop-up after a short delay, so the pointer can cross from the strip into it. */
  function hideZoneSoon(boundary: number) {
    clearTimeout(zoneCloseTimer.current);
    zoneCloseTimer.current = setTimeout(() => setOpenZone((open) => (open === boundary ? null : open)), 150);
  }

  function insertFromZone(boundary: number, kind: RowKind) {
    clearTimeout(zoneCloseTimer.current);
    setOpenZone(null);
    insertRow(boundary, kind);
  }


  function insertRow(boundary: number, kind: RowKind) {
    if (kind === ROW_KIND.SHOT) return placeNewRow(rows, boundary, emptyRow(kind));
    const placement = planSceneAt(rows, boundary);
    if (placement.type === "free") placeNewRow(rows, boundary, { ...emptyRow(kind), sceneNumber: placement.number });
    else setPendingChoice({ type: "insert", boundary, placement });
  }

  function placeNewRow(base: EditorRow[], boundary: number, row: RowData) {
    const key = `r${nextKey.current++}`;
    setRows([...base.slice(0, boundary), { ...row, key }, ...base.slice(boundary)]);
    setFocusKey(key);
  }

  function updateCell(key: string, field: RowField, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  // ----- Moving -----

  /** Moves the block starting at `from` to boundary `to`. A scene is renumbered for where it lands. */
  function moveBlock(from: number, to: number, viaKeyboard: boolean) {
    const count = blockEnd(kinds, from) - from;
    if (to >= from && to <= from + count) return;
    if (kinds[from] === ROW_KIND.SHOT) return commitMove(moveRows(rows, from, count, to), from, count, viaKeyboard);

    const rest = deleteRows(rows, from, count);
    const placement = planSceneAt(rest, to > from ? to - count : to);
    if (placement.type === "free") placeSceneBlock(from, to, placement.number, null, viaKeyboard);
    else setPendingChoice({ type: "move", from, to, placement, viaKeyboard });
  }

  /** Puts the scene block at `from` on boundary `to` as scene `number`, first shifting a run if asked. */
  function placeSceneBlock(from: number, to: number, number: string, shift: RunShift | null, viaKeyboard: boolean) {
    const count = blockEnd(kinds, from) - from;
    const block = [{ ...rows[from], sceneNumber: number }, ...rows.slice(from + 1, from + count)];
    let rest = deleteRows(rows, from, count);
    if (shift) rest = shiftScenes(rest, shift, 1);
    const at = to > from ? to - count : to;
    commitMove([...rest.slice(0, at), ...block, ...rest.slice(at)], from, count, viaKeyboard);
  }

  function commitMove(next: EditorRow[], from: number, count: number, viaKeyboard: boolean) {
    const key = rows[from].key;
    const now = rowLabels(next)[next.findIndex((r) => r.key === key)];
    setAnnouncement(`${nounFor(from)} ${labels[from]}${withShots(count)} moved; now ${nounFor(from).toLowerCase()} ${now}`);
    if (viaKeyboard) focusAfterRender.current = { key, part: "grip" };
    setRows(next);
  }

  // ----- Deleting -----

  function removeRows(index: number, count: number, closeGap: RunShift | null, viaKeyboard: boolean) {
    let next = deleteRows(rows, index, count);
    if (closeGap) next = shiftScenes(next, closeGap, -1);
    setAnnouncement(`Deleted ${nounFor(index).toLowerCase()} ${labels[index]}${withShots(count)}`);
    if (viaKeyboard) {
      const neighbour = next[index] ?? next[index - 1];
      focusAfterRender.current = neighbour ? { key: neighbour.key, part: "grip" } : "empty-sheet";
    }
    setRows(next);
  }

  function requestDelete(index: number, viaKeyboard: boolean) {
    const isScene = kinds[index] === ROW_KIND.SCENE;
    const hasShots = isScene && blockEnd(kinds, index) - index > 1;
    if (hasShots || (isScene && renumberAfterDelete(rows, index))) {
      setPendingChoice({ type: "delete", key: rows[index].key, viaKeyboard });
    } else {
      removeRows(index, 1, null, viaKeyboard);
    }
  }

  // ----- Renumbering -----

  /** Applies a typed scene number. Returns false if it was refused (the input then reverts). */
  function renumber(index: number, text: string, keepFocus: boolean): boolean {
    const row = rows[index];
    const result = renumberScene(rows, index, text);
    if (result.status !== "ok") {
      if (result.status === "unchanged") return true;
      setNumberError({
        key: row.key,
        message:
          result.status === "exists"
            ? `Scene ${result.number} already exists. The number wasn't changed.`
            : `"${result.number}" isn't a scene number. Use numbers like 12, 12.1 or 12.0.1.`,
      });
      return false;
    }
    setNumberError(null);
    const moved = result.rows.findIndex((r) => r.key === row.key) !== index;
    setAnnouncement(`Scene ${row.sceneNumber} renumbered to ${result.number}${moved ? " and moved into order" : ""}`);
    if (keepFocus) focusAfterRender.current = { key: row.key, part: "number" };
    setRows(result.rows);
    return true;
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
  const unsaved = snapshotOf(title, payload) !== (state?.snapshot ?? initialSnapshot);

  // While there are unsaved changes, in-app navigation asks first (nav links, Log out) and the
  // browser warns before closing or reloading the tab (it doesn't allow a custom prompt there).
  const requestLeave = useCallback((proceed: () => void) => setPendingChoice({ type: "leave", proceed }), []);
  useEffect(() => {
    if (!unsaved) return;
    setGuard(requestLeave);
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      setGuard(null);
      window.removeEventListener("beforeunload", warn);
    };
  }, [unsaved, setGuard, requestLeave]);

  /** Saves with `newTitle` (from the title prompt), then goes to `proceed` if leaving. */
  function saveWithTitle(newTitle: string, proceed: (() => void) | null) {
    flushSync(() => {
      setTitle(newTitle);
      setPendingChoice(null);
    });
    dialogEl.current?.close();
    leaveAfterSave.current = proceed;
    saveFormEl.current?.requestSubmit();
  }

  function saveAndLeave(proceed: () => void) {
    if (!title.trim()) return setPendingChoice({ type: "title", proceed });
    closeDialog();
    leaveAfterSave.current = proceed;
    saveFormEl.current?.requestSubmit();
  }
  // Clear the choice in the same update as the change it made, so the dialog never renders
  // against rows it no longer matches (the <dialog> close event arrives later).
  const closeDialog = () => {
    setPendingChoice(null);
    dialogEl.current?.close();
  };

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
          <form
            ref={saveFormEl}
            action={action}
            onSubmit={(e) => {
              // No title yet: ask for one instead of saving (a prevented submit doesn't run the action).
              if (title.trim()) return;
              e.preventDefault();
              setPendingChoice({ type: "title", proceed: null });
            }}
          >
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
          placeholder="Add a title"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div
        ref={scrollEl}
        data-sheet
        className={`max-h-[calc(100dvh-15rem)] min-h-64 overflow-auto rounded-lg border border-line ${drag ? "cursor-grabbing select-none" : ""}`}
      >
        <div className="min-w-[49rem] pb-12">
          <div className="sticky top-0 z-20 text-xs font-semibold uppercase tracking-wide">
            <HeaderRow className="bg-scene" number="Scene #" columns={SCENE_COLUMNS} />
            <HeaderRow className="bg-header text-muted" number="Shot #" columns={SHOT_COLUMNS} />
          </div>

          <InsertZone boundary={0} drag={drag} open={openZone === 0} onShow={showZone} onHide={hideZoneSoon} onInsert={insertFromZone} />
          {rows.map((row, i) => (
            <div key={row.key}>
              <SheetRow
                row={row}
                label={labels[i]}
                autoFocus={row.key === focusKey}
                lifted={!!drag && i >= drag.from && i < drag.from + drag.count}
                numberError={numberError?.key === row.key ? numberError.message : null}
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
                numberRef={(el) => {
                  if (!el) return;
                  numberEls.current.set(row.key, el);
                  return () => void numberEls.current.delete(row.key);
                }}
                onChange={(field, value) => updateCell(row.key, field, value)}
                onRenumber={(text, keepFocus) => renumber(i, text, keepFocus)}
                onGripPointerDown={(e) => onGripPointerDown(e, i)}
                onGripPointerMove={onGripPointerMove}
                onGripPointerUp={onGripPointerUp}
                onGripPointerCancel={() => setDrag(null)}
                onGripKeyDown={(e) => onGripKeyDown(e, i)}
                onDelete={(viaKeyboard) => requestDelete(i, viaKeyboard)}
              />
              <InsertZone
                boundary={i + 1}
                drag={drag}
                open={openZone === i + 1}
                onShow={showZone}
                onHide={hideZoneSoon}
                onInsert={insertFromZone}
              />
            </div>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">{announcement}</p>

      <dialog
        ref={dialogEl}
        // Escape closes it. The close event is queued, so ignore a late one that arrives after
        // another choice has already reopened the dialog.
        onClose={(e) => !e.currentTarget.open && setPendingChoice(null)}
        className="m-auto w-[min(34rem,calc(100%-2rem))] rounded-lg border border-line bg-surface p-5 text-foreground shadow-xl backdrop:bg-black/60"
      >
        {pendingChoice?.type === "delete" &&
          (() => {
            const index = rows.findIndex((r) => r.key === pendingChoice.key);
            if (index === -1) return null;
            const count = blockEnd(kinds, index) - index;
            return (
              <DeleteSceneDialog
                label={labels[index]}
                shotCount={count - 1}
                previousScene={rows.slice(0, index).findLast((r) => r.kind === ROW_KIND.SCENE)?.sceneNumber ?? null}
                renumbering={renumberAfterDelete(rows, index)}
                onConfirm={({ deleteShots, shift }) => {
                  removeRows(index, deleteShots ? count : 1, shift, pendingChoice.viaKeyboard);
                  closeDialog();
                }}
                onCancel={closeDialog}
              />
            );
          })()}
        {(pendingChoice?.type === "insert" || pendingChoice?.type === "move") && (
          <SceneNumberDialog
            title={pendingChoice.type === "insert" ? "Number the new scene" : `Move scene ${labels[pendingChoice.from]}`}
            placement={pendingChoice.placement}
            onChoose={({ number, shift }) => {
              if (pendingChoice.type === "insert") {
                const base = shift ? shiftScenes(rows, shift, 1) : rows;
                placeNewRow(base, pendingChoice.boundary, { ...emptyRow(ROW_KIND.SCENE), sceneNumber: number });
              } else {
                placeSceneBlock(pendingChoice.from, pendingChoice.to, number, shift, pendingChoice.viaKeyboard);
              }
              closeDialog();
            }}
            onCancel={closeDialog}
          />
        )}
        {pendingChoice?.type === "title" && (
          <TitleDialog
            leaving={!!pendingChoice.proceed}
            onSave={(newTitle) => saveWithTitle(newTitle, pendingChoice.proceed)}
            onCancel={closeDialog}
          />
        )}
        {pendingChoice?.type === "leave" && (
          <ChoiceDialog
            title="Save your changes?"
            body="This shotlist has changes that haven't been saved."
            cancelLabel="Stay on this page"
            onCancel={closeDialog}
          >
            <ChoiceCard
              autoFocus
              title="Save and leave"
              detail={title.trim() ? "Saves the shotlist, then continues" : "Asks for a title, saves the shotlist, then continues"}
              onClick={() => saveAndLeave(pendingChoice.proceed)}
            />
            <ChoiceCard
              title="Leave without saving"
              detail="Changes since the last save are lost"
              onClick={() => {
                closeDialog();
                pendingChoice.proceed();
              }}
            />
          </ChoiceDialog>
        )}
      </dialog>
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
  numberError,
  rowRef,
  gripRef,
  numberRef,
  onChange,
  onRenumber,
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
  numberError: string | null;
  rowRef: React.RefCallback<HTMLDivElement>;
  gripRef: React.RefCallback<HTMLButtonElement>;
  numberRef: React.RefCallback<HTMLInputElement>;
  onChange: (field: RowField, value: string) => void;
  onRenumber: (text: string, keepFocus: boolean) => boolean;
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
  const cellInput = "h-full w-full bg-transparent px-2 py-1.5 placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-foreground/70";

  /** Commits a typed scene number; a refused one snaps back to the current number. */
  function commitNumber(input: HTMLInputElement, keepFocus: boolean) {
    if (input.value === row.sceneNumber) return;
    if (!onRenumber(input.value, keepFocus)) input.value = row.sceneNumber;
  }

  return (
    <div ref={rowRef} className={`group/row ${GRID} text-sm ${isScene ? "bg-scene font-medium" : ""} ${lifted ? "opacity-40" : ""}`}>
      <div className={`${CELL} relative flex items-center gap-0.5 px-1`}>
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
        {isScene ? (
          <input
            // Remount when the number changes so the field shows the new value.
            key={row.sceneNumber}
            ref={numberRef}
            defaultValue={row.sceneNumber}
            aria-label={`Scene ${label} number`}
            aria-invalid={numberError ? true : undefined}
            title="Type a new scene number, then press Enter"
            inputMode="decimal"
            maxLength={40}
            className="h-7 min-w-0 flex-1 rounded bg-transparent px-1 font-semibold tabular-nums hover:bg-foreground/10 focus:bg-background focus:outline-none focus:ring-2 focus:ring-foreground/70"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitNumber(e.currentTarget, true);
              } else if (e.key === "Escape") {
                e.currentTarget.value = row.sceneNumber;
              }
            }}
            onBlur={(e) => commitNumber(e.currentTarget, false)}
          />
        ) : (
          <span className="flex-1 px-1 tabular-nums text-muted">{label}</span>
        )}
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
        {numberError && (
          <p role="alert" className="absolute left-1 top-full z-30 mt-1 w-64 rounded-md bg-red-600 px-2 py-1.5 text-xs font-normal text-white shadow-lg">
            {numberError}
          </p>
        )}
      </div>
      {columns.map((c, ci) => (
        <div key={c.field} className={CELL}>
          {c.options ? (
            <ComboboxInput
              aria-label={`${noun} ${label} ${c.label}`}
              className={cellInput}
              options={c.options}
              maxLength={1000}
              autoFocus={autoFocus && ci === 0} // focus the row the user just inserted
              value={row[c.field]}
              onChange={(value) => onChange(c.field, value)}
            />
          ) : (
            <input
              aria-label={`${noun} ${label} ${c.label}`}
              className={cellInput}
              maxLength={1000}
              autoFocus={autoFocus && ci === 0}
              value={row[c.field]}
              onChange={(e) => onChange(c.field, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const range = (from: string, to: string) => (from === to ? from : `${from}–${to}`);
const plural = (from: string, to: string) => (from === to ? "scene" : "scenes");
const renumbers = (r: RunShift) => `Renumbers ${plural(r.from, r.to)} ${range(r.from, r.to)} to ${range(r.newFrom, r.newTo)}`;

/** Asks for a title when saving a shotlist that doesn't have one. */
function TitleDialog({ leaving, onSave, onCancel }: { leaving: boolean; onSave: (title: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSave(value.trim());
      }}
    >
      <h2 className="text-lg font-semibold">Name your shotlist</h2>
      <p className="text-sm text-muted">A shotlist needs a title before it can be saved{leaving ? ", then you'll continue." : "."}</p>
      <div>
        <label htmlFor="title-prompt" className="label">Title</label>
        <input
          id="title-prompt"
          autoFocus
          className="input mt-1"
          placeholder="e.g. Kitchen scene"
          maxLength={200}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={!value.trim()}>{leaving ? "Save and leave" : "Save"}</button>
      </div>
    </form>
  );
}

/**
 * Numbering a scene that's being inserted or moved above another scene: a subscene, the next
 * number renumbering later scenes up to the first gap (or nothing, when the number is free), or
 * the next number renumbering all of them. Options that would do the same thing are merged.
 */
function SceneNumberDialog({
  title,
  placement,
  onChoose,
  onCancel,
}: {
  title: string;
  placement: Extract<ScenePlacement, { type: "choose" }>;
  onChoose: (choice: { number: string; shift: RunShift | null }) => void;
  onCancel: () => void;
}) {
  const { after, before, subscene, number, untilGap, all } = placement;
  const sameShift = untilGap?.to === all.to;

  return (
    <ChoiceDialog
      title={title}
      body={after ? `It goes between scene ${after} and scene ${before}.` : `It goes before scene ${before}.`}
      onCancel={onCancel}
    >
      <ChoiceCard title={`Make it scene ${subscene}`} detail="A subscene; no other numbers change" onClick={() => onChoose({ number: subscene, shift: null })} />
      {!untilGap ? (
        <ChoiceCard title={`Make it scene ${number}`} detail="No other numbers change" onClick={() => onChoose({ number, shift: null })} />
      ) : (
        !sameShift && (
          <ChoiceCard
            title={`Make it scene ${number}, renumber until the gap`}
            detail={`${renumbers(untilGap)}; scenes after the gap keep their numbers`}
            onClick={() => onChoose({ number, shift: untilGap })}
          />
        )
      )}
      <ChoiceCard
        title={`Make it scene ${number}, renumber ${sameShift ? "the scenes after it" : "all later scenes"}`}
        detail={renumbers(all)}
        onClick={() => onChoose({ number, shift: all })}
      />
    </ChoiceDialog>
  );
}

/**
 * Deleting a scene, in the same card style as SceneNumberDialog. Up to two questions, asked in
 * turn: what to do with its shots (if it has any), then — if scenes come after it — its number:
 * leave a gap, renumber until the gap, or renumber all later scenes. Only options that would do
 * something different are shown (see `renumberAfterDelete`).
 */
function DeleteSceneDialog({
  label,
  shotCount,
  previousScene,
  renumbering,
  onConfirm,
  onCancel,
}: {
  label: string;
  shotCount: number;
  previousScene: string | null;
  renumbering: DeleteRenumbering | null;
  onConfirm: (choice: { deleteShots: boolean; shift: RunShift | null }) => void;
  onCancel: () => void;
}) {
  // The answer to the shots question, once given (null while it's being asked or not needed).
  const [deleteShots, setDeleteShots] = useState<boolean | null>(null);
  const shots = `${shotCount} shot${shotCount === 1 ? "" : "s"}`;
  const theShots = shotCount === 1 ? "The shot" : "The shots";
  const title = `Delete scene ${label}?`;

  if (shotCount > 0 && deleteShots === null) {
    const then = renumbering ? "; then choose what happens to the scene numbers" : "";
    const choose = (withShots: boolean) =>
      renumbering ? setDeleteShots(withShots) : onConfirm({ deleteShots: withShots, shift: null });
    return (
      <ChoiceDialog key="shots" title={title} body={`Scene ${label} has ${shots}.`} onCancel={onCancel}>
        <ChoiceCard
          autoFocus
          title={`Delete scene ${label} and its ${shots}`}
          detail={`${theShots} ${shotCount === 1 ? "is" : "are"} deleted too${then}`}
          onClick={() => choose(true)}
        />
        <ChoiceCard
          title={`Delete scene ${label}, keep its ${shots}`}
          detail={`${theShots} ${previousScene ? `${shotCount === 1 ? "joins" : "join"} scene ${previousScene}` : "won't belong to any scene"}${then}`}
          onClick={() => choose(false)}
        />
      </ChoiceDialog>
    );
  }

  // Only reached with scenes after it (otherwise the shots answer, or no dialog, deletes directly).
  const { untilGap, all } = renumbering!;
  const done = (shift: RunShift | null) => onConfirm({ deleteShots: deleteShots ?? false, shift });
  const shotsNote = deleteShots === null ? "" : deleteShots ? `Its ${shots} will be deleted too. ` : `Its ${shots} will be kept. `;
  return (
    <ChoiceDialog
      key="numbers"
      title={title}
      body={`${shotsNote}What should happen to the numbers of the scenes after it?`}
      onBack={deleteShots === null ? undefined : () => setDeleteShots(null)}
      onCancel={onCancel}
    >
      <ChoiceCard autoFocus title="Delete and leave a gap" detail={`There'll be no scene ${label}; no other numbers change`} onClick={() => done(null)} />
      {untilGap && (
        <ChoiceCard
          title="Delete and renumber until the gap"
          detail={`${renumbers(untilGap)}; scenes after the gap keep their numbers`}
          onClick={() => done(untilGap)}
        />
      )}
      <ChoiceCard title={`Delete and renumber ${untilGap ? "all later scenes" : "the scenes after it"}`} detail={renumbers(all)} onClick={() => done(all)} />
    </ChoiceDialog>
  );
}

/**
 * A row boundary. Hovering the small strip at its left end (left of the scene numbers), or tabbing
 * to its buttons, shows an insertion line across the table and an "Insert Scene / Insert Shot"
 * pop-up just left of the table. The pop-up is `fixed` so the sheet's scroll container doesn't
 * clip it. Which pop-up is open lives in the editor (one at a time); its short close delay lets
 * the pointer cross from the strip to the pop-up. While a row
 * is being dragged the pop-ups are off and the line marks where the row will land.
 */
function InsertZone({
  boundary,
  drag,
  open,
  onShow,
  onHide,
  onInsert,
}: {
  boundary: number;
  drag: Drag | null;
  open: boolean;
  onShow: (boundary: number) => void;
  onHide: (boundary: number) => void;
  onInsert: (boundary: number, kind: RowKind) => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const stripEl = useRef<HTMLDivElement>(null);
  const popupEl = useRef<HTMLDivElement>(null);

  function show() {
    const strip = stripEl.current!.getBoundingClientRect();
    const sheet = stripEl.current!.closest("[data-sheet]")!.getBoundingClientRect();
    const width = popupEl.current?.offsetWidth ?? 0;
    // Right edge just left of the table; on narrow screens, overlap the table rather than go off-screen.
    setPos({ top: strip.top + strip.height / 2, left: Math.max(8, sheet.left - 6 - width) });
    onShow(boundary);
  }

  const hide = () => onHide(boundary);

  if (drag) {
    return (
      <div className="relative h-0">
        {drag.target === boundary && <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 -translate-y-1/2 bg-foreground" />}
      </div>
    );
  }

  const btn = "rounded px-2 py-1 text-left text-xs font-medium whitespace-nowrap hover:bg-foreground hover:text-background focus:bg-foreground focus:text-background focus:outline-none";
  return (
    <div className="relative h-0">
      <div className={`pointer-events-none absolute inset-x-0 z-10 h-0.5 -translate-y-1/2 bg-foreground ${open ? "" : "opacity-0"}`} />
      <div ref={stripEl} className="absolute -top-1.5 left-0 z-10 h-3 w-6" onMouseEnter={show} onMouseLeave={hide} />
      <div
        ref={popupEl}
        style={pos}
        className={`fixed z-40 flex -translate-y-1/2 flex-col gap-0.5 rounded-md border border-line bg-surface p-0.5 shadow-lg ${open ? "" : "pointer-events-none opacity-0"}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && hide()}
      >
        <button type="button" className={btn} onClick={() => onInsert(boundary, ROW_KIND.SCENE)}>Insert Scene</button>
        <button type="button" className={btn} onClick={() => onInsert(boundary, ROW_KIND.SHOT)}>Insert Shot</button>
      </div>
    </div>
  );
}
