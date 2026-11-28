<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { clothingCategories, filterProducts } from '#lib/catalogue.ts';
  import { useShop } from '#lib/store.svelte.ts';
  import Photo from '#lib/components/Photo.svelte';
  import ProductGrid from '#lib/components/ProductGrid.svelte';
  const shop = useShop();
  let category = $derived(shop.restored ? page.url.searchParams.get('category') || '' : '');
  let title = $derived(category === 'new-in' ? 'New in clothing' : clothingCategories.find(c => c.toLowerCase() === category) || 'The wardrobe edit');
  let pieces = $derived(filterProducts(category, '', 'clothing'));
  const collectionHref = (category = '') => `${resolve('/clothing')}${category ? `?category=${category}` : ''}#collection`;
  const edits = [
    { name: 'Womenswear', image: 'fashion-coat', copy: 'Soft layers. Strong silhouettes.' },
    { name: 'Menswear', image: 'fashion-overshirt', copy: 'Everyday pieces, quietly refined.' },
    { name: 'Accessories', image: 'fashion-bag', copy: 'The detail that makes it yours.' }
  ];
</script>
<svelte:head><title>{category ? title : 'A considered wardrobe.'} | ALDESCA Clothing</title><meta name="description" content="Discover ALDESCA Clothing. Considered womenswear, menswear and accessories in a quiet palette of ivory, camel, black and sage." /></svelte:head>
<div class="clothing-page">
  {#if !category}
    <section class="fashion-hero" aria-labelledby="fashion-heading">
      <div class="hero-copy"><p class="eyebrow">INTRODUCING ALDESCA CLOTHING</p><h1 id="fashion-heading">A considered<br />wardrobe.</h1><p>Beautifully simple pieces.<br />For the way you live.</p><a class="button" href="#collection">Explore clothing</a></div>
      <div class="hero-photo"><Photo name="fashion-hero" eager /></div>
    </section>
    <section class="edits container" aria-labelledby="edits-heading">
      <div class="edit-intro"><h2 id="edits-heading">A quieter kind of luxury.</h2><p>From the spaces you live in to the pieces you wear. Discover a new expression of ALDESCA.</p></div>
      <div class="edit-grid">{#each edits as edit}<a class="edit" href={collectionHref(edit.name.toLowerCase())}><div class="edit-photo"><Photo name={edit.image} /></div><div class="edit-caption"><h3>{edit.name}</h3><p>{edit.copy}</p><span class="text-link">Explore {edit.name.toLowerCase()}</span></div></a>{/each}</div>
    </section>
  {/if}
  <section class="collection container" id="collection" aria-labelledby="collection-heading">
    <p class="eyebrow">CLOTHING &amp; ACCESSORIES</p>
    <div class="section-heading"><svelte:element this={category ? 'h1' : 'h2'} id="collection-heading">{title}</svelte:element>{#if category}<a href={resolve('/clothing')}>Clothing home</a>{/if}</div>
    <nav class="filters" aria-label="Filter clothing"><a href={collectionHref()} class:active={!category} aria-current={!category ? 'page' : undefined}>All clothing</a><a href={collectionHref('new-in')} class:active={category === 'new-in'}>New In</a>{#each clothingCategories as label}<a href={collectionHref(label.toLowerCase())} class:active={category === label.toLowerCase()} aria-current={category === label.toLowerCase() ? 'page' : undefined}>{label}</a>{/each}</nav>
    <p class="result-count">{pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'}</p>
    {#if pieces.length}<ProductGrid products={pieces} />{:else}<div class="empty"><p>This edit is still taking shape.</p><a class="text-link" href={collectionHref()}>Explore all clothing</a></div>{/if}
    <p class="collection-note">A concept collection. Products, imagery and prices are illustrative; checkout is not currently available.</p>
  </section>
  <section class="closing container" aria-labelledby="closing-heading"><div><p class="eyebrow">ONE WORLD. BEAUTIFULLY CONSIDERED.</p><h2 id="closing-heading">Dress yourself.<br />Dress your home.</h2><p>The same quiet palette. The same considered approach.</p><a class="text-link" href={resolve('/')}>Discover Home &amp; Living</a></div><a class="closing-photo" href={resolve('/')} aria-label="Discover ALDESCA Home and Living"><Photo name="home-closing-editorial" /></a></section>
</div>
<style>
  .clothing-page { max-width:var(--page-width); margin:20px auto 0; }
  .fashion-hero { display:grid; grid-template-columns:36% 64%; background:var(--sage); min-height:clamp(25rem,40vw,38rem); }
  .hero-copy { padding:clamp(2rem,4.5vw,5rem) var(--gutter); align-self:center; }
  .hero-copy .eyebrow { font-size:.875rem; letter-spacing:.12em; margin-bottom:22px; }
  h1 { font-size:clamp(2.8rem,5.6vw,5.6rem); letter-spacing:-.04em; margin-bottom:24px; }
  .hero-copy > p:not(.eyebrow) { font-size:clamp(1.125rem,1.8vw,1.375rem); line-height:1.5; margin-bottom:28px; }
  .hero-photo { min-width:0; min-height:0; }
  .edits { padding-block:clamp(2.5rem,5vw,5rem); }
  .edit-intro { display:flex; align-items:start; justify-content:space-between; gap:32px; margin-bottom:28px; }
  .edit-intro h2, .closing h2 { font-size:clamp(2rem,3.7vw,3.5rem); letter-spacing:-.035em; }
  .edit-intro > p { max-width:25rem; margin:0; line-height:1.65; }
  .edit-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--grid-gap); }
  .edit { text-decoration:none; min-width:0; }
  .edit-photo { aspect-ratio:4/4.5; overflow:hidden; background:var(--oatmeal); }
  .edit-caption { padding:20px 0 0; }
  h3 { font:400 clamp(1.75rem,2.5vw,2.5rem)/1.2 var(--font-serif); margin:0 0 8px; }
  .edit-caption p { margin-bottom:10px; line-height:1.5; }
  .edit:hover h3 { text-decoration:underline; text-decoration-thickness:1px; text-underline-offset:5px; }
  .collection { scroll-margin-top:24px; padding-block:24px 48px; }
  .collection .section-heading { flex-wrap:wrap; }
  .section-heading :global(h1) { min-width:0; font-size:clamp(1.75rem,3.711vw,3rem); margin:0; letter-spacing:-.035em; }
  .filters { display:flex; flex-wrap:wrap; gap:4px 26px; padding-block:12px; border-block:1px solid var(--rule); margin-top:24px; }
  .filters a { display:flex; align-items:center; min-height:44px; text-decoration:none; border-bottom:1px solid transparent; }
  .filters a.active, .filters a:hover { border-color:var(--black); }
  .result-count { font-size:.875rem; margin:18px 0; }
  .collection :global(.product-grid) { row-gap:32px; }
  .collection-note { font-size:.875rem; color:#514d46; line-height:1.6; margin:28px 0 0; }
  .closing { display:grid; grid-template-columns:1fr 1fr; background:var(--sage); padding-block:0; padding-right:0; gap:var(--gutter); }
  .closing > div { padding:clamp(2rem,4vw,4rem) var(--gutter); align-self:center; }
  .closing h2 { margin-bottom:22px; }
  .closing-photo { display:block; min-height:300px; }
  .empty { padding-block:32px; }
  @media(max-width:850px) { .fashion-hero { grid-template-columns:43% 57%; } .edit-intro { flex-direction:column; gap:16px; } .edit-intro > p { max-width:36rem; } }
  @media(max-width:700px) {
    .clothing-page { margin-top:12px; }
    .fashion-hero { display:flex; flex-direction:column; }
    .hero-copy { align-self:stretch; padding:32px var(--gutter); }
    h1 { font-size:clamp(2.75rem,12.5vw,4.5rem); }
    .hero-photo { aspect-ratio:1.22; }
    .hero-photo :global(img) { object-position:center; }
    .edit-grid { grid-template-columns:minmax(0,1fr); gap:30px; }
    .edit { display:grid; grid-template-columns:42% minmax(0,1fr); gap:18px; align-items:center; }
    .edit-photo { aspect-ratio:3/4; }
    .edit-caption { padding:0; }
    .edit-caption h3 { font-size:clamp(1.5rem,6vw,2rem); }
    .edit-caption p { font-size:1rem; }
    .edit-caption .text-link { font-size:.875rem; }
    .filters { column-gap:22px; }
    .collection { padding-block:12px 36px; }
    .closing { display:flex; flex-direction:column; padding:0; gap:0; }
    .closing > div { align-self:stretch; padding:32px var(--gutter); }
    .closing-photo { min-height:0; aspect-ratio:1.8; }
  }
  @media(max-width:359px) { .edit { grid-template-columns:minmax(0,1fr); gap:16px; } .edit-photo { aspect-ratio:4/4.5; } }
</style>
