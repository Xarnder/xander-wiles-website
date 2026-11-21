<script lang="ts">
  import type { Product } from '#lib/catalogue.ts';
  import ProductDetail from '#lib/components/ProductDetail.svelte';
  let { data }: { data: { product: Product } } = $props();
</script>
<svelte:head><title>{data.product.name} | ALDESCA</title><meta name="description" content={`${data.product.description} ${data.product.supporting}`} /></svelte:head>
{#key data.product.id}<ProductDetail product={data.product} />{/key}
