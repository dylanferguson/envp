<script lang="ts">
  import type { Snippet } from "svelte";
  import type { SignalTone } from "../lib/signal.js";
  import Toast from "../ui/Toast.svelte";
  import Nav from "./Nav.svelte";

  type Props = {
    activeOp: "share" | "open";
    word: string;
    tone: SignalTone;
    children: Snippet;
  };

  let { activeOp, word, tone, children }: Props = $props();
</script>

<Nav {activeOp} {word} {tone} />

<main class="layout-main">
  {@render children()}
</main>

<Toast />

<style>
  .layout-main {
    flex: 1;
    min-width: 0;
    width: min(var(--col), 100%);
    margin: 0 auto;
    padding: 1.5rem max(1rem, env(safe-area-inset-right))
      calc(2.5rem + env(safe-area-inset-bottom, 0px)) max(1rem, env(safe-area-inset-left));
  }

  @media (min-width: 40rem) {
    .layout-main {
      padding: 2rem max(1.25rem, env(safe-area-inset-right))
        calc(3.5rem + env(safe-area-inset-bottom, 0px)) max(1.25rem, env(safe-area-inset-left));
    }
  }
</style>
