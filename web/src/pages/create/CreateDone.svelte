<script lang="ts">
  import { revokeShare, ShareApiError } from "../../api/shares.js";
  import { formatShareBoundsLabel, type DeleteToken, type ShareId } from "../../lib/limits.js";
  import { showToast } from "../../lib/toast.svelte.js";
  import Button from "../../ui/Button.svelte";
  import CopyField from "../../ui/CopyField.svelte";
  import FieldLabel from "../../ui/FieldLabel.svelte";
  import type { RevokeState } from "./state.js";

  type Props =
    | {
        kind: "created";
        shareId: ShareId;
        deleteToken: DeleteToken;
        url: string;
        revokeUrl: string;
        expiresAt: number;
        maxReads: number;
        copied: boolean;
        onAgain: () => void;
      }
    | {
        kind: "confirm";
        shareId: ShareId;
        deleteToken: DeleteToken;
        onAgain: () => void;
      }
    | {
        kind: "gone";
        onAgain: () => void;
      };

  let props: Props = $props();

  let linkField = $state<CopyField | null>(null);
  let copied = $state(props.kind === "created" && props.copied);
  let revoke = $state<RevokeState>({ phase: "idle" });

  export function selectLink(): void {
    linkField?.selectAll();
  }

  const revoked = $derived(revoke.phase === "revoked");
  const missing = $derived(revoke.phase === "gone" || props.kind === "gone");
  const revoking = $derived(revoke.phase === "revoking");
  const bounds = $derived(
    props.kind === "created" ? formatShareBoundsLabel(props.expiresAt, props.maxReads) : "",
  );

  function copyShareLink(): void {
    if (props.kind !== "created") {
      return;
    }
    void navigator.clipboard.writeText(props.url).then(
      () => {
        copied = true;
        showToast("link copied to clipboard");
        selectLink();
      },
      () => {
        copied = false;
      },
    );
  }

  function copyRevokeLink(): void {
    if (props.kind !== "created") {
      return;
    }
    void navigator.clipboard.writeText(props.revokeUrl).then(() => {
      showToast("revoke link copied to clipboard");
    });
  }

  async function onRevoke(): Promise<void> {
    if (
      props.kind === "gone" ||
      revoke.phase === "revoking" ||
      revoke.phase === "revoked" ||
      revoke.phase === "gone"
    ) {
      return;
    }
    revoke = { phase: "revoking" };
    try {
      revoke = { phase: await revokeShare(props.shareId, props.deleteToken) };
    } catch (error) {
      const message = error instanceof ShareApiError ? error.message : "Something went wrong";
      revoke = { phase: "error", message };
    }
  }
</script>

<div class="done">
  {#if revoked}
    <p class="done-title" aria-live="polite">share revoked.</p>
  {:else if missing}
    <p class="done-title" aria-live="polite">Not found. Spent, expired, or never existed.</p>
  {:else if props.kind === "confirm"}
    <p class="done-title" aria-live="polite">revoke this share?</p>
  {:else if !copied}
    <p class="done-title" aria-live="polite">copy, then send.</p>
  {/if}
  {#if revoke.phase === "error"}
    <p class="done-error" aria-live="polite">{revoke.message}</p>
  {/if}
  {#if props.kind === "created" && !revoked && !missing}
    <p class="done-meta">{bounds}</p>
    <div class="done-fields">
      <div>
        <FieldLabel for="share-url">share link</FieldLabel>
        <CopyField
          bind:this={linkField}
          id="share-url"
          value={props.url}
          label="share link"
          copyLabel="Copy link to clipboard"
          onCopy={copyShareLink}
          selectOnMount
        />
      </div>
      <div>
        <FieldLabel for="revoke-url">revoke link</FieldLabel>
        <CopyField
          id="revoke-url"
          value={props.revokeUrl}
          label="revoke link"
          copyLabel="Copy revoke link to clipboard"
          onCopy={copyRevokeLink}
        />
      </div>
    </div>
  {/if}
  <div class="done-actions">
    {#if props.kind !== "gone" && !revoked && !missing}
      <Button busy={revoking} disabled={revoking} onclick={onRevoke}>revoke share</Button>
    {/if}
    <Button disabled={revoking} onclick={props.onAgain}>share again</Button>
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
