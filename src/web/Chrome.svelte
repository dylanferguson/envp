<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade } from "svelte/transition";

  type SignalTone = "idle" | "live" | "ok" | "error";

  type Props = {
    activeOp: "new" | "open";
    word: string;
    tone: SignalTone;
    children: Snippet;
  };

  let { activeOp, word, tone, children }: Props = $props();
</script>

<header class="chrome">
  <div class="chrome-row">
    <h1 class="chrome-name">env-share</h1>
    <nav class="chrome-ops" aria-label="console modes">
      <a data-op="new" href="/" class:is-active={activeOp === "new"}>new</a>
      <span data-op="open" class:is-active={activeOp === "open"}>open</span>
    </nav>
    <span class="signal" data-tone={tone} role="status">
      {#key word}
        <span class="signal-word" in:fade={{ duration: 220 }}>{word}</span>
      {/key}
    </span>
  </div>
</header>

<main class="page">
  {@render children()}
</main>

<style>
  .chrome {
    position: sticky;
    top: 0;
    z-index: 3;
    background: var(--bg);
    border-bottom: 1px solid var(--hairline);
  }

  .chrome-row,
  .page {
    width: min(var(--col), 100%);
    margin: 0 auto;
    padding-inline: 1.25rem;
  }

  .chrome-row {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    height: 2.75rem;
  }

  .chrome-name {
    margin: 0;
    font-size: var(--tick);
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--fg);
  }

  .chrome-ops {
    display: flex;
    gap: 1rem;
  }

  .chrome-ops > :global(*) {
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
    text-decoration: none;
    border-bottom: 1px solid transparent;
  }

  .chrome-ops > a:hover {
    color: var(--fg);
  }

  .chrome-ops > :global(.is-active) {
    color: var(--fg);
    border-bottom-color: var(--hairline-lit);
  }

  .signal {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
    transition: color 0.35s ease;
  }

  .signal-word {
    display: inline-block;
  }

  .signal::before {
    content: "";
    width: 0.4rem;
    height: 0.4rem;
    background: var(--hairline-lit);
    transition: background 0.35s ease;
  }

  .signal[data-tone="live"],
  .signal[data-tone="ok"] {
    color: var(--phosphor);
  }

  .signal[data-tone="live"]::before,
  .signal[data-tone="ok"]::before {
    background: var(--phosphor);
  }

  .signal[data-tone="live"]::before {
    animation: led 1.1s steps(1, end) infinite;
  }

  .signal[data-tone="error"] {
    color: var(--coral);
  }

  .signal[data-tone="error"]::before {
    background: var(--coral);
  }

  @keyframes led {
    0%,
    49% {
      opacity: 1;
    }
    50%,
    100% {
      opacity: 0.25;
    }
  }

  .page {
    flex: 1;
    padding-block: 2rem 3.5rem;
  }

  @media (max-width: 720px) {
    .chrome-row {
      gap: 0.75rem;
    }

    .chrome-name {
      letter-spacing: 0.12em;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .signal[data-tone="live"]::before {
      animation: none;
    }
  }
</style>
