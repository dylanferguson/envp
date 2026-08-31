<script lang="ts">
  type Props = {
    for: string;
    children: import("svelte").Snippet;
  };

  let { for: htmlFor, children }: Props = $props();
</script>

<label for={htmlFor}>{@render children()}</label>

<style>
  label {
    display: block;
    margin-bottom: 0.65rem;
    font-size: var(--tick);
    letter-spacing: var(--track);
    text-transform: uppercase;
    color: var(--muted);
  }
</style>
