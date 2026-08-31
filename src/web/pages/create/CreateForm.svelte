<script lang="ts">
  import { DEFAULT_TTL_SECONDS, formatExpiryLabel, LONGEST_EXPIRY_LABEL } from "../../../shared/limits.js";
  import TtlSlider from "../../components/TtlSlider.svelte";
  import { formatInputSize } from "../../lib/format-input-size.js";
  import Button from "../../ui/Button.svelte";
  import FieldLabel from "../../ui/FieldLabel.svelte";
  import Frame from "../../ui/Frame.svelte";
  import Readout from "../../ui/Readout.svelte";
  import StatusLine from "../../ui/StatusLine.svelte";

  type Props = {
    envInput: string;
    ttlSeconds: number;
    busy: boolean;
    shareDisabled: boolean;
    statusText: string;
    statusError: boolean;
    onShare: () => void;
  };

  let {
    envInput = $bindable(),
    ttlSeconds = $bindable(),
    busy,
    shareDisabled,
    statusText,
    statusError,
    onShare,
  }: Props = $props();

  let envTextarea = $state<HTMLTextAreaElement | null>(null);

  export function focusInput(): void {
    envTextarea?.focus();
  }

  const inputBytes = $derived(new TextEncoder().encode(envInput).length);
  const inputSize = $derived(formatInputSize(inputBytes));
  const isOverLimit = $derived(inputSize.over);
</script>

<section class:has-busy={busy}>
  <div class="field-head">
    <FieldLabel for="env-input">paste your .env</FieldLabel>
    <Readout text={inputSize.text} over={inputSize.over} />
  </div>
  <Frame busy={busy} over={isOverLimit}>
    <textarea
      id="env-input"
      bind:this={envTextarea}
      bind:value={envInput}
      disabled={busy}
      spellcheck={false}
      autocomplete="off"
    ></textarea>
  </Frame>
</section>

<div class="controls">
  <label class="control-label" for="ttl">ttl</label>
  <TtlSlider id="ttl" bind:value={ttlSeconds} disabled={busy} />
  <span class="readout ttl-readout">
    <span class="ttl-readout-sizer" aria-hidden="true">{LONGEST_EXPIRY_LABEL}</span>
    <span class="ttl-readout-value">{formatExpiryLabel(ttlSeconds)}</span>
  </span>
  <Button busy={busy} disabled={shareDisabled} onclick={onShare}>share</Button>
</div>

<StatusLine text={statusText} error={statusError} animated />

<style>
  section {
    margin-bottom: 1.75rem;
  }

  .field-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 0.65rem;
  }

  .field-head :global(label) {
    margin-bottom: 0;
  }

  .control-label {
    display: block;
    margin-bottom: 0;
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
  }

  .readout {
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }

  .ttl-readout {
    display: inline-grid;
    justify-self: end;
  }

  .ttl-readout-sizer,
  .ttl-readout-value {
    grid-area: 1 / 1;
  }

  .ttl-readout-sizer {
    visibility: hidden;
  }

  .ttl-readout-value {
    justify-self: end;
  }

  .controls {
    display: grid;
    grid-template-columns: auto minmax(10rem, 1fr) auto auto;
    align-items: center;
    gap: 1rem;
    margin: 0 0 1.25rem;
  }
</style>
