<script lang="ts">
  import "./app.css";
  import {
    DEFAULT_TTL_SECONDS,
    MAX_PLAINTEXT_BYTES,
    MAX_PLAINTEXT_KIB,
    formatExpiresAtLabel,
    formatExpiryLabel,
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
  import TtlSlider from "./TtlSlider.svelte";
  import { fade } from "svelte/transition";
  import { ShareApiError, createShare } from "./shares.js";

  type CopyToastPhase = "hidden" | "shown" | "hiding";

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
    | { phase: "done"; url: string; copied: boolean; expiresAt: number }
    | { phase: "error"; at: "encrypt" | "send" | "link"; message: string };

  function formatInputSize(bytes: number): { text: string; over: boolean } {
    if (bytes > MAX_PLAINTEXT_BYTES) {
      return { text: `over ${MAX_PLAINTEXT_KIB} KiB`, over: true };
    }
    if (bytes === 0) {
      return { text: `${MAX_PLAINTEXT_KIB} KiB max`, over: false };
    }
    const kib = bytes / 1024;
    const label =
      kib >= 10 ? `${Math.round(kib)} KiB` : `${kib.toFixed(1)} KiB`;
    return { text: label, over: false };
  }

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
  let copyToastPhase = $state<CopyToastPhase>("hidden");
  let copyToastSeq = $state(0);
  let copyToastTimer: ReturnType<typeof setTimeout> | undefined;

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

  const inputBytes = $derived(new TextEncoder().encode(envInput).length);
  const inputSize = $derived(formatInputSize(inputBytes));
  const isOverLimit = $derived(inputBytes > MAX_PLAINTEXT_BYTES);

  const isDone = $derived(state.phase === "done");
  const isBusy = $derived(
    state.phase === "encrypting" || state.phase === "uploading",
  );
  const shareDisabled = $derived(
    isBusy || isOverLimit || envInput.length === 0,
  );
  const doneTitle = $derived(
    isDone && state.copied
      ? "send this link."
      : isDone
        ? "copy this link, then send it."
        : "",
  );
  const doneUrl = $derived(isDone ? state.url : "");
  const doneExpiry = $derived(
    isDone ? formatExpiresAtLabel(state.expiresAt) : "",
  );

  $effect(() => {
    if (state.phase === "done" && shareUrlInput) {
      shareUrlInput.focus();
      shareUrlInput.select();
    }
  });

  async function onShare(): Promise<void> {
    const encoded = new TextEncoder().encode(envInput);
    if (encoded.length > MAX_PLAINTEXT_BYTES) {
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
      const created = await createShare(envelope, ttlSeconds);
      const url = `${location.origin}/s/${created.id}#${fragment}`;
      at = "link";
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        copied = false;
      }
      state = { phase: "done", url, copied, expiresAt: created.expiresAt };
      if (copied) {
        showCopyToast();
      }
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

  function scheduleCopyToastHide(): void {
    clearTimeout(copyToastTimer);
    copyToastTimer = setTimeout(() => {
      hideCopyToast();
    }, 2800);
  }

  function showCopyToast(): void {
    copyToastSeq += 1;
    copyToastPhase = "shown";
    scheduleCopyToastHide();
  }

  function hideCopyToast(): void {
    if (copyToastPhase === "shown") {
      copyToastPhase = "hiding";
    }
  }

  function onCopyToastAnimationEnd(event: AnimationEvent): void {
    if (event.animationName !== "copy-toast-out") {
      return;
    }
    if (copyToastPhase === "hiding") {
      copyToastPhase = "hidden";
    }
  }

  function copyShareLink(): void {
    if (state.phase !== "done") {
      return;
    }
    void navigator.clipboard.writeText(state.url).then(
      () => {
        state = { ...state, copied: true };
        showCopyToast();
        shareUrlInput?.focus();
        shareUrlInput?.select();
      },
      () => {
        if (state.phase === "done") {
          state = { ...state, copied: false };
        }
      },
    );
  }

  function onAgain(): void {
    clearTimeout(copyToastTimer);
    if (copyToastPhase === "shown") {
      copyToastPhase = "hiding";
    } else {
      copyToastPhase = "hidden";
    }
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
        <div class="field-head">
          <label for="env-input">paste your .env</label>
          <span class="readout" class:is-over={inputSize.over}>{inputSize.text}</span>
        </div>
        <div class="frame" class:is-busy={isBusy} class:is-over={isOverLimit}>
          <textarea
            id="env-input"
            bind:this={envTextarea}
            bind:value={envInput}
            disabled={isBusy}
            spellcheck={false}
            autocomplete="off"
          ></textarea>
        </div>
      </section>

      <div class="controls">
        <label class="control-label" for="ttl">ttl</label>
        <TtlSlider id="ttl" bind:value={ttlSeconds} disabled={isBusy} />
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
      <div class="frame link-frame">
        <input
          id="share-url"
          bind:this={shareUrlInput}
          class="link-input"
          type="text"
          readonly
          value={doneUrl}
          spellcheck={false}
          aria-label="share link"
        />
        <button
          type="button"
          class="link-copy"
          onclick={copyShareLink}
          aria-label="Copy link to clipboard"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect
              x="5.25"
              y="5.25"
              width="7.5"
              height="7.5"
              rx="0.75"
              fill="none"
              stroke="currentColor"
              stroke-width="1.25"
            />
            <path
              d="M3.5 11V4.25A.75.75 0 0 1 4.25 3.5H11"
              fill="none"
              stroke="currentColor"
              stroke-width="1.25"
            />
          </svg>
        </button>
      </div>
      <div class="done-actions">
        <button type="button" onclick={onAgain}>new</button>
      </div>
    </div>
  </div>
  </div>

</Chrome>

{#if copyToastPhase !== "hidden"}
  {#key copyToastSeq}
    <p
      class="copy-toast"
      class:is-hiding={copyToastPhase === "hiding"}
      role="status"
      aria-live="polite"
      onanimationend={onCopyToastAnimationEnd}
    >
      <svg class="copy-toast-mark" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.25" />
        <path
          d="M5 8.25 7 10.25 11 5.75"
          fill="none"
          stroke="currentColor"
          stroke-width="1.25"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      link copied to clipboard
    </p>
  {/key}
{/if}

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

  .field-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 0.65rem;
  }

  .field-head label {
    margin-bottom: 0;
  }

  .readout {
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }

  .readout.is-over {
    color: var(--coral);
  }

  .frame {
    border: 1px solid var(--hairline);
    background: var(--surface);
    transition: border-color 0.35s ease;
  }

  .frame.is-busy {
    animation: seal-pulse 1.4s ease-in-out infinite;
  }

  .frame.is-over {
    border-color: var(--coral);
  }

  textarea,
  .frame input {
    display: block;
    width: 100%;
    padding: 0.85rem 1rem;
    background: transparent;
    color: var(--fg);
    border: 0;
    border-radius: 0;
    font: inherit;
    caret-color: var(--phosphor);
  }

  textarea {
    min-height: 16rem;
    resize: vertical;
    transition:
      opacity 0.35s ease,
      min-height 0.4s ease,
      padding 0.4s ease;
  }

  textarea:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @keyframes seal-pulse {
    0%,
    100% {
      border-color: var(--hairline);
    }
    50% {
      border-color: var(--phosphor);
    }
  }

  textarea:focus,
  .frame input:focus {
    outline: none;
  }

  .frame:focus-within {
    border-color: var(--phosphor);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    margin: 0 0 1.25rem;
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

  .done-title {
    margin: 0 0 0.35rem;
    font-size: 1rem;
    font-weight: 500;
    color: var(--fg);
  }

  .done-expiry {
    margin: 0 0 1.25rem;
  }

  .done .link-frame {
    display: flex;
    align-items: stretch;
  }

  .done .link-input {
    flex: 1;
    min-width: 0;
    padding-right: 0.65rem;
  }

  .done .link-copy {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    margin: 0;
    padding: 0;
    background: transparent;
    color: var(--muted);
    border: 0;
    border-left: 1px solid var(--hairline);
    border-radius: 0;
    font: inherit;
    letter-spacing: 0;
    text-transform: none;
    cursor: pointer;
    transition:
      color 0.2s ease,
      background 0.2s ease;
  }

  .done .link-copy:hover {
    background: var(--teal);
    color: var(--phosphor);
  }

  .copy-toast {
    position: fixed;
    right: 1.25rem;
    bottom: 1.25rem;
    z-index: 4;
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    margin: 0;
    padding: 0.75rem 1rem;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 0.375rem;
    color: var(--fg);
    font-size: 0.85rem;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.45);
    pointer-events: none;
    transform-origin: bottom right;
    overflow: hidden;
    animation: copy-toast-in 400ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .copy-toast.is-hiding {
    animation: copy-toast-out 400ms cubic-bezier(0.4, 0, 1, 1) both;
  }

  @keyframes copy-toast-in {
    from {
      opacity: 0;
      transform: translate3d(0, 100%, 0);
    }

    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }

  @keyframes copy-toast-out {
    from {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }

    to {
      opacity: 0;
      transform: translate3d(calc(100% + 0.75rem), 0, 0);
    }
  }

  .copy-toast-mark {
    flex-shrink: 0;
    color: var(--phosphor);
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
    .frame.is-busy,
    button.is-busy:disabled {
      transition: none;
      animation: none;
    }

    .copy-toast {
      animation: copy-toast-in-reduced 150ms ease both;
    }

    .copy-toast.is-hiding {
      animation: copy-toast-out-reduced 150ms ease both;
    }
  }

  @keyframes copy-toast-in-reduced {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @keyframes copy-toast-out-reduced {
    from {
      opacity: 1;
    }

    to {
      opacity: 0;
    }
  }
</style>
