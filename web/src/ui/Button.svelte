<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    busy?: boolean;
    disabled?: boolean;
    type?: "button" | "submit";
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  };

  let {
    busy = false,
    disabled = false,
    type = "button",
    onclick,
    children,
  }: Props = $props();
</script>

<button
  {type}
  class:is-busy={busy}
  {disabled}
  {onclick}
>
  {@render children()}
</button>

<style>
  button {
    padding: 0.45rem 1.1rem;
    background: var(--teal);
    color: var(--phosphor);
    border: 1px solid var(--phosphor);
    border-radius: 0;
    font: inherit;
    font-size: var(--tick);
    font-weight: 500;
    letter-spacing: var(--track);
    text-transform: uppercase;
    cursor: pointer;
    transition:
      background 0.2s ease,
      opacity 0.25s ease;
  }

  button.is-busy:disabled {
    opacity: 0.7;
    animation: btn-busy 1.1s steps(1, end) infinite;
  }

  @keyframes btn-busy {
    0%,
    49% {
      border-color: var(--phosphor);
    }
    50%,
    100% {
      border-color: var(--hairline-lit);
    }
  }

  button:hover:not(:disabled) {
    background: var(--teal-hover);
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    button.is-busy:disabled {
      transition: none;
      animation: none;
    }
  }
</style>
