<script lang="ts">
  type Props = {
    id: string;
    value: string;
    label: string;
    copyLabel: string;
    onCopy: () => void;
    selectOnMount?: boolean;
    multiline?: boolean;
  };

  let {
    id,
    value,
    label,
    copyLabel,
    onCopy,
    selectOnMount = false,
    multiline = false,
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
    applySelect(node);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => applySelect(node));
    });
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
</div>

<style>
  .copy-field {
    position: relative;
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
    max-height: 70vh;
    resize: vertical;
    overflow: auto;
    field-sizing: fixed;
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
