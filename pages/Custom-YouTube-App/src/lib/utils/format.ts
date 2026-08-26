import { YouTubeApiError } from '$lib/types/youtube';

export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
	if (error instanceof YouTubeApiError) {
		if (error.isQuota) {
			return 'YouTube daily quota is exhausted. Try again after midnight Pacific Time.';
		}
		if (error.reason === 'auth') {
			return 'YouTube sign-in expired. Sign in again.';
		}
		if (error.reason === 'forbidden') {
			return 'YouTube refused that action. This playlist may not allow reordering.';
		}
		return error.message;
	}
	if (error instanceof Error && error.message) return error.message;
	return fallback;
}

export function relativeTime(iso?: string): string {
	if (!iso) return '';
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return '';
	const delta = Date.now() - then;
	const minutes = Math.round(delta / 60000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.round(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.round(months / 12)}y ago`;
}

export function formatViews(count?: string): string {
	if (!count) return '';
	const n = Number(count);
	if (!Number.isFinite(n)) return '';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M views`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K views`;
	return `${n} views`;
}
