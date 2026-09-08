import type { DiagramFocus, Reading, TreeLine } from "../../lib/signal.js";

export const OPEN_STEPS = ["key", "fetch", "unlock", "env"] as const;
export type OpenStep = (typeof OPEN_STEPS)[number];

export type OpenState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "unlocking" }
  | { phase: "revealed" }
  | { phase: "gone" }
  | { phase: "fetch_error"; message: string }
  | { phase: "tampered" }
  | { phase: "missing_key" }
  | { phase: "invalid_link" };

export const OPEN_READINGS: Record<OpenState["phase"], Reading<OpenStep>> = {
  idle: {
    word: "ready",
    tone: "idle",
    step: "key",
    kind: "hold",
    note: "",
  },
  loading: {
    word: "fetching",
    tone: "live",
    step: "fetch",
    kind: "now",
    note: "fetching ciphertext…",
  },
  unlocking: {
    word: "unsealing",
    tone: "live",
    step: "unlock",
    kind: "now",
    note: "decrypting in your browser…",
  },
  revealed: {
    word: "open",
    tone: "ok",
    step: "env",
    kind: "hold",
    note: "",
  },
  gone: {
    word: "not found",
    tone: "error",
    step: "fetch",
    kind: "error",
    note: "Not found. Spent, expired, or never existed.",
  },
  fetch_error: {
    word: "fault",
    tone: "error",
    step: "fetch",
    kind: "error",
    note: "",
  },
  tampered: {
    word: "fault",
    tone: "error",
    step: "unlock",
    kind: "error",
    note: "Couldn't decrypt. Wrong link or corrupted data.",
  },
  missing_key: {
    word: "no key",
    tone: "error",
    step: "key",
    kind: "error",
    note: "Missing #key.",
  },
  invalid_link: {
    word: "bad link",
    tone: "error",
    step: "key",
    kind: "error",
    note: "Couldn't parse that.",
  },
};

export const OPEN_DIAGRAM_FOCUS: Record<OpenState["phase"], DiagramFocus> = {
  idle: "link",
  invalid_link: "link",
  missing_key: "key",
  loading: "fetch",
  gone: "fetch",
  fetch_error: "fetch",
  unlocking: "unlock",
  tampered: "unlock",
  revealed: "revealed",
};

export const OPEN_TREE: readonly TreeLine<OpenStep>[] = [
  { step: "key", twig: "├── ", label: "enter shared link" },
  { step: "fetch", twig: "│   ├── ", label: "fetch ciphertext" },
  { step: "unlock", twig: "│   ├── ", label: "decrypt locally" },
  { step: "env", twig: "│   └── ", label: "copy .env" },
];

export function deriveOpenReading(state: OpenState): Reading<OpenStep> {
  const base = OPEN_READINGS[state.phase];
  if (state.phase === "fetch_error") {
    return { ...base, note: state.message };
  }
  return base;
}

export function showOpenForm(state: OpenState, isManual: boolean): boolean {
  return isManual && !["loading", "unlocking", "revealed"].includes(state.phase);
}
