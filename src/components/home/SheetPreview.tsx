// A static picture of a shotlist for the home page: the same colours and layout as the editor, with
// callouts pointing at what you can do. Purely illustrative (no inputs).

const GRID = "grid grid-cols-[4.75rem_0.9fr_1.2fr_0.9fr_1.5fr]";
const CELL = "truncate border-b border-r border-line px-2 py-1.5 last:border-r-0";

const ROWS: { scene?: boolean; cells: string[] }[] = [
  { scene: true, cells: ["1", "INT.", "Kitchen", "Day", "Ana, Ben"] },
  { cells: ["1A", "Ana", "CU", "Eye level", "Pours coffee, half asleep"] },
  { cells: ["1B", "Ben", "WS", "High angle", "Shuffles in"] },
  { scene: true, cells: ["2", "EXT.", "Garden", "Night", "Ben"] },
  { cells: ["2A", "Ben", "MS", "Low angle", "Looks up at the sky"] },
  { scene: true, cells: ["2.1", "", "Intercut - Phone Call", "", "Carol"] },
];

export function SheetPreview() {
  return (
    <figure className="relative mb-4" aria-label="An example shotlist">
      {/* Glow behind the sheet */}
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.12),transparent_70%)]" />

      <div className="overflow-hidden rounded-xl border border-line bg-background text-[11px] shadow-2xl shadow-black/50 sm:text-xs">
        {/* Window bar */}
        <div className="flex items-center gap-1.5 border-b border-line bg-header px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/25" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/25" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/25" />
          <span className="ml-2 truncate text-muted">My Short Film · Script: my-short.fdx</span>
        </div>
        <div className={`${GRID} bg-scene font-semibold uppercase tracking-wide`}>
          {["Scene #", "Int./Ext.", "Location", "Time", "Characters"].map((h) => (
            <div key={h} className={CELL}>{h}</div>
          ))}
        </div>
        <div className={`${GRID} bg-header font-semibold uppercase tracking-wide text-muted`}>
          {["Shot #", "Subject", "Framing", "Angle", "Description"].map((h) => (
            <div key={h} className={CELL}>{h}</div>
          ))}
        </div>
        {ROWS.map((row, i) => (
          <div key={i} className={`${GRID} ${row.scene ? "bg-scene font-medium" : ""}`}>
            {row.cells.map((c, j) => (
              <div key={j} className={`${CELL} ${j === 0 ? (row.scene ? "font-semibold" : "text-muted") : ""}`}>
                {c || " "}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Callouts */}
      <figcaption className="pointer-events-none">
        <span className="absolute -top-3 right-4 rotate-2 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background shadow-lg">
          ✨ Autofilled from your script
        </span>
        {/* Beside the sheet, pointing at a row line, like the real Insert pop-up (wide screens only). */}
        <span className="absolute left-0 top-[60%] hidden -translate-x-[calc(100%+0.75rem)] -translate-y-1/2 items-center xl:flex">
          <span className="flex -rotate-2 flex-col gap-0.5 rounded-md border border-line bg-surface p-1 text-[11px] shadow-lg">
            <span className="rounded bg-foreground px-2 py-0.5 font-medium text-background">Insert Scene</span>
            <span className="px-2 py-0.5 font-medium">Insert Shot</span>
          </span>
          <span className="ml-1 h-px w-3 bg-foreground/60" />
        </span>
        <span className="absolute -bottom-7 right-6 -rotate-1 rounded-full border border-line bg-surface px-3 py-1 text-xs shadow-lg">
          ⠿ Drag to reorder · ▲▼ renumber
        </span>
      </figcaption>
    </figure>
  );
}
