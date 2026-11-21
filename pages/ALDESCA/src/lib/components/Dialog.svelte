<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let { open = $bindable(false), title, drawer = false, side = 'right', wide = false, children }: { open?: boolean; title: string; drawer?: boolean; side?: 'left' | 'right'; wide?: boolean; children: Snippet } = $props();
  let dialog: HTMLDialogElement;
  let previousFocus: HTMLElement | null = null;
  let previousOverflow = '';
  const id = $props.id();
  $effect(() => {
    if (open && dialog && !dialog.open) {
      previousFocus = document.activeElement as HTMLElement;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.showModal();
    } else if (!open && dialog?.open) dialog.close();
  });
  function closed() {
    open = false;
    document.body.style.overflow = previousOverflow;
    previousFocus?.focus({ preventScroll: true });
  }
  function trapFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  onDestroy(() => { if (dialog?.open) document.body.style.overflow = previousOverflow; });
</script>
<dialog bind:this={dialog} aria-labelledby={id} class:drawer class:left={drawer && side === 'left'} class:wide onclose={closed} onkeydown={trapFocus} onclick={(event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) open = false; } }}>
  <div class="dialog-heading"><h2 id={id}>{title}</h2><button class="icon-button" aria-label="Close dialog" onclick={() => open = false}><Icon name="close" /></button></div>
  <div class="dialog-content">{@render children()}</div>
</dialog>
<style>
  dialog { border:1px solid var(--rule); padding:clamp(1rem, 3vw, 1.625rem); background:var(--ivory); color:var(--black); width:min(540px, calc(100% - 32px)); max-width:100%; max-height:calc(100dvh - 32px); margin:auto; overflow:hidden; }
  dialog[open] { display:flex; flex-direction:column; }
  dialog::backdrop { background:rgb(0 0 0 / 35%); backdrop-filter:blur(2px); }
  dialog.drawer { margin:0 0 0 auto; height:100dvh; max-height:100dvh; width:min(480px, 100%); border-width:0 0 0 1px; }
  dialog.drawer.left { margin:0 auto 0 0; width:min(22rem, calc(100% - 24px)); border-width:0 1px 0 0; }
  dialog.wide { width:min(940px, calc(100% - 32px)); }
  .dialog-heading { display:flex; flex-shrink:0; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid var(--rule); padding-bottom:15px; margin-bottom:20px; }
  .dialog-heading .icon-button { flex-shrink:0; }
  .left .dialog-heading { justify-content:flex-start; }
  .left .dialog-heading .icon-button { order:-1; }
  h2 { min-width:0; overflow-wrap:anywhere; font-size:clamp(1.5rem, 1rem + 2vw, 2rem); }
  .dialog-content { min-width:0; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:4px; margin:-4px; }
  @media(max-width:700px) { dialog.drawer { padding-bottom:max(1rem, env(safe-area-inset-bottom)); } }
  @media(max-height:480px) { .dialog-heading { margin-bottom:12px; padding-bottom:8px; } }
</style>
