import { canShareFiles, type NavigatorLike, readNavigator } from './platform';

export type SaveGifOutcome = 'shared' | 'downloaded' | 'opened' | 'cancelled' | 'failed';

export function triggerDownload(url: string, filename: string, doc: Document = document): void {
	const link = doc.createElement('a');
	link.href = url;
	link.download = filename;
	link.rel = 'noopener';
	doc.body.appendChild(link);
	link.click();
	link.remove();
}

export function openInNewTab(url: string, win: Pick<Window, 'open'> = window): Window | null {
	return win.open(url, '_blank', 'noopener,noreferrer');
}

export async function shareGifFile(
	file: File,
	nav: NavigatorLike | undefined = readNavigator()
): Promise<'shared' | 'cancelled' | 'failed'> {
	if (!nav?.share || !canShareFiles(file, nav)) return 'failed';
	try {
		await nav.share({ files: [file] });
		return 'shared';
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
		if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
		return 'failed';
	}
}

/**
 * iOS Safari/Chrome ignore <a download> for blob URLs.
 * Use the share sheet when the browser allows file sharing; otherwise open
 * the GIF so the user can tap-and-hold Save Image.
 */
export async function saveGifOnIos(
	file: File,
	url: string,
	nav: NavigatorLike | undefined = readNavigator(),
	win: Pick<Window, 'open'> = window
): Promise<SaveGifOutcome> {
	if (canShareFiles(file, nav)) {
		return shareGifFile(file, nav);
	}
	return openInNewTab(url, win) ? 'opened' : 'failed';
}
