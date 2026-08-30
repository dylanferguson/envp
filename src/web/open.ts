import "./styles.css";
import { parseKeyFragment, parseShareId } from "../shared/limits.js";
import { EnvelopeError, importKeyFromFragment, open } from "../shared/envelope.js";
import type { KeyFragment } from "../shared/limits.js";
import { clear, el, footer } from "./dom.js";

type OpenState =
  | { phase: "loading" }
  | { phase: "revealed" }
  | { phase: "gone" }
  | { phase: "tampered" }
  | { phase: "missing_key" };

const root = document.getElementById("app");
if (!root) {
  throw new Error("missing #app");
}

const textarea = el("textarea", {
  id: "env-output",
  readonly: "true",
  spellcheck: "false",
});
textarea.classList.add("hidden");

const copyButton = el("button", { type: "button" }, "copy");
copyButton.classList.add("hidden");

const status = el("div", { class: "status" });

function shareIdFromPath(): string | null {
  const match = location.pathname.match(/^\/s\/([^/]+)$/);
  return match?.[1] ?? null;
}

function keyFromHash(): KeyFragment | null {
  return parseKeyFragment(location.hash.slice(1));
}

function render(state: OpenState): void {
  clear(status);
  status.className =
    state.phase === "tampered" || state.phase === "missing_key"
      ? "status error"
      : "status";
  textarea.classList.add("hidden");
  copyButton.classList.add("hidden");

  switch (state.phase) {
    case "loading":
      status.append("fetching…");
      break;
    case "revealed":
      status.replaceChildren();
      textarea.classList.remove("hidden");
      copyButton.classList.remove("hidden");
      break;
    case "gone":
      status.append("gone. expired, deleted, or never existed.");
      break;
    case "tampered":
      status.append("couldn't decrypt. wrong link or corrupted data.");
      break;
    case "missing_key":
      status.append(
        "no key in the link. ask the sender for the full URL, including the part after #.",
      );
      break;
  }
}

copyButton.addEventListener("click", () => {
  void navigator.clipboard.writeText(textarea.value);
});

async function loadShare(): Promise<void> {
  render({ phase: "loading" });

  const rawId = shareIdFromPath();
  if (!rawId || !parseShareId(rawId)) {
    render({ phase: "gone" });
    return;
  }

  const fragment = keyFromHash();
  if (!fragment) {
    render({ phase: "missing_key" });
    return;
  }

  const response = await fetch(`/shares/${rawId}`);
  if (response.status === 404) {
    render({ phase: "gone" });
    return;
  }
  if (!response.ok) {
    render({ phase: "gone" });
    return;
  }

  const envelope = new Uint8Array(await response.arrayBuffer());
  try {
    const key = await importKeyFromFragment(fragment);
    const plaintext = await open(envelope, key);
    textarea.value = new TextDecoder().decode(plaintext);
    render({ phase: "revealed" });
  } catch (error) {
    if (error instanceof EnvelopeError) {
      render({ phase: "tampered" });
      return;
    }
    render({ phase: "tampered" });
  }
}

clear(root);
root.append(
  el("header", {}, el("h1", {}, "env-share"), el("p", {}, "paste · encrypt · link")),
  el("main", {}, el("label", { for: "env-output" }, "# decrypted .env"), textarea, copyButton),
  status,
  footer(),
);

void loadShare();
