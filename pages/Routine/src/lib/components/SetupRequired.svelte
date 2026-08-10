<section class="card setup">
	<h1>Firebase setup needed</h1>
	<p>
		Routine Manager needs a dedicated Firebase web app config. Add the
		<code>PUBLIC_ROUTINE_FIREBASE_*</code> values to your environment (see
		<code>.env.example</code> and the README), then restart the app.
	</p>
	<p class="muted">
		Automated tests can run without Firebase by setting <code>PUBLIC_ROUTINE_E2E=true</code>.
	</p>
</section>

<style>
	.setup {
		padding: 1.5rem;
		margin-top: 10vh;
	}

	h1 {
		margin: 0 0 0.6rem;
		font-family: var(--font-display);
		font-size: 1.7rem;
		color: var(--ink);
	}

	p {
		margin: 0 0 0.8rem;
		line-height: 1.5;
		color: var(--ink-soft);
	}

	code {
		font-size: 0.92em;
	}
</style>
