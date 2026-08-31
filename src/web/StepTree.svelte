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
      <span class="tree-node tree-root" class:is-lit={lit}>{root}</span>
    </div>
  {/if}
  {#each lines as line (line.step)}
    {@const stepIdx = steps.indexOf(line.step)}
    {@const isActive = stepIdx === atIdx && lit}
    <div class="tree-line">
      {#if line.twig}
        <span class="tree-twig" class:is-lit={isActive}>{line.twig}</span>
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
    --tree-fade-in: 1.2s;
  }

  .tree-line {
    white-space: pre;
  }

  .tree-twig {
    color: var(--hairline);
  }

  .tree-twig.is-lit {
    animation: tree-twig-in var(--tree-fade-in) cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  .tree-node {
    color: var(--muted);
  }

  .tree-root {
    color: var(--muted);
  }

  .tree-root.is-lit {
    animation: tree-node-in var(--tree-fade-in) cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  .tree-node.is-active {
    animation: tree-node-in var(--tree-fade-in) cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  .tree-node.is-error {
    animation: tree-node-error-in var(--tree-fade-in) cubic-bezier(0.22, 1, 0.36, 1) forwards;
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

    .tree-twig.is-lit {
      animation: none;
      color: var(--phosphor);
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
