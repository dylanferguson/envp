<script lang="ts">
  import { onMount } from "svelte";

  let paused = $state(false);

  onMount(() => {
    const onVisibility = (): void => {
      paused = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  });
</script>

<header class="hero">
  <h2 class="lead">Securely share your <span class="mark">.env</span></h2>
  <p class="deck">
    Encrypt with the browser, and share a link with the key the server never sees.
  </p>
</header>

<pre class="diagram" class:is-paused={paused} aria-hidden="true"
  >      <span class="dia-you">this tab</span>                <span class="dia-server">server</span>               <span class="dia-them">their tab</span>
   <span class="dia-you">┌────────────┐</span>          <span class="dia-server">┌──────────┐</span>          <span class="dia-them">┌────────────┐</span>
   <span class="dia-you">│ </span><span class="dia-slot"><span class="dia-plain">.env       </span><span class="dia-cipher">▒▒▒▒▒▒▒▒ </span></span><span class="dia-you">│</span> <span class="dia-flow-a">--seal-></span> <span class="dia-server">│ </span><span class="dia-cipher">▒▒▒▒▒▒▒▒ </span><span class="dia-server">│</span> <span class="dia-flow-b">--get--></span> <span class="dia-them">│ </span><span class="dia-slot dia-slot-right"><span class="dia-cipher">▒▒▒▒▒▒▒▒ </span><span class="dia-plain">.env       </span></span><span class="dia-them">│</span>
   <span class="dia-you">│ </span><span class="dia-key">#key       </span><span class="dia-you">│</span>          <span class="dia-server">│ no key   │</span>          <span class="dia-them">│ </span><span class="dia-key">#key       </span><span class="dia-them">│</span>
   <span class="dia-you">└─────┬──────┘</span>          <span class="dia-server">└──────────┘</span>          <span class="dia-them">└──────┬─────┘</span>
         <span class="dia-key-path">└──────────── the link carries #key ───────────┘</span></pre
>

<style>
  .hero {
    margin: 0 0 1.75rem;
  }

  .lead {
    margin: 0 0 0.65rem;
    font-size: clamp(1.2rem, 3.5vw, 1.55rem);
    font-weight: 500;
    line-height: 1.35;
    color: var(--fg);
  }

  .deck {
    margin: 0;
    max-width: 34rem;
    color: var(--muted);
    font-size: 0.9rem;
    line-height: 1.55;
  }

  .mark {
    color: var(--phosphor);
  }

  .diagram {
    margin: 0 0 2rem;
    overflow-x: auto;
    color: var(--hairline-lit);
    font: inherit;
    font-size: clamp(0.56rem, 1.35vw, 0.7rem);
    line-height: 1.35;
    user-select: none;
  }

  .dia-slot {
    display: inline-grid;
  }

  .dia-slot > :global(*) {
    grid-area: 1 / 1;
  }

  .diagram :global(.dia-you),
  .diagram :global(.dia-server),
  .diagram :global(.dia-them),
  .diagram :global(.dia-flow-a),
  .diagram :global(.dia-flow-b),
  .diagram :global(.dia-key),
  .diagram :global(.dia-key-path),
  .diagram :global(.dia-plain),
  .diagram :global(.dia-cipher) {
    animation-duration: 14s;
    animation-iteration-count: infinite;
    animation-timing-function: ease-in-out;
  }

  .diagram :global(.dia-you) {
    animation-name: dia-you;
  }

  .diagram :global(.dia-server) {
    animation-name: dia-server;
  }

  .diagram :global(.dia-them) {
    animation-name: dia-them;
  }

  .diagram :global(.dia-flow-a) {
    animation-name: dia-flow-a;
  }

  .diagram :global(.dia-flow-b) {
    animation-name: dia-flow-b;
  }

  .diagram :global(.dia-key) {
    animation-name: dia-key;
  }

  .diagram :global(.dia-key-path) {
    animation-name: dia-key-path;
  }

  .diagram :global(.dia-plain) {
    animation-name: dia-plain;
  }

  .diagram :global(.dia-cipher) {
    animation-name: dia-cipher-block;
  }

  .diagram :global(.dia-slot-right .dia-plain) {
    animation-name: dia-plain-right;
  }

  .diagram :global(.dia-slot-right .dia-cipher) {
    animation-name: dia-cipher-right;
  }

  .diagram.is-paused :global(*) {
    animation-play-state: paused;
  }

  @keyframes dia-you {
    0%,
    100% {
      color: var(--hairline-lit);
    }
    6%,
    38% {
      color: var(--fg);
    }
  }

  @keyframes dia-server {
    0%,
    22%,
    72%,
    100% {
      color: var(--hairline-lit);
    }
    32%,
    58% {
      color: var(--fg);
    }
  }

  @keyframes dia-them {
    0%,
    48%,
    100% {
      color: var(--hairline-lit);
    }
    58%,
    86% {
      color: var(--fg);
    }
  }

  @keyframes dia-flow-a {
    0%,
    16%,
    44%,
    100% {
      color: var(--hairline-lit);
    }
    24%,
    36% {
      color: var(--phosphor);
    }
  }

  @keyframes dia-flow-b {
    0%,
    46%,
    78%,
    100% {
      color: var(--hairline-lit);
    }
    54%,
    68% {
      color: var(--phosphor);
    }
  }

  @keyframes dia-key {
    0%,
    20%,
    90%,
    100% {
      color: var(--hairline-lit);
    }
    30%,
    82% {
      color: var(--phosphor);
    }
  }

  @keyframes dia-key-path {
    0%,
    26%,
    92%,
    100% {
      color: var(--hairline-lit);
    }
    36%,
    84% {
      color: var(--phosphor);
    }
  }

  @keyframes dia-plain {
    0%,
    12% {
      opacity: 1;
      color: var(--fg);
    }
    22%,
    100% {
      opacity: 0;
    }
  }

  @keyframes dia-cipher-block {
    0%,
    18%,
    62%,
    100% {
      opacity: 0.2;
    }
    28%,
    52% {
      opacity: 1;
      color: var(--fg);
    }
  }

  @keyframes dia-cipher-right {
    0%,
    52%,
    74%,
    100% {
      opacity: 0;
    }
    60%,
    68% {
      opacity: 1;
    }
  }

  @keyframes dia-plain-right {
    0%,
    66%,
    100% {
      opacity: 0;
    }
    74%,
    88% {
      opacity: 1;
      color: var(--fg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .diagram :global(*) {
      animation: none;
    }
  }
</style>
