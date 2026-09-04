<script lang="ts">
	import '../app.css';
	import { assets } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<title>Smart Video to GIF</title>
	<meta
		name="description"
		content="Convert a video to a GIF entirely in your browser. Choose a maximum file size and the app finds the best settings automatically."
	/>
	<meta name="color-scheme" content="dark light" />
	<meta name="theme-color" content="#0a1220" />
	<link rel="icon" href={favicon} />
	<link rel="icon" type="image/png" sizes="32x32" href="{assets}/favicon-32x32.png" />
	<link rel="icon" type="image/png" sizes="16x16" href="{assets}/favicon-16x16.png" />
	<link rel="apple-touch-icon" href="{assets}/apple-touch-icon.png" />
	<link rel="manifest" href="{assets}/site.webmanifest" />
</svelte:head>

{@render children()}
