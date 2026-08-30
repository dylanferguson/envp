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
import { paintTree } from "./tree.js";
import { must, showReading, type Reading } from "./chrome.js";

const CREATE_STEPS = ["paste", "encrypt", "send", "link"] as const;
type CreateStep = (typeof CREATE_STEPS)[number];

type CreateState =
  | { phase: "idle" }
  | { phase: "encrypting" }
  | { phase: "uploading"; bytes: number }
  | { phase: "done"; url: string; copied: boolean }
  | { phase: "too_large" }
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
  too_large: {
    word: "too large",
    tone: "error",
    step: "paste",
    kind: "error",
    note: "over 16 KiB. trim it or split the file.",
  },
  error: {
    word: "fault",
    tone: "error",
    step: "encrypt",
    kind: "error",
    note: "",
  },
};

function readingFor(state: CreateState): Reading<CreateStep> {
  const base = READINGS[state.phase];
  switch (state.phase) {
    case "uploading":
      return { ...base, note: `uploading ${state.bytes} bytes, encrypted` };
    case "error":
      return { ...base, step: state.at, note: state.message };
    default:
      return base;
  }
}

const textarea = must<HTMLTextAreaElement>("env-input");
const expiryLabel = must("expiry-label");
const slider = must<HTMLInputElement>("ttl");
const shareButton = must<HTMLButtonElement>("share");
const cycle = must("cycle");
const compose = must("compose");
const done = must("done");
const doneTitle = must("done-title");
const doneExpiry = must("done-expiry");
const shareUrl = must<HTMLInputElement>("share-url");
const copyLink = must<HTMLButtonElement>("copy-link");
const again = must<HTMLButtonElement>("again");
const doneRail = must("done-rail");

let ttlSeconds = DEFAULT_TTL_SECONDS;

function showCopied(copied: boolean): void {
  doneTitle.textContent = copied
    ? "copied. send this link."
    : "copy this link, then send it.";
  doneRail.textContent = copied ? "already on your clipboard" : "select and copy";
  shareUrl.focus();
  shareUrl.select();
}

function render(next: CreateState): void {
  const reading = readingFor(next);
  showReading(reading);
  paintTree(cycle, CREATE_STEPS, reading.step, reading.kind);

  const isDone = next.phase === "done";
  shareButton.disabled =
    next.phase === "encrypting" || next.phase === "uploading";
  compose.classList.toggle("is-out", isDone);
  done.classList.toggle("is-out", !isDone);

  if (next.phase === "done") {
    doneExpiry.textContent = formatExpiryLabel(ttlSeconds);
    shareUrl.value = next.url;
    showCopied(next.copied);
  }
}

async function onShare(): Promise<void> {
  const encoded = new TextEncoder().encode(textarea.value);
  if (encoded.length > MAX_PLAINTEXT_BYTES) {
    render({ phase: "too_large" });
    return;
  }

  render({ phase: "encrypting" });
  let at: "encrypt" | "send" | "link" = "encrypt";
  try {
    const key = await generateKey();
    const envelope = await seal(encoded, key);
    const fragment = await exportKeyFragment(key);

    at = "send";
    render({ phase: "uploading", bytes: envelope.length });
    const response = await fetch(`/shares?ttl=${ttlSeconds}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: toArrayBuffer(envelope),
    });

    if (!response.ok) {
      render({
        phase: "error",
        at: "send",
        message: `upload failed (${response.status})`,
      });
      return;
    }

    const payload: unknown = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("id" in payload) ||
      typeof payload.id !== "string"
    ) {
      render({ phase: "error", at: "send", message: "upload failed" });
      return;
    }
    const id = parseShareId(payload.id);
    if (!id) {
      render({ phase: "error", at: "send", message: "upload failed" });
      return;
    }
    const url = `${location.origin}/s/${id}#${fragment}`;
    at = "link";
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      copied = false;
    }
    render({ phase: "done", url, copied });
  } catch (error) {
    if (error instanceof EnvelopeError) {
      render({ phase: "error", at: "encrypt", message: "encryption failed" });
      return;
    }
    render({
      phase: "error",
      at,
      message: "something went wrong",
    });
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

copyLink.addEventListener("click", () => {
  void navigator.clipboard.writeText(shareUrl.value).then(
    () => showCopied(true),
    () => showCopied(false),
  );
});

again.addEventListener("click", () => {
  textarea.value = "";
  render({ phase: "idle" });
  textarea.focus();
});

shareButton.addEventListener("click", () => {
  void onShare();
});

render({ phase: "idle" });
