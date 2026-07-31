/** Visual themes for Time Pass */

export const THEMES = [
  {
    id: 'atmosphere',
    label: 'Atmosphere',
    desc: 'Glass panels, midnight blue, and floating orbs (current look).',
  },
  {
    id: 'oled',
    label: 'Pure black OLED',
    desc: 'True black backgrounds for AMOLED screens.',
  },
  {
    id: 'light',
    label: 'White light',
    desc: 'Bright light mode with soft surfaces.',
  },
];

export const THEME_KEY = 'time-pass:theme';

export function normalizeTheme(theme) {
  if (theme === 'oled' || theme === 'light' || theme === 'atmosphere') return theme;
  return 'atmosphere';
}

export function readStoredTheme() {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'atmosphere';
  }
}

export function applyTheme(theme) {
  const id = normalizeTheme(theme);
  document.documentElement.dataset.theme = id;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      'content',
      id === 'light' ? '#f4f6fb' : id === 'oled' ? '#000000' : '#050814'
    );
  }

  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* ignore */
  }

  return id;
}
