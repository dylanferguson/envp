<script lang="ts">
  import Button from "../../ui/Button.svelte";
  import FieldLabel from "../../ui/FieldLabel.svelte";
  import Frame from "../../ui/Frame.svelte";

  type Props = {
    linkInput: string;
    onOpen: () => void;
  };

  let { linkInput = $bindable(), onOpen }: Props = $props();

  let linkInputEl = $state<HTMLInputElement | null>(null);

  export function focusInput(): void {
    linkInputEl?.focus();
  }
</script>

<section>
  <FieldLabel for="share-link">paste shared link</FieldLabel>
  <Frame>
    <input
      id="share-link"
      bind:this={linkInputEl}
      type="text"
      bind:value={linkInput}
      spellcheck={false}
      autocomplete="off"
      onkeydown={(e) => {
        if (e.key === "Enter") {
          onOpen();
        }
      }}
    />
  </Frame>
  <Button onclick={onOpen}>open</Button>
</section>

<style>
  section {
    margin-bottom: 1.75rem;
  }

  section > :global(button) {
    margin-top: 1.25rem;
  }
</style>
