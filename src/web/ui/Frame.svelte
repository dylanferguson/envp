<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    busy?: boolean;
    over?: boolean;
    children: Snippet;
  };

  let { busy = false, over = false, children }: Props = $props();
</script>

<div class="field-shell frame" class:is-busy={busy} class:is-over={over}>
  {@render children()}
</div>

<style>
  .frame.is-busy {
    animation: seal-pulse 1.4s ease-in-out infinite;
  }

  .frame.is-over {
    border-color: var(--coral);
  }

  @keyframes seal-pulse {
    0%,
    100% {
      border-color: var(--hairline);
    }
    50% {
      border-color: var(--phosphor);
    }
  }

  .frame :global(textarea),
  .frame :global(input) {
    display: block;
    width: 100%;
    padding: 0.85rem 1rem;
    background: transparent;
    color: var(--fg);
    border: 0;
    border-radius: 0;
    font: inherit;
    caret-color: var(--phosphor);
  }

  .frame :global(textarea) {
    min-height: 16rem;
    resize: vertical;
    transition:
      opacity 0.35s ease,
      min-height 0.4s ease,
      padding 0.4s ease;
  }

  .frame :global(textarea:disabled) {
    opacity: 0.45;
    cursor: default;
  }

  .frame :global(input::placeholder) {
    color: var(--muted);
    opacity: 0.6;
  }

  .frame :global(textarea:focus),
  .frame :global(input:focus) {
    outline: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .frame.is-busy,
    .frame :global(textarea) {
      transition: none;
      animation: none;
    }
  }
</style>
