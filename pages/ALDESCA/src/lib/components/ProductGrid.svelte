<script lang="ts">
  import type { Product } from '../catalogue';
  import ProductCard from './ProductCard.svelte';
  let { products, wide = false }: { products: Product[]; wide?: boolean } = $props();
</script>
<div class="product-grid" class:wide>{#each products as product (product.id)}<ProductCard {product} {wide} />{/each}</div>
<style>
  .product-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:var(--grid-gap); }
  .wide { grid-template-columns:repeat(3,minmax(0,1fr)); gap:clamp(.75rem, 1.465vw, 1.5rem); }
  @media(max-width:900px) { .product-grid:not(.wide) { grid-template-columns:repeat(2,minmax(0,1fr)); row-gap:24px; } }
  @media(max-width:700px) { .product-grid.wide { grid-template-columns:repeat(2,minmax(0,1fr)); row-gap:24px; } }
  @media(max-width:359px) { .product-grid, .product-grid:not(.wide), .product-grid.wide { grid-template-columns:minmax(0,1fr); row-gap:28px; } }
</style>
