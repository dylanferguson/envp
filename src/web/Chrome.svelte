<script lang="ts">
  import type { Snippet } from "svelte";

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
    <span class="signal" data-tone={tone} role="status">{word}</span>
  </div>
</header>

<main class="page">
  {@render children()}
</main>

<footer class="chrome-foot">
  <dl class="facts">
    <div>
      <dt>key</dt>
      <dd>Lives after the # in the URL. Your browser keeps it. It never reaches us.</dd>
    </div>
    <div>
      <dt>stored</dt>
      <dd>The encrypted blob, the share id, when you uploaded, and your IP.</dd>
    </div>
    <div>
      <dt>access</dt>
      <dd>We cannot read your variables. Anyone with the full link can, until it expires.</dd>
    </div>
    <div>
      <dt>abuse</dt>
      <dd><a href="mailto:abuse@localhost">abuse@localhost</a></dd>
    </div>
  </dl>
</footer>

<style>
  .chrome {
    position: sticky;
    top: 0;
    z-index: 3;
    background: var(--bg);
    border-bottom: 1px solid var(--hairline);
  }

  .chrome-row,
  .facts,
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
  }

  .signal::before {
    content: "";
    width: 0.4rem;
    height: 0.4rem;
    background: var(--hairline-lit);
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

  .chrome-foot {
    border-top: 1px solid var(--hairline);
    padding-block: 1.5rem 2.5rem;
  }

  .facts {
    margin: 0 auto;
    display: grid;
    grid-template-columns: 6rem 1fr;
    gap: 0.5rem 1rem;
    font-size: 0.8rem;
  }

  .facts > div {
    display: contents;
  }

  .facts dt {
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
    line-height: 1.7;
  }

  .facts dd {
    margin: 0;
    color: var(--muted);
  }

  .facts a {
    color: var(--fg);
    text-decoration: none;
    border-bottom: 1px solid var(--hairline-lit);
  }

  .facts a:hover {
    color: var(--phosphor);
    border-bottom-color: var(--phosphor);
  }

  @media (max-width: 720px) {
    .chrome-row {
      gap: 0.75rem;
    }

    .chrome-name {
      letter-spacing: 0.12em;
    }

    .facts {
      grid-template-columns: 1fr;
    }

    .facts > div {
      display: grid;
      gap: 0.2rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .signal[data-tone="live"]::before {
      animation: none;
    }
  }
</style>
