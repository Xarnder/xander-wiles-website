export type NavigatorLike = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> & {
	canShare?: (data: ShareData) => boolean;
	share?: (data: ShareData) => Promise<void>;
};

export function readNavigator(): NavigatorLike | undefined {
	return typeof navigator === 'undefined' ? undefined : navigator;
}

/**
 * iPhone, iPod, iPad, and iPadOS that spoofs a Mac desktop UA.
 * Chrome on iOS uses WebKit, so it needs the same save/upload path as Safari.
 */
export function prefersNativeShareSave(nav: NavigatorLike | undefined = readNavigator()): boolean {
	if (!nav) return false;
	const ua = nav.userAgent ?? '';
	if (/iP(hone|ad|od)/.test(ua)) return true;
	return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
}

export function shouldUseMultiThreadFfmpeg(
	isolated: boolean,
	ios = prefersNativeShareSave()
): boolean {
	return isolated && !ios;
}

export function canShareFiles(
	file: File,
	nav: NavigatorLike | undefined = readNavigator()
): boolean {
	if (!nav?.canShare) return false;
	try {
		return nav.canShare({ files: [file] });
	} catch {
		return false;
	}
}
