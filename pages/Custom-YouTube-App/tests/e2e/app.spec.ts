import { expect, test, type Page } from '@playwright/test';

const ALLOWED_EMAIL = 'allowed@example.com';
const SESSION_KEY = 'playlist-deck-session';

const playlists = {
	items: [
		{
			id: 'PLtest',
			snippet: { title: 'Late night mix', thumbnails: { medium: { url: '/favicon.svg' } } },
			contentDetails: { itemCount: 2 }
		}
	]
};

const playlistItems = {
	pageInfo: { totalResults: 2 },
	items: [
		{
			id: 'pli-1',
			snippet: {
				title: 'First video',
				channelTitle: 'Channel A',
				position: 0,
				resourceId: { videoId: 'vid1' },
				thumbnails: { medium: { url: '/favicon.svg' } }
			}
		},
		{
			id: 'pli-2',
			snippet: {
				title: 'Second video',
				channelTitle: 'Channel B',
				position: 1,
				resourceId: { videoId: 'vid2' },
				thumbnails: { medium: { url: '/favicon.svg' } }
			}
		}
	]
};

const subscriptions = {
	items: [
		{
			snippet: { resourceId: { channelId: 'UCabc' }, title: 'Channel A' }
		}
	]
};

const channels = {
	items: [
		{
			id: 'UCabc',
			snippet: { title: 'Channel A' },
			contentDetails: { relatedPlaylists: { uploads: 'UUabc' } }
		}
	]
};

const uploads = {
	items: [
		{
			snippet: {
				title: 'Fresh upload',
				publishedAt: '2026-08-01T12:00:00Z',
				resourceId: { videoId: 'sub1' },
				channelTitle: 'Channel A',
				thumbnails: { medium: { url: '/favicon.svg' } }
			}
		}
	]
};

const featured = {
	items: [
		{
			id: 'trend1',
			snippet: {
				title: 'Trending clip',
				channelTitle: 'Trend Channel',
				thumbnails: { medium: { url: '/favicon.svg' } }
			},
			statistics: { viewCount: '12000' }
		}
	]
};

async function mockYouTube(page: Page) {
	await page.route('https://www.googleapis.com/youtube/v3/**', async (route) => {
		const url = new URL(route.request().url());
		const path = url.pathname;
		if (path.endsWith('/playlists')) {
			await route.fulfill({ json: playlists });
			return;
		}
		if (path.endsWith('/playlistItems')) {
			const playlistId = url.searchParams.get('playlistId');
			await route.fulfill({ json: playlistId === 'UUabc' ? uploads : playlistItems });
			return;
		}
		if (path.endsWith('/subscriptions')) {
			await route.fulfill({ json: subscriptions });
			return;
		}
		if (path.endsWith('/channels')) {
			await route.fulfill({ json: channels });
			return;
		}
		if (path.endsWith('/videos')) {
			await route.fulfill({ json: featured });
			return;
		}
		await route.fulfill({ status: 404, json: { error: { message: 'unmocked' } } });
	});
}

async function injectSession(page: Page) {
	await page.addInitScript(
		({ key, email }) => {
			sessionStorage.setItem(
				key,
				JSON.stringify({
					accessToken: 'test-token',
					expiresAt: Date.now() + 60 * 60 * 1000,
					email
				})
			);
		},
		{ key: SESSION_KEY, email: ALLOWED_EMAIL }
	);
}

test('signed-out visitors see the Google sign-in gate', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
	await expect(page.getByRole('heading', { name: /without the noise/i })).toBeVisible();
});

test('signed-in shell supports tabs, playlist open, and player overlay', async ({ page }) => {
	await injectSession(page);
	await mockYouTube(page);
	await page.goto('/');

	await expect(page.getByRole('heading', { name: 'Playlists' })).toBeVisible();
	await expect(page.getByRole('button', { name: /late night mix/i })).toBeVisible();

	await page.getByRole('tab', { name: 'Subscriptions' }).click();
	await expect(page.getByRole('heading', { name: 'Subscriptions' })).toBeVisible();
	await expect(page.getByText('Fresh upload')).toBeVisible();

	await page.getByRole('tab', { name: 'Featured' }).click();
	await expect(page.getByRole('heading', { name: 'Featured' })).toBeVisible();
	await expect(page.getByText('Trending clip')).toBeVisible();

	await page.getByRole('tab', { name: 'Playlists' }).click();
	await page.getByRole('button', { name: /late night mix/i }).click();
	await expect(page.getByRole('heading', { name: 'Late night mix' })).toBeVisible();
	await expect(page.getByText('First video')).toBeVisible();

	await page.getByRole('button', { name: 'Play First video' }).click();
	await expect(page.getByRole('dialog', { name: 'First video' })).toBeVisible();
	await page.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByText('First video')).toBeVisible();
});
