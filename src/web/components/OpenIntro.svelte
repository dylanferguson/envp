<script lang="ts">
  import type { DiagramFocus } from "../lib/diagram-focus.js";
  import ShareDiagram from "./ShareDiagram.svelte";

  type Props = {
    focus: DiagramFocus;
  };

  let { focus }: Props = $props();
</script>

<header class="hero">
  <h2 class="lead">Open a shared <span class="mark">.env</span></h2>
  <p class="deck">
    Paste the shared env-share link, and decrypt the sender's env, without the
    server ever seeing the key.
  </p>
</header>

<ShareDiagram {focus} />

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
</style>
