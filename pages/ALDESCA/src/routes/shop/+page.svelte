<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { categories, filterProducts } from '#lib/catalogue.ts';
  import ProductGrid from '#lib/components/ProductGrid.svelte';
  import { useShop } from '#lib/store.svelte.ts';
  const shop = useShop();
  let category = $derived(shop.restored ? page.url.searchParams.get('category') || '' : '');
  let title = $derived(category === 'new-in' ? 'New In' : categories.find(c => c.toLowerCase() === category) || 'The collection');
  let products = $derived(filterProducts(category, '', 'home'));
</script>
<svelte:head><title>{title} | ALDESCA</title><meta name="description" content="Explore ALDESCA’s considered collection of lighting, furniture and homeware." /></svelte:head>
<div class="catalogue container">
  <p class="eyebrow">A CONSIDERED COLLECTION</p><h1>{title}</h1><p class="intro">Sculptural shapes. Natural textures. Pieces to feel at home with.</p>
  <nav class="filters" aria-label="Filter the collection"><a class:active={!category} href={resolve('/shop')}>All pieces</a><a class:active={category === 'new-in'} href={`${resolve('/shop')}?category=new-in`}>New In</a>{#each categories as label}<a class:active={category === label.toLowerCase()} href={`${resolve('/shop')}?category=${label.toLowerCase()}`}>{label}</a>{/each}</nav>
  <p class="result-count">{products.length} {products.length === 1 ? 'piece' : 'pieces'}</p>
  {#if products.length}<ProductGrid {products} />{:else}<div class="empty"><h2>No pieces in this collection yet.</h2><a class="text-link" href={resolve('/shop')}>Explore all pieces</a></div>{/if}
</div>
<style>
  .catalogue { padding-top:clamp(2rem, 4.688vw, 4rem); padding-bottom:clamp(2.5rem, 5.86vw, 5rem); min-height:75dvh; }
  h1 { font-size:clamp(2.5rem, 6.055vw, 4.5rem); margin-bottom:16px; }
  .eyebrow { margin-bottom:16px; }
  .intro { margin-bottom:30px; }
  .filters { display:flex; flex-wrap:wrap; gap:10px 24px; border-block:1px solid var(--rule); padding-block:14px; }
  .filters a { text-decoration:none; padding-block:5px; border-bottom:1px solid transparent; }
  .filters a.active { border-color:var(--black); }
  .result-count { margin:20px 0; font-size:14px; }
  .empty { padding-block:40px; }
  .empty h2 { font-size:36px; margin-bottom:20px; }
  @media(max-width:700px) { h1 { font-size:clamp(2rem, 1rem + 6vw, 3.25rem); } .filters { gap:4px 18px; font-size:1rem; padding-block:8px; } .filters a { display:inline-flex; align-items:center; min-height:44px; } .empty h2 { font-size:clamp(1.75rem, 6vw, 2.25rem); } }
</style>
