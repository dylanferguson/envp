<script lang="ts">
  import type { Snippet } from "svelte";
  import type { SignalTone } from "../lib/signal.js";
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

<style>
  .layout-main {
    flex: 1;
    width: min(var(--col), 100%);
    margin: 0 auto;
    padding: 2rem 1.25rem 3.5rem;
  }
</style>
