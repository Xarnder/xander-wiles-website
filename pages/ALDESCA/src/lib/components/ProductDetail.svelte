<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { money, products, type Product } from '../catalogue';
  import { useShop } from '../store.svelte';
  import ProductGallery from './ProductGallery.svelte';
  import FinishSelector from './FinishSelector.svelte';
  import QuantitySelector from './QuantitySelector.svelte';
  import Icon from './Icon.svelte';
  import EditorialSplit from './EditorialSplit.svelte';
  import ProductGrid from './ProductGrid.svelte';
  let { product }: { product: Product } = $props();
  const shop = useShop();
  let finish = $state('');
  let selectedFinish = $derived(finish || (shop.restored ? product.finishes.find(f => f.id === page.url.searchParams.get('finish'))?.id : '') || product.finishes[0].id);
  let quantity = $state(1);
  let clothing = $derived(product.department === 'clothing');
  let size = $state('');
  let selectedSize = $derived(size || (product.sizes?.length === 1 ? product.sizes[0] : ''));
  let sizeError = $state(false);
  let sizeFieldset: HTMLFieldSetElement | undefined = $state();
  function addToBag() {
    if (product.sizes && !selectedSize) { sizeError = true; sizeFieldset?.focus(); return; }
    shop.add(product.id, selectedFinish, quantity, selectedSize || undefined);
  }
  let saved = $derived(shop.wishlist.includes(product.id));
  let related = $derived(products.filter(p => p.department === product.department && p.id !== product.id).sort((a, b) => Number(b.category === product.category) - Number(a.category === product.category)).slice(0, 3));
  let sections = $derived([
    { title: 'Product details', body: product.details },
    { title: clothing ? 'Fit & care' : 'Dimensions & care', body: clothing ? 'Sizes shown are illustrative options for this concept collection. Garment measurements, fabric composition and care instructions are awaiting confirmation.' : 'Dimensions and care instructions have not yet been supplied.' + (product.category === 'Lighting' ? ' Electrical specifications and installation guidance are also awaiting confirmation.' : '') },
    { title: 'Delivery & Returns', body: 'Delivery areas, timings, charges and the returns policy are not available yet. Checkout is currently unavailable.' }
  ]);
</script>
<div class="product-page container">
  <nav class="breadcrumb" aria-label="Breadcrumb"><a href={resolve('/')}>Home</a><span>/</span>{#if clothing}<a href={resolve('/clothing')}>Clothing</a><span>/</span>{/if}<a href={`${clothing ? resolve('/clothing') : resolve('/shop')}?category=${product.category.toLowerCase()}${clothing ? '#collection' : ''}`}>{product.category}</a><span>/</span><span aria-current="page">{product.name}</span></nav>
  <div class="product-main">
    <ProductGallery {product} />
    <section class="purchase" aria-labelledby="product-title">
      <p class="eyebrow">{product.category.toUpperCase()}</p>
      <h1 id="product-title">{product.name}</h1>
      <p class="product-price">{money(product.price)}</p>
      <div class="description"><p>{product.description}</p><p>{product.supporting}</p></div>
      <div class="finish"><FinishSelector name={clothing ? 'Colour' : 'Finish'} finishes={product.finishes} value={selectedFinish} onchange={(value) => finish = value} /></div>
      {#if product.sizes}
        <fieldset class="sizes" bind:this={sizeFieldset} tabindex="-1" aria-describedby={sizeError ? 'size-error' : undefined}>
          <legend>{product.id === 'trousers' ? 'Waist size (inches)' : 'Size'}{selectedSize ? `: ${selectedSize}` : ''}</legend>
          <div class="size-options">{#each product.sizes as option}<label><input type="radio" name="clothing-size" value={option} checked={selectedSize === option} onchange={() => { size = option; sizeError = false; }} /><span>{option}</span></label>{/each}</div>
          {#if sizeError}<p class="size-error" id="size-error" role="alert">Please select a size before adding to your bag.</p>{/if}
        </fieldset>
      {/if}
      <div class="quantity"><p>Quantity</p><QuantitySelector value={quantity} onchange={(value) => quantity = value} /></div>
      <button class="button full add-to-bag" onclick={addToBag}>Add to bag</button>
      <button class="wishlist" aria-pressed={saved} onclick={() => shop.toggleWishlist(product.id)}><Icon name="heart" size={23} filled={saved} /><span>{saved ? 'Saved to wishlist' : 'Save to wishlist'}</span></button>
      {#if clothing}<p class="concept-note">Concept collection · Illustrative product and price.</p>{/if}
      <div class="accordions">{#each sections as section}<details><summary>{section.title}<span class="plus"><Icon name="plus" size={19}/></span><span class="minus"><Icon name="minus" size={19}/></span></summary><p>{section.body}</p></details>{/each}</div>
    </section>
  </div>
  <div class="product-editorial">{#if clothing}<EditorialSplit image="fashion-hero" title="Wear it your way." copy="Quiet tones. Effortless combinations." link="Explore clothing" href={resolve('/clothing')} />{:else}<EditorialSplit image="product-editorial" title="A softer kind of light." copy="Sculptural form. A warm, welcoming glow." link="Explore lighting" href={`${resolve('/shop')}?category=lighting`} />{/if}</div>
  <section class="related" aria-labelledby="related-heading"><div class="section-heading"><h2 id="related-heading">Pairs beautifully with</h2><a href={clothing ? resolve('/clothing') : resolve('/shop')}>View all</a></div><ProductGrid products={related} wide /></section>
</div>
<style>
  .breadcrumb { display:flex; flex-wrap:wrap; align-items:center; gap:6px; min-height:50px; padding-block:10px; font-size:13px; }
  .breadcrumb a { text-decoration:none; }
  .breadcrumb a:hover { text-decoration:underline; }
  .product-main { display:grid; grid-template-columns:minmax(0,1.49fr) minmax(0,1fr); gap:clamp(1.5rem, 3.5156vw, 3.125rem); }
  .purchase { padding-top:0; min-width:0; }
  .eyebrow { margin:0 0 6px; line-height:20px; }
  h1 { font-size:clamp(2.25rem, 4.248vw, 3.375rem); line-height:1.15; letter-spacing:-.55px; margin:0 0 8px -3px; }
  .product-price { font-size:28.4px; line-height:33.6px; margin:0 0 6px; }
  .description { font-size:16.2px; line-height:22px; border-bottom:1px solid var(--rule); padding-bottom:16px; margin-bottom:10px; }
  .description p { margin:0; }
  .description p:first-child { max-width:345px; }
  .finish { margin-bottom:18px; }
  .sizes { border:0; padding:0; margin:0 0 24px; min-width:0; }
  .sizes legend { margin-bottom:10px; padding:0; }
  .size-options { display:flex; flex-wrap:wrap; gap:8px; }
  .size-options label { position:relative; cursor:pointer; }
  .size-options input { position:absolute; opacity:0; inset:0; width:100%; height:100%; margin:0; cursor:pointer; }
  .size-options span { display:flex; align-items:center; justify-content:center; min-width:48px; min-height:44px; padding:10px 12px; border:1px solid var(--rule); }
  .size-options input:checked + span { background:var(--black); color:var(--ivory); border-color:var(--black); }
  .size-options input:focus-visible + span { outline:2px solid var(--black); outline-offset:3px; }
  .size-error { font-size:.875rem; margin:12px 0 0; color:#842f20; }
  .concept-note { font-size:.875rem; color:#514d46; margin:0 0 16px; }
  .quantity p { margin-bottom:6px; line-height:20px; }
  .quantity { margin-bottom:21px; }
  .add-to-bag { min-height:50px; font-size:22px; font-weight:500; }
  .wishlist { display:flex; align-items:center; gap:10px; min-height:58px; padding:0; font-size:15px; }
  .accordions { border-top:1px solid var(--rule); margin-top:4px; }
  details { border-bottom:1px solid var(--rule); }
  summary { display:flex; align-items:center; justify-content:space-between; min-height:43px; gap:10px; cursor:pointer; list-style:none; font-size:15px; padding-inline:4px; }
  summary::-webkit-details-marker { display:none; }
  summary span { display:flex; }
  summary .minus, details[open] .plus { display:none; }
  details[open] .minus { display:flex; }
  details p { padding:4px 4px 17px; margin:0; line-height:1.55; font-size:14px; }
  .product-editorial { margin-top:26px; margin-left:-2px; }
  .related { margin-top:20px; padding-bottom:9px; border-bottom:1px solid rgb(0 0 0 / 20%); }
  .related .section-heading { margin-bottom:13px; }
  .related h2 { font-size:clamp(2rem, 3.2715vw, 2.75rem); line-height:1.28; }
  @media(min-width:1200px) { .purchase { max-width:490px; padding-top:10px; } .description { margin-bottom:20px; padding-bottom:24px; } .finish { margin-bottom:24px; } .quantity { margin-bottom:24px; } }
  @media(max-width:1000px) { .product-main { grid-template-columns:minmax(0,1.25fr) minmax(0,1fr); } }
  @media(max-width:850px) { .product-main { grid-template-columns:minmax(0,1fr); gap:clamp(1.5rem, 4vw, 2rem); } .purchase { max-width:620px; width:100%; margin:auto; } h1 { font-size:clamp(2rem, 1rem + 5vw, 3rem); margin-left:0; } .product-editorial { margin-top:32px; } }
  @media(max-width:700px) {
    .breadcrumb { font-size:.875rem; min-height:52px; gap:0 6px; padding-block:4px; }
    .breadcrumb a { display:inline-flex; align-items:center; min-height:44px; }
    .breadcrumb [aria-current] { flex-basis:100%; padding-bottom:12px; }
    .purchase { padding:0; }
    .product-price { font-size:1.75rem; margin-block:12px; }
    .description { font-size:1rem; line-height:1.5; }
    .description p:first-child { max-width:none; }
    .finish { margin-block:14px 20px; }
    .quantity { margin-bottom:22px; }
    .add-to-bag { min-height:52px; font-size:1.25rem; }
    .wishlist, summary { font-size:1rem; min-height:50px; }
    details p { font-size:1rem; }
    .product-editorial { margin-inline:calc(-1 * var(--gutter)); }
    .related { margin-top:28px; padding-bottom:24px; }
    .related h2 { font-size:clamp(1.75rem, 1.1rem + 3.8vw, 2.5rem); line-height:1.12; }
  }
</style>
