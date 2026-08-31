<script lang="ts">
  import ShareDiagram from "./ShareDiagram.svelte";
</script>

<header class="hero">
  <h2 class="lead">Securely share your <span class="mark">.env</span></h2>
  <p class="deck">
    Encrypt with the browser, and share a link with a key the server never sees.
  </p>
</header>

<ShareDiagram />

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
