<script lang="ts">
  import { formatExpiresAtLabel } from "../../../shared/limits.js";
  import Button from "../../ui/Button.svelte";
  import CopyIcon from "../../ui/CopyIcon.svelte";

  type Props = {
    url: string;
    expiresAt: number;
    copied: boolean;
    onCopy: () => void;
    onAgain: () => void;
  };

  let {
    url,
    expiresAt,
    copied,
    onCopy,
    onAgain,
  }: Props = $props();

  let shareUrlInput = $state<HTMLTextAreaElement | null>(null);

  // Select-all must run from a textarea action, not the parent: CreateDone mounts
  // inside SwapStage after share completes, and bind:this is not ready until then.
  // Double rAF waits for field-sizing layout before setSelectionRange sticks.
  function focusLinkField(node: HTMLTextAreaElement): { update?: (value: string) => void } {
    const selectAll = (): void => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          node.focus({ preventScroll: true });
          node.setSelectionRange(0, node.value.length);
        });
      });
    };
    selectAll();
    return {
      update(value: string) {
        if (value.length > 0) {
          selectAll();
        }
      },
    };
  }

  export function selectLink(): void {
    const el = shareUrlInput;
    if (!el) {
      return;
    }
    el.focus({ preventScroll: true });
    el.setSelectionRange(0, el.value.length);
  }

  const title = $derived(!copied ? "copy, then send." : "");
  const expiry = $derived(formatExpiresAtLabel(expiresAt));
</script>

<div class="done">
  {#if title}
    <p class="done-title" aria-live="polite">{title}</p>
  {/if}
  <p class="done-expiry readout">{expiry}</p>
  <div class="frame">
    <textarea
      id="share-url"
      bind:this={shareUrlInput}
      use:focusLinkField={url}
      class="link-output"
      readonly
      rows={1}
      value={url}
      spellcheck={false}
      aria-label="share link"
    ></textarea>
    <button
      type="button"
      class="field-copy"
      onclick={onCopy}
      aria-label="Copy link to clipboard"
    >
      <CopyIcon />
    </button>
  </div>
  <div class="done-actions">
    <Button onclick={onAgain}>new</Button>
  </div>
</div>

<style>
  .readout {
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }

  .done-title {
    margin: 0 0 0.65rem;
    font-size: 1rem;
    font-weight: 500;
    color: var(--fg);
  }

  .done-expiry {
    margin: 0 0 0.65rem;
  }

  .frame {
    position: relative;
    border: 1px solid var(--hairline);
    background: var(--surface);
  }

  .link-output {
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
  }

  .link-output:focus {
    outline: none;
  }

  .frame:focus-within {
    border-color: var(--phosphor);
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

  .done-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 1.25rem 0 0;
  }
</style>
