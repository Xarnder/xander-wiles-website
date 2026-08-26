import { YouTubeApiError, type YouTubeErrorReason } from '$lib/types/youtube';

const API_ROOT = 'https://www.googleapis.com/youtube/v3';

type RequestOptions = {
	method?: 'GET' | 'PUT';
	token: string;
	searchParams?: Record<string, string | number | undefined>;
	body?: unknown;
};

function classifyError(status: number, apiReason?: string): YouTubeErrorReason {
	if (
		apiReason === 'quotaExceeded' ||
		apiReason === 'dailyLimitExceeded' ||
		apiReason === 'rateLimitExceeded'
	) {
		return 'quota';
	}
	if (status === 401) return 'auth';
	if (status === 403) return 'forbidden';
	if (status === 404) return 'not-found';
	if (status === 0) return 'network';
	return 'unknown';
}

export async function youtubeRequest<T>(path: string, options: RequestOptions): Promise<T> {
	const url = new URL(`${API_ROOT}/${path}`);
	for (const [key, value] of Object.entries(options.searchParams ?? {})) {
		if (value !== undefined && value !== '') {
			url.searchParams.set(key, String(value));
		}
	}

	let response: Response;
	try {
		response = await fetch(url, {
			method: options.method ?? 'GET',
			headers: {
				Authorization: `Bearer ${options.token}`,
				Accept: 'application/json',
				...(options.body ? { 'Content-Type': 'application/json' } : {})
			},
			body: options.body ? JSON.stringify(options.body) : undefined
		});
	} catch {
		throw new YouTubeApiError('Network error talking to YouTube.', 0, 'network');
	}

	if (!response.ok) {
		let message = `YouTube request failed (${response.status}).`;
		let apiReason: string | undefined;
		try {
			const payload = (await response.json()) as {
				error?: { message?: string; errors?: { reason?: string }[] };
			};
			message = payload.error?.message ?? message;
			apiReason = payload.error?.errors?.[0]?.reason;
		} catch {
			// keep fallback message
		}
		throw new YouTubeApiError(
			message,
			response.status,
			classifyError(response.status, apiReason),
			apiReason
		);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
}
