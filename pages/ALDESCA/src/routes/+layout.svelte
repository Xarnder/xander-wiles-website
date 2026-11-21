<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { asset } from '$app/paths';
  import { createShop } from '#lib/store.svelte.ts';
  import SiteHeader from '#lib/components/SiteHeader.svelte';
  import SiteFooter from '#lib/components/SiteFooter.svelte';
  import ShopPanels from '#lib/components/ShopPanels.svelte';
  import '#lib/styles.css';
  let { children }: { children: Snippet } = $props();
  const shop = createShop();
  onMount(() => shop.restore());
</script>
<svelte:head><link rel="icon" type="image/svg+xml" href={asset('favicon.svg')} /></svelte:head>
<a class="skip-link" href="#main">Skip to content</a>
<SiteHeader />
<main id="main" data-shop-ready={shop.restored}>{@render children()}</main>
<SiteFooter />
<ShopPanels />
<div class="sr-only" aria-live="polite" aria-atomic="true">{shop.announcement}</div>
