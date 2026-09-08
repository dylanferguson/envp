<script lang="ts">
  import {
    DEFAULT_MAX_READS,
    DEFAULT_TTL_SECONDS,
    formatExpiryLabel,
    formatInputSize,
    formatMaxReadsLabel,
    LONGEST_EXPIRY_LABEL,
    LONGEST_READS_LABEL,
    MAX_MAX_READS,
    MAX_TTL_SECONDS,
    MIN_MAX_READS,
    MIN_TTL_SECONDS,
    parseMaxReads,
    parseTtlSeconds,
    type MaxReads,
    type TtlSeconds,
  } from "../../lib/limits.js";
  import Button from "../../ui/Button.svelte";
  import FieldLabel from "../../ui/FieldLabel.svelte";
  import Frame from "../../ui/Frame.svelte";
  import Readout from "../../ui/Readout.svelte";
  import Slider from "../../ui/Slider.svelte";
  import StatusLine from "../../ui/StatusLine.svelte";

  type Props = {
    busy: boolean;
    statusText: string;
    statusError: boolean;
    onShare: (envInput: string, ttlSeconds: TtlSeconds, maxReads: MaxReads) => void;
  };

  let {
    busy,
    statusText,
    statusError,
    onShare,
  }: Props = $props();

  let envInput = $state("");
  let ttlSeconds = $state<number>(DEFAULT_TTL_SECONDS);
  let maxReads = $state<number>(DEFAULT_MAX_READS);
  let envTextarea = $state<HTMLTextAreaElement | null>(null);

  export function clearInput(): void {
    envInput = "";
  }

  export function focusInput(): void {
    envTextarea?.focus();
  }

  const inputBytes = $derived(new TextEncoder().encode(envInput).length);
  const inputSize = $derived(formatInputSize(inputBytes));
  const isOverLimit = $derived(inputSize.over);
  const validatedTtl = $derived(parseTtlSeconds(String(ttlSeconds)));
  const validatedMaxReads = $derived(parseMaxReads(maxReads));
  const shareDisabled = $derived(
    busy || isOverLimit || envInput.length === 0 || validatedTtl === null || validatedMaxReads === null,
  );

  function submit(): void {
    if (shareDisabled || validatedTtl === null || validatedMaxReads === null) {
      return;
    }
    onShare(envInput, validatedTtl, validatedMaxReads);
  }
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
  <FieldLabel for="ttl" compact>ttl</FieldLabel>
  <Slider
    id="ttl"
    bind:value={ttlSeconds}
    min={MIN_TTL_SECONDS}
    max={MAX_TTL_SECONDS}
    step={60}
    disabled={busy}
  />
  <Readout
    text={formatExpiryLabel(ttlSeconds)}
    sizer={LONGEST_EXPIRY_LABEL}
    align="start"
  />
  <FieldLabel for="reads" compact>reads</FieldLabel>
  <Slider
    id="reads"
    bind:value={maxReads}
    min={MIN_MAX_READS}
    max={MAX_MAX_READS}
    step={1}
    disabled={busy}
  />
  <Readout
    text={formatMaxReadsLabel(maxReads)}
    sizer={LONGEST_READS_LABEL}
    align="start"
  />
  <Button busy={busy} disabled={shareDisabled} onclick={submit}>share</Button>
</div>

<StatusLine text={statusText} error={statusError} />

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

  .controls {
    --controls-band: 0.85rem;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    column-gap: 1rem;
    row-gap: 0.85rem;
    min-width: 0;
    margin: 0 0 1.25rem;
  }

  .controls > :global(label.compact),
  .controls > :global(.readout-grid) {
    min-height: var(--controls-band);
    line-height: 1;
  }

  .controls > :global(.slider) {
    min-width: 0;
    height: var(--controls-band);
  }

  .controls > :global(button) {
    grid-column: 4;
    grid-row: 1 / span 2;
    align-self: center;
    line-height: 1;
  }

  @media (max-width: 40rem) {
    .controls {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .controls > :global(button) {
      grid-column: 1 / -1;
      grid-row: auto;
      justify-self: end;
    }
  }
</style>
