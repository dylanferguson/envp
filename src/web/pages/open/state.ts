import type { Reading, TreeLine } from "../../lib/signal.js";

export const OPEN_STEPS = ["key", "fetch", "unlock", "env"] as const;
export type OpenStep = (typeof OPEN_STEPS)[number];

export type OpenState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "unlocking" }
  | { phase: "revealed" }
  | { phase: "gone" }
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
    word: "gone",
    tone: "error",
    step: "fetch",
    kind: "error",
    note: "gone. expired, deleted, or never existed.",
  },
  tampered: {
    word: "fault",
    tone: "error",
    step: "unlock",
    kind: "error",
    note: "couldn't decrypt. wrong link or corrupted data.",
  },
  missing_key: {
    word: "no key",
    tone: "error",
    step: "key",
    kind: "error",
    note: "missing #key. paste the full URL or share_id#key.",
  },
  invalid_link: {
    word: "bad link",
    tone: "error",
    step: "key",
    kind: "error",
    note: "couldn't parse that. use a full URL or share_id#key.",
  },
};

export const OPEN_TREE: readonly TreeLine<OpenStep>[] = [
  { step: "key", twig: "├── ", label: "enter full URL or share_id#key" },
  { step: "fetch", twig: "│   ├── ", label: "fetch ciphertext" },
  { step: "unlock", twig: "│   ├── ", label: "decrypt locally" },
  { step: "env", twig: "│   └── ", label: ".env is ready" },
];

export function deriveOpenReading(state: OpenState): Reading<OpenStep> {
  return OPEN_READINGS[state.phase];
}

export function showOpenForm(state: OpenState, isManual: boolean): boolean {
  return (
    isManual && !["loading", "unlocking", "revealed"].includes(state.phase)
  );
}
