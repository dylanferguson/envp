export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") {
      node.className = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) {
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function footer(): HTMLElement {
  return el(
    "footer",
    { class: "footer" },
    el(
      "p",
      {},
      "The key is in the URL after #. Your browser keeps it. It never goes to us.",
    ),
    el(
      "p",
      {},
      "We only get the encrypted blob, the share id, when you uploaded, and your IP.",
    ),
    el(
      "p",
      {},
      "We cannot read your variables. Anyone with the full link can, until it expires.",
    ),
    el("p", {}, el("a", { href: "mailto:abuse@localhost" }, "Questions or abuse: abuse@localhost")),
  );
}
