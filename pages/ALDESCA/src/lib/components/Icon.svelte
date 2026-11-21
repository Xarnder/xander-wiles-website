<script lang="ts">
  let { name, size = 24, filled = false }: { name: string; size?: number; filled?: boolean } = $props();
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'heart'}<path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z" />
  {:else if name === 'search'}<circle cx="10.6" cy="10.6" r="6.6"/><path d="m15.4 15.4 5 5"/>
  {:else if name === 'bag'}<path d="M5 7h14l2 15H3L5 7Z"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/>
  {:else if name === 'account'}<circle cx="12" cy="6.5" r="4.2"/><path d="M3.5 22v-2a8.5 6.7 0 0 1 17 0v2H3.5Z"/>
  {:else if name === 'close'}<path d="m5 5 14 14M19 5 5 19"/>
  {:else if name === 'plus'}<path d="M12 5v14M5 12h14"/>
  {:else if name === 'minus'}<path d="M5 12h14"/>
  {:else if name === 'arrow'}<path d="M4 12h16m-6-6 6 6-6 6"/>
  {:else if name === 'menu'}<path d="M3 6h18M3 12h18M3 18h18"/>
  {:else if name === 'check'}<path d="m5 12 4 4L20 5"/>
  {/if}
</svg>
