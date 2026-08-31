<script lang="ts">
  import "../../app.css";
  import { onMount } from "svelte";
  import { parseShareLink } from "../../../shared/limits.js";
  import Chrome from "../../components/Chrome.svelte";
  import StepTree from "../../components/StepTree.svelte";
  import Toast from "../../components/Toast.svelte";
  import StatusLine from "../../ui/StatusLine.svelte";
  import {
    decryptShareEnvelope,
    fetchShareEnvelope,
    resolveShareTarget,
  } from "./flow.js";
  import OpenForm from "./OpenForm.svelte";
  import OpenResult from "./OpenResult.svelte";
  import {
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

  const reading = $derived(deriveOpenReading(state));
  const revealed = $derived(state.phase === "revealed");
  const showForm = $derived(showOpenForm(state, isManual));
  const statusText = $derived(statusNote || reading.note);

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
    const envelope = await fetchShareEnvelope(resolved.shareId, isStale);
    if (isStale()) {
      return;
    }
    if (envelope === "stale") {
      return;
    }
    if (!envelope) {
      state = { phase: "gone" };
      return;
    }

    state = { phase: "unlocking" };
    const outcome = await decryptShareEnvelope(
      envelope,
      resolved.fragment,
      isStale,
    );
    if (isStale() || outcome.kind === "stale") {
      return;
    }
    if (outcome.kind === "revealed") {
      envOutput = outcome.envOutput;
      state = { phase: "revealed" };
      return;
    }
    state = { phase: outcome.kind };
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

  onMount(() => {
    if (!isManual) {
      void loadShare();
    }
  });
</script>

<Chrome activeOp="open" word={reading.word} tone={reading.tone}>
  <StepTree
    steps={OPEN_STEPS}
    lines={OPEN_TREE}
    at={reading.step}
    kind={reading.kind}
  />

  {#if showForm}
    <OpenForm bind:linkInput onOpen={onOpenLink} />
  {:else}
    <OpenResult {envOutput} {revealed} onCopy={onCopy} />
  {/if}

  <StatusLine text={statusText} error={reading.tone === "error"} />
</Chrome>

<Toast bind:this={copyToast} message="copied to clipboard" />
