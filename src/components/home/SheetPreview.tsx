// A static picture of a shotlist for the home page: the same colours and layout as the editor, with
// callouts pointing at what you can do, and a peek at the script panel with linked lines. Purely
// illustrative (no inputs).

// Phones show four columns (no Time/Angle or Characters/Description) so the Script column has room.
const GRID = "grid grid-cols-[4.1rem_0.7fr_1fr_1.5fr] sm:grid-cols-[4.1rem_4.3rem_1fr_4.4rem_1.1fr_1.25fr]";
const CELL = "truncate border-b border-r border-line px-1.5 py-1.5 last:border-r-0";
/** Classes for column j: Time/Angle and Characters/Description are hidden on phones. */
const col = (j: number) => (j === 3 || j === 4 ? "hidden sm:block" : "");

const ROWS: { scene?: boolean; cells: string[] }[] = [
  { scene: true, cells: ["1", "INT.", "Kitchen", "Day", "Ana, Ben", "INT. Kitchen - Day"] },
  { cells: ["1A", "Ana", "CU", "Eye level", "Pours coffee, half asleep", "Ana pours coffee, half asleep."] },
  { cells: ["1B", "Ben", "WS", "High angle", "Shuffles in", "Ben shuffles in, still in his robe."] },
  { scene: true, cells: ["2", "EXT.", "Garden", "Night", "Ben", "EXT. Garden - Night"] },
  { cells: ["2A", "Ben", "MS", "Low angle", "Looks up at the sky", "Ben looks up at the stars."] },
  { scene: true, cells: ["2.1", "", "Intercut - Phone Call", "", "Carol", "Intercut - Phone Call"] },
];

/** The scene-1 text as the script panel shows it while linking shot 1A. */
const SCRIPT: { text: string; indent?: string; shot?: "1A" | "1B" }[] = [
  { text: "Ana pours coffee, half asleep.", shot: "1A" },
  { text: "Ben shuffles in, still in his robe.", shot: "1B" },
  { text: "ANA", indent: "pl-[38%]" },
  { text: "Morning.", indent: "pl-[16%]" },
];

export function SheetPreview() {
  return (
    <figure className="relative mb-4" aria-label="An example shotlist, with a shot's lines linked in the script">
      {/* Glow behind the sheet */}
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.12),transparent_70%)]" />

      <div className="relative">
        <div className="overflow-hidden rounded-xl border border-line bg-background text-[10px] shadow-2xl shadow-black/50 sm:text-[11px]">
          {/* Window bar */}
          <div className="flex items-center gap-1.5 border-b border-line bg-header px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/25" />
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/25" />
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/25" />
            <span className="ml-2 truncate text-muted">My Short Film · Script: my-short.fdx</span>
          </div>
          <div className={`${GRID} bg-scene font-semibold uppercase tracking-wide`}>
            {["Scene #", "Int./Ext.", "Location", "Time", "Characters", "Script scene"].map((h, j) => (
              <div key={h} className={`${CELL} ${col(j)}`}>{h}</div>
            ))}
          </div>
          <div className={`${GRID} bg-header font-semibold uppercase tracking-wide text-muted`}>
            {["Shot #", "Subject", "Framing", "Angle", "Description", "Script"].map((h, j) => (
              <div key={h} className={`${CELL} ${col(j)}`}>{h}</div>
            ))}
          </div>
          {ROWS.map((row, i) => (
            <div key={i} className={`${GRID} ${row.scene ? "bg-scene font-medium" : ""}`}>
              {row.cells.map((c, j) => (
                <div
                  key={j}
                  className={`${CELL} ${col(j)} ${j === 0 ? (row.scene ? "font-semibold" : "text-muted") : ""} ${j === 5 && row.cells[0] === "1A" ? "bg-foreground/15" : ""}`}
                >
                  {c || " "}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Callouts on the sheet */}
        <span aria-hidden className="pointer-events-none absolute -top-3 right-4 rotate-2 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background shadow-lg">
          ✨ Autofilled from your script
        </span>
        {/* Beside the sheet, pointing at a row line, like the real Insert pop-up (wide screens only). */}
        <span aria-hidden className="pointer-events-none absolute left-0 top-[60%] hidden -translate-x-[calc(100%+0.75rem)] -translate-y-1/2 items-center xl:flex">
          <span className="flex -rotate-2 flex-col gap-0.5 rounded-md border border-line bg-surface p-1 text-[11px] shadow-lg">
            <span className="rounded bg-foreground px-2 py-0.5 font-medium text-background">Insert Scene</span>
            <span className="px-2 py-0.5 font-medium">Insert Shot</span>
          </span>
          <span className="ml-1 h-px w-3 bg-foreground/60" />
        </span>
        {/* On the sheet's bottom edge, left of the script card (which sits lower on phones to leave room). */}
        <span aria-hidden className="pointer-events-none absolute -bottom-3.5 left-4 z-20 -rotate-1 rounded-full border border-line bg-surface px-3 py-1 text-xs shadow-lg">
          ⠿ Drag to reorder · ▲▼ renumber
        </span>
      </div>

      {/* A peek at the script panel: shot 1A's lines (white) and 1B's (tinted), and a line no shot covers yet. */}
      <div className="relative z-10 mt-5 ml-auto w-[min(100%,19rem)] rotate-1 overflow-hidden rounded-lg border border-line bg-surface text-[11px] shadow-2xl shadow-black/60 sm:-mr-4 sm:-mt-2">
        <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
          <span className="font-semibold">🔗 Script · Shot 1A</span>
          <span className="ml-auto truncate text-muted">INT. Kitchen - Day</span>
        </div>
        <div className="flex flex-col gap-0.5 px-1.5 py-1.5 font-mono leading-snug">
          {SCRIPT.map((line) => (
            <div
              key={line.text}
              className={`flex gap-2 rounded-sm border-l-4 px-1.5 py-0.5 ${
                line.shot === "1A" ? "border-foreground/80 bg-foreground/10" : line.shot === "1B" ? "border-sky-300/70 bg-sky-300/15" : "border-transparent"
              }`}
            >
              <span className={`min-w-0 flex-1 truncate ${line.indent ?? ""}`}>{line.text}</span>
              {line.shot && (
                <span className={`shrink-0 rounded px-1 font-sans text-[10px] font-semibold ${line.shot === "1A" ? "bg-foreground text-background" : "bg-sky-300 text-black"}`}>
                  {line.shot}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}
