<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { useShop } from '../store.svelte';
  import Wordmark from './Wordmark.svelte';
  import Icon from './Icon.svelte';
  const shop = useShop();
  let email = $state('');
  let message = $state('');
  function submit(event: SubmitEvent) {
    event.preventDefault();
    message = 'Newsletter sign-ups are not available yet. Your email has not been subscribed or saved.';
    email = '';
  }
</script>
<footer class="site-footer" class:compact={page.route.id?.startsWith('/products/')}>
  <div class="footer-logo"><Wordmark small /></div>
  <form class="newsletter" onsubmit={submit}>
    <label for="newsletter-email">Newsletter</label>
    <div class="newsletter-field"><input id="newsletter-email" type="email" bind:value={email} placeholder="Your email address" autocomplete="email" required oninvalid={() => message = 'Please enter a valid email address.'} oninput={() => message = ''} aria-describedby={message ? 'newsletter-status' : undefined} /><button aria-label="Submit newsletter email"><Icon name="arrow" size={19} /></button></div>
    {#if message}<p id="newsletter-status" class="newsletter-status" role="status">{message}</p>{/if}
  </form>
  <nav aria-label="Footer navigation"><a href={resolve('/shop')}>Shop</a><button onclick={() => shop.panel = 'about'}>About Aldesca</button><button onclick={() => shop.panel = 'contact'}>Contact</button><button onclick={() => shop.panel = 'delivery'}>Delivery &amp; Returns</button><a href={resolve('/privacy-policy')} aria-current={page.route.id === '/privacy-policy' ? 'page' : undefined}>Privacy policy</a></nav>
</footer>
<style>
  .site-footer { display:grid; grid-template-columns:222px 337px minmax(0,1fr); align-items:center; padding:15px var(--gutter); min-height:80px; max-width:var(--page-width); margin-inline:auto; }
  .footer-logo { display:flex; align-items:center; min-height:48px; padding-left:4px; }
  .site-footer.compact { padding-block:9px; min-height:68px; }
  .newsletter { border-inline:1px solid var(--rule); padding-inline:35px; min-height:48px; }
  .newsletter label { display:block; font-size:13px; margin-bottom:2px; }
  .newsletter-field { height:28px; display:flex; border:1px solid var(--rule); }
  .newsletter input { min-width:0; width:100%; padding:0 10px; background:transparent; border:0; font-size:12px; }
  .newsletter button { background:var(--black); color:var(--ivory); width:41px; flex-shrink:0; display:grid; place-items:center; }
  .newsletter-status { font-size:13px; line-height:1.5; margin:10px 0 0; }
  nav { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; padding-left:35px; }
  nav a, nav button { font-size:13px; white-space:nowrap; text-decoration:none; padding:8px 0; }
  nav a:hover, nav button:hover, nav a[aria-current='page'] { text-decoration:underline; text-underline-offset:3px; }
  @media(min-width:1200px) { .site-footer { grid-template-columns:24% 35% 1fr; } }
  @media(max-width:1000px) { .site-footer { grid-template-columns:200px 1fr; gap:16px; } nav { grid-column:1/-1; padding-left:0; justify-content:center; gap:26px; } .newsletter { border-right:0; } }
  @media(max-width:700px) { .site-footer { display:flex; flex-direction:column; align-items:stretch; padding:25px var(--gutter) max(20px, env(safe-area-inset-bottom)); gap:22px; } .footer-logo { justify-content:center; } .newsletter { border:0; padding:0; } .newsletter label { font-size:.875rem; margin-bottom:8px; } .newsletter-field { height:48px; } .newsletter input { font-size:1rem; } .newsletter button { width:48px; } nav { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:4px 12px; } nav a, nav button { display:flex; align-items:center; text-align:left; font-size:.875rem; min-height:44px; white-space:normal; } }
  @media(max-width:700px) { .site-footer.compact { padding-block:25px 20px; } }
</style>
