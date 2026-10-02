"use client";

import { useRef, useState } from "react";
import { coverageFor, formatParagraphs, formatRuns, paragraphGroups, runsOf, type ShotLink } from "@/lib/scriptLinks";
import { displayHeading, type DocParagraph, type ScriptDoc } from "@/lib/scriptParse/scenes";

export type PanelShot = { key: string; label: string; link: ShotLink | null };

/** Tints for other shots' highlights (the current shot is always white). */
const TINTS = [
  { para: "bg-amber-300/15 border-amber-300/70", chip: "bg-amber-300 text-black" },
  { para: "bg-sky-300/15 border-sky-300/70", chip: "bg-sky-300 text-black" },
  { para: "bg-emerald-300/15 border-emerald-300/70", chip: "bg-emerald-300 text-black" },
  { para: "bg-violet-300/15 border-violet-300/70", chip: "bg-violet-300 text-black" },
  { para: "bg-rose-300/15 border-rose-300/70", chip: "bg-rose-300 text-black" },
  { para: "bg-lime-300/15 border-lime-300/70", chip: "bg-lime-300 text-black" },
];

/** Screenplay-style indents for each kind of paragraph. */
const INDENT: Record<DocParagraph["type"], string> = {
  action: "",
  character: "pl-[38%]",
  parenthetical: "pl-[28%] pr-[18%]",
  dialogue: "pl-[16%] pr-[12%]",
  transition: "text-right",
};

/**
 * The script side panel: the text of one scene (laid out like a screenplay) with every shot's linked
 * paragraphs highlighted and labelled. Select paragraphs (click toggles one — a character and their
 * lines go together — shift-click adds a run, or ↑/↓ + Space, Shift+↑/↓ to add) and link them to the current shot (or, from a scene row, any of
 * its shots); each run becomes a section. The current shot's sections are listed with ×. A scene that
 * isn't linked to the script yet (or "Change") shows a searchable list of the script's scenes.
 */
export function ScriptPanel({
  title,
  doc,
  loading,
  error,
  segment,
  picking,
  shots,
  current,
  onPick,
  onChangeScene,
  onCancelPick,
  onSelectShot,
  onLink,
  onRemoveSection,
  onClose,
}: {
  title: string;
  doc: ScriptDoc | null;
  loading: boolean;
  error: string | null;
  /** The scene's segment in the script, or null if it isn't linked yet. */
  segment: number | null;
  picking: boolean;
  shots: PanelShot[];
  /** The shot being linked (null when opened from a scene row). */
  current: string | null;
  onPick: (segment: number) => void;
  onChangeScene: () => void;
  onCancelPick: () => void;
  onSelectShot: (key: string) => void;
  onLink: (shotKey: string, runs: [number, number][]) => void;
  onRemoveSection: (shotKey: string, index: number) => void;
  onClose: () => void;
}) {
  let body: React.ReactNode;
  if (loading) body = <p className="text-sm text-muted">Reading script…</p>;
  else if (error) body = <p role="alert" className="text-sm text-red-300">{error}</p>;
  else if (!doc) body = null;
  else if (doc.segments.length === 0) body = <p className="text-sm text-red-300">{doc.error ?? "No scenes were found in this script."}</p>;
  else if (picking || segment === null)
    body = <ScenePicker doc={doc} segment={segment} onPick={onPick} onCancel={segment === null ? null : onCancelPick} />;
  else
    body = (
      // Keyed so the selection starts fresh for each shot / scene.
      <SceneText
        key={`${segment}-${current}`}
        doc={doc}
        segment={segment}
        shots={shots}
        current={current}
        onChangeScene={onChangeScene}
        onSelectShot={onSelectShot}
        onLink={onLink}
        onRemoveSection={onRemoveSection}
      />
    );

  return (
    <aside
      aria-label="Script"
      className="fixed inset-0 z-40 flex flex-col bg-background lg:sticky lg:inset-auto lg:top-4 lg:z-auto lg:max-h-[calc(100dvh-2rem)] lg:rounded-lg lg:border lg:border-line lg:bg-surface/40"
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate font-semibold">{title}</h2>
        <button
          type="button"
          aria-label="Close the script"
          className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-foreground/10 hover:text-foreground"
          onClick={onClose}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 stroke-current" strokeWidth={1.75} strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
    </aside>
  );
}

function ScenePicker({
  doc,
  segment,
  onPick,
  onCancel,
}: {
  doc: ScriptDoc;
  segment: number | null;
  onPick: (segment: number) => void;
  onCancel: (() => void) | null;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = doc.segments
    .map((s, i) => ({ s, i, heading: displayHeading(s.heading) }))
    .filter(({ s, heading }) => !q || heading.toLowerCase().includes(q) || s.number?.toLowerCase() === q);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <p className="text-sm text-muted">
        {segment === null ? "This scene isn't linked to the script yet. Which scene in the script is it?" : "Choose the script scene this scene matches."}
      </p>
      <input
        autoFocus
        aria-label="Search the script's scenes"
        placeholder="Search scene headings"
        className="input py-1.5"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="min-h-0 flex-1 overflow-auto rounded-md border border-line">
        {matches.length === 0 && <li className="px-3 py-2 text-sm text-muted">No scenes match “{query}”.</li>}
        {matches.map(({ s, i, heading }) => (
          <li key={i}>
            <button
              type="button"
              className={`flex w-full items-baseline gap-2 border-b border-line px-3 py-2 text-left text-sm last:border-b-0 hover:bg-scene ${i === segment ? "bg-scene" : ""}`}
              onClick={() => onPick(i)}
            >
              <span className="w-10 shrink-0 text-xs tabular-nums text-muted">{s.number ?? `#${i + 1}`}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{heading}</span>
              {i === segment && <span className="text-xs text-muted">current</span>}
            </button>
          </li>
        ))}
      </ul>
      {onCancel && (
        <button type="button" className="btn-ghost self-end" onClick={onCancel}>Cancel</button>
      )}
    </div>
  );
}

function SceneText({
  doc,
  segment,
  shots,
  current,
  onChangeScene,
  onSelectShot,
  onLink,
  onRemoveSection,
}: {
  doc: ScriptDoc;
  segment: number;
  shots: PanelShot[];
  current: string | null;
  onChangeScene: () => void;
  onSelectShot: (key: string) => void;
  onLink: (shotKey: string, runs: [number, number][]) => void;
  onRemoveSection: (shotKey: string, index: number) => void;
}) {
  const seg = doc.segments[segment];
  const heading = displayHeading(seg.heading);
  // Each option is a group of paragraphs (a speech, or one other paragraph). Selected paragraphs stay
  // selected until clicked again (or linked / cleared); `anchor` (a group) is where a shift-click run
  // starts, `active` the group with the tab stop.
  const groups = paragraphGroups(seg.paragraphs);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const optionEls = useRef<(HTMLDivElement | null)[]>([]);

  const coverage = coverageFor(shots.map((s) => ({ id: s.key, link: s.link })), segment);
  const tintOf = new Map(shots.map((s, i) => [s.key, TINTS[i % TINTS.length]]));
  const labelOf = new Map(shots.map((s) => [s.key, s.label]));
  const currentShot = shots.find((s) => s.key === current) ?? null;
  const runs = runsOf(selected);
  const range = formatRuns(runs);

  /** Adds groups `a`–`b` to the selection (never removes any). */
  function addGroups(a: number, b: number) {
    const next = new Set(selected);
    for (let p = groups[Math.min(a, b)][0]; p <= groups[Math.max(a, b)][1]; p++) next.add(p);
    setSelected(next);
  }

  /** Click / Space: toggles one group; with Shift, adds the run from the last one chosen. */
  function choose(g: number, extend: boolean) {
    setActive(g);
    setAnchor(g);
    if (extend && anchor !== null) return addGroups(anchor, g);
    const [from, to] = groups[g];
    const next = new Set(selected);
    const on = next.has(from);
    for (let p = from; p <= to; p++) {
      if (on) next.delete(p);
      else next.add(p);
    }
    setSelected(next);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, Math.min(groups.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
      setActive(next);
      optionEls.current[next]?.focus();
      if (e.shiftKey) {
        addGroups(active, next);
        setAnchor(next);
      }
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      choose(active, e.shiftKey);
    }
  }

  function clear() {
    setSelected(new Set());
    setAnchor(null);
  }

  function link(shotKey: string) {
    onLink(shotKey, runs);
    clear();
  }

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-semibold">{heading}</span>
          <button type="button" className="shrink-0 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline" onClick={onChangeScene}>
            Change scene
          </button>
        </div>
        {shots.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted">Shots:</span>
            {shots.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={s.key === current}
                className={`rounded px-1.5 py-0.5 font-semibold ${s.key === current ? "bg-foreground text-background" : `${tintOf.get(s.key)!.chip} opacity-80 hover:opacity-100`}`}
                onClick={() => onSelectShot(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        {currentShot && (
          <div className="text-sm">
            <p className="font-medium">Linked to {currentShot.label}</p>
            {currentShot.link ? (
              <ul className="mt-1 flex flex-col gap-1">
                {currentShot.link.sections.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate ${s.broken ? "text-red-300" : "text-muted"}`}>
                      {s.broken ? "⚠ Not found in this script: " : s.scene === segment ? `¶${s.from + 1}${s.to > s.from ? `–${s.to + 1}` : ""} · ` : "In another scene: "}
                      {formatParagraphs(s.paras)[0]}
                    </span>
                    <button
                      type="button"
                      aria-label={`Unlink section ${i + 1} from ${currentShot.label}`}
                      className="shrink-0 rounded px-1 text-muted hover:bg-foreground/10 hover:text-foreground"
                      onClick={() => onRemoveSection(currentShot.key, i)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">Not linked yet. Click the paragraphs it shows (click again to unselect), then Link.</p>
            )}
          </div>
        )}
      </div>

      <div
        role="listbox"
        aria-multiselectable="true"
        aria-label={`Paragraphs of ${heading}`}
        className="min-h-0 flex-1 overflow-auto px-2 py-3 font-mono text-[13px] leading-snug"
        onKeyDown={onKeyDown}
      >
        {seg.paragraphs.length === 0 && <p className="px-2 text-muted">This scene has no text after its heading.</p>}
        {groups.map(([from, to], g) => {
          const paras = seg.paragraphs.slice(from, to + 1);
          const covering = [...new Set(paras.flatMap((_, k) => coverage.get(from + k) ?? []))];
          const isSelected = selected.has(from);
          const mine = current !== null && covering.includes(current);
          const other = covering.find((k) => k !== current);
          const look = isSelected
            ? "bg-foreground/25 border-foreground"
            : mine
              ? "bg-foreground/10 border-foreground/80"
              : other
                ? tintOf.get(other)!.para
                : "border-transparent hover:bg-foreground/5";
          return (
            <div
              key={from}
              ref={(el) => void (optionEls.current[g] = el)}
              role="option"
              aria-selected={isSelected}
              tabIndex={g === active ? 0 : -1}
              className={`flex cursor-pointer gap-2 rounded-sm border-l-4 px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 ${look}`}
              onClick={(e) => choose(g, e.shiftKey)}
              onFocus={() => setActive(g)}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                {paras.map((p, k) => (
                  <span key={k} className={`whitespace-pre-wrap ${INDENT[p.type]}`}>
                    {p.type === "character" ? p.text.toUpperCase() : p.text}
                  </span>
                ))}
              </span>
              {covering.length > 0 && (
                <span className="flex shrink-0 flex-col items-end gap-0.5 font-sans">
                  {covering.map((k) => (
                    <span key={k} className={`rounded px-1 text-[10px] font-semibold ${k === current ? "bg-foreground text-background" : tintOf.get(k)!.chip}`}>
                      {labelOf.get(k)}
                    </span>
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 text-sm">
          {currentShot ? (
            <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={() => link(currentShot.key)}>
              Link {range} to {currentShot.label}
            </button>
          ) : shots.length ? (
            <>
              <span className="text-muted">Link {range} to:</span>
              {shots.map((s) => (
                <button key={s.key} type="button" className="btn-secondary px-2 py-1 text-sm" onClick={() => link(s.key)}>
                  {s.label}
                </button>
              ))}
            </>
          ) : (
            <span className="text-muted">Add shots under this scene to link lines to them.</span>
          )}
          <button type="button" className="btn-ghost ml-auto px-2 py-1 text-sm" onClick={clear}>
            Clear
          </button>
        </div>
      )}
    </>
  );
}
