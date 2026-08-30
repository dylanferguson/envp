export type TreeKind = "now" | "hold" | "error";

export function paintTree<T extends string>(
  root: HTMLElement,
  steps: readonly T[],
  at: T,
  kind: TreeKind,
): void {
  const idx = steps.indexOf(at);
  if (idx < 0) {
    return;
  }

  for (const node of root.querySelectorAll("[data-step]")) {
    const step = node.getAttribute("data-step");
    if (step === null) {
      continue;
    }
    const i = steps.findIndex((candidate) => candidate === step);
    node.classList.toggle("is-now", i === idx && kind === "now");
    node.classList.toggle("is-hold", i === idx && kind === "hold");
    node.classList.toggle("is-error", i === idx && kind === "error");
    node.classList.toggle("is-done", i >= 0 && i < idx);
  }

  for (const node of root.querySelectorAll("[data-twig]")) {
    const step = node.getAttribute("data-twig");
    if (step === null) {
      continue;
    }
    const i = steps.findIndex((candidate) => candidate === step);
    node.classList.toggle("is-lit", i >= 0 && i <= idx);
  }
}
