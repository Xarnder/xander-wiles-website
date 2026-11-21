<script lang="ts">import { page } from '$app/state'; import { resolve } from '$app/paths';</script>
<svelte:head><title>Page not found | ALDESCA</title></svelte:head>
<section class="error container"><p class="eyebrow">ALDESCA</p><h1>{page.status === 404 ? 'A little out of place.' : 'Something went wrong.'}</h1><p>{page.error?.message}</p><a class="button" href={resolve('/shop')}>Explore the collection</a></section>
<style>.error { min-height:60dvh; padding-block:clamp(2.5rem, 8vw, 5rem); } h1 { font-size:clamp(2rem, 5vw, 3.125rem); margin-bottom:22px; } p { overflow-wrap:anywhere; }</style>
