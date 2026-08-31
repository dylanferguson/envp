<script lang="ts">
  import "./app.css";
  import {
    DEFAULT_TTL_SECONDS,
    MAX_PLAINTEXT_BYTES,
    formatExpiryLabel,
    parseTtlSeconds,
  } from "../shared/limits.js";
  import {
    EnvelopeError,
    exportKeyFragment,
    generateKey,
    seal,
  } from "../shared/envelope.js";
  import Chrome from "./Chrome.svelte";
  import Intro from "./Intro.svelte";
  import StepTree from "./StepTree.svelte";
  import { fade } from "svelte/transition";
  import { ShareApiError, createShare } from "./shares.js";

  const STEPS = ["paste", "encrypt", "send", "link"] as const;
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
    | { phase: "idle" }
    | { phase: "encrypting" }
    | { phase: "uploading"; bytes: number }
    | { phase: "done"; url: string; copied: boolean }
    | { phase: "too_large" }
    | { phase: "error"; at: "encrypt" | "send" | "link"; message: string };

  const READINGS: Record<State["phase"], Reading> = {
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

  const TREE = [
    { step: "paste", label: ".env" },
    { step: "encrypt", twig: "├── ", label: "encrypt in this tab" },
    { step: "send", twig: "│   ├── ", label: "ciphertext only" },
    { step: "link", twig: "│   └── ", label: "#key in the URL" },
  ] as const;

  let state = $state<State>({ phase: "idle" });
  let envInput = $state("");
  let ttlSeconds = $state(DEFAULT_TTL_SECONDS);
  let shareUrlInput = $state<HTMLInputElement | null>(null);
  let envTextarea = $state<HTMLTextAreaElement | null>(null);

  const reading = $derived.by((): Reading => {
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
  });

  const isDone = $derived(state.phase === "done");
  const isBusy = $derived(
    state.phase === "encrypting" || state.phase === "uploading",
  );
  const shareDisabled = $derived(isBusy);
  const doneTitle = $derived(
    isDone && state.copied
      ? "copied. send this link."
      : "copy this link, then send it.",
  );
  const doneRail = $derived(
    isDone && state.copied
      ? "already on your clipboard"
      : "select and copy",
  );
  const doneUrl = $derived(isDone ? state.url : "");
  const doneExpiry = $derived(
    isDone ? formatExpiryLabel(ttlSeconds) : "",
  );

  $effect(() => {
    if (state.phase === "done" && shareUrlInput) {
      shareUrlInput.focus();
      shareUrlInput.select();
    }
  });

  function onTtlInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    const parsed = parseTtlSeconds(target.value);
    if (parsed === null) {
      return;
    }
    ttlSeconds = parsed;
  }

  async function onShare(): Promise<void> {
    const encoded = new TextEncoder().encode(envInput);
    if (encoded.length > MAX_PLAINTEXT_BYTES) {
      state = { phase: "too_large" };
      return;
    }

    state = { phase: "encrypting" };
    let at: "encrypt" | "send" | "link" = "encrypt";
    try {
      const key = await generateKey();
      const envelope = await seal(encoded, key);
      const fragment = await exportKeyFragment(key);

      at = "send";
      state = { phase: "uploading", bytes: envelope.length };
      const id = await createShare(envelope, ttlSeconds);
      const url = `${location.origin}/s/${id}#${fragment}`;
      at = "link";
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        copied = false;
      }
      state = { phase: "done", url, copied };
    } catch (error) {
      if (error instanceof EnvelopeError) {
        state = { phase: "error", at: "encrypt", message: "encryption failed" };
        return;
      }
      if (error instanceof ShareApiError) {
        state = {
          phase: "error",
          at: "send",
          message:
            error.status > 0
              ? `upload failed (${error.status})`
              : "upload failed",
        };
        return;
      }
      state = {
        phase: "error",
        at,
        message: "something went wrong",
      };
    }
  }

  function onCopyLink(): void {
    void navigator.clipboard.writeText(doneUrl).then(
      () => {
        if (state.phase === "done") {
          state = { ...state, copied: true };
        }
      },
      () => {
        if (state.phase === "done") {
          state = { ...state, copied: false };
        }
      },
    );
  }

  function onAgain(): void {
    envInput = "";
    state = { phase: "idle" };
    envTextarea?.focus();
  }
</script>

<Chrome activeOp="new" word={reading.word} tone={reading.tone}>
  <Intro />

  <div class="console">
  <StepTree steps={STEPS} lines={TREE} at={reading.step} kind={reading.kind} />

  <div class="swap-stage">
    <div class="swap-pane" class:is-out={isDone}>
      <section class:has-busy={isBusy}>
        <label for="env-input">paste your .env</label>
        <div class="rail" class:is-busy={isBusy} aria-hidden="true">
          <span>┌─ cat .env </span>
          <span class="rail-fill"></span>
          <span> 16 KiB max ─┐</span>
        </div>
        <div class="panel" class:is-busy={isBusy}>
          <textarea
            id="env-input"
            bind:this={envTextarea}
            bind:value={envInput}
            disabled={isBusy}
            spellcheck={false}
            autocomplete="off"
          ></textarea>
        </div>
        <div class="rail" class:is-busy={isBusy} aria-hidden="true">
          <span>└─ </span>
          <span class="rail-fill"></span>
          <span>─┘</span>
        </div>
      </section>

      <div class="controls">
        <label class="control-label" for="ttl">ttl</label>
        <input
          id="ttl"
          type="range"
          min="60"
          max="86400"
          value={ttlSeconds}
          disabled={isBusy}
          oninput={onTtlInput}
        />
        <span class="readout">{formatExpiryLabel(ttlSeconds)}</span>
        <button
          type="button"
          class:is-busy={isBusy}
          disabled={shareDisabled}
          onclick={onShare}
        >
          share
        </button>
      </div>

      <div
        class="status"
        class:error={reading.tone === "error"}
        class:has-note={reading.note.length > 0}
        aria-live="polite"
      >
        {#key reading.note}
          {#if reading.note}
            <span class="status-text" in:fade={{ duration: 220 }}>{reading.note}</span>
          {/if}
        {/key}
      </div>
    </div>

    <div class="done swap-pane" class:is-out={!isDone}>
      <p class="done-title" aria-live="polite">{doneTitle}</p>
      <p class="done-expiry readout">{doneExpiry}</p>
      <label for="share-url">share link</label>
      <div class="rail" aria-hidden="true">
        <span>┌─ url </span>
        <span class="rail-fill"></span>
        <span>─┐</span>
      </div>
      <div class="panel">
        <input
          id="share-url"
          bind:this={shareUrlInput}
          type="text"
          readonly
          value={doneUrl}
          spellcheck={false}
        />
      </div>
      <div class="rail" aria-hidden="true">
        <span>└─ </span><span>{doneRail}</span>
        <span class="rail-fill"></span>
        <span>─┘</span>
      </div>
      <div class="done-actions">
        <button type="button" onclick={onCopyLink}>copy again</button>
        <button class="ghost" type="button" onclick={onAgain}>share another</button>
      </div>
    </div>
  </div>
  </div>

</Chrome>

<style>
  section {
    margin-bottom: 1.75rem;
  }

  label,
  .control-label {
    display: block;
    margin-bottom: 0.65rem;
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
  }

  .control-label {
    margin-bottom: 0;
  }

  .readout {
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
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
    transition: border-color 0.35s ease;
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
      opacity 0.35s ease,
      min-height 0.4s ease,
      padding 0.4s ease;
  }

  textarea:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .panel.is-busy {
    animation: seal-pulse 1.4s ease-in-out infinite;
  }

  .rail.is-busy {
    color: var(--phosphor);
    transition: color 0.35s ease;
  }

  .rail.is-busy .rail-fill {
    border-bottom-color: var(--phosphor);
    animation: rail-flow 1.4s ease-in-out infinite;
  }

  @keyframes seal-pulse {
    0%,
    100% {
      border-inline-color: var(--hairline);
    }
    50% {
      border-inline-color: var(--phosphor);
    }
  }

  @keyframes rail-flow {
    0%,
    100% {
      opacity: 0.35;
    }
    50% {
      opacity: 1;
    }
  }

  textarea:focus,
  .panel input:focus {
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

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    margin: 0 0 1.25rem;
  }

  input[type="range"] {
    flex: 1;
    min-width: 10rem;
    accent-color: var(--phosphor);
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
    transition:
      background 0.2s ease,
      opacity 0.25s ease;
  }

  button.is-busy:disabled {
    opacity: 0.7;
    animation: btn-busy 1.1s steps(1, end) infinite;
  }

  @keyframes btn-busy {
    0%,
    49% {
      border-color: var(--phosphor);
    }
    50%,
    100% {
      border-color: var(--hairline-lit);
    }
  }

  button:hover:not(:disabled) {
    background: var(--teal-hover);
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  button.ghost {
    background: transparent;
    color: var(--muted);
    border-color: var(--hairline-lit);
  }

  button.ghost:hover:not(:disabled) {
    background: var(--surface);
    color: var(--fg);
  }

  .status {
    display: grid;
    min-height: 1.5rem;
    margin: 0 0 1.5rem;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .status-text {
    grid-area: 1 / 1;
  }

  .status.error {
    color: var(--coral);
  }

  input[type="range"]:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .done-title {
    margin: 0 0 0.35rem;
    font-size: 1rem;
    font-weight: 500;
    color: var(--fg);
  }

  .done-expiry {
    margin: 0 0 1.25rem;
  }

  .done .panel input {
    display: block;
    width: 100%;
    padding: 0.85rem 1rem;
    background: transparent;
    color: var(--fg);
    border: 0;
    font: inherit;
  }

  .done-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 1.25rem 0 0;
  }

  .swap-stage {
    display: grid;
  }

  .swap-pane {
    grid-area: 1 / 1;
    transition:
      opacity 0.38s ease,
      transform 0.38s ease,
      visibility 0.38s;
  }

  .swap-pane:not(.is-out) {
    z-index: 1;
  }

  .swap-pane.is-out {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateY(0.4rem);
  }

  @media (prefers-reduced-motion: reduce) {
    textarea,
    .swap-pane,
    .panel.is-busy,
    .rail.is-busy .rail-fill,
    button.is-busy:disabled {
      transition: none;
      animation: none;
    }
  }
</style>
