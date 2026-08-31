<script lang="ts">
  import Button from "../../ui/Button.svelte";
  import FieldLabel from "../../ui/FieldLabel.svelte";
  import Frame from "../../ui/Frame.svelte";

  type Props = {
    linkInput: string;
    onOpen: () => void;
  };

  let { linkInput = $bindable(), onOpen }: Props = $props();
</script>

<section>
  <FieldLabel for="share-link">paste full URL or share_id#key</FieldLabel>
  <Frame>
    <input
      id="share-link"
      type="text"
      bind:value={linkInput}
      placeholder="https://…/s/share_…#… or share_…#…"
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
