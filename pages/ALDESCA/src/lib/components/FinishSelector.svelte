<script lang="ts">
  import type { Finish } from '../catalogue';
  let { finishes, value, onchange, compact = false, name = 'Finish' }: { finishes: Finish[]; value: string; onchange: (value: string) => void; compact?: boolean; name?: string } = $props();
  const uid = $props.id();
</script>
<fieldset class:compact>
  <legend class:sr-only={compact}>{name}: {finishes.find(f => f.id === value)?.name}</legend>
  <div class="swatches">{#each finishes as finish}
    <label class="swatch" style:--swatch={finish.color} title={finish.name}>
      <input type="radio" name={`${uid}-finish`} value={finish.id} checked={value === finish.id} onchange={() => onchange(finish.id)} aria-label={finish.name} />
      <span></span>
    </label>
  {/each}</div>
</fieldset>
<style>
  fieldset { border:0; padding:0; margin:0; min-width:0; }
  legend { padding:0; margin-bottom:5px; font-size:16px; }
  .swatches { display:flex; gap:9px; }
  .swatch { position:relative; display:grid; place-items:center; width:36px; height:36px; cursor:pointer; }
  input { position:absolute; inset:0; opacity:0; width:100%; height:100%; margin:0; cursor:pointer; }
  span { width:28px; height:28px; border-radius:50%; background:var(--swatch); border:1px solid rgb(0 0 0 / 3%); pointer-events:none; }
  input:checked + span { outline:1px solid var(--black); outline-offset:3px; }
  input:focus-visible + span { outline:2px solid var(--black); outline-offset:3px; }
  .compact .swatches { gap:2px; }
  .compact .swatch { width:23px; height:28px; }
  .compact span { width:17px; height:17px; }
  .compact input:checked + span { outline:none; }
  .compact input:focus-visible + span { outline:2px solid var(--black); }
  @media(max-width:700px), (pointer:coarse) { .swatch, .compact .swatch { min-height:44px; min-width:44px; } .compact .swatches { gap:0; } }
</style>
