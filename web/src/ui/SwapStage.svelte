<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    showAlt: boolean;
    primary: Snippet;
    alt: Snippet;
  };

  let { showAlt, primary, alt }: Props = $props();
</script>

<div class="swap-stage">
  <div class="swap-pane" class:is-out={showAlt}>
    {@render primary()}
  </div>
  <div class="swap-pane" class:is-out={!showAlt}>
    {@render alt()}
  </div>
</div>

<style>
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
    .swap-pane {
      transition: none;
    }
  }
</style>
