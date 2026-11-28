<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { useShop } from '../store.svelte';
  import { products } from '../catalogue';
  import Icon from './Icon.svelte';
  import Wordmark from './Wordmark.svelte';
  const shop = useShop();
  let clothing = $derived(page.route.id === '/clothing' || products.some(p => p.department === 'clothing' && page.url.pathname.includes(p.slug)));
  let nav = $derived(clothing ? ['New In', 'Womenswear', 'Menswear', 'Accessories'] : ['New In', 'Lighting', 'Tables', 'Furniture', 'Homeware', 'Collections']);
  const href = (name: string) => clothing ? `${resolve('/clothing')}?category=${name.toLowerCase().replaceAll(' ', '-')}#collection` : name === 'Collections' ? `${resolve('/')}#collections` : `${resolve('/shop')}?category=${name.toLowerCase().replaceAll(' ', '-')}`;
  let active = $derived((shop.restored ? page.url.searchParams.get('category') : '') || products.find(p => page.url.pathname.includes(p.slug))?.category.toLowerCase());
</script>
<header class="site-header">
  <div class="header-top">
    <div class="header-left">
      <button class="search-trigger" onclick={() => shop.panel = 'search'}><Icon name="search" size={18} /><span>Search the collection</span></button>
      <button class="icon-button mobile-control" aria-label="Open menu" onclick={() => shop.panel = 'menu'}><Icon name="menu" /></button>
      <button class="icon-button mobile-control mobile-search" aria-label="Search the collection" onclick={() => shop.panel = 'search'}><Icon name="search" size={21} /></button>
    </div>
    <Wordmark />
    <div class="header-actions">
      <button class="icon-button account" aria-label="Your account" onclick={() => shop.panel = 'account'}><Icon name="account" /></button>
      <button class="icon-button wishlist" aria-label={`Wishlist, ${shop.wishlist.length} saved products`} onclick={() => shop.panel = 'wishlist'}><Icon name="heart" />{#if shop.wishlist.length}<span class="count">{shop.wishlist.length}</span>{/if}</button>
      <button class="icon-button bag" aria-label={`Shopping bag, ${shop.unitCount} items`} onclick={() => shop.panel = 'cart'}><Icon name="bag" />{#if shop.unitCount}<span class="count">{shop.unitCount}</span>{/if}</button>
    </div>
  </div>
  <nav class="departments" aria-label="Departments"><a class:current={!clothing} aria-current={!clothing ? 'true' : undefined} href={resolve('/')}>Home &amp; Living</a><a class:current={clothing} aria-current={clothing ? 'true' : undefined} href={resolve('/clothing')}>Clothing</a></nav>
  <nav class="main-nav" aria-label="Main navigation">{#each nav as name}<a class:active={active === name.toLowerCase().replaceAll(' ', '-')} href={href(name)}>{name}</a>{/each}</nav>
</header>
<style>
  .site-header { max-width:var(--page-width); margin-inline:auto; padding-inline:15px; }
  .header-top { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; height:76px; padding-inline:14px; }
  .header-left { display:flex; align-items:center; }
  .search-trigger { width:216px; height:31px; border:1px solid var(--rule); display:flex; align-items:center; padding:0 10px; gap:9px; font-size:12px; text-align:left; margin-top:12px; }
  .header-actions { display:flex; justify-content:flex-end; gap:3px; margin-right:-10px; padding-top:6px; }
  .header-actions .icon-button { position:relative; }
  .count { position:absolute; right:0; top:0; background:var(--black); color:var(--ivory); font-size:10px; line-height:17px; min-width:17px; padding-inline:3px; border-radius:50%; }
  nav { display:flex; justify-content:center; align-items:center; gap:43.5px; height:44px; border-bottom:1px solid var(--rule); padding-left:8px; }
  nav a { font-size:14px; line-height:26px; text-decoration:none; border-bottom:1px solid transparent; padding-inline:3px; margin-bottom:10px; }
  nav a.active, nav a:hover { border-color:var(--black); }
  .departments { height:auto; min-height:44px; gap:32px; border:0; padding:0; }
  .departments a { margin:0; min-height:44px; display:flex; align-items:center; padding-inline:2px; font-size:14px; letter-spacing:.04em; }
  .departments a.current { border-bottom:2px solid var(--black); }
  .mobile-control { display:none; }
  @media(max-width:900px) { .search-trigger { width:180px; } nav { gap:30px; } }
  @media(max-width:700px) {
    .site-header { padding-inline:var(--gutter); }
    .header-top { min-height:72px; height:auto; padding-block:12px; border-bottom:1px solid var(--rule); grid-template-columns:minmax(44px,1fr) auto minmax(44px,1fr); }
    .mobile-control { display:inline-flex; }
    .search-trigger, .main-nav, .account, .wishlist { display:none; }
    .departments { display:flex; border-bottom:1px solid var(--rule); gap:28px; }
    .header-left { gap:0; }
    .header-actions { margin-right:0; padding-top:0; }
    .header-left, .header-actions { min-width:0; }
    .header-left .icon-button, .header-actions .icon-button { width:44px; height:44px; flex-shrink:0; }
  }
  @media(max-width:479px) { .mobile-search { display:none; } }
</style>
