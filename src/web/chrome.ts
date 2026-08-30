import type { TreeKind } from "./tree.js";

export type SignalTone = "idle" | "live" | "ok" | "error";

export type Reading<Step extends string> = {
  word: string;
  tone: SignalTone;
  step: Step;
  kind: TreeKind;
  note: string;
};

export function must<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`missing #${id}`);
  }
  return node as T;
}

const signal = must("signal");
const status = must("status");

const activeOp = location.pathname.startsWith("/s/") ? "open" : "new";
for (const op of document.querySelectorAll("[data-op]")) {
  op.classList.toggle("is-active", op.getAttribute("data-op") === activeOp);
}

export function showReading(reading: Reading<string>): void {
  signal.textContent = reading.word;
  signal.dataset.tone = reading.tone;
  status.textContent = reading.note;
  status.classList.toggle("error", reading.tone === "error");
}
