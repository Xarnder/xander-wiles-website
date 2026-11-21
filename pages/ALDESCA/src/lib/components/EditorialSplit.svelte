<script lang="ts">
  import Photo from './Photo.svelte';
  let { image, title, copy, link, href, closing = false }: { image: string; title: string; copy?: string; link: string; href: string; closing?: boolean } = $props();
</script>
<section class="editorial" class:closing aria-label={title}>
  <div class="editorial-copy"><h2>{title}</h2>{#if copy}<p>{copy}</p>{/if}<a href={href}>{link}</a></div>
  <div class="editorial-photo"><Photo name={image} /></div>
</section>
<style>
  .editorial { display:grid; grid-template-columns:39.875% 60.125%; background:var(--sage); min-height:clamp(17.125rem, 26.76vw, 22rem); }
  .editorial-copy { min-width:0; align-self:center; padding:25px clamp(1.5rem, 3.32vw, 3rem); }
  h2 { font-size:clamp(2rem, 4.785vw, 3.5rem); line-height:.96; max-width:310px; margin-bottom:15px; letter-spacing:-.25px; }
  p { font-size:1.0625rem; line-height:1.4; margin:0 0 16px; }
  a { font-size:18px; text-underline-offset:5px; text-decoration-thickness:1px; }
  .editorial-photo { min-width:0; min-height:0; }
  .closing { grid-template-columns:46.289% 53.711%; min-height:clamp(12.0625rem, 18.85vw, 16rem); }
  .closing .editorial-photo { grid-column:1; grid-row:1; padding-left:var(--gutter); }
  .closing .editorial-copy { grid-column:2; grid-row:1; padding-left:clamp(1.5rem, 5.078vw, 4rem); padding-top:27px; }
  .closing h2 { max-width:none; font-size:clamp(2rem, 4.639vw, 3.5rem); line-height:1; margin-bottom:12px; letter-spacing:-.7px; }
  .editorial:not(.closing) a { margin-left:2px; }
  .closing a { font-size:21px; }
  @media(max-width:700px) {
    .editorial, .closing { min-height:0; display:flex; flex-direction:column; }
    .editorial-copy, .closing .editorial-copy { padding:clamp(1.75rem, 7vw, 2.5rem) var(--gutter); align-self:stretch; }
    .editorial-photo { width:100%; aspect-ratio:1.6; }
    .closing .editorial-photo { padding:0; order:-1; aspect-ratio:2; }
    h2, .closing h2 { font-size:clamp(2rem, 1.2rem + 5.5vw, 3rem); line-height:1.06; }
    a, .closing a { display:inline-flex; align-items:center; min-height:44px; font-size:1.125rem; }
  }
</style>
