<script lang="ts">
	import {
		usageLevel,
		usagePercent,
		type CloudflareUsage,
		type UsageAccess,
		type UsageMetric
	} from '$lib/game/net/CloudflareUsage';
	let { access }: { access: UsageAccess | null } = $props();
	let usage = $state<CloudflareUsage | null>(null);
	let loading = $state(false);
	let error = $state('');
	let refresh = $state(0);
	$effect(() => {
		const current = access;
		refresh;
		usage = null;
		error = '';
		if (!current?.owner) return;
		const abort = new AbortController();
		loading = true;
		void fetch(
			`${current.server.replace(/\/+$/, '')}/w/${encodeURIComponent(current.worldId)}/usage`,
			{
				headers: { Authorization: `Bearer ${current.invite}` },
				signal: abort.signal
			}
		)
			.then(async (response) => {
				if (!response.ok) throw new Error('Usage could not be loaded. Owner access is required.');
				const result = (await response.json()) as CloudflareUsage;
				if (!['ok', 'unavailable'].includes(result.status) || !Array.isArray(result.metrics))
					throw new Error('Usage response was not valid.');
				if (!abort.signal.aborted) usage = result;
			})
			.catch((cause: unknown) => {
				if (!abort.signal.aborted)
					error = cause instanceof Error ? cause.message : 'Usage could not be loaded.';
			})
			.finally(() => {
				if (!abort.signal.aborted) loading = false;
			});
		return () => abort.abort();
	});
	$effect(() => {
		if (!access?.owner) return;
		const timer = setInterval(() => {
			if (!document.hidden) refresh++;
		}, 5 * 60_000);
		return () => clearInterval(timer);
	});
	const highest = $derived(
		usage?.metrics.reduce<number | null>((max, metric) => {
			const percent = usagePercent(metric);
			return percent === null ? max : Math.max(max ?? 0, percent);
		}, null) ?? null
	);
	function format(metric: UsageMetric, value: number): string {
		if (metric.unit === 'bytes')
			return value >= 1e9 ? `${(value / 1e9).toFixed(2)} GB` : `${(value / 1e6).toFixed(2)} MB`;
		return new Intl.NumberFormat(undefined, {
			maximumFractionDigits: metric.unit === 'GB·s' ? 1 : 0
		}).format(value);
	}
	function timestamp(value: string): string {
		return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	}
</script>

<section aria-labelledby="usage-heading" data-testid="multiplayer-usage">
	<header>
		<h3 id="usage-heading">Cloudflare usage</h3>
		{#if access?.owner}<button disabled={loading} onclick={() => refresh++}
				>{loading ? 'Loading…' : 'Refresh usage'}</button
			>{/if}
	</header>
	<p class="plan">
		<strong>Free hosting configuration</strong><br />£0/month while the account stays on Workers
		Free. Your budget: £10/month, £15 absolute ceiling.
	</p>
	<p class="note">
		Usage telemetry, not a bill or a spending cap. This panel does not verify subscriptions or paid
		add-ons.
	</p>
	{#if !access?.owner}
		<p>
			Only the world owner can view account usage. Join using the owner link to see the allowance
			breakdown.
		</p>
	{:else if loading}
		<p role="status">Fetching Cloudflare’s account totals…</p>
	{:else if error}
		<p role="alert">{error} Usage is unknown; it is not zero.</p>
	{:else if usage}
		{#if usage.message}<p class="warning" role="status">{usage.message}</p>{/if}
		{#if usage.status === 'ok'}
			<p
				class:warning={usageLevel(highest) === 'warning'}
				class:critical={usageLevel(highest) === 'critical'}
				data-testid="usage-summary"
			>
				{highest !== null && highest >= 90
					? 'Near the free allowance — affected operations may stop.'
					: highest !== null && highest >= 75
						? 'Approaching a free allowance. Keep an eye on this session.'
						: 'Reported usage is within the free allowances.'}
			</p>
			{#each usage.metrics as metric (metric.id)}
				{@const percent = usagePercent(metric)}
				<div class="metric" data-testid={`usage-${metric.id}`} data-level={usageLevel(percent)}>
					<div class="metric-heading">
						<strong>{metric.label}{metric.estimate ? ' ≈' : ''}</strong><span
							>{percent === null ? 'Unknown' : `${percent.toFixed(1)}%`}</span
						>
					</div>
					{#if percent !== null}<progress
							aria-label={metric.label}
							max="100"
							value={Math.min(100, percent)}
						></progress>{/if}
					<p>
						{metric.used === null ? 'Not reported yet' : format(metric, metric.used)} / {format(
							metric,
							metric.limit
						)}
						{metric.unit === 'bytes' ? '' : metric.unit}{metric.period === 'day'
							? ' per day'
							: ' stored (does not reset daily)'}
					</p>
				</div>
			{/each}
			<p class="note">
				Account-wide totals include all worlds and Workers. Today starts at 00:00 UTC; daily
				allowances reset at {timestamp(usage.resetsAt)} (your time).
			</p>
			<p class="note">
				Last fetched: {usage.asOf ? timestamp(usage.asOf) : 'unknown'}{usage.stale
					? ' · STALE'
					: ''}. Readings are cached for five minutes and Cloudflare reporting can lag. ≈ indicates
				sampled or estimated usage. The room bar counts every invocation/message and may warn early;
				Cloudflare applies a 20:1 WebSocket billing ratio, which may differ from quota enforcement.
				Storage shows recent namespace peaks.
			</p>
		{/if}
	{/if}
	<p class="note">
		Free quotas can stop play or saving when exhausted. Keep Workers Free to avoid usage charges; do
		not rely on alerts to cap paid spending.
	</p>
	<a
		href="https://dash.cloudflare.com/486cee976614a9cd516317f5ce022092/workers-and-pages"
		target="_blank"
		rel="noreferrer">Open Cloudflare dashboard</a
	>
</section>

<style>
	section {
		margin: 1.2rem 0;
		padding: 1rem;
		border: 1px solid #496355;
		border-radius: 10px;
		background: #162b22;
	}
	header,
	.metric-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	h3 {
		font-size: 1rem;
		margin: 0;
	}
	button {
		background: #294937;
		color: #eaf6ff;
		border: 1px solid #789585;
		padding: 0.45rem 0.65rem;
		border-radius: 6px;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.6;
	}
	.plan {
		line-height: 1.5;
	}
	.note,
	.metric p {
		font-size: 0.76rem;
		color: #b4c6bd;
		line-height: 1.5;
	}
	.metric {
		margin: 1rem 0;
	}
	.metric-heading {
		font-size: 0.82rem;
	}
	.metric p {
		margin: 0.15rem 0;
	}
	progress {
		width: 100%;
		height: 0.6rem;
		accent-color: #65db9a;
	}
	[data-level='warning'] progress {
		accent-color: #ffcf69;
	}
	[data-level='critical'] progress {
		accent-color: #ff8f8f;
	}
	.warning {
		color: #ffcf69;
	}
	.critical {
		color: #ff8f8f;
	}
	a {
		color: #a3edc3;
		font-size: 0.8rem;
	}
</style>
