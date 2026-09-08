<script lang="ts">
  import { finishHide, toast } from "../lib/toast.svelte.js";

  function onAnimationEnd(event: AnimationEvent): void {
    if (!event.animationName.endsWith("toast-out")) {
      return;
    }
    finishHide();
  }
</script>

{#if toast.phase !== "hidden"}
  {#key toast.seq}
    <p
      class="toast"
      class:is-hiding={toast.phase === "hiding"}
      role="status"
      aria-live="polite"
      onanimationend={onAnimationEnd}
    >
      <svg class="toast-mark" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.25" />
        <path
          d="M5 8.25 7 10.25 11 5.75"
          fill="none"
          stroke="currentColor"
          stroke-width="1.25"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      {toast.message}
    </p>
  {/key}
{/if}

<style>
  .toast {
    position: fixed;
    right: max(1rem, env(safe-area-inset-right));
    bottom: max(1rem, env(safe-area-inset-bottom));
    z-index: 4;
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    max-width: calc(100% - 2rem);
    margin: 0;
    padding: 0.75rem 1rem;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 0.375rem;
    color: var(--fg);
    font-size: 0.85rem;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.45);
    pointer-events: none;
    transform-origin: bottom right;
    overflow: hidden;
    animation: toast-in 400ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .toast.is-hiding {
    animation: toast-out 400ms cubic-bezier(0.4, 0, 1, 1) both;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translate3d(0, 100%, 0);
    }

    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }

  @keyframes toast-out {
    from {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }

    to {
      opacity: 0;
      transform: translate3d(calc(100% + 0.75rem), 0, 0);
    }
  }

  .toast-mark {
    flex-shrink: 0;
    color: var(--phosphor);
  }

  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: toast-in-reduced 150ms ease both;
    }

    .toast.is-hiding {
      animation: toast-out-reduced 150ms ease both;
    }
  }

  @keyframes toast-in-reduced {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @keyframes toast-out-reduced {
    from {
      opacity: 1;
    }

    to {
      opacity: 0;
    }
  }
</style>
