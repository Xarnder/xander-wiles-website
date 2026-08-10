<script lang="ts">
	import { signInWithGoogle } from '$lib/firebase/auth';

	let busy = $state(false);
	let error = $state<string | null>(null);

	async function signIn() {
		busy = true;
		error = null;
		try {
			await signInWithGoogle();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Sign-in failed.';
		} finally {
			busy = false;
		}
	}
</script>

<section class="card gate">
	<p class="eyebrow">Routine Manager</p>
	<h1>Your step-by-step routines</h1>
	<p class="lede">
		Sign in with Google to create routines and run them one task at a time — built for one-handed
		use on your phone.
	</p>
	{#if error}
		<p class="error-banner" role="alert">{error}</p>
	{/if}
	<button type="button" class="btn btn-primary btn-block" onclick={signIn} disabled={busy}>
		{busy ? 'Signing in…' : 'Sign in with Google'}
	</button>
</section>

<style>
	.gate {
		padding: 1.6rem 1.35rem;
		margin-top: 12vh;
	}

	.eyebrow {
		margin: 0;
		font-weight: 700;
		color: var(--accent-strong);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		font-size: 0.78rem;
	}

	h1 {
		margin: 0.45rem 0 0.6rem;
		font-family: var(--font-display);
		font-size: clamp(2rem, 7vw, 2.6rem);
		line-height: 1.1;
		color: var(--ink);
	}

	.lede {
		margin: 0 0 1.2rem;
		color: var(--ink-soft);
		line-height: 1.5;
	}
</style>
