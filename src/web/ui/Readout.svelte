<script lang="ts">
  type Props = {
    text: string;
    over?: boolean;
    sizer?: string;
    align?: "start" | "end";
  };

  let { text, over = false, sizer, align = "end" }: Props = $props();
</script>

{#if sizer}
  <span class="readout-grid" class:align-start={align === "start"}>
    <span class="readout-sizer" aria-hidden="true">{sizer}</span>
    <span class="readout" class:is-over={over}>{text}</span>
  </span>
{:else}
  <span class="readout" class:is-over={over}>{text}</span>
{/if}

<style>
  .readout-grid {
    display: inline-grid;
    align-items: center;
    justify-self: end;
  }

  .readout-grid.align-start {
    justify-self: start;
  }

  .readout-grid.align-start .readout {
    justify-self: start;
  }

  .readout-sizer,
  .readout {
    grid-area: 1 / 1;
    line-height: 1;
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
