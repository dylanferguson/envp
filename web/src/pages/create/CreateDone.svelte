<script lang="ts">
  import { formatShareBoundsLabel } from "../../lib/limits.js";
  import Button from "../../ui/Button.svelte";
  import CopyField from "../../ui/CopyField.svelte";
  import type { RevokeState } from "./state.js";

  type Props = {
    url: string;
    deleteToken: string;
    expiresAt: number;
    maxReads: number;
    copied: boolean;
    revoke: RevokeState;
    onCopy: () => void;
    onCopyToken: () => void;
    onRevoke: () => void;
    onAgain: () => void;
  };

  let {
    url,
    deleteToken,
    expiresAt,
    maxReads,
    copied,
    revoke,
    onCopy,
    onCopyToken,
    onRevoke,
    onAgain,
  }: Props = $props();

  let linkField = $state<CopyField | null>(null);

  export function selectLink(): void {
    linkField?.selectAll();
  }

  const revoked = $derived(revoke.phase === "revoked");
  const revoking = $derived(revoke.phase === "revoking");
  const title = $derived(!copied && !revoked ? "copy, then send." : "");
  const bounds = $derived(formatShareBoundsLabel(expiresAt, maxReads));
</script>

<div class="done">
  {#if revoked}
    <p class="done-title" aria-live="polite">share revoked.</p>
  {:else if title}
    <p class="done-title" aria-live="polite">{title}</p>
  {/if}
  {#if revoke.phase === "error"}
    <p class="done-error" aria-live="polite">{revoke.message}</p>
  {/if}
  {#if !revoked}
    <p class="done-meta">{bounds}</p>
    <div class="done-fields">
      <CopyField
        bind:this={linkField}
        id="share-url"
        value={url}
        label="share link"
        copyLabel="Copy link to clipboard"
        {onCopy}
        selectOnMount
      />
      <CopyField
        id="delete-token"
        value={deleteToken}
        label="revoke token"
        copyLabel="Copy revoke token to clipboard"
        onCopy={onCopyToken}
      />
    </div>
  {/if}
  <div class="done-actions">
    {#if !revoked}
      <Button busy={revoking} disabled={revoking} onclick={onRevoke}>revoke share</Button>
    {/if}
    <Button disabled={revoking} onclick={onAgain}>share again</Button>
  </div>
</div>

<style>
  .done-title {
    margin: 0 0 0.65rem;
    font-size: 1rem;
    font-weight: 500;
    color: var(--fg);
  }

  .done-error {
    margin: 0 0 0.65rem;
    font-size: var(--tick);
    letter-spacing: var(--track);
    color: var(--error);
  }

  .done-meta {
    margin: 0 0 0.65rem;
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
  }

  .done-fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .done-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 1.25rem 0 0;
  }
</style>
