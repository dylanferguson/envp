import "./styles.css";
import { toArrayBuffer } from "../shared/bytes.js";
import {
  DEFAULT_TTL_SECONDS,
  MAX_PLAINTEXT_BYTES,
  formatExpiryLabel,
  parseShareId,
  parseTtlSeconds,
} from "../shared/limits.js";
import {
  EnvelopeError,
  exportKeyFragment,
  generateKey,
  seal,
} from "../shared/envelope.js";
import { clear, el, footer } from "./dom.js";

type CreateState =
  | { phase: "idle" }
  | { phase: "encrypting" }
  | { phase: "uploading"; bytes: number }
  | { phase: "copied" }
  | { phase: "too_large" }
  | { phase: "error"; message: string };

const root = document.getElementById("app");
if (!root) {
  throw new Error("missing #app");
}

const textarea = el("textarea", {
  id: "env-input",
  spellcheck: "false",
  autocomplete: "off",
});
const expiryLabel = el("span", { class: "expiry-label" }, formatExpiryLabel(DEFAULT_TTL_SECONDS));
const slider = el("input", {
  type: "range",
  min: "60",
  max: "86400",
  value: String(DEFAULT_TTL_SECONDS),
});
const shareButton = el("button", { type: "button" }, "share");
const status = el("div", { class: "status" });

let ttlSeconds = DEFAULT_TTL_SECONDS;
let state: CreateState = { phase: "idle" };

function render(next: CreateState): void {
  state = next;
  clear(status);
  status.className =
    state.phase === "too_large" || state.phase === "error"
      ? "status error"
      : "status";
  shareButton.disabled =
    state.phase === "encrypting" || state.phase === "uploading";

  switch (state.phase) {
    case "idle":
      break;
    case "encrypting":
      status.append("encrypting in your browser…");
      break;
    case "uploading":
      status.append(`uploading ${state.bytes} bytes encrypted`);
      break;
    case "copied":
      status.append("link copied");
      break;
    case "too_large":
      status.append("over 16 KiB. trim it or split the file.");
      break;
    case "error":
      status.append(state.message);
      break;
  }
}

async function onShare(): Promise<void> {
  const text = textarea.value;
  const encoded = new TextEncoder().encode(text);
  if (encoded.length > MAX_PLAINTEXT_BYTES) {
    render({ phase: "too_large" });
    return;
  }

  render({ phase: "encrypting" });
  try {
    const key = await generateKey();
    const envelope = await seal(encoded, key);
    const fragment = await exportKeyFragment(key);

    render({ phase: "uploading", bytes: envelope.length });
    const response = await fetch(`/shares?ttl=${ttlSeconds}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: toArrayBuffer(envelope),
    });

    if (!response.ok) {
      render({ phase: "error", message: `upload failed (${response.status})` });
      return;
    }

    const payload: unknown = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("id" in payload) ||
      typeof payload.id !== "string"
    ) {
      render({ phase: "error", message: "upload failed" });
      return;
    }
    const id = parseShareId(payload.id);
    if (!id) {
      render({ phase: "error", message: "upload failed" });
      return;
    }
    const url = `${location.origin}/s/${id}#${fragment}`;
    await navigator.clipboard.writeText(url);
    render({ phase: "copied" });
  } catch (error) {
    if (error instanceof EnvelopeError) {
      render({ phase: "error", message: "encryption failed" });
      return;
    }
    render({ phase: "error", message: "something went wrong" });
  }
}

slider.addEventListener("input", () => {
  const parsed = parseTtlSeconds(slider.value);
  if (parsed === null) {
    return;
  }
  ttlSeconds = parsed;
  expiryLabel.textContent = formatExpiryLabel(ttlSeconds);
});

shareButton.addEventListener("click", () => {
  void onShare();
});

clear(root);
root.append(
  el("header", {}, el("h1", {}, "env-share"), el("p", {}, "paste · encrypt · link")),
  el("main", {}, el("label", { for: "env-input" }, "# paste your .env here"), textarea),
  el("div", { class: "controls" }, expiryLabel, slider, shareButton),
  status,
  footer(),
);

render({ phase: "idle" });
