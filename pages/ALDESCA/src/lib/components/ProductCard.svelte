<script lang="ts">
  import { resolve } from '$app/paths';
  import { money, type Product } from '../catalogue';
  import { useShop } from '../store.svelte';
  import Icon from './Icon.svelte';
  import Photo from './Photo.svelte';
  import FinishSelector from './FinishSelector.svelte';
  let { product, wide = false }: { product: Product; wide?: boolean } = $props();
  const shop = useShop();
  let chosenFinish = $state('');
  let finish = $derived(chosenFinish || product.finishes[0].id);
  let saved = $derived(shop.wishlist.includes(product.id));
  let url = $derived(`${resolve('/products/[slug]', { slug: product.slug })}${chosenFinish ? `?finish=${finish}` : ''}`);
</script>
<article class="product-card" class:wide>
  <div class="card-image">
    <a href={url} aria-label={`View ${product.name}`}><Photo name={wide ? product.relatedImage : product.image} mobileName={wide ? product.image : undefined} /></a>
    <button class="icon-button heart" aria-label={`${saved ? 'Remove' : 'Save'} ${product.name} ${saved ? 'from' : 'to'} wishlist`} aria-pressed={saved} onclick={() => shop.toggleWishlist(product.id)}><Icon name="heart" size={22} filled={saved} /></button>
  </div>
  {#if !wide}<FinishSelector finishes={product.finishes} value={finish} onchange={(id) => chosenFinish = id} compact name={`${product.name} finish`} />{/if}
  <a class="product-name" href={url}>{product.name}</a>
  <p class="price">{money(product.price)}</p>
</article>
<style>
  .product-card { min-width:0; }
  .card-image { position:relative; aspect-ratio:232/220; background:var(--oatmeal); }
  .card-image a { display:block; width:100%; height:100%; }
  .heart { position:absolute; top:1px; right:3px; width:42px; height:38px; }
  .product-name { display:block; text-decoration:none; font-size:17.25px; line-height:24px; padding-left:2px; }
  .product-name:hover { text-decoration:underline; text-underline-offset:3px; }
  .price { margin:0; font-size:17.25px; line-height:24px; padding-left:2px; }
  .wide .card-image { aspect-ratio:312/188; margin-bottom:3px; }
  .wide .product-name, .wide .price { font-size:15px; line-height:23px; padding-left:0; }
  @media(max-width:700px) {
    .product-name, .price, .wide .product-name, .wide .price { font-size:1rem; line-height:1.4; padding-left:0; }
    .product-name { margin-bottom:4px; overflow-wrap:anywhere; }
    .wide .card-image { aspect-ratio:232/220; margin-bottom:10px; }
    .heart { background:rgb(239 230 216 / 75%); top:4px; right:4px; width:44px; height:44px; }
  }
</style>
