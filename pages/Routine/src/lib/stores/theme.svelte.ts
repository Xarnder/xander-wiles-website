export type Theme = 'dark' | 'oled' | 'light';

const STORAGE_KEY = 'routine-theme';
const DEFAULT_THEME: Theme = 'dark';
const THEME_ORDER: Theme[] = ['dark', 'oled', 'light'];

const THEME_COLORS: Record<Theme, string> = {
	dark: '#0c1714',
	oled: '#000000',
	light: '#e8f4f1'
};

let theme: Theme = $state(DEFAULT_THEME);
let ready = $state(false);

export function getTheme(): Theme {
	return theme;
}

export function getNextTheme(current: Theme = theme): Theme {
	const index = THEME_ORDER.indexOf(current);
	return THEME_ORDER[(index + 1) % THEME_ORDER.length]!;
}

export function isThemeReady(): boolean {
	return ready;
}

export function initTheme(): void {
	if (typeof document === 'undefined') return;
	const stored = readStoredTheme();
	theme = stored ?? DEFAULT_THEME;
	applyTheme(theme);
	ready = true;
}

export function setTheme(next: Theme): void {
	theme = next;
	applyTheme(next);
	try {
		localStorage.setItem(STORAGE_KEY, next);
	} catch {
		/* ignore quota / private mode */
	}
}

export function toggleTheme(): void {
	setTheme(getNextTheme(theme));
}

function isTheme(value: string | null): value is Theme {
	return value === 'dark' || value === 'oled' || value === 'light';
}

function readStoredTheme(): Theme | null {
	try {
		const value = localStorage.getItem(STORAGE_KEY);
		if (isTheme(value)) return value;
	} catch {
		/* ignore */
	}
	return null;
}

function applyTheme(next: Theme): void {
	document.documentElement.dataset.theme = next;
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) {
		meta.setAttribute('content', THEME_COLORS[next]);
	}
}
