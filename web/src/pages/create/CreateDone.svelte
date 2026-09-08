<script lang="ts">
  import { formatShareBoundsLabel } from "../../lib/limits.js";
  import Button from "../../ui/Button.svelte";
  import CopyField from "../../ui/CopyField.svelte";

  type Props = {
    url: string;
    expiresAt: number;
    maxReads: number;
    copied: boolean;
    onCopy: () => void;
    onAgain: () => void;
  };

  let { url, expiresAt, maxReads, copied, onCopy, onAgain }: Props = $props();

  let copyField = $state<CopyField | null>(null);

  export function selectLink(): void {
    copyField?.selectAll();
  }

  const title = $derived(!copied ? "copy, then send." : "");
  const bounds = $derived(formatShareBoundsLabel(expiresAt, maxReads));
</script>

<div class="done">
  {#if title}
    <p class="done-title" aria-live="polite">{title}</p>
  {/if}
  <p class="done-meta">{bounds}</p>
  <CopyField
    bind:this={copyField}
    id="share-url"
    value={url}
    label="share link"
    copyLabel="Copy link to clipboard"
    {onCopy}
    selectOnMount
  />
  <div class="done-actions">
    <Button onclick={onAgain}>share again</Button>
  </div>
</div>

<style>
  .done-title {
    margin: 0 0 0.65rem;
    font-size: 1rem;
    font-weight: 500;
    color: var(--fg);
  }

  .done-meta {
    margin: 0 0 0.65rem;
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
  }

  .done-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 1.25rem 0 0;
  }
</style>
