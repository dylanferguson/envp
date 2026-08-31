<script lang="ts">
  import "./app.css";
  import { onMount } from "svelte";
  import { parseKeyFragment, parseShareId, parseShareLink } from "../shared/limits.js";
  import { importKeyFromFragment, open } from "../shared/envelope.js";
  import Chrome from "./Chrome.svelte";
  import StepTree from "./StepTree.svelte";
  import Toast from "./Toast.svelte";
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
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "unlocking" }
    | { phase: "revealed" }
    | { phase: "gone" }
    | { phase: "tampered" }
    | { phase: "missing_key" }
    | { phase: "invalid_link" };

  const READINGS: Record<State["phase"], Reading> = {
    idle: {
      word: "ready",
      tone: "idle",
      step: "key",
      kind: "hold",
      note: "",
    },
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
      note: "missing #key. paste the full URL or share_id#key.",
    },
    invalid_link: {
      word: "bad link",
      tone: "error",
      step: "key",
      kind: "error",
      note: "couldn't parse that. use a full URL or share_id#key.",
    },
  };

  const TREE = [
    { step: "key", twig: "├── ", label: "enter full URL or share_id#key" },
    { step: "fetch", twig: "│   ├── ", label: "fetch ciphertext" },
    { step: "unlock", twig: "│   ├── ", label: "decrypt locally" },
    { step: "env", twig: "│   └── ", label: ".env is ready" },
  ] as const;

  const isManual = location.pathname === "/open" || location.pathname === "/open/";

  let state = $state<State>(isManual ? { phase: "idle" } : { phase: "loading" });
  let envOutput = $state("");
  let statusNote = $state("");
  let linkInput = $state("");
  let openLoadToken = 0;
  let copyToast = $state<Toast | null>(null);

  const reading = $derived(READINGS[state.phase]);
  const revealed = $derived(state.phase === "revealed");
  const showForm = $derived(
    isManual && !["loading", "unlocking", "revealed"].includes(state.phase),
  );
  const statusText = $derived(statusNote || reading.note);

  function shareIdFromPath(): string | null {
    const match = location.pathname.match(/^\/s\/([^/]+)$/);
    return match?.[1] ?? null;
  }

  function onCopy(): void {
    void navigator.clipboard.writeText(envOutput).then(() => {
      copyToast?.show();
    });
  }

  function onOpenLink(): void {
    const parsed = parseShareLink(linkInput);
    if (!parsed) {
      state = { phase: "invalid_link" };
      return;
    }
    void loadShare(parsed.shareId, parsed.keyFragment);
  }

  async function loadShare(
    shareId?: string,
    keyFragment?: string,
  ): Promise<void> {
    const token = ++openLoadToken;
    statusNote = "";

    const rawId = shareId ?? shareIdFromPath();
    if (!rawId || !parseShareId(rawId)) {
      state = isManual ? { phase: "invalid_link" } : { phase: "gone" };
      return;
    }

    const fragment =
      keyFragment ?? parseKeyFragment(location.hash.slice(1)) ?? null;
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
    if (!isManual) {
      void loadShare();
    }
  });
</script>

<Chrome activeOp="open" word={reading.word} tone={reading.tone}>
  <StepTree steps={STEPS} lines={TREE} at={reading.step} kind={reading.kind} />

  {#if showForm}
    <section>
      <label for="share-link">paste share link</label>
      <p class="hint">full URL or share_id#key</p>
      <div class="frame">
        <input
          id="share-link"
          type="text"
          bind:value={linkInput}
          placeholder="https://…/s/share_…#… or share_…#…"
          spellcheck={false}
          autocomplete="off"
          onkeydown={(e) => {
            if (e.key === "Enter") {
              onOpenLink();
            }
          }}
        />
      </div>
      <button type="button" onclick={onOpenLink}>open</button>
    </section>
  {:else}
    <section>
      <label for="env-output">decrypted .env</label>
      <div class="frame">
        <textarea
          id="env-output"
          class:is-out={!revealed}
          readonly
          value={envOutput}
          spellcheck={false}
        ></textarea>
      </div>
      <button class:is-out={!revealed} type="button" onclick={onCopy}>copy</button>
    </section>
  {/if}

  <div class="status" class:error={reading.tone === "error"}>
    {statusText}
  </div>
</Chrome>

<Toast bind:this={copyToast} message="copied to clipboard" />

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

  .hint {
    margin: -0.35rem 0 0.65rem;
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
  }

  .frame {
    border: 1px solid var(--hairline);
    background: var(--surface);
    transition: border-color 0.35s ease;
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

  .frame input::placeholder {
    color: var(--muted);
    opacity: 0.6;
  }

  textarea {
    min-height: 16rem;
    resize: vertical;
    transition:
      opacity 0.4s ease,
      min-height 0.4s ease,
      padding 0.4s ease;
  }

  textarea:focus,
  .frame input:focus {
    outline: none;
  }

  .frame:focus-within {
    border-color: var(--phosphor);
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
