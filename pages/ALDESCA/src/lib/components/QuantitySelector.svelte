<script lang="ts">
  import Icon from './Icon.svelte';
  let { value = 1, onchange, label = 'Quantity' }: { value?: number; onchange: (value: number) => void; label?: string } = $props();
  function input(event: Event) {
    const field = event.target as HTMLInputElement;
    const amount = Number(field.value);
    if (Number.isSafeInteger(amount) && amount >= 1 && amount <= 999) onchange(amount);
    else field.value = String(value);
  }
</script>
<div class="quantity-control">
  <button aria-label={`Decrease ${label.toLowerCase()}`} disabled={value <= 1} onclick={() => onchange(value - 1)}><Icon name="minus" size={18} /></button>
  <input aria-label={label} type="number" min="1" max="999" step="1" {value} onchange={input} inputmode="numeric" />
  <button aria-label={`Increase ${label.toLowerCase()}`} disabled={value >= 999} onclick={() => onchange(value + 1)}><Icon name="plus" size={18} /></button>
</div>
<style>
  .quantity-control { display:grid; grid-template-columns:40px 51px 40px; width:max-content; border:1px solid var(--rule); height:39px; }
  button { display:grid; place-items:center; padding:0; }
  input { width:100%; min-width:0; background:transparent; border:0; text-align:center; appearance:textfield; padding:0; border-radius:0; }
  input::-webkit-inner-spin-button, input::-webkit-outer-spin-button { appearance:none; }
  @media(max-width:700px), (pointer:coarse) { .quantity-control { grid-template-columns:44px 46px 44px; height:46px; } input { font-size:1rem; } }
</style>
