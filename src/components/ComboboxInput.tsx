"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CellOption } from "@/lib/constants";

/**
 * A text input with a suggestion dropdown (ARIA combobox). Unlike a native <datalist>, opening the
 * dropdown (click, ▾, ↓ / Alt+↓) shows every option; only typing filters it. Any text is allowed.
 * The list is `position: fixed` so a scrolling container can't clip it, and closes on scroll/resize.
 */
export function ComboboxInput({
  value,
  options,
  onChange,
  className,
  ...inputProps
}: {
  value: string;
  options: CellOption[];
  onChange: (value: string) => void;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "list">) {
  const [open, setOpen] = useState(false);
  // null: show every option (just opened); a string: show options matching what was typed.
  const [filter, setFilter] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const inputEl = useRef<HTMLInputElement>(null);
  const listEl = useRef<HTMLDivElement>(null);
  const listId = useId();

  const query = filter?.trim().toLowerCase() ?? "";
  const shown = query
    ? options.filter((o) => o.value.toLowerCase().includes(query) || o.label?.toLowerCase().includes(query))
    : options;

  // Close when anything but the list itself scrolls, or the window resizes (the list wouldn't follow).
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => !listEl.current?.contains(e.target as Node) && setOpen(false);
    const onResize = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open && active >= 0) listEl.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function place() {
    const r = inputEl.current!.getBoundingClientRect();
    const height = Math.min(options.length * 34 + 8, 240);
    const below = window.innerHeight - r.bottom;
    const up = below < height && r.top > below;
    setPos({
      left: r.left,
      minWidth: Math.max(r.width, 160),
      maxHeight: Math.min(240, (up ? r.top : below) - 8),
      ...(up ? { bottom: window.innerHeight - r.top + 2 } : { top: r.bottom + 2 }),
    });
  }

  /** Opens showing every option, highlighting the current value. */
  function openAll() {
    place();
    setFilter(null);
    setActive(options.findIndex((o) => o.value === value));
    setOpen(true);
  }

  function choose(option: CellOption) {
    onChange(option.value);
    setOpen(false);
    setFilter(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open || e.altKey) return openAll();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open) {
      // Picks the highlighted option; with none highlighted, keeps the typed text.
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
      else setOpen(false);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const expanded = open && shown.length > 0;

  return (
    <div className="group/combo relative h-full">
      <input
        {...inputProps}
        ref={inputEl}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={`${className ?? ""} pr-6`}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) place();
          setFilter(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onClick={() => !open && openAll()}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className="absolute inset-y-0 right-0 flex w-6 items-center justify-center text-muted opacity-0 hover:text-foreground group-hover/combo:opacity-100 group-focus-within/combo:opacity-100"
        // Keep focus in the input.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          inputEl.current?.focus();
          if (open) setOpen(false);
          else openAll();
        }}
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
          <path d="M2 4h8L6 9z" />
        </svg>
      </button>
      {expanded && (
        <div
          ref={listEl}
          id={listId}
          role="listbox"
          style={pos}
          className="fixed z-40 overflow-auto rounded-md border border-line bg-surface p-1 text-sm shadow-lg"
        >
          {shown.map((o, i) => (
            <div
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`flex cursor-pointer items-baseline gap-2 rounded px-2 py-1.5 font-normal ${i === active ? "bg-foreground text-background" : ""}`}
              // Choose on mousedown so the input never blurs (which would close the list first).
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseMove={() => setActive(i)}
            >
              <span className="font-medium">{o.value}</span>
              {o.label && <span className={i === active ? "" : "text-muted"}>{o.label}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
