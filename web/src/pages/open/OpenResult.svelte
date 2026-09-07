<script lang="ts">
  import Button from "../../ui/Button.svelte";
  import CopyField from "../../ui/CopyField.svelte";
  import FieldLabel from "../../ui/FieldLabel.svelte";

  type Props = {
    envOutput: string;
    revealed: boolean;
    onCopy: () => void;
    onAgain: () => void;
  };

  let { envOutput, revealed, onCopy, onAgain }: Props = $props();

  let copyField = $state<CopyField | null>(null);

  export function selectOutput(): void {
    copyField?.selectAll();
  }
</script>

<div class="done">
  <div class="field-head">
    <FieldLabel for="env-output">decrypted .env</FieldLabel>
  </div>
  <CopyField
    bind:this={copyField}
    id="env-output"
    value={envOutput}
    label="decrypted .env"
    copyLabel="Copy .env to clipboard"
    {onCopy}
    multiline
    hidden={!revealed}
    showCopy={revealed}
  />
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

  .done-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 1.25rem 0 0;
  }
</style>
