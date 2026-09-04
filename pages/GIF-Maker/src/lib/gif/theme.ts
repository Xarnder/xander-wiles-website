export type ThemeName = 'light' | 'navy' | 'oled';

export const THEME_ORDER: readonly ThemeName[] = ['navy', 'oled', 'light'];

export const THEME_LABEL: Record<ThemeName, string> = {
	light: 'Light',
	navy: 'Navy',
	oled: 'OLED'
};

export function isThemeName(value: string | null | undefined): value is ThemeName {
	return value === 'light' || value === 'navy' || value === 'oled';
}

export function resolveStoredTheme(stored: string | null, prefersDark = true): ThemeName {
	if (isThemeName(stored)) return stored;
	if (stored === 'dark') return 'navy';
	return prefersDark ? 'navy' : 'light';
}

export function nextTheme(current: ThemeName): ThemeName {
	const index = THEME_ORDER.indexOf(current);
	return THEME_ORDER[(index + 1) % THEME_ORDER.length];
}

export function themeColor(theme: ThemeName): string {
	if (theme === 'oled') return '#000000';
	if (theme === 'light') return '#e8eef6';
	return '#0a1220';
}
