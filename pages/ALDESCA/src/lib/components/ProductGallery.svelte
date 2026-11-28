<script lang="ts">
  import type { Product } from '../catalogue';
  import Photo from './Photo.svelte';
  import Icon from './Icon.svelte';
  import Dialog from './Dialog.svelte';
  let { product }: { product: Product } = $props();
  let selected = $state(0);
  let zoom = $state(false);
  let current = $derived(product.gallery[selected] ?? product.gallery[0]);
</script>
<div class="gallery" class:clothing={product.department === 'clothing'}>
  <div class="main-photo"><Photo name={current.image} eager /><button class="icon-button zoom" aria-label={`Zoom ${product.name} image`} onclick={() => zoom = true}><Icon name="search" size={21} /></button></div>
  {#if product.gallery.length > 1}<div class="thumbnails" aria-label="Product photographs">{#each product.gallery as photo, index}
    <button class:active={selected === index} aria-label={photo.label} aria-pressed={selected === index} onclick={() => selected = index}><Photo name={product.id === 'halo' && index === 0 ? 'halo-front-thumbnail' : product.id === 'halo' && index === 1 ? 'halo-interior-thumbnail' : photo.image} eager /></button>
  {/each}</div>{/if}
</div>
<Dialog bind:open={zoom} title={`${product.name} — ${current.label}`} wide>
  <div class="zoom-photo"><Photo name={current.image} fit="contain" eager /></div>
  <p class="resolution-note">{product.department === 'clothing' ? 'Illustrative collection photograph.' : 'Reference photograph shown at its available resolution.'}</p>
</Dialog>
<style>
  .main-photo { position:relative; aspect-ratio:556/533; background:var(--oatmeal); }
  .clothing .main-photo { aspect-ratio:2/3; }
  .zoom { position:absolute; bottom:16px; right:13px; width:32px; height:32px; border-radius:50%; background:var(--ivory); }
  .gallery { min-width:0; }
  .thumbnails { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:var(--grid-gap); margin-top:var(--grid-gap); }
  .thumbnails button { aspect-ratio:129/133; padding:0; border:2px solid transparent; }
  .thumbnails button.active { border-color:var(--black); }
  .zoom-photo { height:min(72dvh,760px); }
  .zoom-photo :global(img) { object-fit:contain; }
  .resolution-note { font-size:13px; margin:12px 0 0; text-align:center; }
  @media(max-width:850px) { .gallery { width:100%; max-width:620px; margin-inline:auto; } }
  @media(max-width:700px) { .zoom { width:44px; height:44px; right:10px; bottom:10px; } .thumbnails { gap:clamp(6px, 2vw, 10px); margin-top:10px; } .thumbnails button { min-height:44px; } .zoom-photo { height:55dvh; } }
</style>
