<script lang="ts">
  import { onMount } from "svelte";

  type TreeKind = "now" | "hold" | "error";

  type TreeLine = {
    step: string;
    label: string;
    twig?: string;
  };

  type Props = {
    steps: readonly string[];
    lines: readonly TreeLine[];
    at: string;
    kind: TreeKind;
    root?: string | false;
  };

  let { steps, lines, at, kind, root = "." }: Props = $props();

  const atIdx = $derived(steps.indexOf(at));
  let lit = $state(false);

  function splitTwig(twig: string): { spine: string; connector: string } {
    const match = twig.match(/^(.*?)(├── |└── )$/);
    if (match) {
      return { spine: match[1], connector: match[2] };
    }
    return { spine: "", connector: twig };
  }

  onMount(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      lit = true;
      return;
    }
    requestAnimationFrame(() => {
      lit = true;
    });
  });
</script>

<div class="tree" aria-hidden="true">
  {#if root}
    <div class="tree-line">
      <span class="tree-node tree-root">{root}</span>
    </div>
  {/if}
  {#each lines as line (line.step)}
    {@const stepIdx = steps.indexOf(line.step)}
    {@const isCurrent = stepIdx === atIdx && lit}
    {@const spineLit = stepIdx === atIdx - 1 && stepIdx > 0 && lit}
    {@const twig = line.twig ? splitTwig(line.twig) : null}
    <div class="tree-line">
      {#if twig}
        {#if twig.spine}
          <span class="tree-spine" class:is-lit={spineLit}>{twig.spine}</span>
        {/if}
        <span class="tree-connector" class:is-lit={isCurrent}>{twig.connector}</span>
      {/if}
      <span
        class="tree-node"
        class:is-active={isCurrent && kind !== "error"}
        class:is-error={isCurrent && kind === "error"}
      >{line.label}</span>
    </div>
  {/each}
</div>

<style>
  .tree {
    margin: 0 0 2rem;
    overflow-x: auto;
    color: var(--muted);
    font: inherit;
    font-size: 0.8rem;
    line-height: 1.55;
    user-select: none;
    font-variant-ligatures: none;
    font-feature-settings: "liga" 0, "calt" 0;
    --tree-fade-in: 1.2s;
  }

  .tree-line {
    display: flex;
    align-items: baseline;
    white-space: pre;
  }

  .tree-spine,
  .tree-connector {
    flex: none;
    color: var(--hairline);
  }

  .tree-spine {
    width: 4ch;
  }

  .tree-connector {
    width: 4ch;
  }

  .tree-spine.is-lit,
  .tree-connector.is-lit {
    animation: tree-twig-in var(--tree-fade-in) cubic-bezier(0.22, 1, 0.36, 1)
      forwards;
  }

  .tree-node {
    color: var(--muted);
  }

  .tree-root {
    color: var(--muted);
  }

  .tree-node.is-active {
    animation: tree-node-in var(--tree-fade-in) cubic-bezier(0.22, 1, 0.36, 1)
      forwards;
  }

  .tree-node.is-error {
    animation: tree-node-error-in var(--tree-fade-in) cubic-bezier(0.22, 1, 0.36, 1)
      forwards;
  }

  @keyframes tree-node-in {
    from {
      color: #7c828b;
    }
    to {
      color: #48d597;
    }
  }

  @keyframes tree-twig-in {
    from {
      color: #23262b;
    }
    to {
      color: #48d597;
    }
  }

  @keyframes tree-node-error-in {
    from {
      color: #7c828b;
    }
    to {
      color: #ff6a80;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tree-node.is-active {
      animation: none;
      color: var(--phosphor);
    }

    .tree-spine.is-lit,
    .tree-connector.is-lit {
      animation: none;
      color: var(--phosphor);
    }

    .tree-node.is-error {
      animation: none;
      color: var(--coral);
    }
  }
</style>
