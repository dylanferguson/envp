<script lang="ts">
  import "../../app.css";
  import { onMount, tick } from "svelte";
  import { parseShareLink } from "../../../shared/limits.js";
  import Chrome from "../../components/Chrome.svelte";
  import OpenIntro from "../../components/OpenIntro.svelte";
  import StepTree from "../../components/StepTree.svelte";
  import Toast from "../../components/Toast.svelte";
  import StatusLine from "../../ui/StatusLine.svelte";
  import SwapStage from "../../ui/SwapStage.svelte";
  import {
    decryptShareEnvelope,
    fetchShareEnvelope,
    resolveShareTarget,
  } from "./flow.js";
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
  let statusNote = $state("");
  let linkInput = $state("");
  let openLoadToken = 0;
  let copyToast = $state<Toast | null>(null);
  let openForm = $state<OpenForm | null>(null);
  let openResult = $state<OpenResult | null>(null);

  const reading = $derived(deriveOpenReading(state));
  const diagramFocus = $derived(OPEN_DIAGRAM_FOCUS[state.phase]);
  const revealed = $derived(state.phase === "revealed");
  const showForm = $derived(showOpenForm(state, isManual));
  const statusText = $derived(statusNote || reading.note);

  $effect(() => {
    if (!revealed || envOutput.length === 0) {
      return;
    }
    let cancelled = false;
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
    shareId?: string,
    keyFragment?: string,
  ): Promise<void> {
    const token = ++openLoadToken;
    statusNote = "";
    const isStale = () => token !== openLoadToken;

    const resolved = resolveShareTarget(
      shareId,
      keyFragment,
      location.pathname,
      location.hash,
      isManual,
    );
    if (!("kind" in resolved)) {
      state = resolved;
      return;
    }

    state = { phase: "loading" };
    const outcome = await fetchShareEnvelope(resolved.shareId, isStale);
    if (isStale() || outcome.kind === "stale") {
      return;
    }
    if (outcome.kind === "missing") {
      state = { phase: "gone" };
      return;
    }
    if (outcome.kind === "http_error") {
      state = { phase: "fetch_error", message: outcome.message };
      return;
    }

    state = { phase: "unlocking" };
    const decryptOutcome = await decryptShareEnvelope(
      outcome.envelope,
      resolved.fragment,
      isStale,
    );
    if (isStale() || decryptOutcome.kind === "stale") {
      return;
    }
    if (decryptOutcome.kind === "revealed") {
      envOutput = decryptOutcome.envOutput;
      state = { phase: "revealed" };
      return;
    }
    state = { phase: decryptOutcome.kind };
  }

  function onCopy(): void {
    void navigator.clipboard.writeText(envOutput).then(() => {
      copyToast?.show();
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
    copyToast?.dismiss();
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

<Chrome activeOp="open" word={reading.word} tone={reading.tone}>
  <OpenIntro focus={diagramFocus} />

  <div class="console">
    <StepTree
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
        {#if !showForm}
          <OpenResult
            bind:this={openResult}
            {envOutput}
            {revealed}
            onCopy={onCopy}
            onAgain={onAgain}
          />
        {/if}
      {/snippet}
    </SwapStage>
  </div>

  <StatusLine text={statusText} error={reading.tone === "error"} animated />
</Chrome>

<Toast bind:this={copyToast} message="copied to clipboard" />
