<script lang="ts">
  type Props = {
    id: string;
    value: string;
    label: string;
    copyLabel: string;
    onCopy: () => void;
    selectOnMount?: boolean;
    multiline?: boolean;
    hidden?: boolean;
    showCopy?: boolean;
  };

  let {
    id,
    value,
    label,
    copyLabel,
    onCopy,
    selectOnMount = false,
    multiline = false,
    hidden = false,
    showCopy = true,
  }: Props = $props();

  let field = $state<HTMLTextAreaElement | null>(null);

  // Retry after SwapStage's 380 ms pane transition and this field's 400 ms resize.
  const SWAP_SELECT_DELAY_MS = 420;

  function applySelect(node: HTMLTextAreaElement): void {
    if (node.value.length === 0) {
      return;
    }
    node.focus({ preventScroll: true });
    node.setSelectionRange(0, node.value.length);
  }

  function scheduleSelect(node: HTMLTextAreaElement): () => void {
    // Select immediately for an already-visible field (for example, after copying).
    applySelect(node);
    // Keep the two-frame retry for selection during the done-screen swap.
    // A Svelte tick flushes DOM updates but does not wait for the browser to paint.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => applySelect(node));
    });
    // Reapply once the pane transition settles; frame retries alone were insufficient.
    const timer = setTimeout(() => applySelect(node), SWAP_SELECT_DELAY_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }

  export function selectAll(): void {
    const el = field;
    if (!el) {
      return;
    }
    scheduleSelect(el);
  }

  function mountSelect(
    node: HTMLTextAreaElement,
    mountValue: string | undefined,
  ): { update?: (next: string) => void; destroy?: () => void } {
    if (mountValue === undefined) {
      return {};
    }
    let cancel = scheduleSelect(node);
    return {
      update(next: string) {
        if (next.length > 0) {
          cancel();
          cancel = scheduleSelect(node);
        }
      },
      destroy() {
        cancel();
      },
    };
  }
</script>

<div
  class="field-shell copy-field"
  class:is-hidden={hidden}
  class:is-multiline={multiline}
>
  <textarea
    {id}
    bind:this={field}
    use:mountSelect={selectOnMount ? value : undefined}
    class="copy-output"
    readonly
    rows={multiline ? null : 1}
    {value}
    spellcheck={false}
    aria-label={label}
  ></textarea>
  {#if showCopy}
    <button type="button" class="field-copy" onclick={onCopy} aria-label={copyLabel}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect
          x="5.25"
          y="5.25"
          width="7.5"
          height="7.5"
          rx="0.75"
          fill="none"
          stroke="currentColor"
          stroke-width="1.25"
        />
        <path
          d="M3.5 11V4.25A.75.75 0 0 1 4.25 3.5H11"
          fill="none"
          stroke="currentColor"
          stroke-width="1.25"
        />
      </svg>
    </button>
  {/if}
</div>

<style>
  .copy-field {
    position: relative;
    transition:
      opacity 0.35s ease,
      min-height 0.4s ease;
  }

  .copy-field.is-hidden {
    opacity: 0;
    min-height: 0;
    border-color: transparent;
    pointer-events: none;
  }

  .copy-field.is-hidden .copy-output {
    min-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    overflow: hidden;
    transition:
      opacity 0.35s ease,
      min-height 0.4s ease,
      padding 0.4s ease;
  }

  .copy-output {
    display: block;
    width: 100%;
    min-height: 0;
    padding: 0.85rem 1rem;
    padding-right: 2.75rem;
    padding-bottom: 2.75rem;
    background: transparent;
    color: var(--fg);
    border: 0;
    border-radius: 0;
    font: inherit;
    caret-color: var(--phosphor);
    resize: none;
    overflow: hidden;
    overflow-wrap: anywhere;
    field-sizing: content;
    transition: opacity 0.35s ease;
  }

  .copy-field.is-multiline .copy-output {
    min-height: 16rem;
    resize: vertical;
    field-sizing: auto;
  }

  .copy-field.is-hidden.is-multiline .copy-output {
    min-height: 0;
  }

  @media (pointer: coarse) {
    .copy-output {
      font-size: 16px;
    }
  }

  @media (max-width: 40rem) {
    .copy-field.is-multiline .copy-output {
      min-height: 11rem;
    }
  }

  .copy-output:focus {
    outline: none;
  }

  .field-copy {
    position: absolute;
    right: 0.35rem;
    bottom: 0.35rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    margin: 0;
    padding: 0;
    background: var(--surface);
    color: var(--muted);
    border: 0;
    border-radius: 0;
    font: inherit;
    cursor: pointer;
    transition:
      color 0.2s ease,
      background 0.2s ease;
  }

  .field-copy:hover {
    background: var(--teal);
    color: var(--phosphor);
  }

  @media (prefers-reduced-motion: reduce) {
    .copy-field,
    .copy-output {
      transition: none;
    }
  }
</style>
