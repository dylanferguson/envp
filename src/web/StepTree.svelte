<script lang="ts">
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
  };

  let { steps, lines, at, kind }: Props = $props();

  const atIdx = $derived(steps.indexOf(at));
</script>

<div class="tree" aria-hidden="true">
  {#each lines as line (line.step)}
    {@const stepIdx = steps.indexOf(line.step)}
    <div class="tree-line">
      {#if line.twig}
        <span
          class="tree-twig"
          class:is-lit={atIdx >= 0 && stepIdx >= 0 && stepIdx <= atIdx}
        >{line.twig}</span>
      {/if}
      <span
        class="tree-node"
        class:is-now={stepIdx === atIdx && kind === "now"}
        class:is-hold={stepIdx === atIdx && kind === "hold"}
        class:is-error={stepIdx === atIdx && kind === "error"}
        class:is-done={stepIdx < atIdx}
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
  }

  .tree-line {
    white-space: pre;
  }

  .tree-node,
  .tree-twig {
    color: var(--muted);
    transition:
      color 0.5s ease,
      opacity 0.5s ease;
  }

  .tree-twig {
    color: var(--hairline);
  }

  .tree-twig.is-lit {
    color: var(--hairline-lit);
  }

  .tree-node.is-done {
    color: var(--phosphor);
    opacity: 0.4;
  }

  .tree-node.is-hold,
  .tree-node.is-now {
    color: var(--phosphor);
  }

  .tree-node.is-now {
    animation: step-live 1.3s ease-in-out infinite;
  }

  .tree-node.is-error {
    color: var(--coral);
  }

  @keyframes step-live {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tree-node,
    .tree-twig {
      transition: none;
    }

    .tree-node.is-now {
      animation: none;
    }
  }
</style>
