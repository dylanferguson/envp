import type { DiagramFocus } from "../../lib/diagram-focus.js";
import type { Reading, TreeLine } from "../../lib/signal.js";

export const CREATE_STEPS = ["paste", "encrypt", "send", "link"] as const;
export type CreateStep = (typeof CREATE_STEPS)[number];

export type CreateState =
  | { phase: "idle" }
  | { phase: "encrypting" }
  | { phase: "uploading"; bytes: number }
  | { phase: "done"; url: string; copied: boolean; expiresAt: number; maxReads: number }
  | { phase: "error"; at: "encrypt" | "send" | "link"; message: string };

const READINGS: Record<CreateState["phase"], Reading<CreateStep>> = {
  idle: {
    word: "ready",
    tone: "idle",
    step: "paste",
    kind: "hold",
    note: "",
  },
  encrypting: {
    word: "sealing",
    tone: "live",
    step: "encrypt",
    kind: "now",
    note: "encrypting in your browser…",
  },
  uploading: {
    word: "uploading",
    tone: "live",
    step: "send",
    kind: "now",
    note: "",
  },
  done: {
    word: "sealed",
    tone: "ok",
    step: "link",
    kind: "hold",
    note: "",
  },
  error: {
    word: "fault",
    tone: "error",
    step: "encrypt",
    kind: "error",
    note: "",
  },
};

export const CREATE_TREE: readonly TreeLine<CreateStep>[] = [
  { step: "paste", twig: "├── ", label: "enter .env" },
  { step: "encrypt", twig: "│   ├── ", label: "encrypt .env locally" },
  { step: "send", twig: "│   ├── ", label: "send ciphertext to server" },
  { step: "link", twig: "│   └── ", label: "share link" },
];

const CREATE_DIAGRAM_FOCUS: Record<Exclude<CreateState["phase"], "error">, DiagramFocus> = {
  idle: "paste",
  encrypting: "seal",
  // Upload is usually a few ms; keep seal so the diagram doesn't flash the server.
  uploading: "seal",
  done: "share",
};

const CREATE_ERROR_FOCUS: Record<Extract<CreateState, { phase: "error" }>["at"], DiagramFocus> = {
  encrypt: "seal",
  send: "send",
  link: "share",
};

export function deriveCreateDiagramFocus(state: CreateState): DiagramFocus {
  if (state.phase === "error") {
    return CREATE_ERROR_FOCUS[state.at];
  }
  return CREATE_DIAGRAM_FOCUS[state.phase];
}

export function deriveCreateReading(state: CreateState): Reading<CreateStep> {
  const base = READINGS[state.phase];
  if (state.phase === "uploading") {
    return {
      ...base,
      note: `uploading ${state.bytes} bytes, encrypted`,
    };
  }
  if (state.phase === "error") {
    return { ...base, step: state.at, note: state.message };
  }
  return base;
}

export function isCreateBusy(state: CreateState): boolean {
  return state.phase === "encrypting" || state.phase === "uploading";
}

export function isCreateDone(state: CreateState): state is Extract<CreateState, { phase: "done" }> {
  return state.phase === "done";
}
