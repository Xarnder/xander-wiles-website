<script lang="ts">
  import { resolve } from '$app/paths';
  let { small = false }: { small?: boolean } = $props();
</script>
<a href={resolve('/')} class:small class="wordmark" aria-label="ALDESCA home">ALDESCA</a>
<style>
  .wordmark { font-family: var(--font-logo); font-weight:400; font-size:57.5px; line-height:1.16; letter-spacing:3px; text-decoration:none; white-space:nowrap; }
  .wordmark:not(.small) { padding-left:3px; }
  .small { font-size:34.2px; letter-spacing:2.07px; }
  @media(max-width:700px) { .wordmark { font-size:clamp(1.625rem, 7.5vw, 2.625rem); letter-spacing:clamp(1px, .4vw, 2px); } .small { font-size:clamp(1.75rem, 8vw, 2rem); } }
</style>
