<script lang="ts">
  type Props = {
    text: string;
    over?: boolean;
    sizer?: string;
  };

  let { text, over = false, sizer }: Props = $props();
</script>

{#if sizer}
  <span class="readout-grid">
    <span class="readout-sizer" aria-hidden="true">{sizer}</span>
    <span class="readout" class:is-over={over}>{text}</span>
  </span>
{:else}
  <span class="readout" class:is-over={over}>{text}</span>
{/if}

<style>
  .readout-grid {
    display: inline-grid;
    justify-self: end;
  }

  .readout-sizer,
  .readout {
    grid-area: 1 / 1;
  }

  .readout-sizer {
    visibility: hidden;
  }

  .readout {
    justify-self: end;
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }

  .readout.is-over {
    color: var(--coral);
  }
</style>
