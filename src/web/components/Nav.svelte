<script lang="ts">
  import { crossfade } from "svelte/transition";
  import { BUILD_META, buildCommitUrl } from "../../shared/build-meta.js";
  import type { SignalTone } from "../lib/signal.js";

  type Props = {
    activeOp: "share" | "open";
    word: string;
    tone: SignalTone;
  };

  let { activeOp, word, tone }: Props = $props();

  const REPO_URL = "https://github.com/dylanferguson/env-share";
  const SIGNAL_WIDTH_WORD = "uploading";
  const commitHref = buildCommitUrl(REPO_URL, BUILD_META.commit);
  const [send, receive] = crossfade({ duration: 260 });
</script>

<header class="nav">
  <div class="nav-row">
    <div class="nav-start">
      <h1 class="nav-name">
        <a href="/">env-share</a>
      </h1>
      <div class="nav-menu">
        <nav class="nav-ops" aria-label="console modes">
          <a data-op="share" href="/" class:is-active={activeOp === "share"}>share</a>
          <a data-op="open" href="/open" class:is-active={activeOp === "open"}>open</a>
        </nav>
        <span class="nav-build">
          <a
            class="nav-repo"
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
          >
            <span class="nav-repo-mark" aria-hidden="true">&lt;/&gt;</span>
          </a>
          <span class="nav-commit-wrap">
            <a
              class="nav-commit"
              href={commitHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Deployed build {BUILD_META.commit}"
            >
              {BUILD_META.commit}
            </a>
          </span>
        </span>
      </div>
    </div>
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
</header>

<style>
  .nav {
    position: sticky;
    top: 0;
    z-index: 3;
    background: var(--bg);
    border-bottom: 1px solid var(--hairline);
  }

  .nav-row {
    display: flex;
    align-items: center;
    width: min(var(--col), 100%);
    height: 2.75rem;
    margin: 0 auto;
    padding-inline: 1.25rem;
  }

  .nav-start {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .nav-menu {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .nav-name {
    margin: 0;
    font-size: var(--tick);
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .nav-name a {
    color: var(--fg);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .nav-name a:hover {
    color: var(--phosphor);
  }

  .nav-ops {
    display: flex;
    gap: 1rem;
  }

  .nav-ops :global(a) {
    position: relative;
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .nav-ops :global(a)::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -0.15rem;
    height: 1px;
    background: var(--phosphor);
    transform: scaleX(0);
  }

  .nav-ops :global(a[data-op="share"])::after {
    transform-origin: left;
  }

  .nav-ops :global(a[data-op="open"])::after {
    transform-origin: right;
  }

  .nav-ops :global(a.is-active) {
    color: var(--phosphor);
  }

  .nav-ops :global(a.is-active)::after {
    animation: nav-underline-in 0.26s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  .nav-ops :global(a:hover) {
    color: var(--phosphor);
  }

  @keyframes nav-underline-in {
    from {
      transform: scaleX(0);
    }

    to {
      transform: scaleX(1);
    }
  }

  .nav-build {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
  }

  .nav-commit-wrap {
    display: grid;
    grid-template-columns: 1fr;
    min-width: 0;
  }

  .nav-repo,
  .nav-commit {
    font-size: var(--tick);
    color: var(--muted);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .nav-repo-mark {
    color: inherit;
    letter-spacing: 0;
  }

  .nav-repo:hover,
  .nav-commit:hover {
    color: var(--phosphor);
  }

  .nav-commit {
    min-width: 0;
    padding-left: 0.35rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  @media (hover: hover) {
    .nav-commit-wrap {
      grid-template-columns: 0fr;
      transition: grid-template-columns 0.24s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .nav-commit {
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      transform: translateX(-0.4rem);
      transition:
        color 0.2s ease,
        opacity 0.18s ease,
        transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .nav-build:hover .nav-commit-wrap,
    .nav-build:has(:focus-visible) .nav-commit-wrap {
      grid-template-columns: 1fr;
    }

    .nav-build:hover .nav-commit,
    .nav-build:has(:focus-visible) .nav-commit {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-commit-wrap {
      transition: none;
    }

    .nav-commit {
      transition: color 0.2s ease;
    }

    .nav-ops :global(a.is-active)::after {
      animation: none;
      transform: scaleX(1);
    }

    .signal[data-tone="live"]::before {
      animation: none;
    }
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

  @media (max-width: 720px) {
    .nav-start {
      gap: 0.75rem;
    }

    .nav-menu {
      gap: 0.65rem;
    }

    .nav-ops {
      gap: 0.65rem;
    }

    .nav-name {
      letter-spacing: 0.12em;
    }
  }
</style>
