<script lang="ts">
  import { resolve } from '$app/paths';
  import { products, categories } from '#lib/catalogue.ts';
  import Photo from '#lib/components/Photo.svelte';
  import ProductGrid from '#lib/components/ProductGrid.svelte';
  import EditorialSplit from '#lib/components/EditorialSplit.svelte';
</script>
<svelte:head><title>ALDESCA — A considered home.</title><meta name="description" content="Lighting, furniture and objects for beautiful everyday living. Explore ALDESCA’s considered collection of sculptural pieces and natural textures." /></svelte:head>
<div class="home-page">
  <section class="hero" aria-labelledby="hero-heading">
    <div class="hero-copy"><h1 id="hero-heading">A considered<br />home.</h1><p>Lighting, furniture and objects<br class="desktop-break" /> for beautiful everyday living.</p><a class="button" href={resolve('/shop')}>Shop the collection</a></div>
    <div class="hero-photo"><Photo name="home-hero" eager /></div>
  </section>
  <section class="selected container" aria-labelledby="selected-heading">
    <div class="section-heading"><h2 id="selected-heading">Selected pieces</h2><a href={resolve('/shop')}>View all</a></div>
    <ProductGrid {products} />
  </section>
  <section class="categories container" id="collections" aria-labelledby="categories-heading">
    <div class="section-heading"><h2 id="categories-heading">Find your finishing touches</h2></div>
    <div class="category-grid">{#each categories as category}
      <a class="category-tile" href={`${resolve('/shop')}?category=${category.toLowerCase()}`}><div class="category-photo"><Photo name={`category-${category.toLowerCase()}`} /></div><span>{category}</span></a>
    {/each}</div>
  </section>
  <EditorialSplit image="home-closing-editorial" title="Bring it all together." link="Explore the collection" href={resolve('/shop')} closing />
</div>
<style>
  .home-page { max-width:var(--page-width); margin:20px auto 0; }
  .hero { display:grid; grid-template-columns:38.77% 61.23%; min-height:clamp(22rem, 38.77vw, 35rem); background:var(--sage); }
  .hero-copy { min-width:0; padding:36px 20px 36px clamp(1.5rem, 5.078vw, 5rem); align-self:center; }
  h1 { font-size:clamp(2.5rem, 5.615vw, 5.125rem); line-height:1.01; letter-spacing:-1px; margin:-2px 0 16px -4px; }
  .hero-copy p { font-size:clamp(1.125rem, 2.051vw, 1.5rem); line-height:1.27; margin-bottom:27px; }
  .hero-copy .button { width:min(100%, 14.625rem); font-size:clamp(1rem, 1.855vw, 1.25rem); font-weight:500; }
  .hero-photo { min-width:0; min-height:0; }
  .selected { margin-top:20px; }
  .categories { margin-top:25px; margin-bottom:31px; scroll-margin-top:20px; }
  .categories .section-heading { margin-bottom:14px; }
  .categories h2 { padding-left:2px; letter-spacing:-.65px; }
  .category-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:var(--grid-gap); }
  .category-tile { display:block; text-decoration:none; background:var(--oatmeal); }
  .category-photo { aspect-ratio:232/188; }
  .category-tile span { display:flex; align-items:center; justify-content:center; text-align:center; font-size:1.125rem; font-weight:500; min-height:40px; padding:6px; }
  .category-tile:hover span { text-decoration:underline; text-underline-offset:4px; }
  @media(min-width:1200px) { .hero-copy p { max-width:370px; } .selected { margin-top:30px; } .categories { margin-top:34px; } }
  @media(max-width:1000px) { .desktop-break { display:none; } }
  @media(max-width:900px) { .hero { grid-template-columns:44% 56%; } .category-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media(max-width:700px) {
    .home-page { margin-top:12px; }
    .hero { display:flex; flex-direction:column; min-height:0; }
    .hero-copy { padding:clamp(1.75rem, 7vw, 2.5rem) var(--gutter); align-self:stretch; }
    h1 { font-size:clamp(2.25rem, 14vw, 4.25rem); max-width:30rem; margin-left:0; }
    .hero-copy p { font-size:1.125rem; max-width:22rem; margin-bottom:22px; }
    .hero-copy .button { width:auto; font-size:1.125rem; }
    .hero-photo { width:100%; aspect-ratio:1.45; }
    .selected { margin-top:26px; }
    .categories { margin-top:32px; margin-bottom:28px; }
    .category-tile span { font-size:1rem; min-height:44px; }
    .category-photo { aspect-ratio:1.12; }
  }
</style>
