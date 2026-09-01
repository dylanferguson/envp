<script lang="ts">
  type Props = {
    id: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
  };

  let {
    id,
    value = $bindable(),
    min,
    max,
    step = 1,
    disabled = false,
  }: Props = $props();

  const fillPct = $derived(((value - min) / (max - min)) * 100);
</script>

<div class="slider">
  <span class="bracket" aria-hidden="true">[</span>
  <input
    {id}
    type="range"
    {min}
    {max}
    {step}
    bind:value
    {disabled}
    style="--fill: {fillPct}%"
  />
  <span class="bracket" aria-hidden="true">]</span>
</div>

<style>
  .slider {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    column-gap: 0.35rem;
    width: 100%;
    min-width: 0;
    height: 0.85rem;
    color: var(--hairline-lit);
    transition: color 0.2s ease;
  }

  .slider:focus-within {
    color: var(--phosphor);
  }

  .bracket {
    font-size: 0.8rem;
    line-height: 1;
    user-select: none;
  }

  input[type="range"] {
    width: 100%;
    height: 0.85rem;
    margin: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    align-self: center;
  }

  input[type="range"]:disabled {
    opacity: 0.45;
    cursor: default;
  }

  input[type="range"]::-webkit-slider-runnable-track {
    height: 0.55rem;
    border: 1px solid var(--hairline);
    border-radius: 0;
    background: linear-gradient(
      to right,
      var(--phosphor) 0%,
      var(--phosphor) var(--fill),
      var(--surface) var(--fill),
      var(--surface) 100%
    );
    transition: border-color 0.2s ease;
  }

  input[type="range"]::-moz-range-track {
    height: 0.55rem;
    border: 1px solid var(--hairline);
    border-radius: 0;
    background: var(--surface);
    transition: border-color 0.2s ease;
  }

  input[type="range"]::-moz-range-progress {
    height: 0.55rem;
    border-radius: 0;
    background: var(--phosphor);
  }

  input[type="range"]::-webkit-slider-thumb {
    width: 0.45rem;
    height: 0.85rem;
    margin-top: calc((0.55rem - 0.85rem) / 2);
    border: 1px solid var(--phosphor);
    border-radius: 0;
    background: var(--phosphor);
    box-shadow: none;
    -webkit-appearance: none;
    appearance: none;
  }

  input[type="range"]::-moz-range-thumb {
    width: 0.45rem;
    height: 0.85rem;
    border: 1px solid var(--phosphor);
    border-radius: 0;
    background: var(--phosphor);
    box-shadow: none;
  }

  input[type="range"]:focus {
    outline: none;
  }

  input[type="range"]:focus-visible::-webkit-slider-thumb,
  input[type="range"]:focus-visible::-moz-range-thumb {
    outline: 1px solid var(--fg);
    outline-offset: 2px;
  }

  .slider:focus-within input[type="range"]::-webkit-slider-runnable-track,
  .slider:focus-within input[type="range"]::-moz-range-track {
    border-color: var(--phosphor);
  }

  @media (prefers-reduced-motion: reduce) {
    .slider,
    input[type="range"]::-webkit-slider-runnable-track,
    input[type="range"]::-moz-range-track {
      transition: none;
    }
  }
</style>
