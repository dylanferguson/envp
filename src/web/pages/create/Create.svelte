<script lang="ts">
  import "../../app.css";
  import { onMount, tick } from "svelte";
  import { DEFAULT_TTL_SECONDS, MAX_PLAINTEXT_BYTES } from "../../../shared/limits.js";
  import Layout from "../../components/Layout.svelte";
  import Hero from "../../components/Hero.svelte";
  import Tree from "../../components/Tree.svelte";
  import Toast from "../../ui/Toast.svelte";
  import SwapStage from "../../ui/SwapStage.svelte";
  import CreateDone from "./CreateDone.svelte";
  import CreateForm from "./CreateForm.svelte";
  import {
    applyShareOutcome,
    applyShareProgress,
    runShareFlow,
  } from "./flow.js";
  import {
    CREATE_STEPS,
    CREATE_TREE,
    deriveCreateReading,
    isCreateBusy,
    isCreateDone,
    type CreateState,
  } from "./state.js";

  let state = $state<CreateState>({ phase: "idle" });
  let envInput = $state("");
  let ttlSeconds = $state(DEFAULT_TTL_SECONDS);
  let copyToast = $state<Toast | null>(null);
  let createForm = $state<CreateForm | null>(null);
  let createDone = $state<CreateDone | null>(null);

  const reading = $derived(deriveCreateReading(state));
  const inputBytes = $derived(new TextEncoder().encode(envInput).length);
  const isOverLimit = $derived(inputBytes > MAX_PLAINTEXT_BYTES);
  const isDone = $derived(isCreateDone(state));
  const isBusy = $derived(isCreateBusy(state));
  const shareDisabled = $derived(
    isBusy || isOverLimit || envInput.length === 0,
  );

  async function onShare(): Promise<void> {
    const outcome = await runShareFlow(
      envInput,
      ttlSeconds,
      location.origin,
      (progress) => {
        state = applyShareProgress(progress);
      },
    );
    if (outcome.kind === "over_limit") {
      return;
    }
    state = applyShareOutcome(outcome);
    if (outcome.kind === "done" && outcome.copied) {
      copyToast?.show();
    }
  }

  function copyShareLink(): void {
    if (!isCreateDone(state)) {
      return;
    }
    void navigator.clipboard.writeText(state.url).then(
      () => {
        state = { ...state, copied: true };
        copyToast?.show();
        createDone?.selectLink();
      },
      () => {
        if (isCreateDone(state)) {
          state = { ...state, copied: false };
        }
      },
    );
  }

  function onAgain(): void {
    copyToast?.dismiss();
    envInput = "";
    state = { phase: "idle" };
    createForm?.focusInput();
  }

  onMount(() => {
    void tick().then(() => {
      createForm?.focusInput();
    });
  });
</script>

<Layout activeOp="share" word={reading.word} tone={reading.tone}>
  <Hero
    lead="Securely share your"
    deck="Encrypt with the browser, and share a link with a key the server never sees."
  />

  <div class="console">
    <Tree
      steps={CREATE_STEPS}
      lines={CREATE_TREE}
      at={reading.step}
      kind={reading.kind}
    />

    <SwapStage showAlt={isDone}>
      {#snippet primary()}
        <CreateForm
          bind:this={createForm}
          bind:envInput
          bind:ttlSeconds
          busy={isBusy}
          shareDisabled={shareDisabled}
          statusText={reading.note}
          statusError={reading.tone === "error"}
          onShare={onShare}
        />
      {/snippet}
      {#snippet alt()}
        {#if isDone}
          <CreateDone
            bind:this={createDone}
            url={state.url}
            expiresAt={state.expiresAt}
            copied={state.copied}
            onCopy={copyShareLink}
            onAgain={onAgain}
          />
        {/if}
      {/snippet}
    </SwapStage>
  </div>
</Layout>

<Toast bind:this={copyToast} message="link copied to clipboard" />
