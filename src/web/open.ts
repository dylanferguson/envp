import "./styles.css";
import { parseKeyFragment, parseShareId } from "../shared/limits.js";
import { importKeyFromFragment, open } from "../shared/envelope.js";
import { paintTree } from "./tree.js";
import { must, showReading, type Reading } from "./chrome.js";

const OPEN_STEPS = ["key", "fetch", "unlock", "env"] as const;
type OpenStep = (typeof OPEN_STEPS)[number];

type OpenState =
  | { phase: "loading" }
  | { phase: "unlocking" }
  | { phase: "revealed" }
  | { phase: "gone" }
  | { phase: "tampered" }
  | { phase: "missing_key" };

const READINGS: Record<OpenState["phase"], Reading<OpenStep>> = {
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
    note: "no key in the link. ask the sender for the full URL, including the part after #.",
  },
};

const textarea = must<HTMLTextAreaElement>("env-output");
const copyButton = must<HTMLButtonElement>("copy");
const cycle = must("cycle");
let openLoadToken = 0;

function shareIdFromPath(): string | null {
  const match = location.pathname.match(/^\/s\/([^/]+)$/);
  return match?.[1] ?? null;
}

function render(state: OpenState): void {
  const reading = READINGS[state.phase];
  showReading(reading);
  paintTree(cycle, OPEN_STEPS, reading.step, reading.kind);

  const revealed = state.phase === "revealed";
  textarea.classList.toggle("is-out", !revealed);
  copyButton.classList.toggle("is-out", !revealed);
}

copyButton.addEventListener("click", () => {
  void navigator.clipboard.writeText(textarea.value).then(() => {
    showReading({ ...READINGS.revealed, note: "copied to clipboard" });
  });
});

async function loadShare(): Promise<void> {
  const token = ++openLoadToken;
  const rawId = shareIdFromPath();
  if (!rawId || !parseShareId(rawId)) {
    render({ phase: "gone" });
    return;
  }

  const fragment = parseKeyFragment(location.hash.slice(1));
  if (!fragment) {
    render({ phase: "missing_key" });
    return;
  }

  render({ phase: "loading" });
  const response = await fetch(`/shares/${rawId}`);
  if (token !== openLoadToken) {
    return;
  }
  if (!response.ok) {
    render({ phase: "gone" });
    return;
  }

  const envelope = new Uint8Array(await response.arrayBuffer());
  if (token !== openLoadToken) {
    return;
  }
  render({ phase: "unlocking" });
  try {
    const key = await importKeyFromFragment(fragment);
    const plaintext = await open(envelope, key);
    if (token !== openLoadToken) {
      return;
    }
    textarea.value = new TextDecoder().decode(plaintext);
    render({ phase: "revealed" });
  } catch {
    if (token !== openLoadToken) {
      return;
    }
    render({ phase: "tampered" });
  }
}

void loadShare();
