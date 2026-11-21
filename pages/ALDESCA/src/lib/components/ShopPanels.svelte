<script lang="ts">
  import { resolve } from '$app/paths';
  import { useShop } from '../store.svelte';
  import { categories, filterProducts, money, productById } from '../catalogue';
  import Dialog from './Dialog.svelte';
  import Photo from './Photo.svelte';
  import Icon from './Icon.svelte';
  import QuantitySelector from './QuantitySelector.svelte';
  const shop = useShop();
  let open = $state(false);
  let checkoutMessage = $state('');
  const titles = { cart: 'Your bag', wishlist: 'Your wishlist', search: 'Find your finishing touch', account: 'Your account', menu: 'Explore ALDESCA', about: 'About ALDESCA', contact: 'Get in touch', delivery: 'Delivery & Returns' };
  let title = $derived(shop.panel ? titles[shop.panel] : 'ALDESCA');
  let results = $derived(filterProducts('', shop.query));
  $effect(() => { open = shop.panel !== null; checkoutMessage = ''; });
  function updateOpen(value: boolean) { open = value; if (!value) shop.panel = null; }
  const close = () => shop.panel = null;
</script>
<Dialog bind:open={() => open, updateOpen} {title} drawer={shop.panel === 'cart' || shop.panel === 'wishlist' || shop.panel === 'menu'}>
  {#if shop.panel === 'cart'}
    {#if shop.cart.length}
      <p class="subtle">{shop.unitCount} considered {shop.unitCount === 1 ? 'piece' : 'pieces'} for your home.</p>
      <div class="line-items">
        {#each shop.cart as line (`${line.productId}:${line.finishId}`)}
          {@const product = productById(line.productId)!}
          <article class="bag-line">
            <a class="line-photo" href={resolve('/products/[slug]', { slug: product.slug })} onclick={close}><Photo name={product.image} /></a>
            <div class="line-info">
              <a class="line-name" href={resolve('/products/[slug]', { slug: product.slug })} onclick={close}>{product.name}</a>
              <p class="line-finish">{product.finishes.find(f => f.id === line.finishId)?.name}</p>
              <p>{money(product.price * line.quantity)}</p>
              <QuantitySelector value={line.quantity} label={`${product.name} quantity`} onchange={(quantity) => shop.quantity(line.productId, line.finishId, quantity)} />
              <button class="text-link remove" onclick={() => shop.remove(line.productId, line.finishId)} aria-label={`Remove ${product.name} ${line.finishId} from bag`}>Remove</button>
            </div>
          </article>
        {/each}
      </div>
      <div class="subtotal"><span>Subtotal</span><strong>{money(shop.subtotal)}</strong></div>
      <p class="subtle">Product subtotal only. Delivery and tax rules are not available.</p>
      <button class="button full" onclick={() => checkoutMessage = 'Checkout is not connected yet. Your bag is saved on this device; no order has been placed.'}>Checkout</button>
      <p class="status" role="status">{checkoutMessage}</p>
      <button class="text-link" onclick={close}>Continue exploring</button>
    {:else}
      <div class="empty"><Icon name="bag" size={42} /><h3>A little room for something lovely.</h3><p>Your bag is empty. Find a piece that feels at home.</p><a class="button" href={resolve('/shop')} onclick={close}>Explore the collection</a></div>
    {/if}
  {:else if shop.panel === 'wishlist'}
    {#if shop.wishlist.length}
      <p class="subtle">The pieces you keep coming back to.</p>
      <div class="line-items">{#each shop.wishlist as id (id)}
        {@const product = productById(id)!}
        <article class="bag-line">
          <a class="line-photo" href={resolve('/products/[slug]', { slug: product.slug })} onclick={close}><Photo name={product.image} /></a>
          <div class="line-info"><a class="line-name" href={resolve('/products/[slug]', { slug: product.slug })} onclick={close}>{product.name}</a><p>{money(product.price)}</p><button class="text-link" aria-label={`Remove ${product.name} from wishlist`} onclick={() => shop.toggleWishlist(id)}>Remove</button></div>
        </article>
      {/each}</div>
    {:else}<div class="empty"><Icon name="heart" size={42} /><h3>Keep your favourites close.</h3><p>Save the pieces you love using the heart on any product.</p><a class="button" href={resolve('/shop')} onclick={close}>Discover your favourites</a></div>{/if}
  {:else if shop.panel === 'search'}
    <label class="search-label" for="collection-search">Search by product or category</label>
    <div class="search-field"><Icon name="search" size={20} /><input id="collection-search" type="search" bind:value={shop.query} placeholder="Try lighting, table or vase" /></div>
    <p class="subtle" aria-live="polite">{results.length} {results.length === 1 ? 'piece' : 'pieces'} found</p>
    {#if results.length}<div class="search-results">{#each results as product}
      <a class="search-result" href={resolve('/products/[slug]', { slug: product.slug })} onclick={close}><span class="result-photo"><Photo name={product.image} /></span><span>{product.name}<small>{product.category} · {money(product.price)}</small></span><Icon name="arrow" size={18}/></a>
    {/each}</div>{:else}<div class="empty"><h3>Nothing here just yet.</h3><p>Try “lighting”, “table” or “vase”, or browse all four pieces.</p><button class="text-link" onclick={() => shop.query = ''}>Show the collection</button></div>{/if}
  {:else if shop.panel === 'menu'}
    <nav class="menu-links" aria-label="Mobile navigation">
      <button onclick={() => shop.panel = 'search'}><span>Search the collection</span><Icon name="search" /></button>
      <a href={`${resolve('/shop')}?category=new-in`} onclick={close}>New In</a>
      {#each categories as category}<a href={`${resolve('/shop')}?category=${category.toLowerCase()}`} onclick={close}>{category}</a>{/each}
      <a href={`${resolve('/')}#collections`} onclick={close}>Collections</a>
      <button onclick={() => shop.panel = 'wishlist'}>Wishlist ({shop.wishlist.length})</button>
      <button onclick={() => shop.panel = 'account'}>Your account</button>
    </nav>
  {:else if shop.panel === 'account'}
    <div class="empty"><Icon name="account" size={40} /><h3>Welcome to ALDESCA.</h3><p>Account sign-in is not available yet. Your bag and wishlist are saved on this device, so you can return to your favourite pieces.</p><button class="button" onclick={() => shop.panel = 'wishlist'}>View your wishlist</button></div>
  {:else if shop.panel === 'about'}
    <div class="information"><p class="eyebrow">A CONSIDERED HOME</p><h3>Beautiful everyday living.</h3><p>ALDESCA brings together lighting, furniture and objects with sculptural forms, natural textures and a quiet sense of warmth.</p><p>Explore a considered selection of pieces that sit beautifully together, and make a space feel like yours.</p><a class="text-link" href={resolve('/shop')} onclick={close}>Explore the collection</a></div>
  {:else if shop.panel === 'contact'}
    <div class="information"><h3>We’ll keep it simple.</h3><p>Contact details and customer support are not available yet. No enquiry form is connected at this stage.</p><p>Product dimensions, electrical specifications and delivery information will be added when supplied.</p></div>
  {:else if shop.panel === 'delivery'}
    <div class="information"><h3>A few details to come.</h3><p>Delivery areas, timings, charges and the returns policy have not yet been supplied.</p><p>Checkout is unavailable until these details and a payment service are in place. No orders can currently be placed.</p></div>
  {/if}
</Dialog>
<style>
  .subtle { color:#514d46; font-size:14px; line-height:1.5; margin:0 0 20px; }
  .line-items { display:grid; gap:22px; }
  .bag-line { display:grid; grid-template-columns:105px minmax(0,1fr); gap:17px; padding-bottom:22px; border-bottom:1px solid var(--rule); }
  .line-photo { aspect-ratio:1; }
  .line-name { font-size:1rem; text-decoration:none; overflow-wrap:anywhere; }
  .line-name:hover { text-decoration:underline; }
  .line-info p { margin:4px 0 10px; }
  .line-info .line-finish { font-size:14px; color:#514d46; }
  .remove { margin-top:10px; font-size:14px; }
  .subtotal { display:flex; justify-content:space-between; font-size:21px; padding-block:24px 12px; }
  .subtotal strong { font-weight:500; }
  .status { font-size:14px; line-height:1.5; }
  .empty { padding:26px 0; text-align:center; display:flex; flex-direction:column; align-items:center; gap:16px; }
  h3 { font-family:var(--font-serif); font-size:32px; font-weight:400; line-height:1.1; margin:0; }
  .empty p { line-height:1.6; margin:0 0 8px; max-width:350px; }
  .search-label { display:block; font-size:14px; margin-bottom:8px; }
  .search-field { display:flex; align-items:center; border:1px solid var(--rule); padding:0 12px; margin-bottom:16px; }
  .search-field input { background:transparent; border:0; min-width:0; width:100%; padding:14px 10px; }
  .search-results { display:grid; }
  .search-result { display:grid; grid-template-columns:70px minmax(0,1fr) 18px; align-items:center; gap:14px; padding-block:12px; text-decoration:none; border-bottom:1px solid var(--rule); }
  .result-photo { aspect-ratio:1; }
  .search-result small { display:block; font-size:14px; margin-top:4px; }
  .search-result > span { min-width:0; overflow-wrap:anywhere; }
  .menu-links { display:flex; flex-direction:column; }
  .menu-links a, .menu-links button { display:flex; align-items:center; justify-content:space-between; text-align:left; text-decoration:none; padding:16px 0; border-bottom:1px solid var(--rule); }
  .information p { line-height:1.6; }
  .information h3 { margin-bottom:20px; }
  @media(max-width:700px) {
    .bag-line { grid-template-columns:clamp(64px, 22vw, 105px) minmax(0,1fr); gap:12px; }
    .empty { padding-block:16px; }
    h3 { font-size:clamp(1.5rem, 1rem + 3vw, 2rem); }
    .search-field input { font-size:1rem; padding-inline:8px; }
    .search-result { grid-template-columns:clamp(48px, 15vw, 70px) minmax(0,1fr) 18px; gap:10px; }
    .subtotal { gap:12px; flex-wrap:wrap; }
  }
</style>
