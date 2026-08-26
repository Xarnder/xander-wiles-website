export const FEATURED_REGIONS = [
	{ code: 'GB', label: 'United Kingdom' },
	{ code: 'US', label: 'United States' },
	{ code: 'IE', label: 'Ireland' },
	{ code: 'DE', label: 'Germany' },
	{ code: 'FR', label: 'France' },
	{ code: 'CA', label: 'Canada' },
	{ code: 'AU', label: 'Australia' },
	{ code: 'JP', label: 'Japan' },
	{ code: 'IN', label: 'India' },
	{ code: 'BR', label: 'Brazil' }
] as const;

export const DEFAULT_REGION = 'GB';
export const REGION_STORAGE_KEY = 'playlist-deck-region';

export function isKnownRegion(code: string): boolean {
	return FEATURED_REGIONS.some((region) => region.code === code);
}

export function readStoredRegion(): string {
	if (typeof localStorage === 'undefined') return DEFAULT_REGION;
	try {
		const stored = localStorage.getItem(REGION_STORAGE_KEY);
		if (stored && isKnownRegion(stored)) return stored;
	} catch {
		// ignore private-mode storage failures
	}
	return DEFAULT_REGION;
}

export function writeStoredRegion(code: string): void {
	if (!isKnownRegion(code) || typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(REGION_STORAGE_KEY, code);
	} catch {
		// ignore
	}
}
