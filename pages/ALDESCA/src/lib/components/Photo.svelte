<script lang="ts">
  import { asset } from '$app/paths';
  import manifest from '../assets/asset-manifest.json';
  import clothingManifest from '../assets/clothing-asset-manifest.json';
  const assets = { ...manifest.assets, ...clothingManifest.assets };
  let { name, eager = false, decorative = false, position, mobileName, fit }: { name: string; eager?: boolean; decorative?: boolean; position?: string; mobileName?: string; fit?: string } = $props();
  type Asset = { src: string; width: number; height: number; alt: string; focalPoint?: string; srcSmall?: string; smallWidth?: number; preferredFit?: string };
  const imageUrl = (path: string) => asset(path.replace(/^\//, '') as Parameters<typeof asset>[0]);
  let image = $derived((assets as Record<string, Asset>)[name]);
  let mobileImage = $derived(mobileName ? (assets as Record<string, Asset>)[mobileName] : undefined);
</script>
{#if image}
  <picture>
  {#if mobileImage}<source media="(max-width: 700px)" srcset={imageUrl(mobileImage.src)} />{/if}
  <img src={imageUrl(image.src)}
    srcset={image.srcSmall ? `${imageUrl(image.srcSmall)} ${image.smallWidth}w, ${imageUrl(image.src)} ${image.width}w` : undefined}
    sizes={image.srcSmall ? '(max-width: 700px) 100vw, 60vw' : undefined}
    alt={decorative ? '' : image.alt} width={image.width} height={image.height}
    loading={eager ? 'eager' : 'lazy'} fetchpriority={eager ? 'high' : 'auto'} decoding="async"
    style:--position={position ?? image.focalPoint ?? '50% 50%'} style:--fit={fit ?? image.preferredFit ?? 'cover'}
    style:--mobile-position={position ?? mobileImage?.focalPoint ?? image.focalPoint ?? '50% 50%'} style:--mobile-fit={fit ?? mobileImage?.preferredFit ?? image.preferredFit ?? 'cover'} />
  </picture>
{/if}
<style>picture { display:contents; } img { display:block; width:100%; height:100%; object-fit:var(--fit); object-position:var(--position); } @media(max-width:700px) { img { object-fit:var(--mobile-fit); object-position:var(--mobile-position); } }</style>
