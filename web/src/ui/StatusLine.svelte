<script lang="ts">
  import { fade } from "svelte/transition";

  type Props = {
    text: string;
    error?: boolean;
    animated?: boolean;
  };

  let { text, error = false, animated = false }: Props = $props();
</script>

<div
  class="status"
  class:error
  class:has-note={text.length > 0}
  aria-live="polite"
>
  {#if animated}
    {#key text}
      {#if text}
        <span class="status-text" in:fade={{ duration: 220 }}>{text}</span>
      {/if}
    {/key}
  {:else if text}
    {text}
  {/if}
</div>

<style>
  .status {
    display: grid;
    min-height: 1.5rem;
    margin: 0 0 1.5rem;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .status-text {
    grid-area: 1 / 1;
  }

  .status.error {
    color: var(--coral);
  }
</style>
