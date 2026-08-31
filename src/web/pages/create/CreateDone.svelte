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
    bindShareUrlInput?: (el: HTMLInputElement) => void;
  };

  let {
    url,
    expiresAt,
    copied,
    onCopy,
    onAgain,
  }: Props = $props();

  let shareUrlInput = $state<HTMLInputElement | null>(null);

  export function focusLink(): void {
    shareUrlInput?.focus();
    shareUrlInput?.select();
  }

  const title = $derived(!copied ? "copy, then send." : "");
  const expiry = $derived(formatExpiresAtLabel(expiresAt));
</script>

<div class="done">
  {#if title}
    <p class="done-title" aria-live="polite">{title}</p>
  {/if}
  <div class="done-result">
    <p class="done-expiry readout">{expiry}</p>
    <div class="frame link-frame">
      <input
        id="share-url"
        bind:this={shareUrlInput}
        class="link-input"
        type="text"
        readonly
        value={url}
        spellcheck={false}
        aria-label="share link"
      />
      <button
        type="button"
        class="link-copy"
        onclick={onCopy}
        aria-label="Copy link to clipboard"
      >
        <CopyIcon />
      </button>
    </div>
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

  .done-result {
    margin: 0;
  }

  .done-expiry {
    margin: 0 0 0.65rem;
  }

  .frame {
    border: 1px solid var(--hairline);
    background: var(--surface);
  }

  .link-frame {
    display: flex;
    align-items: stretch;
  }

  .link-input {
    display: block;
    flex: 1;
    min-width: 0;
    padding: 0.85rem 1rem;
    padding-right: 0.65rem;
    background: transparent;
    color: var(--fg);
    border: 0;
    font: inherit;
    caret-color: var(--phosphor);
  }

  .link-input:focus {
    outline: none;
  }

  .frame:focus-within {
    border-color: var(--phosphor);
  }

  .link-copy {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    margin: 0;
    padding: 0;
    background: transparent;
    color: var(--muted);
    border: 0;
    border-left: 1px solid var(--hairline);
    border-radius: 0;
    font: inherit;
    letter-spacing: 0;
    text-transform: none;
    cursor: pointer;
    transition:
      color 0.2s ease,
      background 0.2s ease;
  }

  .link-copy:hover {
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
