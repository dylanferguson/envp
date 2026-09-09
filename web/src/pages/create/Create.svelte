<script lang="ts">
  import "../../app.css";
  import { onMount, tick } from "svelte";
  import { parseRevokeLink, type MaxReads, type TtlSeconds } from "../../lib/limits.js";
  import Layout from "../../components/Layout.svelte";
  import Hero from "../../components/Hero.svelte";
  import Tree from "../../components/Tree.svelte";
  import { once } from "../../lib/once.js";
  import { dismissToast, showToast } from "../../lib/toast.svelte.js";
  import SwapStage from "../../ui/SwapStage.svelte";
  import CreateDone from "./CreateDone.svelte";
  import CreateForm from "./CreateForm.svelte";
  import { runShareFlow } from "./flow.js";
  import {
    CREATE_STEPS,
    CREATE_TREE,
    deriveCreateDiagramFocus,
    deriveCreateReading,
    type CreateState,
  } from "./state.js";

  let state = $state<CreateState>({ phase: "idle" });
  let createForm = $state<CreateForm | null>(null);
  let createDone = $state<CreateDone | null>(null);
  let intro = $state(once("envp:diagram-seen"));

  const reading = $derived(deriveCreateReading(state));
  const diagramFocus = $derived(
    intro && state.phase === "idle" ? undefined : deriveCreateDiagramFocus(state),
  );
  const showDone = $derived(
    state.phase === "done" || state.phase === "confirm" || state.phase === "gone",
  );
  const isBusy = $derived(state.phase === "encrypting" || state.phase === "uploading");

  async function onShare(envInput: string, ttlSeconds: TtlSeconds, maxReads: MaxReads): Promise<void> {
    const outcome = await runShareFlow(
      envInput,
      ttlSeconds,
      maxReads,
      location.origin,
      (progress) => {
        state = progress;
      },
    );
    if (outcome.phase === "over_limit") {
      return;
    }
    state = outcome;
    if (outcome.phase === "done") {
      if (outcome.copied) {
        showToast("link copied to clipboard");
      }
      // Wait for CreateDone's component binding; CopyField handles the visual swap timing.
      await tick();
      createDone?.selectLink();
    }
  }

  function onAgain(): void {
    dismissToast();
    if (state.phase === "confirm" || state.phase === "gone") {
      location.assign("/");
      return;
    }
    createForm?.clearInput();
    state = { phase: "idle" };
    createForm?.focusInput();
  }

  $effect(() => {
    if (state.phase !== "idle") {
      intro = false;
    }
  });

  onMount(() => {
    if (/^\/revoke(\/|$)/.test(location.pathname)) {
      const parsed = parseRevokeLink(location.pathname, location.hash);
      state = parsed
        ? { phase: "confirm", shareId: parsed.shareId, deleteToken: parsed.deleteToken }
        : { phase: "gone" };
      return;
    }
    void tick().then(() => {
      createForm?.focusInput();
    });
  });
</script>

<Layout activeOp="share" word={reading.word} tone={reading.tone}>
  <Hero
    lead="Securely share your"
    deck="Encrypt with the browser, and share a link with a key the server never sees."
    focus={diagramFocus}
  />

  <div class="console">
    <Tree
      steps={CREATE_STEPS}
      lines={CREATE_TREE}
      at={reading.step}
      kind={reading.kind}
    />

    <SwapStage showAlt={showDone}>
      {#snippet primary()}
        <CreateForm
          bind:this={createForm}
          busy={isBusy}
          statusText={reading.note}
          statusError={reading.tone === "error"}
          onShare={onShare}
        />
      {/snippet}
      {#snippet alt()}
        {#if state.phase === "done"}
          <CreateDone
            bind:this={createDone}
            kind="created"
            shareId={state.shareId}
            deleteToken={state.deleteToken}
            url={state.url}
            revokeUrl={state.revokeUrl}
            expiresAt={state.expiresAt}
            maxReads={state.maxReads}
            copied={state.copied}
            {onAgain}
          />
        {:else if state.phase === "confirm"}
          <CreateDone
            kind="confirm"
            shareId={state.shareId}
            deleteToken={state.deleteToken}
            {onAgain}
          />
        {:else if state.phase === "gone"}
          <CreateDone kind="gone" {onAgain} />
        {/if}
      {/snippet}
    </SwapStage>
  </div>
</Layout>
