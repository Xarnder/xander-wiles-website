<script lang="ts">
  import { resolve } from '$app/paths';
</script>

<svelte:head>
  <title>Privacy policy | ALDESCA</title>
  <meta name="description" content="How the ALDESCA demonstration website uses browser storage, handles information and supports your privacy choices." />
</svelte:head>

<div class="privacy-page container">
  <header class="policy-header">
    <p class="eyebrow">YOUR PRIVACY</p>
    <h1>Privacy policy</h1>
    <p class="introduction">A clear view of how this website uses information.</p>
    <p class="updated">Last updated <time datetime="2026-11-21">21 November 2026</time></p>
  </header>

  <article class="policy-body" aria-label="ALDESCA privacy policy">
    <aside class="notice" aria-labelledby="notice-heading">
      <h2 id="notice-heading">About this notice</h2>
      <p>This notice describes the current ALDESCA demonstration website. The legal operator, privacy contact and hosting details are awaiting confirmation, so this is a draft notice for the current site.</p>
    </aside>

    <section aria-labelledby="about-heading">
      <h2 id="about-heading">Who we are</h2>
      <p>ALDESCA is the name of this demonstration storefront for lighting, furniture and homeware. Checkout, account sign-in, customer enquiries and newsletter subscriptions are not currently connected to a service.</p>
      <dl class="operator-details">
        <div><dt>Legal operator</dt><dd>Awaiting confirmation</dd></div>
        <div><dt>Privacy contact</dt><dd>Awaiting confirmation</dd></div>
      </dl>
    </section>

    <section aria-labelledby="information-heading">
      <h2 id="information-heading">Information you choose to use</h2>
      <p>Your bag and wishlist remember the products you select, including finishes and quantities. These choices are saved in your browser on this device. The storefront does not send them to a shopping account or an order service.</p>
      <p>Product searches run in your browser. Search text is kept while you browse the site and is cleared when the page is reloaded; it is not saved in the bag or wishlist storage.</p>
      <p>The newsletter field checks an email address in your browser but does not send it, subscribe it or save it through this website. Submitting a valid address clears the field and shows a message explaining that sign-ups are unavailable.</p>
      <p>The current storefront does not request payment details, delivery addresses or account passwords.</p>
    </section>

    <section aria-labelledby="storage-heading">
      <h2 id="storage-heading">Cookies and browser storage</h2>
      <p>The storefront uses local browser storage to remember your bag and wishlist between visits. It saves these choices when you add, change or remove an item. There is no automatic expiry: saved choices remain until you remove them, clear the website’s browser data, or your browser removes them.</p>
      <p>You can remove individual items through your bag or wishlist. To remove all saved choices, clear this website’s data in your browser settings. Clearing site data may also reset other preferences saved on the same website. If your browser blocks storage, the bag and wishlist can still work during your visit, but changes will not be saved between visits.</p>
      <p>The storefront itself does not set cookies or include analytics scripts, advertising pixels or third-party tracking tools. Hosting or security services may have separate storage practices; these must be confirmed for the live hosting setup.</p>
    </section>

    <section aria-labelledby="hosting-heading">
      <h2 id="hosting-heading">Hosting and other services</h2>
      <p>Loading a website involves sending requests to its host. Hosting and security providers may process technical information such as your IP address, requested page, browser details and request time to deliver and protect the website.</p>
      <p>The hosting provider, any logging and retention periods, processing locations and international transfer arrangements have not yet been confirmed for this notice. The operator must also confirm the applicable lawful bases for any personal-data processing, including hosting logs, before this notice is finalised.</p>
      <p>Product photographs and fonts are served with the website. No payment processor, email marketing provider or customer account service is connected to the current storefront.</p>
    </section>

    <section aria-labelledby="rights-heading">
      <h2 id="rights-heading">Your choices and rights</h2>
      <p>You can browse without creating an account and manage the choices saved in your bag and wishlist at any time.</p>
      <p>Depending on the law that applies and the circumstances, you may have rights to access, correct or delete your personal information, restrict or object to its use, or receive a portable copy. Where processing relies on consent, you may withdraw it. These rights are subject to legal conditions.</p>
      <p>The operator’s privacy contact is awaiting confirmation. For information about UK data protection rights, visit the <a href="https://ico.org.uk/for-the-public/" rel="external noreferrer">Information Commissioner’s Office</a>. You can also <a href="https://ico.org.uk/make-a-complaint/" rel="external noreferrer">raise a concern with the ICO</a>, or contact the relevant authority where you live.</p>
    </section>

    <section aria-labelledby="updates-heading">
      <h2 id="updates-heading">Changes to this policy</h2>
      <p>This notice will be updated as the website and its use of information change. The date above identifies this version. Any future checkout, account, marketing or analytics services will need their own accurate privacy information before they are introduced.</p>
    </section>

    <a class="text-link return-link" href={resolve('/shop')}>Return to the collection</a>
  </article>
</div>

<style>
  .privacy-page { padding-block:clamp(1.5rem, 4vw, 3rem) clamp(2.5rem, 6vw, 5rem); }
  .policy-header { padding:clamp(1.5rem, 5vw, 4rem); background:var(--sage); }
  .eyebrow { margin-bottom:16px; }
  h1 { font-size:clamp(2.5rem, 6vw, 4rem); margin-bottom:20px; letter-spacing:-.5px; }
  .introduction { max-width:38rem; font-size:clamp(1.125rem, 2vw, 1.375rem); line-height:1.5; }
  .updated { font-size:.875rem; margin:24px 0 0; }
  .policy-body { max-width:46rem; margin:clamp(2rem, 5vw, 3.5rem) auto 0; font-size:1rem; line-height:1.7; }
  .notice { border-left:2px solid var(--black); padding:4px 0 4px clamp(1rem, 3vw, 1.5rem); margin-bottom:40px; }
  .notice h2 { font-family:var(--font-sans); font-size:1rem; font-weight:500; line-height:1.4; margin-bottom:10px; }
  .notice p { margin:0; }
  section { border-top:1px solid var(--rule); padding-top:28px; margin-top:28px; scroll-margin-top:24px; }
  h2 { font-size:clamp(1.625rem, 3vw, 2rem); line-height:1.2; margin-bottom:18px; }
  section p:last-child { margin-bottom:0; }
  .operator-details { margin:20px 0 0; }
  .operator-details div { display:grid; grid-template-columns:9rem minmax(0,1fr); gap:12px; padding-block:6px; }
  dt { font-weight:500; }
  dd { margin:0; }
  .policy-body a { text-underline-offset:4px; text-decoration-thickness:1px; }
  .return-link { display:inline-flex; align-items:center; min-height:44px; margin-top:32px; }
  @media(max-width:420px) { .operator-details div { grid-template-columns:minmax(0,1fr); gap:0; padding-block:8px; } }
</style>
