export const SESSION_COOKIE = "shotlistr_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const ROW_KIND = { SCENE: "SCENE", SHOT: "SHOT" } as const;
export type RowKind = (typeof ROW_KIND)[keyof typeof ROW_KIND];

/** Suggested cell values (offered by ComboboxInput; any text is still accepted). */
export type CellOption = { value: string; label?: string };

export const INT_EXT_OPTIONS: CellOption[] = [{ value: "INT." }, { value: "EXT." }, { value: "INT./EXT." }];

export const TIME_OPTIONS: CellOption[] = [
  { value: "DAY" },
  { value: "NIGHT" },
  { value: "DAWN" },
  { value: "DUSK" },
  { value: "MORNING" },
  { value: "AFTERNOON" },
  { value: "EVENING" },
  { value: "CONTINUOUS" },
  { value: "LATER" },
];

export const FRAMING_OPTIONS: CellOption[] = [
  { value: "EWS", label: "Extreme wide shot" },
  { value: "WS", label: "Wide shot" },
  { value: "FS", label: "Full shot" },
  { value: "MWS", label: "Medium wide shot" },
  { value: "MS", label: "Medium shot" },
  { value: "MCU", label: "Medium close-up" },
  { value: "CU", label: "Close-up" },
  { value: "ECU", label: "Extreme close-up" },
  { value: "OTS", label: "Over the shoulder" },
  { value: "2S", label: "Two shot" },
  { value: "INSERT", label: "Insert" },
];

export const ANGLE_OPTIONS: CellOption[] = [
  { value: "Eye level" },
  { value: "High angle" },
  { value: "Low angle" },
  { value: "Overhead" },
  { value: "Worm's eye" },
  { value: "Dutch" },
  { value: "POV" },
];
