<script lang="ts">
  type Props = {
    for: string;
    compact?: boolean;
    children: import("svelte").Snippet;
  };

  let { for: htmlFor, compact = false, children }: Props = $props();
</script>

<label for={htmlFor} class:compact>{@render children()}</label>

<style>
  label {
    display: block;
    margin-bottom: 0.65rem;
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
  }

  label.compact {
    display: inline-flex;
    align-items: center;
    margin-bottom: 0;
    line-height: 1;
  }
</style>
