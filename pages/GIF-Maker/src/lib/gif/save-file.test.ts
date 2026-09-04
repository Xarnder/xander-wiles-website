import { describe, expect, it, vi } from 'vitest';
import { saveGifOnIos, shareGifFile, triggerDownload } from './save-file';

const gif = new File([new Uint8Array([71, 73, 70])], 'holiday.gif', { type: 'image/gif' });

describe('saveGifOnIos', () => {
	it('shares through the system sheet when files can be shared', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		const open = vi.fn();
		const outcome = await saveGifOnIos(
			gif,
			'blob:gif',
			{
				userAgent: 'iPhone',
				platform: 'iPhone',
				maxTouchPoints: 5,
				canShare: () => true,
				share
			},
			{ open }
		);
		expect(outcome).toBe('shared');
		expect(share).toHaveBeenCalledWith({ files: [gif] });
		expect(open).not.toHaveBeenCalled();
	});

	it('treats a dismissed share sheet as cancelled', async () => {
		const outcome = await saveGifOnIos(
			gif,
			'blob:gif',
			{
				userAgent: 'iPhone',
				platform: 'iPhone',
				maxTouchPoints: 5,
				canShare: () => true,
				share: async () => {
					throw new DOMException('The user aborted a request.', 'AbortError');
				}
			},
			{ open: vi.fn() }
		);
		expect(outcome).toBe('cancelled');
	});

	it('opens the GIF when the share sheet is unavailable', async () => {
		const open = vi.fn().mockReturnValue({});
		const outcome = await saveGifOnIos(
			gif,
			'blob:gif',
			{
				userAgent: 'iPhone',
				platform: 'iPhone',
				maxTouchPoints: 5
			},
			{ open }
		);
		expect(outcome).toBe('opened');
		expect(open).toHaveBeenCalledWith('blob:gif', '_blank', 'noopener,noreferrer');
	});
});

describe('shareGifFile', () => {
	it('fails closed when share is missing', async () => {
		await expect(
			shareGifFile(gif, {
				userAgent: 'iPhone',
				platform: 'iPhone',
				maxTouchPoints: 5
			})
		).resolves.toBe('failed');
	});
});

describe('triggerDownload', () => {
	it('clicks a temporary download link', () => {
		const click = vi.fn();
		const remove = vi.fn();
		const link = {
			href: '',
			download: '',
			rel: '',
			click,
			remove
		} as unknown as HTMLAnchorElement;
		const appendChild = vi.fn();
		const doc = {
			createElement: () => link,
			body: { appendChild }
		} as unknown as Document;

		triggerDownload('blob:gif', 'holiday.gif', doc);
		expect(link.href).toBe('blob:gif');
		expect(link.download).toBe('holiday.gif');
		expect(click).toHaveBeenCalled();
		expect(appendChild).toHaveBeenCalledWith(link);
		expect(remove).toHaveBeenCalled();
	});
});
