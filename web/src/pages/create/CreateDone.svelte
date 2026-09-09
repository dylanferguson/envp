<script lang="ts">
  import { revokeShare, ShareApiError } from "../../api/shares.js";
  import { formatShareBoundsLabel, type DeleteToken, type ShareId } from "../../lib/limits.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import Button from "../../ui/Button.svelte";
  import CopyField from "../../ui/CopyField.svelte";
  import FieldLabel from "../../ui/FieldLabel.svelte";

  type Props = {
    shareId: ShareId;
    deleteToken: DeleteToken;
    onAgain: () => void;
    url?: string;
    revokeUrl?: string;
    expiresAt?: number;
    maxReads?: number;
    copied?: boolean;
    onCopy?: () => void;
  };

  let {
    shareId,
    deleteToken,
    onAgain,
    url,
    revokeUrl,
    expiresAt,
    maxReads,
    copied = false,
    onCopy,
  }: Props = $props();

  let copyField = $state<CopyField | null>(null);
  let revoke = $state<"idle" | "revoking" | "revoked" | "gone" | { error: string }>("idle");

  export function selectLink(): void {
    copyField?.selectAll();
  }

  const created = $derived(url !== undefined);
  const title = $derived(
    revoke === "revoked"
      ? "share revoked."
      : revoke === "gone"
        ? "Not found. Spent, expired, or never existed."
        : !created
          ? "revoke this share?"
          : !copied
            ? "copy, then send."
            : "",
  );
  const bounds = $derived(
    expiresAt !== undefined && maxReads !== undefined
      ? formatShareBoundsLabel(expiresAt, maxReads)
      : "",
  );
  const done = $derived(revoke === "revoked" || revoke === "gone");

  function copyRevokeLink(): void {
    if (revokeUrl === undefined) {
      return;
    }
    void navigator.clipboard.writeText(revokeUrl).then(() => {
      showToast("revoke link copied to clipboard");
    });
  }

  async function onRevoke(): Promise<void> {
    if (revoke === "revoking" || done) {
      return;
    }
    revoke = "revoking";
    try {
      revoke = await revokeShare(shareId, deleteToken);
    } catch (error) {
      revoke = { error: error instanceof ShareApiError ? error.message : "Something went wrong" };
    }
  }
</script>

<div class="done">
  {#if title}
    <p class="done-title" aria-live="polite">{title}</p>
  {/if}
  {#if typeof revoke === "object"}
    <p class="done-error" aria-live="polite">{revoke.error}</p>
  {/if}
  {#if created && !done}
    <p class="done-meta">{bounds}</p>
    <div class="done-fields">
      <div>
        <FieldLabel for="share-url">share link</FieldLabel>
        <CopyField
          bind:this={copyField}
          id="share-url"
          value={url ?? ""}
          label="share link"
          copyLabel="Copy link to clipboard"
          onCopy={onCopy ?? (() => {})}
          selectOnMount
        />
      </div>
      <div>
        <FieldLabel for="revoke-url">revoke link</FieldLabel>
        <CopyField
          id="revoke-url"
          value={revokeUrl ?? ""}
          label="revoke link"
          copyLabel="Copy revoke link to clipboard"
          onCopy={copyRevokeLink}
        />
      </div>
    </div>
  {/if}
  <div class="done-actions">
    {#if !done}
      <Button busy={revoke === "revoking"} disabled={revoke === "revoking"} onclick={onRevoke}>revoke share</Button>
    {/if}
    <Button disabled={revoke === "revoking"} onclick={onAgain}>share again</Button>
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
