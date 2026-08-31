<script lang="ts">
  import Button from "../../ui/Button.svelte";
  import CopyIcon from "../../ui/CopyIcon.svelte";
  import FieldLabel from "../../ui/FieldLabel.svelte";

  type Props = {
    envOutput: string;
    revealed: boolean;
    onCopy: () => void;
    onAgain: () => void;
  };

  let { envOutput, revealed, onCopy, onAgain }: Props = $props();

  let envOutputEl = $state<HTMLTextAreaElement | null>(null);

  export function selectOutput(): void {
    const el = envOutputEl;
    if (!el) {
      return;
    }
    el.focus({ preventScroll: true });
    el.setSelectionRange(0, el.value.length);
  }
</script>

<div class="done">
  <div class="field-head">
    <FieldLabel for="env-output">decrypted .env</FieldLabel>
    {#if revealed}
      <button
        type="button"
        class="head-copy"
        onclick={onCopy}
        aria-label="Copy .env to clipboard"
      >
        <CopyIcon />
      </button>
    {/if}
  </div>
  <div class="frame" class:is-out={!revealed}>
    <textarea
      id="env-output"
      bind:this={envOutputEl}
      class="env-output"
      readonly
      value={envOutput}
      spellcheck={false}
    ></textarea>
  </div>
  {#if revealed}
    <div class="done-actions">
      <Button onclick={onAgain}>open another</Button>
    </div>
  {/if}
</div>

<style>
  .field-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 0.25rem;
  }

  .field-head :global(label) {
    margin-bottom: 0;
  }

  .head-copy {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    align-self: center;
    width: 1.75rem;
    height: 1.75rem;
    margin: 0;
    padding: 0;
    background: transparent;
    color: var(--muted);
    border: 0;
    border-radius: 0;
    font: inherit;
    cursor: pointer;
    transition:
      color 0.2s ease,
      background 0.2s ease;
  }

  .head-copy:hover {
    background: var(--teal);
    color: var(--phosphor);
  }

  .frame {
    border: 1px solid var(--hairline);
    background: var(--surface);
    transition:
      border-color 0.35s ease,
      opacity 0.35s ease,
      min-height 0.4s ease;
  }

  .frame.is-out {
    opacity: 0;
    min-height: 0;
    border-color: transparent;
    pointer-events: none;
  }

  .frame.is-out .env-output {
    min-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    overflow: hidden;
    transition:
      opacity 0.35s ease,
      min-height 0.4s ease,
      padding 0.4s ease;
  }

  .env-output {
    display: block;
    width: 100%;
    min-height: 16rem;
    padding: 0.85rem 1rem;
    background: transparent;
    color: var(--fg);
    border: 0;
    border-radius: 0;
    font: inherit;
    resize: vertical;
    transition: opacity 0.35s ease;
  }

  .env-output:focus {
    outline: none;
  }

  .frame:focus-within {
    border-color: var(--phosphor);
  }

  .done-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 1.25rem 0 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .frame,
    .env-output {
      transition: none;
    }
  }
</style>
