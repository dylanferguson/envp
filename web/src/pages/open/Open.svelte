<script lang="ts">
  import "../../app.css";
  import { onMount, tick } from "svelte";
  import { parseShareLink, type KeyFragment, type ShareId } from "../../lib/limits.js";
  import Layout from "../../components/Layout.svelte";
  import Hero from "../../components/Hero.svelte";
  import Tree from "../../components/Tree.svelte";
  import { dismissToast, showToast } from "../../lib/toast.svelte.js";
  import StatusLine from "../../ui/StatusLine.svelte";
  import SwapStage from "../../ui/SwapStage.svelte";
  import { runOpenFlow } from "./flow.js";
  import OpenForm from "./OpenForm.svelte";
  import OpenResult from "./OpenResult.svelte";
  import {
    OPEN_DIAGRAM_FOCUS,
    OPEN_STEPS,
    OPEN_TREE,
    deriveOpenReading,
    showOpenForm,
    type OpenState,
  } from "./state.js";

  const isManual =
    location.pathname === "/open" || location.pathname === "/open/";

  let state = $state<OpenState>(
    isManual ? { phase: "idle" } : { phase: "loading" },
  );
  let envOutput = $state("");
  let linkInput = $state("");
  let openLoadToken = 0;
  let openForm = $state<OpenForm | null>(null);
  let openResult = $state<OpenResult | null>(null);

  const reading = $derived(deriveOpenReading(state));
  const diagramFocus = $derived(OPEN_DIAGRAM_FOCUS[state.phase]);
  const revealed = $derived(state.phase === "revealed");
  const showForm = $derived(showOpenForm(state, isManual));

  $effect(() => {
    if (!revealed || envOutput.length === 0) {
      return;
    }
    let cancelled = false;
    // Let Svelte update the result value and visibility before CopyField retries selection.
    void tick().then(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          openResult?.selectOutput();
        }
      });
    });
    return () => {
      cancelled = true;
    };
  });

  async function loadShare(
    shareId?: ShareId,
    keyFragment?: KeyFragment,
  ): Promise<void> {
    const token = ++openLoadToken;
    const isStale = () => token !== openLoadToken;

    const outcome = await runOpenFlow(
      { shareId, keyFragment, pathname: location.pathname, hash: location.hash, isManual },
      isStale,
      (progress) => { state = progress; },
    );
    if (isStale() || outcome.phase === "stale") {
      return;
    }
    if (outcome.phase === "revealed") {
      envOutput = outcome.envOutput;
      state = { phase: "revealed" };
      return;
    }
    state = outcome;
  }

  function onCopy(): void {
    void navigator.clipboard.writeText(envOutput).then(() => {
      showToast("copied to clipboard");
    });
  }

  function onOpenLink(): void {
    const parsed = parseShareLink(linkInput);
    if (!parsed) {
      state = { phase: "invalid_link" };
      return;
    }
    void loadShare(parsed.shareId, parsed.keyFragment);
  }

  function onAgain(): void {
    dismissToast();
    openLoadToken++;
    linkInput = "";
    envOutput = "";
    if (!isManual) {
      location.assign("/open");
      return;
    }
    state = { phase: "idle" };
    void tick().then(() => {
      openForm?.focusInput();
    });
  }

  onMount(() => {
    if (!isManual) {
      void loadShare();
      return;
    }
    void tick().then(() => {
      openForm?.focusInput();
    });
  });
</script>

<Layout activeOp="open" word={reading.word} tone={reading.tone}>
  <Hero
    lead="Open a shared"
    deck="Decrypt the sender's env, without the server having seen the key."
    focus={diagramFocus}
  />

  <div class="console">
    <Tree
      steps={OPEN_STEPS}
      lines={OPEN_TREE}
      at={reading.step}
      kind={reading.kind}
    />

    <SwapStage showAlt={!showForm}>
      {#snippet primary()}
        <OpenForm bind:this={openForm} bind:linkInput onOpen={onOpenLink} />
      {/snippet}
      {#snippet alt()}
        {#if revealed}
          <OpenResult
            bind:this={openResult}
            {envOutput}
            onCopy={onCopy}
            onAgain={onAgain}
          />
        {/if}
      {/snippet}
    </SwapStage>

    <StatusLine text={reading.note} error={reading.tone === "error"} />
  </div>
</Layout>
