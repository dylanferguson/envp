<script lang="ts">
  import type { Snippet } from "svelte";
  import { crossfade } from "svelte/transition";
  import { BUILD_META, buildCommitUrl } from "../../shared/build-meta.js";

  type SignalTone = "idle" | "live" | "ok" | "error";

  type Props = {
    activeOp: "new" | "open";
    word: string;
    tone: SignalTone;
    children: Snippet;
  };

  let { activeOp, word, tone, children }: Props = $props();

  const REPO_URL = "https://github.com/dylanferguson/env-share";
  const SIGNAL_WIDTH_WORD = "uploading";
  const commitHref = buildCommitUrl(REPO_URL, BUILD_META.commit);
  const [send, receive] = crossfade({ duration: 260 });
</script>

<header class="chrome">
  <div class="chrome-row">
    <h1 class="chrome-name">
      <a href="/">env-share</a>
    </h1>
    <nav class="chrome-ops" aria-label="console modes">
      <a data-op="new" href="/" class:is-active={activeOp === "new"}>new</a>
      <a data-op="open" href="/open" class:is-active={activeOp === "open"}>open</a>
    </nav>
    <div class="chrome-end">
      <span class="chrome-build">
        <a
          class="chrome-repo"
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="View source on GitHub"
          aria-label="View source on GitHub"
        >
          <span class="chrome-repo-mark" aria-hidden="true">&lt;/&gt;</span>
        </a>
        <a
          class="chrome-commit"
          href={commitHref}
          target="_blank"
          rel="noopener noreferrer"
          title="View deployed build on GitHub"
          aria-label="Deployed build {BUILD_META.commit}"
        >
          {BUILD_META.commit}
        </a>
      </span>
      <span class="signal" data-tone={tone} role="status">
        <span class="signal-slot">
          <span class="signal-sizer" aria-hidden="true">{SIGNAL_WIDTH_WORD}</span>
          {#key word}
            <span
              class="signal-word"
              in:receive={{ key: word }}
              out:send={{ key: word }}
            >
              {word}
            </span>
          {/key}
        </span>
      </span>
    </div>
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
  }

  .chrome-name a {
    color: var(--fg);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .chrome-name a:hover {
    color: var(--phosphor);
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
    transition: color 0.2s ease, border-color 0.2s ease;
  }

  .chrome-ops > a:hover {
    color: var(--phosphor);
  }

  .chrome-ops > :global(.is-active) {
    color: var(--phosphor);
    border-bottom-color: var(--phosphor);
  }

  .chrome-end {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-left: auto;
  }

  .chrome-build {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    white-space: nowrap;
  }

  .chrome-repo,
  .chrome-commit {
    font-size: var(--tick);
    color: var(--muted);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .chrome-repo-mark {
    color: var(--phosphor);
    letter-spacing: 0;
  }

  .chrome-repo:hover,
  .chrome-commit:hover {
    color: var(--phosphor);
  }

  .chrome-commit {
    font-variant-numeric: tabular-nums;
  }

  .signal {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
    transition: color 0.35s ease;
  }

  .signal-slot {
    display: inline-grid;
    align-items: center;
  }

  .signal-slot > :global(*) {
    grid-area: 1 / 1;
  }

  .signal-sizer {
    visibility: hidden;
    user-select: none;
    pointer-events: none;
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
