"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { attachScript, parseScriptFile, parseStoredScript, removeScript, saveShotlist } from "@/app/actions/shotlists";
import { ChoiceCard, ChoiceDialog, ConfirmDialog } from "@/components/ChoiceDialog";
import { ComboboxInput } from "@/components/ComboboxInput";
import { useNavigationGuard } from "@/components/NavigationGuard";
import { ScriptBar, type ScriptBusy } from "@/components/ScriptBar";
import { ScriptPanel } from "@/components/ScriptPanel";
import { appendScenes, mergeScenes, scenesToRows, scriptSummary, sheetIsEmpty } from "@/lib/autofill";
import { CharacterList } from "@/components/CharacterList";
import {
  addCharacters,
  addToScene,
  charactersInRows,
  moveCharacter,
  parseCharacters,
  removeCharacter,
  renameCharacter,
  scenesWith,
  scriptCharacters,
  sortAllCells,
  sortCell,
} from "@/lib/characters";
import { autoScrollStep } from "@/lib/dragScroll";
import {
  addSection,
  formatRuns,
  linkSummary,
  readSceneLink,
  readShotLink,
  reanchorRows,
  removeSection,
  sceneRowFor,
  shotsUnder,
  staleShotsUnder,
  writeSceneLink,
  writeShotLink,
} from "@/lib/scriptLinks";
import { downloadShotlist } from "@/lib/exportShotlist";
import { displayHeading, type ScriptDoc, type ScriptScene } from "@/lib/scriptParse/scenes";
import { MAX_SCRIPT_BYTES, SCRIPT_ACCEPT, formatFileSize, scriptProblem, titleFromFileName, type ScriptInfo } from "@/lib/scripts";
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
  sceneNudges,
  rowLabels,
  shiftScenes,
  stepTarget,
  type RowData,
  type DeleteRenumbering,
  type RowField,
  type RunShift,
  type SceneNudge,
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
/** The same, plus a Script column (shown while the shotlist has a script). */
const GRID_SCRIPT = "grid grid-cols-[7rem_minmax(7rem,1fr)_minmax(9rem,1.5fr)_minmax(7rem,1fr)_minmax(13rem,2fr)_minmax(10rem,1.3fr)]";
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
  // Saving without a title asks for one first; `then` is what to do once it's saved, if anything.
  | { type: "title"; then: AfterSave | null }
  // Downloading with unsaved changes: save first, download anyway, or cancel.
  | { type: "download" }
  // Downloading without a title (and not saving): name it first, then download.
  | { type: "downloadTitle" }
  // A new shotlist starts by asking whether to attach a script.
  | { type: "start" }
  // "Are you sure?" before removing a stored script.
  | { type: "removeScript" }
  // Scenes read from a script, waiting for the user to apply them (and choose how, if the sheet has data).
  | { type: "autofill"; fileName: string; scenes: ScriptScene[]; version: string }
  // "Are you sure?" before removing a character that scenes list.
  | { type: "removeCharacter"; name: string }
  // Leaving with unsaved changes: save first, leave anyway, or stay.
  | { type: "leave"; proceed: () => void };

/** What to do once the save in flight succeeds: leave the page ("Save and leave") or download it. */
type AfterSave = { type: "leave"; proceed: () => void } | { type: "download" };

/** The editor's save state: the server's answer plus what was saved, to tell when there are unsaved changes. */
type EditorSaveState = { error?: string; savedAt?: number; snapshot?: string } | undefined;

/** Everything a save sends, as one comparable string. */
const snapshotOf = (title: string, rowsJson: string, charactersJson: string) => `${title}\u0000${rowsJson}\u0000${charactersJson}`;

export function ShotlistEditor({
  id,
  heading,
  initialTitle,
  initialRows,
  initialScript = null,
  initialCharacters = [],
}: {
  id?: string;
  heading: string;
  initialTitle: string;
  initialRows: RowData[];
  initialScript?: ScriptInfo | null;
  initialCharacters?: string[];
}) {
  const [title, setTitle] = useState(initialTitle);
  // The character list starts as the saved one plus any names already typed in scene cells (older
  // shotlists have only the cells), and the cells start in list order.
  const [initial] = useState(() => {
    const characters = addCharacters(initialCharacters, charactersInRows(initialRows));
    const sortedRows = sortAllCells(initialRows, characters);
    return {
      characters,
      rows: sortedRows,
      snapshot: snapshotOf(initialTitle, JSON.stringify(sortedRows.map(cleanRow)), JSON.stringify(characters)),
    };
  });
  const [rows, setRows] = useState<EditorRow[]>(() => initial.rows.map((r, i) => ({ ...r, key: `r${i}` })));
  const [characters, setCharacters] = useState<string[]>(initial.characters);
  const [charactersOpen, setCharactersOpen] = useState(false);
  const nextKey = useRef(initialRows.length);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // A new shotlist (no id) opens by asking whether to start with a script.
  const [pendingChoice, setPendingChoice] = useState<Pending | null>(id ? null : { type: "start" });
  // The stored script, and for a new shotlist the file picked to attach on its first save.
  // Saved shotlists attach and remove scripts immediately, outside Save.
  const [script, setScript] = useState<ScriptInfo | null>(initialScript);
  const [pendingScript, setPendingScript] = useState<File | null>(null);
  const pendingScriptRef = useRef<File | null>(null); // read by the save wrapper
  const [scriptBusy, setScriptBusy] = useState<ScriptBusy | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const scriptInputEl = useRef<HTMLInputElement>(null);
  // The current script's text and version, once read (on autofill, attaching, or opening a scene).
  const [scriptText, setScriptText] = useState<{ doc: ScriptDoc; version: string } | null>(null);
  // The script side panel: the row it was opened from (a shot, or a scene), and whether it's picking the scene.
  const [panel, setPanel] = useState<{ key: string; picking: boolean } | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [numberError, setNumberError] = useState<{ key: string; message: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // Which boundary's Insert pop-up is open. Only one at a time: showing one closes any other at once.
  const [openZone, setOpenZone] = useState<number | null>(null);
  const zoneCloseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();
  const { setGuard } = useNavigationGuard();
  const saveFormEl = useRef<HTMLFormElement>(null);
  const afterSave = useRef<AfterSave | null>(null);

  const [state, action, pending] = useActionState(async (prev: EditorSaveState, formData: FormData): Promise<EditorSaveState> => {
    const then = afterSave.current;
    afterSave.current = null;
    if (!id && pendingScriptRef.current) formData.set("script", pendingScriptRef.current);
    const result = await saveShotlist(undefined, formData);
    if (!result?.savedAt || !result.id) return { snapshot: prev?.snapshot, error: result?.error ?? "Couldn't save the shotlist" };
    if (then?.type === "leave") {
      then.proceed();
    } else {
      // Download exactly what was saved (the title may have just come from the title prompt).
      if (then?.type === "download") {
        void exportFile(String(formData.get("title")), JSON.parse(String(formData.get("rows"))), JSON.parse(String(formData.get("characters"))));
      }
      if (!id) router.replace(`/shotlists/${result.id}`); // a new shotlist moves to its own page
    }
    return {
      savedAt: result.savedAt,
      snapshot: snapshotOf(String(formData.get("title")), String(formData.get("rows")), String(formData.get("characters"))),
    };
  }, undefined);

  const rowEls = useRef(new Map<string, HTMLDivElement>());
  const gripEls = useRef(new Map<string, HTMLButtonElement>());
  const numberEls = useRef(new Map<string, HTMLInputElement>());
  const scrollEl = useRef<HTMLDivElement>(null);
  const headerEl = useRef<HTMLDivElement>(null);
  const pointerY = useRef(0);
  // The latest drop-target finder, for the auto-scroll loop (which outlives a single render).
  const dropTargetAt = useRef<(clientY: number) => number | null>(() => null);
  const dialogEl = useRef<HTMLDialogElement>(null);
  const focusAfterRender = useRef<FocusTarget | null>(null);

  const kinds = rows.map((r) => r.kind);
  const labels = rowLabels(rows);
  const nudges = sceneNudges(rows);
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

  // Keep the drop-target finder current for the auto-scroll loop below.
  useLayoutEffect(() => {
    dropTargetAt.current = (clientY) => (drag ? targetAt(clientY, drag.from) : null);
  });

  // While dragging a row, keep scrolling the sheet (then the page) whenever the pointer is near or
  // past its visible top edge (just under the sticky header) or bottom edge — even if the pointer is
  // held still — and keep the drop line in step.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const step = () => {
      const sheet = scrollEl.current;
      const y = pointerY.current;
      const headerHeight = headerEl.current?.offsetHeight ?? 0;
      if (sheet && autoScrollStep(sheet, y, headerHeight)) {
        const target = dropTargetAt.current(y);
        if (target !== null) setDrag((d) => d && (d.target === target ? d : { ...d, target }));
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [dragging]);

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

  // ----- Characters -----

  /** Leaving a Characters cell: new names join the end of the list, and the cell is put in list order. */
  function charactersCellDone(key: string) {
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    const list = addCharacters(characters, parseCharacters(row.characters));
    if (list.length !== characters.length) setCharacters(list);
    const sorted = sortCell(row.characters, list);
    if (sorted !== row.characters) updateCell(key, "characters", sorted);
  }

  function moveCharacterTo(from: number, to: number) {
    const list = moveCharacter(characters, from, to);
    setCharacters(list);
    setRows((prev) => sortAllCells(prev, list));
    setAnnouncement(`${characters[from]} moved to position ${to + 1}`);
  }

  function renameCharacterAt(index: number, name: string): string | null {
    const result = renameCharacter(rows, characters, index, name);
    if (result.status !== "ok") {
      if (result.status === "empty") return "A character needs a name.";
      return result.status === "exists" ? `${result.name} is already in the list.` : null;
    }
    setCharacters(result.list);
    setRows(sortAllCells(result.rows, result.list));
    return null;
  }

  /** Removing a character that scenes list asks first; otherwise it goes straight away. */
  function requestRemoveCharacter(index: number) {
    if (scenesWith(rows, characters[index]) > 0) return setPendingChoice({ type: "removeCharacter", name: characters[index] });
    setCharacters(characters.filter((_, i) => i !== index));
  }

  function confirmRemoveCharacter(name: string) {
    const index = characters.indexOf(name);
    if (index !== -1) {
      const result = removeCharacter(rows, characters, index);
      setCharacters(result.list);
      setRows(result.rows);
      setAnnouncement(`Removed ${name}`);
    }
    closeDialog();
  }

  /** The + on a character: adds them to a scene by number and says what happened. */
  function addCharacterToScene(name: string, sceneText: string): { ok: boolean; message: string } {
    const result = addToScene(rows, characters, name, sceneText);
    if (result.status !== "added") {
      return result.status === "missing"
        ? { ok: false, message: `Scene ${result.number} doesn't exist` }
        : { ok: true, message: `Already in scene ${result.number}` };
    }
    setRows(result.rows);
    setAnnouncement(`${name} added to scene ${result.number}`);
    return { ok: true, message: `Added to scene ${result.number}` };
  }

  function addCharacter(raw: string): string | null {
    const name = raw.replace(/\s+/g, " ").replace(/,/g, "").trim();
    if (!name) return "A character needs a name.";
    if (characters.some((n) => n.toLowerCase() === name.toLowerCase())) return `${name} is already in the list.`;
    setCharacters([...characters, name]);
    return null;
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
    pointerY.current = e.clientY;
    setDrag({ from: index, count: blockEnd(kinds, index) - index, target: index });
  }

  function onGripPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    pointerY.current = e.clientY;
    if (!drag) return;
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
  const charactersPayload = JSON.stringify(characters);
  const unsaved =
    snapshotOf(title, payload, charactersPayload) !== (state?.snapshot ?? initial.snapshot) || (!id && pendingScript !== null);

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

  // ----- Script -----

  function pickScript() {
    setScriptError(null);
    scriptInputEl.current?.click();
  }

  function setPending(file: File | null) {
    pendingScriptRef.current = file;
    setPendingScript(file);
  }

  /**
   * Checks a picked file, then attaches it (saved shotlist) or holds it for the first save (new),
   * and offers to autofill from it — which, for a shotlist just created with a script, is automatic.
   */
  async function scriptChosen(file: File) {
    const problem = scriptProblem(file.name, file.size);
    if (problem) return setScriptError(problem);
    if (!id) {
      setPending(file);
      return autofill(file);
    }
    setScriptBusy("uploading");
    try {
      const body = new FormData();
      body.set("script", file);
      const result = await attachScript(id, body);
      if (!result.script) return setScriptError(result.error ?? "Couldn't attach the script. Try again.");
      setScript(result.script);
      if (result.doc && result.version) adoptScriptText({ doc: result.doc, version: result.version });
      // The upload also read the script: offer autofill straight away (or say why it can't).
      if (result.scenes?.length && result.version) {
        setPendingChoice({ type: "autofill", fileName: file.name, scenes: result.scenes, version: result.version });
      } else if (result.parseError) {
        setScriptError(result.parseError);
      }
    } catch {
      setScriptError("Couldn't upload the script. Try again.");
    } finally {
      setScriptBusy(null);
    }
  }

  /** Reads scenes from a script (a picked file, or the stored one) and shows what was found. */
  async function autofill(source: File | "stored") {
    setScriptError(null);
    setScriptBusy("reading");
    try {
      let result;
      if (source === "stored") {
        result = await parseStoredScript(id!);
      } else {
        const body = new FormData();
        body.set("script", source);
        result = await parseScriptFile(body);
      }
      if (result.doc && result.version) adoptScriptText({ doc: result.doc, version: result.version });
      if (!result.scenes?.length || !result.version) return setScriptError(result.error ?? "Couldn't read the script.");
      setPendingChoice({
        type: "autofill",
        fileName: source === "stored" ? script!.fileName : source.name,
        scenes: result.scenes,
        version: result.version,
      });
    } catch {
      setScriptError("Couldn't read the script. Try again.");
    } finally {
      setScriptBusy(null);
    }
  }

  /**
   * Puts the script's scenes into the sheet (an unsaved change, like any edit), and names an untitled
   * shotlist after the script's file.
   */
  function applyAutofill(fileName: string, scenes: ScriptScene[], version: string, mode: "replace" | "merge" | "append") {
    if (!title.trim()) setTitle(titleFromFileName(fileName));
    const create = (row: RowData): EditorRow => ({ ...row, key: `r${nextKey.current++}` });
    const next =
      mode === "merge"
        ? mergeScenes(rows, scenes, create, version)
        : mode === "append"
          ? appendScenes(rows, scenes, create, version)
          : scenesToRows(scenes, version).map(create);
    // Replacing starts the list over in order of first mention; otherwise newcomers go at the end.
    const fromScript = scriptCharacters(scenes);
    const list = addCharacters(mode === "replace" ? fromScript : addCharacters(characters, fromScript), charactersInRows(next));
    setAnnouncement(`Autofilled ${scenes.length} scene${scenes.length === 1 ? "" : "s"} from the script`);
    setCharacters(list);
    setRows(sortAllCells(next, list));
    setCharactersOpen(true);
    closeDialog();
  }

  function requestRemoveScript() {
    setScriptError(null);
    if (!id) setPending(null); // nothing stored yet
    else setPendingChoice({ type: "removeScript" });
  }

  async function confirmRemoveScript() {
    setScriptBusy("removing");
    try {
      const result = await removeScript(id!);
      if (result.error) return setScriptError(result.error);
      setScript(null);
      setScriptText(null); // shots keep their links, hidden until a script is attached again
      closeDialog();
    } catch {
      setScriptError("Couldn't remove the script. Try again.");
    } finally {
      setScriptBusy(null);
    }
  }

  // ----- Linking shots to the script -----

  /**
   * Takes on a script's text. Links made against another version (a new draft, or a script attached
   * again after being removed) are found again in it; any that can't be are flagged on their shots.
   */
  function adoptScriptText(text: { doc: ScriptDoc; version: string }) {
    setScriptText(text);
    setRows((prev) => {
      const { rows: next } = reanchorRows(prev, text.doc, text.version);
      return next.every((r, i) => r === prev[i]) ? prev : next;
    });
  }

  /** The script's text, reading it first if needed (for the panel). */
  async function ensureScriptText() {
    if (scriptText) return scriptText;
    setPanelLoading(true);
    setPanelError(null);
    try {
      let result;
      if (pendingScript) {
        const body = new FormData();
        body.set("script", pendingScript);
        result = await parseScriptFile(body);
      } else {
        result = await parseStoredScript(id!);
      }
      if (!result.doc || !result.version) {
        setPanelError(result.error ?? "Couldn't read the script.");
        return null;
      }
      const text = { doc: result.doc, version: result.version };
      adoptScriptText(text);
      return text;
    } catch {
      setPanelError("Couldn't read the script. Try again.");
      return null;
    } finally {
      setPanelLoading(false);
    }
  }

  function openScript(key: string) {
    setPanel({ key, picking: false });
    void ensureScriptText();
  }

  /** Links the panel's scene row to a script scene, and finds its shots' links in it again. */
  function pickScriptScene(sceneIndex: number, segment: number) {
    if (!scriptText) return;
    const { doc, version } = scriptText;
    const linked = rows.map((r, i) => (i === sceneIndex ? { ...r, scriptLink: writeSceneLink({ v: version, scene: segment, heading: doc.segments[segment].heading }) } : r));
    setRows(reanchorRows(staleShotsUnder(linked, sceneIndex), doc, version).rows);
    setPanel((p) => p && { ...p, picking: false });
  }

  /** Links runs of paragraphs (each [from, to]) of a script scene to a shot. */
  function linkLines(shotKey: string, segment: number, runs: [number, number][]) {
    if (!scriptText || runs.length === 0) return;
    const { doc, version } = scriptText;
    const row = rows.find((r) => r.key === shotKey);
    if (!row) return;
    const link = runs.reduce((l, [from, to]) => addSection(l, doc, version, segment, from, to), readShotLink(row.scriptLink));
    updateCell(shotKey, "scriptLink", writeShotLink(link));
    setAnnouncement(`Linked ${formatRuns(runs).replaceAll("¶", "paragraph ")}`);
  }

  function unlinkSection(shotKey: string, index: number) {
    const row = rows.find((r) => r.key === shotKey);
    const link = row && readShotLink(row.scriptLink);
    if (link) updateCell(shotKey, "scriptLink", writeShotLink(removeSection(link, index)));
  }

  /** Builds and downloads an .xlsx of the given title and rows. */
  async function exportFile(fileTitle: string, fileRows: RowData[], fileCharacters: string[]) {
    setExporting(true);
    setExportError(null);
    try {
      await downloadShotlist(fileTitle.trim() || "Untitled shotlist", fileRows, fileCharacters);
    } catch {
      setExportError("Couldn't create the spreadsheet. Try again.");
    } finally {
      setExporting(false);
    }
  }

  /** The Download button: asks to save first if there are unsaved changes, then for a title if there isn't one. */
  function download() {
    if (unsaved) setPendingChoice({ type: "download" });
    else downloadAsIs();
  }

  /** Downloads without saving; a shotlist without a title is named first (the title stays unsaved). */
  function downloadAsIs() {
    if (!title.trim()) return setPendingChoice({ type: "downloadTitle" });
    closeDialog();
    void exportFile(title, rows.map(cleanRow), characters);
  }

  /** Sets the title from the title prompt and downloads, without saving. */
  function downloadWithTitle(newTitle: string) {
    flushSync(() => {
      setTitle(newTitle);
      setPendingChoice(null);
    });
    dialogEl.current?.close();
    void exportFile(newTitle, rows.map(cleanRow), characters);
  }

  /** Saves with `newTitle` (from the title prompt), then does `then`, if anything. */
  function saveWithTitle(newTitle: string, then: AfterSave | null) {
    flushSync(() => {
      setTitle(newTitle);
      setPendingChoice(null);
    });
    dialogEl.current?.close();
    afterSave.current = then;
    saveFormEl.current?.requestSubmit();
  }

  /** "Save and leave" / "Save and download": asks for a title first if there isn't one. */
  function saveThen(then: AfterSave) {
    if (!title.trim()) return setPendingChoice({ type: "title", then });
    closeDialog();
    afterSave.current = then;
    saveFormEl.current?.requestSubmit();
  }
  // Clear the choice in the same update as the change it made, so the dialog never renders
  // against rows it no longer matches (the <dialog> close event arrives later).
  const closeDialog = () => {
    setPendingChoice(null);
    dialogEl.current?.close();
  };

  // The Script column and panel exist while the shotlist has a script (links stay hidden otherwise).
  const hasScript = !!(script || pendingScript);
  const panelIndex = panel && hasScript ? rows.findIndex((r) => r.key === panel.key) : -1;
  const panelRow = panelIndex === -1 ? null : rows[panelIndex];
  const panelSceneIndex = panelRow ? (panelRow.kind === ROW_KIND.SCENE ? panelIndex : sceneRowFor(rows, panelIndex)) : -1;
  const panelSceneLink = panelSceneIndex === -1 ? null : readSceneLink(rows[panelSceneIndex].scriptLink);
  const panelSegment =
    panelSceneLink && scriptText && panelSceneLink.scene < scriptText.doc.segments.length ? panelSceneLink.scene : null;
  const panelShots =
    panelSceneIndex === -1
      ? []
      : shotsUnder(rows, panelSceneIndex).map((i) => ({ key: rows[i].key, label: labels[i], link: readShotLink(rows[i].scriptLink) }));
  const grid = hasScript ? GRID_SCRIPT : GRID;
  const shotsNeedingRelink = hasScript ? rows.filter((r) => r.kind === ROW_KIND.SHOT && linkSummary(readShotLink(r.scriptLink))?.broken).length : 0;

  return (
    <div
      className={`mx-auto w-full flex-1 px-4 py-6 ${
        panelRow ? "max-w-[100rem] lg:grid lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start lg:gap-6" : "max-w-6xl"
      }`}
    >
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <div className="ml-auto flex items-center gap-3">
          {exportError || state?.error ? (
            <p role="alert" className="text-sm text-red-300">{exportError ?? state?.error}</p>
          ) : (
            state?.savedAt && (
              <p className="text-sm text-muted">Saved at {new Date(state.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
            )
          )}
          <button type="button" className="btn-secondary" disabled={exporting} onClick={download}>
            {exporting ? "Preparing…" : "Download"}
          </button>
          {/* Only the button is inside the form, so Enter in a cell doesn't submit. */}
          <form
            ref={saveFormEl}
            action={action}
            onSubmit={(e) => {
              // No title yet: ask for one instead of saving (a prevented submit doesn't run the action).
              if (title.trim()) return;
              e.preventDefault();
              setPendingChoice({ type: "title", then: null });
            }}
          >
            {id && <input type="hidden" name="id" value={id} />}
            <input type="hidden" name="title" value={title} />
            <input type="hidden" name="rows" value={payload} />
            <input type="hidden" name="characters" value={charactersPayload} />
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </form>
        </div>
      </div>

      <ScriptBar
        shotlistId={id}
        script={script}
        pending={pendingScript}
        busy={scriptBusy}
        error={pendingChoice?.type === "removeScript" ? null : scriptError}
        notice={
          shotsNeedingRelink
            ? `${shotsNeedingRelink} shot${shotsNeedingRelink === 1 ? " needs" : "s need"} re-linking — their lines weren't found in this script (marked ⚠ in the Script column).`
            : null
        }
        onPick={pickScript}
        onRemove={requestRemoveScript}
        onAutofill={() => void autofill(pendingScript ?? "stored")}
      />
      <input
        ref={scriptInputEl}
        type="file"
        accept={SCRIPT_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // so picking the same file again still fires
          if (file) void scriptChosen(file);
        }}
      />

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

      <CharacterList
        names={characters}
        open={charactersOpen}
        onToggle={() => setCharactersOpen((o) => !o)}
        onMove={moveCharacterTo}
        onRename={renameCharacterAt}
        onRemove={requestRemoveCharacter}
        onAdd={addCharacter}
        onAddToScene={addCharacterToScene}
      />

      <div
        ref={scrollEl}
        data-sheet
        className={`max-h-[calc(100dvh-15rem)] min-h-64 overflow-auto rounded-lg border border-line ${drag ? "cursor-grabbing select-none" : ""}`}
      >
        <div className={`${hasScript ? "min-w-[60rem]" : "min-w-[49rem]"} pb-12`}>
          <div ref={headerEl} className="sticky top-0 z-20 text-xs font-semibold uppercase tracking-wide">
            <HeaderRow grid={grid} className="bg-scene" number="Scene #" columns={SCENE_COLUMNS} script={hasScript ? "Script scene" : null} />
            <HeaderRow grid={grid} className="bg-header text-muted" number="Shot #" columns={SHOT_COLUMNS} script={hasScript ? "Script" : null} />
          </div>

          <InsertZone boundary={0} drag={drag} open={openZone === 0} onShow={showZone} onHide={hideZoneSoon} onInsert={insertFromZone} />
          {rows.map((row, i) => (
            <div key={row.key}>
              <SheetRow
                grid={grid}
                scriptCell={
                  hasScript ? (
                    <ScriptCell
                      row={row}
                      label={labels[i]}
                      inScene={row.kind === ROW_KIND.SCENE || sceneRowFor(rows, i) !== -1}
                      open={panel?.key === row.key}
                      onOpen={() => openScript(row.key)}
                    />
                  ) : null
                }
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
                onCellBlur={(field) => field === "characters" && charactersCellDone(row.key)}
                onRenumber={(text, keepFocus) => renumber(i, text, keepFocus)}
                nudge={nudges.get(i)}
                onNudge={(dir, keepFocus) => {
                  const target = nudges.get(i)?.[dir];
                  if (target) renumber(i, target, keepFocus);
                }}
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

    </div>
      {panelRow && panelSceneIndex !== -1 && (
        <ScriptPanel
          title={panelRow.kind === ROW_KIND.SHOT ? `Script · Shot ${labels[panelIndex]}` : `Script · Scene ${labels[panelIndex]}`}
          doc={scriptText?.doc ?? null}
          loading={panelLoading}
          error={panelError}
          segment={panelSegment}
          picking={panel!.picking}
          shots={panelShots}
          current={panelRow.kind === ROW_KIND.SHOT ? panelRow.key : null}
          onPick={(segment) => pickScriptScene(panelSceneIndex, segment)}
          onChangeScene={() => setPanel((p) => p && { ...p, picking: true })}
          onCancelPick={() => setPanel((p) => p && { ...p, picking: false })}
          onSelectShot={(key) => setPanel({ key, picking: false })}
          onLink={(shotKey, runs) => panelSegment !== null && linkLines(shotKey, panelSegment, runs)}
          onRemoveSection={unlinkSection}
          onClose={() => setPanel(null)}
        />
      )}

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
            description={`A shotlist needs a title before it can be saved${
              pendingChoice.then?.type === "leave" ? ", then you'll continue." : pendingChoice.then?.type === "download" ? ", then it will download." : "."
            }`}
            submitLabel={pendingChoice.then?.type === "leave" ? "Save and leave" : pendingChoice.then?.type === "download" ? "Save and download" : "Save"}
            onSubmit={(newTitle) => saveWithTitle(newTitle, pendingChoice.then)}
            onCancel={closeDialog}
          />
        )}
        {pendingChoice?.type === "start" && (
          <ChoiceDialog title="New shotlist" body="Would you like to attach a script? You can also add one later.">
            <ChoiceCard
              autoFocus
              title="Upload a script"
              detail={`A .doc, .docx, .pdf or .fdx file, up to ${formatFileSize(MAX_SCRIPT_BYTES)}`}
              onClick={() => {
                closeDialog();
                pickScript();
              }}
            />
            <ChoiceCard title="Start without a script" detail="You can add one later from the top of the shotlist" onClick={closeDialog} />
          </ChoiceDialog>
        )}
        {pendingChoice?.type === "autofill" && (
          <AutofillDialog
            fileName={pendingChoice.fileName}
            newTitle={title.trim() ? null : titleFromFileName(pendingChoice.fileName)}
            scenes={pendingChoice.scenes}
            rows={rows}
            onApply={(mode) => applyAutofill(pendingChoice.fileName, pendingChoice.scenes, pendingChoice.version, mode)}
            onCancel={closeDialog}
          />
        )}
        {pendingChoice?.type === "removeCharacter" && (
          <ConfirmDialog
            title={`Remove ${pendingChoice.name}?`}
            body={`${pendingChoice.name} is listed in ${scenesWith(rows, pendingChoice.name) === 1 ? "1 scene" : `${scenesWith(rows, pendingChoice.name)} scenes`}. Removing them from the list also removes them from those scenes.`}
            confirmLabel="Remove"
            busyLabel="Removing…"
            onConfirm={() => confirmRemoveCharacter(pendingChoice.name)}
            onCancel={closeDialog}
          />
        )}
        {pendingChoice?.type === "removeScript" && script && (
          <ConfirmDialog
            title={`Remove “${script.fileName}”?`}
            body="The script file is removed from this shotlist. The shotlist itself isn't changed."
            confirmLabel="Remove"
            busyLabel="Removing…"
            busy={scriptBusy === "removing"}
            error={scriptError}
            onConfirm={() => void confirmRemoveScript()}
            onCancel={closeDialog}
          />
        )}
        {pendingChoice?.type === "downloadTitle" && (
          <TitleDialog
            description="The shotlist needs a title before it can be downloaded. The file is named after it."
            submitLabel="Download"
            onSubmit={downloadWithTitle}
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
              onClick={() => saveThen({ type: "leave", proceed: pendingChoice.proceed })}
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
        {pendingChoice?.type === "download" && (
          <ChoiceDialog
            title="Save before downloading?"
            body="This shotlist has changes that haven't been saved."
            onCancel={closeDialog}
          >
            <ChoiceCard
              autoFocus
              title="Save and download"
              detail={title.trim() ? "Saves the shotlist, then downloads it" : "Asks for a title, saves the shotlist, then downloads it"}
              onClick={() => saveThen({ type: "download" })}
            />
            <ChoiceCard
              title="Download without saving"
              detail={
                title.trim()
                  ? "The file includes your unsaved changes; the shotlist stays unsaved"
                  : "Asks for a title, then downloads; the shotlist stays unsaved"
              }
              onClick={downloadAsIs}
            />
          </ChoiceDialog>
        )}
      </dialog>
    </div>
  );
}

function HeaderRow({
  grid,
  className,
  number,
  columns,
  script,
}: {
  grid: string;
  className: string;
  number: string;
  columns: Column[];
  script: string | null;
}) {
  return (
    <div className={`${grid} ${className}`}>
      <div className={`${CELL} py-1.5 pl-7 pr-2`}>{number}</div>
      {columns.map((c) => (
        <div key={c.field} className={`${CELL} px-2 py-1.5`}>{c.label}</div>
      ))}
      {script && <div className={`${CELL} px-2 py-1.5`}>{script}</div>}
    </div>
  );
}

/**
 * A row's Script cell. A scene row shows the script scene it's linked to (or "Choose script scene");
 * a shot row shows its first linked line, "+N more", and a warning if any need re-linking. Clicking
 * opens the side panel. Shots above the first scene have nothing to link to.
 */
function ScriptCell({ row, label, inScene, open, onOpen }: { row: EditorRow; label: string; inScene: boolean; open: boolean; onOpen: () => void }) {
  const isScene = row.kind === ROW_KIND.SCENE;
  if (!inScene) return <div className={CELL} />;
  const sceneLink = isScene ? readSceneLink(row.scriptLink) : null;
  const summary = isScene ? null : linkSummary(readShotLink(row.scriptLink));
  let text: React.ReactNode;
  let ariaLabel: string;
  if (isScene) {
    const heading = sceneLink && displayHeading(sceneLink.heading);
    text = heading ? <span className="truncate">{heading}</span> : <span className="text-muted">Choose script scene</span>;
    ariaLabel = heading ? `Scene ${label}'s script scene: ${heading}` : `Choose the script scene for scene ${label}`;
  } else if (summary) {
    text = (
      <>
        {summary.broken > 0 && <span className="shrink-0 text-red-300" title="Needs re-linking">⚠</span>}
        <span className="min-w-0 truncate">{summary.first}</span>
        {summary.more > 0 && <span className="shrink-0 text-xs text-muted">+{summary.more} more</span>}
      </>
    );
    ariaLabel = `Shot ${label}'s script lines: ${summary.first}${summary.more ? ` and ${summary.more} more` : ""}${summary.broken ? ", needs re-linking" : ""}`;
  } else {
    text = <span className="text-muted opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100">Link to script</span>;
    ariaLabel = `Link shot ${label} to the script`;
  }
  return (
    <div className={CELL}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        className={`flex h-full w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-foreground/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-foreground/70 ${open ? "bg-foreground/15" : ""}`}
        onClick={onOpen}
      >
        <svg aria-hidden viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 fill-none stroke-current ${summary || sceneLink ? "" : "opacity-50"}`} strokeWidth={1.25}>
          <path d="M4 1.5h5l3.5 3.5v9.5h-8.5z M9 1.5v3.5h3.5" strokeLinejoin="round" />
        </svg>
        {text}
      </button>
    </div>
  );
}

function SheetRow({
  grid,
  scriptCell,
  row,
  label,
  autoFocus,
  lifted,
  numberError,
  rowRef,
  gripRef,
  numberRef,
  onChange,
  onCellBlur,
  onRenumber,
  nudge,
  onNudge,
  onGripPointerDown,
  onGripPointerMove,
  onGripPointerUp,
  onGripPointerCancel,
  onGripKeyDown,
  onDelete,
}: {
  grid: string;
  scriptCell: React.ReactNode;
  row: EditorRow;
  label: string;
  autoFocus: boolean;
  lifted: boolean;
  numberError: string | null;
  rowRef: React.RefCallback<HTMLDivElement>;
  gripRef: React.RefCallback<HTMLButtonElement>;
  numberRef: React.RefCallback<HTMLInputElement>;
  onChange: (field: RowField, value: string) => void;
  onCellBlur: (field: RowField) => void;
  onRenumber: (text: string, keepFocus: boolean) => boolean;
  /** The numbers ▲ (lower) and ▼ (higher) step to (null where there's no gap). */
  nudge?: SceneNudge;
  onNudge: (dir: keyof SceneNudge, keepFocus: boolean) => void;
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
    <div ref={rowRef} className={`group/row ${grid} text-sm ${isScene ? "bg-scene font-medium" : ""} ${lifted ? "opacity-40" : ""}`}>
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
          <div className="relative min-w-0 flex-1">
            <input
              // Remount when the number changes so the field shows the new value.
              key={row.sceneNumber}
              ref={numberRef}
              defaultValue={row.sceneNumber}
              aria-label={`Scene ${label} number`}
              aria-invalid={numberError ? true : undefined}
              title="Type a new scene number and press Enter, or use ↑ (−1) ↓ (+1) to step into a gap"
              inputMode="decimal"
              maxLength={40}
              className="h-7 w-full rounded bg-transparent px-1 pr-4 font-semibold tabular-nums hover:bg-foreground/10 focus:bg-background focus:outline-none focus:ring-2 focus:ring-foreground/70"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitNumber(e.currentTarget, true);
                } else if (e.key === "Escape") {
                  e.currentTarget.value = row.sceneNumber;
                } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.currentTarget.value === row.sceneNumber) {
                  // Step into a gap (only when not mid-edit): ↑ moves up the sheet (−1), ↓ down (+1).
                  const dir = e.key === "ArrowUp" ? "lower" : "higher";
                  if (nudge?.[dir]) {
                    e.preventDefault();
                    onNudge(dir, true);
                  }
                }
              }}
              onBlur={(e) => commitNumber(e.currentTarget, false)}
            />
            {(nudge?.lower || nudge?.higher) && (
              <div className={`absolute inset-y-0 right-0.5 flex flex-col justify-center ${reveal}`}>
                {/* ▲ = lower number (up the sheet), ▼ = higher number. */}
                {(["lower", "higher"] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    tabIndex={-1} // the number field's ↑ ↓ keys do the same
                    aria-label={nudge[dir] ? `Renumber scene ${label} to ${nudge[dir]}` : undefined}
                    title={nudge[dir] ? `Make it scene ${nudge[dir]}` : undefined}
                    disabled={!nudge[dir]}
                    className={`flex h-3 w-3.5 items-center justify-center rounded-sm text-muted hover:bg-foreground/15 hover:text-foreground ${nudge[dir] ? "" : "invisible"}`}
                    // Don't take focus from the number field.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onNudge(dir, false)}
                  >
                    <svg aria-hidden viewBox="0 0 8 5" className={`h-1.5 w-2 fill-current ${dir === "higher" ? "rotate-180" : ""}`}>
                      <path d="M0 5L4 0l4 5z" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>
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
              onBlur={() => onCellBlur(c.field)}
            />
          )}
        </div>
      ))}
      {scriptCell}
    </div>
  );
}

const range = (from: string, to: string) => (from === to ? from : `${from}–${to}`);
const plural = (from: string, to: string) => (from === to ? "scene" : "scenes");
const renumbers = (r: RunShift) => `Renumbers ${plural(r.from, r.to)} ${range(r.from, r.to)} to ${range(r.newFrom, r.newTo)}`;

/** Asks for a title when saving (or downloading) a shotlist that doesn't have one. */
function TitleDialog({
  description,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  description: string;
  submitLabel: string;
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <h2 className="text-lg font-semibold">Name your shotlist</h2>
      <p className="text-sm text-muted">{description}</p>
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
        <button type="submit" className="btn-primary" disabled={!value.trim()}>{submitLabel}</button>
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

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * What autofill found, and how to apply it. On an empty sheet: Apply / Cancel. With data already
 * in the sheet: fill in (merge), replace everything, or add to the end.
 */
function AutofillDialog({
  fileName,
  newTitle,
  scenes,
  rows,
  onApply,
  onCancel,
}: {
  fileName: string;
  /** The title an untitled shotlist will get, if any. */
  newTitle: string | null;
  scenes: ScriptScene[];
  rows: readonly RowData[];
  onApply: (mode: "replace" | "merge" | "append") => void;
  onCancel: () => void;
}) {
  const found = scriptSummary(scenes);
  const summary = `Found ${count(found.scenes, "scene")} and ${count(found.characters, "speaking character")}.`;
  const naming = newTitle ? ` The shotlist will be named “${newTitle}”.` : "";
  const title = `Autofill from “${fileName}”`;

  if (sheetIsEmpty(rows)) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted">
          {summary} They&apos;ll be added as scenes; you can edit them before saving.{naming}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-primary flex-1" onClick={() => onApply("replace")}>Apply</button>
          <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  const sceneRows = rows.filter((r) => r.kind === ROW_KIND.SCENE);
  const shotCount = rows.length - sceneRows.length;
  const lastTop = Math.max(0, ...sceneRows.map((r) => Number(r.sceneNumber.split(".")[0])));
  return (
    <ChoiceDialog title={title} body={`${summary} This shotlist already has data. How should the script's scenes be added?${naming}`} onCancel={onCancel}>
      <ChoiceCard
        autoFocus
        title="Fill in from the script"
        detail="Matches scenes by number, fills only empty cells and adds missing scenes. Nothing you've typed changes."
        onClick={() => onApply("merge")}
      />
      <ChoiceCard
        title="Replace everything"
        detail={`Discards the current ${count(sceneRows.length, "scene")} and ${count(shotCount, "shot")}`}
        onClick={() => onApply("replace")}
      />
      <ChoiceCard
        title="Add to the end"
        detail={`Adds the script's scenes after everything else, numbered from ${lastTop + 1}`}
        onClick={() => onApply("append")}
      />
    </ChoiceDialog>
  );
}
