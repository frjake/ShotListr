import Link from "next/link";
import { SheetPreview } from "@/components/home/SheetPreview";
import { getCurrentUser } from "@/lib/auth";

// The home page doubles as a friendly user guide: what ShotListr does and how to use each part.
// Keep it in step with the real features (see README.md / CLAUDE.md) when they change.

type IconName = "film" | "sparkles" | "hash" | "rows" | "people" | "save" | "download" | "keyboard" | "link";

/** Simple line icons (inline so the page needs no icon library). */
function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    film: <path d="M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4" />,
    sparkles: <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" />,
    hash: <path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" />,
    rows: <path d="M4 6h16M4 12h16M4 18h10M18 16v4M16 18h4" />,
    people: <path d="M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3 3 0 010 5.5M18 14.5c1.8.8 3 2.6 3 4.7" />,
    save: <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />,
    download: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" />,
    keyboard: <path d="M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M7 14h10" />,
    link: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />,
  };
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`${className} fill-none stroke-current`} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

/** A strip of film sprocket holes, used as a divider. */
function FilmStrip() {
  return (
    <div aria-hidden className="flex h-6 items-center gap-3 overflow-hidden bg-header px-3">
      {Array.from({ length: 60 }, (_, i) => (
        <span key={i} className="h-3 w-5 shrink-0 rounded-sm bg-background" />
      ))}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-header px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</kbd>;
}

const STEPS = [
  {
    title: "Start a shotlist",
    body: "Click New Shotlist. You'll be asked whether to attach your script — a .fdx, .docx, .pdf or .doc file up to 20 MB — or start with a blank sheet.",
  },
  {
    title: "Let it fill in the scenes",
    body: "With a script, ShotListr reads every scene heading and fills in Int./Ext., Location, Time and who speaks in each scene, plus a list of your characters.",
  },
  {
    title: "Plan your shots, then save",
    body: "Add shots under each scene — subject, framing, angle and what happens. Save it to My Shotlists, or download it as a spreadsheet for the crew.",
  },
];

const FEATURES: { icon: IconName; title: string; points: React.ReactNode[] }[] = [
  {
    icon: "sparkles",
    title: "Autofill from your script",
    points: [
      "Every INT./EXT. heading becomes a scene; the script's scene numbers are kept (12A becomes 12.1).",
      "Headings like INTERCUT or FLASHBACK become subscenes of the scene they're in.",
      "Already started? Choose to fill in empty cells, replace everything, or add the script's scenes to the end.",
      "Use Autofill from script any time, or Replace the script to read a new draft.",
    ],
  },
  {
    icon: "rows",
    title: "Build the sheet",
    points: [
      "Hover the left end of any line between rows to Insert Scene or Insert Shot right there.",
      "Drag a row's ⠿ handle to move it — a scene takes its shots with it. Holding near the edge scrolls.",
      "The × on a row deletes it; deleting a scene asks what to do with its shots.",
      "Int./Ext., Time, Framing and Angle offer common choices, but you can type anything.",
    ],
  },
  {
    icon: "hash",
    title: "Scene numbers your way",
    points: [
      "Shots are lettered automatically: 12A, 12B, 12.1A…",
      "Type over a scene number to change it; the scene moves into number order.",
      "Squeeze a scene in between with a subscene (12.1, 12.1.1), or renumber the scenes after it.",
      "The ▲ ▼ in a scene number nudge it by one when there's a free number.",
    ],
  },
  {
    icon: "link",
    title: "Link shots to the script",
    points: [
      "Click a shot's Script cell to open its scene's text beside the sheet.",
      "Click the paragraphs that shot covers (shift-click for a run) and link them — as many sections as you need.",
      "Every shot's lines are highlighted and labelled, so you can see what no shot covers yet.",
      "New draft? Links are found again by their text; any that moved too much are marked ⚠ to re-link.",
    ],
  },
  {
    icon: "people",
    title: "Character list",
    points: [
      "Open Characters above the sheet to see everyone in the shotlist.",
      "Drag names into the order you want — every scene lists its characters in that order.",
      "Rename someone once and every scene updates; remove them from the list and from every scene.",
      "The + in a name adds that character to a scene by its number.",
    ],
  },
  {
    icon: "save",
    title: "Save and come back",
    points: [
      "Save keeps everything — the sheet, the character list and the script — under My Shotlists.",
      "My Shotlists shows your shotlists as cards, most recently saved first.",
      "Leaving with unsaved changes? ShotListr asks whether to save first.",
    ],
  },
  {
    icon: "download",
    title: "Download a spreadsheet",
    points: [
      "Download gives you a clean, black-and-white Excel file ready to print or share.",
      "One header row, scenes in bold, plus sheets with your character list and each shot's script lines.",
      "Click the script's name at the top of a shotlist to download the original file.",
    ],
  },
];

const FORMATS = [
  { ext: ".fdx", name: "Final Draft", note: "Best results: scene numbers and every speaking character." },
  { ext: ".docx", name: "Word", note: "Great when written in a screenwriting app or screenplay template." },
  { ext: ".pdf", name: "PDF", note: "Great when exported from a writing app. Scanned pages can't be read." },
  { ext: ".doc", name: "Older Word", note: "Text only, so a little less accurate. Check the result." },
];

const SHORTCUTS: [React.ReactNode, string][] = [
  [<><Kbd>Enter</Kbd> / <Kbd>Esc</Kbd></>, "Confirm or undo a scene number or character name you're typing"],
  [<><Kbd>↑</Kbd> <Kbd>↓</Kbd> on a ⠿ handle</>, "Move that row (or character) up or down"],
  [<><Kbd>↑</Kbd> <Kbd>↓</Kbd> in a scene number</>, "Step the number down or up by one, when it's free"],
  [<><Kbd>↓</Kbd> in Int./Ext., Time, Framing or Angle</>, "Open the list of suggestions"],
  [<><Kbd>Tab</Kbd></>, "Move through the sheet — the Insert buttons between rows are on the way"],
  [<><Kbd>Esc</Kbd> while dragging</>, "Cancel the move"],
];

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,#7a1a1a_0%,transparent_55%),radial-gradient(ellipse_at_bottom_right,#2e0000_0%,transparent_60%)]" />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 lg:grid-cols-[1fr_1.15fr] xl:gap-x-32">
          <div className="flex flex-col gap-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-muted">
              <Icon name="film" className="h-4 w-4" /> Shot lists for filmmakers
            </span>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
              From script to <span className="whitespace-nowrap">shot list,</span>{" "}
              <span className="text-muted">without the busywork.</span>
            </h1>
            <p className="max-w-xl text-base text-foreground/85 sm:text-lg">
              ShotListr reads your screenplay, lays out every scene for you, and gives you a simple spreadsheet to plan each shot —
              then hands your crew a clean copy to print.
            </p>
            <div className="flex flex-wrap gap-3">
              {user ? (
                <>
                  <Link href="/shotlists/new" className="btn-primary px-5 py-2.5">Create new shotlist +</Link>
                  <Link href="/shotlists" className="btn-secondary px-5 py-2.5">My Shotlists</Link>
                </>
              ) : (
                <>
                  <Link href="/register" className="btn-primary px-5 py-2.5">Sign up — it&apos;s free</Link>
                  <Link href="/login" className="btn-secondary px-5 py-2.5">Log in</Link>
                </>
              )}
            </div>
            <nav aria-label="On this page" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              <a href="#how-it-works" className="underline-offset-4 hover:text-foreground hover:underline">How it works</a>
              <a href="#features" className="underline-offset-4 hover:text-foreground hover:underline">What you can do</a>
              <a href="#formats" className="underline-offset-4 hover:text-foreground hover:underline">Script formats</a>
              <a href="#shortcuts" className="underline-offset-4 hover:text-foreground hover:underline">Shortcuts</a>
            </nav>
          </div>
          <SheetPreview />
        </div>
      </section>

      <FilmStrip />

      {/* How it works */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-14">
        <h2 className="text-2xl font-semibold sm:text-3xl">How it works</h2>
        <p className="mt-2 text-muted">Three steps from a finished draft to a shot list you can shoot from.</p>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative overflow-hidden rounded-xl border border-line bg-surface p-5">
              <span aria-hidden className="absolute -right-2 -top-6 text-8xl font-bold text-foreground/5">{i + 1}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">{i + 1}</span>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-foreground/80">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section id="features" className="border-y border-line bg-header/60">
        <div className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-14">
          <h2 className="text-2xl font-semibold sm:text-3xl">What you can do</h2>
          <p className="mt-2 text-muted">Everything in a shotlist, and how to do it.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="flex flex-col rounded-xl border border-line bg-background p-5 transition-colors hover:border-foreground/40">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-scene">
                  <Icon name={f.icon} />
                </span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground/80">
                  {f.points.map((point, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Formats + shortcuts */}
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 lg:grid-cols-2">
        <div id="formats" className="scroll-mt-6">
          <h2 className="text-2xl font-semibold">Script formats</h2>
          <p className="mt-2 text-muted">Attach one script per shotlist, up to 20 MB. It&apos;s stored as-is and only read to fill in scenes.</p>
          <ul className="mt-6 flex flex-col gap-3">
            {FORMATS.map((f) => (
              <li key={f.ext} className="flex items-start gap-4 rounded-xl border border-line bg-surface p-4">
                <span className="w-16 shrink-0 rounded-md bg-foreground py-1 text-center font-mono text-sm font-semibold text-background">{f.ext}</span>
                <span>
                  <span className="font-medium">{f.name}</span>
                  <span className="block text-sm text-foreground/75">{f.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div id="shortcuts" className="scroll-mt-6">
          <h2 className="flex items-center gap-2 text-2xl font-semibold">
            <Icon name="keyboard" className="h-6 w-6" /> Handy shortcuts
          </h2>
          <p className="mt-2 text-muted">Everything works with a mouse — these make it quicker.</p>
          <dl className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {SHORTCUTS.map(([keys, what], i) => (
              <div key={i} className="grid gap-1 bg-surface/60 px-4 py-3 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-4">
                <dt className="text-sm">{keys}</dt>
                <dd className="text-sm text-foreground/80">{what}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <FilmStrip />

      {/* Closing call to action */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 py-16 text-center">
        <h2 className="text-3xl font-semibold">Ready to plan your shoot?</h2>
        <p className="max-w-xl text-muted">Start with your script and have every scene laid out in seconds.</p>
        <Link href={user ? "/shotlists/new" : "/register"} className="btn-primary px-6 py-3 text-lg">
          {user ? "Create new shotlist +" : "Sign up and get started"}
        </Link>
      </section>
    </div>
  );
}
