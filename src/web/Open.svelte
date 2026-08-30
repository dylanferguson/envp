<script lang="ts">
  import "./app.css";
  import { onMount } from "svelte";
  import { parseKeyFragment, parseShareId } from "../shared/limits.js";
  import { importKeyFromFragment, open } from "../shared/envelope.js";
  import Chrome from "./Chrome.svelte";
  import StepTree from "./StepTree.svelte";
  import { getShare } from "./shares.js";

  const STEPS = ["key", "fetch", "unlock", "env"] as const;
  type Step = (typeof STEPS)[number];

  type SignalTone = "idle" | "live" | "ok" | "error";
  type TreeKind = "now" | "hold" | "error";

  type Reading = {
    word: string;
    tone: SignalTone;
    step: Step;
    kind: TreeKind;
    note: string;
  };

  type State =
    | { phase: "loading" }
    | { phase: "unlocking" }
    | { phase: "revealed" }
    | { phase: "gone" }
    | { phase: "tampered" }
    | { phase: "missing_key" };

  const READINGS: Record<State["phase"], Reading> = {
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

  const TREE = [
    { step: "key", label: "#key from the URL" },
    { step: "fetch", twig: "├── ", label: "fetch ciphertext" },
    { step: "unlock", twig: "│   └── ", label: "unlock in this tab" },
    { step: "env", twig: "│       └── ", label: ".env" },
  ] as const;

  let state = $state<State>({ phase: "loading" });
  let envOutput = $state("");
  let statusNote = $state("");
  let openLoadToken = 0;

  const reading = $derived(READINGS[state.phase]);
  const revealed = $derived(state.phase === "revealed");
  const statusText = $derived(statusNote || reading.note);

  function shareIdFromPath(): string | null {
    const match = location.pathname.match(/^\/s\/([^/]+)$/);
    return match?.[1] ?? null;
  }

  function onCopy(): void {
    void navigator.clipboard.writeText(envOutput).then(() => {
      statusNote = "copied to clipboard";
    });
  }

  async function loadShare(): Promise<void> {
    const token = ++openLoadToken;
    statusNote = "";
    const rawId = shareIdFromPath();
    if (!rawId || !parseShareId(rawId)) {
      state = { phase: "gone" };
      return;
    }

    const fragment = parseKeyFragment(location.hash.slice(1));
    if (!fragment) {
      state = { phase: "missing_key" };
      return;
    }

    state = { phase: "loading" };
    const envelope = await getShare(rawId);
    if (token !== openLoadToken) {
      return;
    }
    if (!envelope) {
      state = { phase: "gone" };
      return;
    }

    state = { phase: "unlocking" };
    try {
      const key = await importKeyFromFragment(fragment);
      const plaintext = await open(envelope, key);
      if (token !== openLoadToken) {
        return;
      }
      envOutput = new TextDecoder().decode(plaintext);
      state = { phase: "revealed" };
    } catch {
      if (token !== openLoadToken) {
        return;
      }
      state = { phase: "tampered" };
    }
  }

  onMount(() => {
    void loadShare();
  });
</script>

<Chrome activeOp="open" word={reading.word} tone={reading.tone}>
  <StepTree steps={STEPS} lines={TREE} at={reading.step} kind={reading.kind} />

  <section>
    <label for="env-output">decrypted .env</label>
    <div class="rail" aria-hidden="true">
      <span>┌─ open </span>
      <span class="rail-fill"></span>
      <span> local decrypt ─┐</span>
    </div>
    <div class="panel">
      <textarea
        id="env-output"
        class:is-out={!revealed}
        readonly
        value={envOutput}
        spellcheck={false}
      ></textarea>
    </div>
    <div class="rail" aria-hidden="true">
      <span>└─ never innerHTML </span>
      <span class="rail-fill"></span>
      <span>─┘</span>
    </div>
    <button class:is-out={!revealed} type="button" onclick={onCopy}>copy</button>
  </section>

  <div class="status" class:error={reading.tone === "error"}>
    {statusText}
  </div>
</Chrome>

<style>
  section {
    margin-bottom: 1.75rem;
  }

  label {
    display: block;
    margin-bottom: 0.65rem;
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
  }

  .rail {
    display: flex;
    align-items: baseline;
    color: var(--hairline-lit);
    font-size: 0.8rem;
    user-select: none;
  }

  .rail-fill {
    flex: 1;
    min-width: 1rem;
    border-bottom: 1px solid var(--hairline);
    margin: 0 0.35rem 0.3em;
  }

  .panel {
    border-inline: 1px solid var(--hairline);
    background: var(--surface);
  }

  textarea {
    display: block;
    width: 100%;
    min-height: 16rem;
    padding: 0.85rem 1rem;
    background: transparent;
    color: var(--fg);
    border: 0;
    border-radius: 0;
    font: inherit;
    resize: vertical;
    caret-color: var(--phosphor);
    transition:
      opacity 0.4s ease,
      min-height 0.4s ease,
      padding 0.4s ease;
  }

  textarea:focus {
    outline: none;
  }

  .panel:focus-within {
    border-inline-color: var(--phosphor);
  }

  .rail:has(+ .panel:focus-within),
  .panel:focus-within + .rail {
    color: var(--phosphor);
  }

  .rail:has(+ .panel:focus-within) .rail-fill,
  .panel:focus-within + .rail .rail-fill {
    border-bottom-color: var(--phosphor);
  }

  button {
    padding: 0.45rem 1.1rem;
    background: var(--teal);
    color: var(--phosphor);
    border: 1px solid var(--phosphor);
    border-radius: 0;
    font: inherit;
    font-size: var(--tick);
    font-weight: 500;
    letter-spacing: var(--track);
    text-transform: uppercase;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: var(--teal-hover);
  }

  section > button {
    margin-top: 1.25rem;
  }

  .status {
    min-height: 1.5rem;
    margin: 0 0 1.5rem;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .status.error {
    color: var(--coral);
  }

  button.is-out {
    display: none;
  }

  textarea.is-out {
    opacity: 0;
    min-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    overflow: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    textarea {
      transition: none;
    }
  }
</style>
