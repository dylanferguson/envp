<script lang="ts">
  import Button from "../../ui/Button.svelte";
  import FieldLabel from "../../ui/FieldLabel.svelte";
  import Frame from "../../ui/Frame.svelte";

  type Props = {
    envOutput: string;
    revealed: boolean;
    onCopy: () => void;
  };

  let { envOutput, revealed, onCopy }: Props = $props();
</script>

<section>
  <FieldLabel for="env-output">decrypted .env</FieldLabel>
  <Frame>
    <textarea
      id="env-output"
      class:is-out={!revealed}
      readonly
      value={envOutput}
      spellcheck={false}
    ></textarea>
  </Frame>
  <Button hidden={!revealed} onclick={onCopy}>copy</Button>
</section>

<style>
  section {
    margin-bottom: 1.75rem;
  }

  section > :global(button) {
    margin-top: 1.25rem;
  }

  :global(textarea.is-out) {
    opacity: 0;
    min-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    overflow: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(textarea.is-out) {
      transition: none;
    }
  }
</style>
