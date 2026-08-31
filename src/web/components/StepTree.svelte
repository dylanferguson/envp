<script lang="ts">
  import { onMount } from "svelte";

  import type { TreeKind } from "../lib/signal.js";

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
  const isFirstStep = $derived(atIdx === 0);
  let lit = $state(false);

  function splitTwig(twig: string): { spine: string; connector: string } {
    const match = twig.match(/^([│ ]*)(├── |└── )$/);
    if (match) return { spine: match[1], connector: match[2] };
    return { spine: twig, connector: "" };
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
      <span
        class="tree-node tree-root"
        class:is-lit={isFirstStep && lit && kind !== "error"}
        class:is-error={isFirstStep && lit && kind === "error"}
      >{root}</span>
    </div>
  {/if}
  {#each lines as line (line.step)}
    {@const stepIdx = steps.indexOf(line.step)}
    {@const isActive = stepIdx === atIdx && lit}
    {@const twigParts = line.twig ? splitTwig(line.twig) : null}
    <div class="tree-line">
      {#if twigParts}
        <span class="tree-twig-wrap"><span class="tree-twig-spine">{twigParts.spine}</span><span
            class="tree-twig"
            class:is-lit={isActive && !isFirstStep && kind !== "error"}
            class:is-error={isActive && !isFirstStep && kind === "error"}
          >{twigParts.connector}</span></span>
      {/if}
      <span
        class="tree-node"
        class:is-active={isActive && kind !== "error"}
        class:is-error={isActive && kind === "error"}
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
    font-feature-settings: "liga" 0, "calt" 0;
    --tree-fade-in: 1.2s;
  }

  .tree-line {
    white-space: pre;
  }

  .tree-twig-wrap {
    white-space: pre;
  }

  .tree-twig,
  .tree-twig-spine {
    color: var(--hairline);
  }

  .tree-twig.is-lit {
    color: var(--phosphor);
    animation: tree-twig-in var(--tree-fade-in) cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tree-twig.is-error {
    color: var(--coral);
    animation: tree-twig-error-in var(--tree-fade-in) cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tree-node {
    color: var(--muted);
  }

  .tree-root {
    color: var(--muted);
  }

  .tree-root.is-lit {
    color: var(--phosphor);
    animation: tree-node-in var(--tree-fade-in) cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tree-root.is-error {
    color: var(--coral);
    animation: tree-node-error-in var(--tree-fade-in) cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tree-node.is-active {
    color: var(--phosphor);
    animation: tree-node-in var(--tree-fade-in) cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tree-node.is-error {
    color: var(--coral);
    animation: tree-node-error-in var(--tree-fade-in) cubic-bezier(0.22, 1, 0.36, 1);
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

  @keyframes tree-twig-error-in {
    from {
      color: #23262b;
    }
    to {
      color: #ff6a80;
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

    .tree-twig.is-lit {
      animation: none;
      color: var(--phosphor);
    }

    .tree-twig.is-error {
      animation: none;
      color: var(--coral);
    }

    .tree-root.is-lit {
      animation: none;
      color: var(--phosphor);
    }

    .tree-node.is-error {
      animation: none;
      color: var(--coral);
    }
  }
</style>
