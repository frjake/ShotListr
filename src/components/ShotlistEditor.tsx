"use client";

import { useActionState, useRef, useState } from "react";
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
import { cleanRow, emptyRow, rowLabels, type RowData, type RowField } from "@/lib/rows";

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
const GRID = "grid grid-cols-[4.5rem_minmax(7rem,1fr)_minmax(9rem,1.5fr)_minmax(7rem,1fr)_minmax(13rem,2fr)]";
const CELL = "border-b border-r border-line last:border-r-0";

type EditorRow = RowData & { key: string };

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
  const [state, action, pending] = useActionState(saveShotlist, undefined);

  const labels = rowLabels(rows.map((r) => r.kind));

  function insertRow(index: number, kind: RowKind) {
    const key = `r${nextKey.current++}`;
    setRows((prev) => [...prev.slice(0, index), { ...emptyRow(kind), key }, ...prev.slice(index)]);
    setFocusKey(key);
  }

  function updateCell(key: string, field: RowField, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  const payload = JSON.stringify(rows.map(cleanRow));

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

      <div className="max-h-[calc(100dvh-15rem)] min-h-64 overflow-auto rounded-lg border border-line">
        <div className="min-w-[46rem] pb-12">
          <div className="sticky top-0 z-20 text-xs font-semibold uppercase tracking-wide">
            <HeaderRow className="bg-scene" number="Scene #" columns={SCENE_COLUMNS} />
            <HeaderRow className="bg-header text-muted" number="Shot #" columns={SHOT_COLUMNS} />
          </div>

          <InsertZone onInsert={(kind) => insertRow(0, kind)} />
          {rows.map((row, i) => (
            <div key={row.key}>
              <SheetRow
                row={row}
                label={labels[i]}
                autoFocus={row.key === focusKey}
                onChange={(field, value) => updateCell(row.key, field, value)}
              />
              <InsertZone onInsert={(kind) => insertRow(i + 1, kind)} />
            </div>
          ))}
        </div>
      </div>

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
      <div className={`${CELL} px-2 py-1.5`}>{number}</div>
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
  onChange,
}: {
  row: EditorRow;
  label: string;
  autoFocus: boolean;
  onChange: (field: RowField, value: string) => void;
}) {
  const isScene = row.kind === ROW_KIND.SCENE;
  const columns = isScene ? SCENE_COLUMNS : SHOT_COLUMNS;
  const noun = isScene ? "Scene" : "Shot";

  return (
    <div className={`${GRID} text-sm ${isScene ? "bg-scene font-medium" : ""}`}>
      <div className={`${CELL} px-2 py-1.5 tabular-nums ${isScene ? "font-semibold" : "text-muted"}`}>{label}</div>
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

/**
 * Invisible strip straddling a row boundary. Hovering (or tabbing into) it shows an insertion
 * line and an "Insert Scene / Insert Shot" pop-up centred on it. The pop-up must stay shorter
 * than a row so it never covers the neighbouring boundaries' strips.
 */
function InsertZone({ onInsert }: { onInsert: (kind: RowKind) => void }) {
  const btn = "rounded px-2 py-0.5 text-xs font-medium hover:bg-foreground hover:text-background focus:bg-foreground focus:text-background focus:outline-none";
  const show = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";

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
