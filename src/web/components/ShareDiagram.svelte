<script lang="ts">
  import { onMount } from "svelte";
  import type { DiagramFocus } from "../lib/diagram-focus.js";

  type Props = {
    /** Set for open: static highlight. Omit for create: one-shot animation. */
    focus?: DiagramFocus;
  };

  let { focus }: Props = $props();

  /** Inner width between └ and ┘; must match diagram column geometry. */
  const KEY_PATH_INNER = 47;
  const KEY_PATH_PREFIX = " share link";
  const KEY_PATH_SUFFIX = "#key";

  function keyPathDashes(labelLen: number): [string, string] {
    const pad = KEY_PATH_INNER - labelLen;
    const left = Math.floor(pad / 2);
    return ["─".repeat(left), "─".repeat(pad - left)];
  }

  const [keyPathLeft, keyPathRight] = keyPathDashes(
    KEY_PATH_PREFIX.length + KEY_PATH_SUFFIX.length,
  );

  let paused = $state(false);
  let lit = $state(false);
  const isAnimated = $derived(focus === undefined);

  onMount(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      lit = true;
    } else {
      requestAnimationFrame(() => {
        lit = true;
      });
    }

    if (!isAnimated) {
      return;
    }
    const onVisibility = (): void => {
      paused = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  });
</script>

<pre
  class="diagram"
  class:is-animate={isAnimated}
  class:is-highlight={!isAnimated}
  class:is-lit={lit}
  class:is-paused={paused}
  data-focus={focus}
  aria-hidden="true"
  >   <span class="dia-you">╭ sender ─────╮</span>          <span class="dia-server">┌ server ───┐</span>          <span class="dia-them">╭ receiver ───╮</span>
   <span class="dia-you">│ </span><span class="dia-slot"><span class="dia-plain">.env        </span><span class="dia-cipher">▒▒▒▒▒▒▒▒    </span></span><span class="dia-you">│</span> <span class="dia-flow-a">--seal-></span> <span class="dia-server">│ </span><span class="dia-cipher dia-server-cipher">▒▒▒▒▒▒▒▒  </span><span class="dia-server">│</span> <span class="dia-flow-b">--get--></span> <span class="dia-them">│ </span><span class="dia-slot dia-slot-right"><span class="dia-cipher">▒▒▒▒▒▒▒▒    </span><span class="dia-plain">.env        </span></span><span class="dia-them">│</span>
   <span class="dia-you">│ </span><span class="dia-key">#key        </span><span class="dia-you">│</span>          <span class="dia-server">│  no key   │</span>          <span class="dia-them">│ </span><span class="dia-key dia-receiver-key">#key        </span><span class="dia-them">│</span>
   <span class="dia-you">╰──────┬──────╯</span>          <span class="dia-server">└───────────┘</span>          <span class="dia-them">╰──────┬──────╯</span>
          <span class="dia-key-path">└{keyPathLeft}{KEY_PATH_PREFIX}</span><span class="dia-key">{KEY_PATH_SUFFIX}</span><span class="dia-key-path">{keyPathRight}┘</span></pre
>

<style>
  .diagram {
    margin: 0 0 2rem;
    overflow-x: auto;
    color: var(--hairline-lit);
    font: inherit;
    font-size: clamp(0.56rem, 1.35vw, 0.7rem);
    line-height: 1.35;
    user-select: none;
    --dia-fade-in: 1.2s;
    opacity: 0;
  }

  .diagram.is-lit {
    animation: dia-fade-in var(--dia-fade-in) cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  .dia-slot {
    display: inline-grid;
  }

  .dia-slot > :global(*) {
    grid-area: 1 / 1;
  }

  .diagram.is-animate.is-lit :global(.dia-you),
  .diagram.is-animate.is-lit :global(.dia-server),
  .diagram.is-animate.is-lit :global(.dia-them),
  .diagram.is-animate.is-lit :global(.dia-flow-a),
  .diagram.is-animate.is-lit :global(.dia-flow-b),
  .diagram.is-animate.is-lit :global(.dia-key),
  .diagram.is-animate.is-lit :global(.dia-plain),
  .diagram.is-animate.is-lit :global(.dia-cipher) {
    animation-duration: 14s;
    animation-iteration-count: 1;
    animation-fill-mode: forwards;
    animation-timing-function: ease-in-out;
    animation-delay: var(--dia-fade-in);
  }

  .diagram.is-animate.is-lit :global(.dia-you) {
    animation-name: dia-you;
  }

  .diagram.is-animate.is-lit :global(.dia-server) {
    animation-name: dia-server;
  }

  .diagram.is-animate.is-lit :global(.dia-them) {
    animation-name: dia-them;
  }

  .diagram.is-animate.is-lit :global(.dia-flow-a) {
    animation-name: dia-flow-a;
  }

  .diagram.is-animate.is-lit :global(.dia-flow-b) {
    animation-name: dia-flow-b;
  }

  .diagram.is-animate.is-lit :global(.dia-key) {
    animation-name: dia-key;
  }

  .diagram.is-animate.is-lit :global(.dia-key-path) {
    color: var(--hairline-lit);
    animation: dia-key-path 14s ease-in-out 1 forwards;
    animation-delay: var(--dia-fade-in);
  }

  .diagram.is-animate.is-lit :global(.dia-plain) {
    animation-name: dia-plain;
  }

  .diagram.is-animate.is-lit :global(.dia-cipher) {
    animation-name: dia-cipher-block;
  }

  .diagram.is-animate.is-lit :global(.dia-slot-right .dia-plain) {
    animation-name: dia-plain-right;
  }

  .diagram.is-animate.is-lit :global(.dia-slot-right .dia-cipher) {
    animation-name: dia-cipher-right;
  }

  .diagram.is-paused :global(*) {
    animation-play-state: paused;
  }

  .diagram.is-highlight :global(.dia-plain) {
    opacity: 0;
  }

  .diagram.is-highlight :global(.dia-cipher) {
    opacity: 0.2;
  }

  .diagram.is-highlight[data-focus="link"] :global(.dia-them),
  .diagram.is-highlight[data-focus="link"] :global(.dia-key-path),
  .diagram.is-highlight[data-focus="link"] :global(.dia-server),
  .diagram.is-highlight[data-focus="link"] :global(.dia-server-cipher) {
    color: var(--fg);
  }

  .diagram.is-highlight[data-focus="link"] :global(.dia-server-cipher) {
    opacity: 1;
  }

  .diagram.is-highlight[data-focus="link"] :global(.dia-key-path + .dia-key),
  .diagram.is-highlight[data-focus="link"] :global(.dia-receiver-key),
  .diagram.is-highlight[data-focus="link"] :global(.dia-flow-b) {
    color: var(--phosphor);
  }

  .diagram.is-highlight[data-focus="key"] :global(.dia-key-path) {
    color: var(--fg);
  }

  .diagram.is-highlight[data-focus="key"] :global(.dia-key) {
    color: var(--phosphor);
  }

  .diagram.is-highlight[data-focus="fetch"] :global(.dia-server),
  .diagram.is-highlight[data-focus="fetch"] :global(.dia-server-cipher) {
    color: var(--fg);
    opacity: 1;
  }

  .diagram.is-highlight[data-focus="fetch"] :global(.dia-flow-b) {
    color: var(--phosphor);
  }

  .diagram.is-highlight[data-focus="unlock"] :global(.dia-them) {
    color: var(--fg);
  }

  .diagram.is-highlight[data-focus="unlock"] :global(.dia-receiver-key) {
    color: var(--phosphor);
  }

  .diagram.is-highlight[data-focus="unlock"] :global(.dia-slot-right .dia-cipher) {
    opacity: 1;
    color: var(--fg);
  }

  .diagram.is-highlight[data-focus="revealed"] :global(.dia-them) {
    color: var(--fg);
  }

  .diagram.is-highlight[data-focus="revealed"] :global(.dia-slot-right .dia-plain) {
    opacity: 1;
    color: var(--fg);
  }

  .diagram.is-highlight[data-focus="revealed"] :global(.dia-slot-right .dia-cipher) {
    opacity: 0;
  }

  @keyframes dia-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes dia-you {
    0% {
      color: var(--hairline-lit);
    }
    5%,
    35% {
      color: var(--fg);
    }
    40%,
    100% {
      color: var(--hairline-lit);
    }
  }

  @keyframes dia-key-path {
    0%,
    36% {
      color: var(--hairline-lit);
    }
    42%,
    100% {
      color: var(--fg);
    }
  }

  @keyframes dia-server {
    0%,
    20% {
      color: var(--hairline-lit);
    }
    24%,
    100% {
      color: var(--fg);
    }
  }

  @keyframes dia-them {
    0%,
    58% {
      color: var(--hairline-lit);
    }
    62%,
    82% {
      color: var(--fg);
    }
    86%,
    100% {
      color: var(--hairline-lit);
    }
  }

  @keyframes dia-flow-a {
    0%,
    18%,
    38%,
    100% {
      color: var(--hairline-lit);
    }
    22%,
    34% {
      color: var(--phosphor);
    }
  }

  @keyframes dia-flow-b {
    0%,
    54%,
    72%,
    100% {
      color: var(--hairline-lit);
    }
    58%,
    68% {
      color: var(--phosphor);
    }
  }

  @keyframes dia-key {
    0%,
    34% {
      color: var(--hairline-lit);
    }
    38%,
    100% {
      color: var(--phosphor);
    }
  }

  @keyframes dia-plain {
    0%,
    8% {
      opacity: 1;
      color: var(--fg);
    }
    18%,
    100% {
      opacity: 0;
    }
  }

  @keyframes dia-cipher-block {
    0%,
    14% {
      opacity: 0.2;
    }
    20%,
    56% {
      opacity: 1;
      color: var(--fg);
    }
    66%,
    100% {
      opacity: 0.2;
    }
  }

  @keyframes dia-cipher-right {
    0%,
    58% {
      opacity: 0;
    }
    62%,
    70% {
      opacity: 1;
    }
    76%,
    100% {
      opacity: 0;
    }
  }

  @keyframes dia-plain-right {
    0%,
    66% {
      opacity: 0;
    }
    72%,
    100% {
      opacity: 1;
      color: var(--fg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .diagram {
      opacity: 1;
      animation: none;
    }

    .diagram.is-animate.is-lit :global(*) {
      animation: none;
    }

    .diagram.is-animate :global(.dia-server) {
      color: var(--fg);
    }

    .diagram.is-animate :global(.dia-key-path) {
      color: var(--fg);
    }

    .diagram.is-animate :global(.dia-key) {
      color: var(--phosphor);
    }

    .diagram.is-animate :global(.dia-slot-right .dia-plain) {
      opacity: 1;
      color: var(--fg);
    }

    .diagram.is-animate :global(.dia-slot-right .dia-cipher) {
      opacity: 0;
    }
  }
</style>
