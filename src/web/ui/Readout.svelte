<script lang="ts">
  type Props = {
    text: string;
    over?: boolean;
  };

  let { text, over = false }: Props = $props();
</script>

<span class="readout" class:is-over={over}>{text}</span>

<style>
  .readout {
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
