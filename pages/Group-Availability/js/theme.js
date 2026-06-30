const STORAGE_KEY = 'wth-theme';
const THEMES = ['light', 'dark'];

const META_COLORS = {
  light: '#eef4ff',
  dark: '#0a0a0f',
};

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  const next = THEMES.includes(theme) ? theme : 'light';
  document.documentElement.setAttribute('data-theme', next);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_COLORS[next]);

  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    const isDark = next === 'dark';
    toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    toggle.textContent = isDark ? 'Light mode' : 'Dark mode';
    toggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  }

  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private browsing */
  }
}

export function initThemeFromStorage() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  applyTheme(stored === 'dark' ? 'dark' : 'light');
}

export function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

function initNavButtons() {
  document.querySelectorAll('[data-nav-href]').forEach((btn) => {
    if (btn.dataset.navBound === 'true') return;
    btn.dataset.navBound = 'true';
    btn.addEventListener('click', () => {
      const href = btn.getAttribute('data-nav-href');
      if (href) window.location.href = href;
    });
  });
}

function ensureAppChrome() {
  let chrome = document.getElementById('app-chrome');
  if (chrome) return chrome;

  chrome = document.createElement('div');
  chrome.id = 'app-chrome';
  chrome.className = 'app-chrome';
  chrome.innerHTML = `
    <div class="app-chrome-inner panel">
      <div class="app-chrome-start"></div>
      <button type="button" id="theme-toggle" class="btn btn-ghost theme-toggle-btn" aria-pressed="false">Dark mode</button>
    </div>
  `;
  document.body.prepend(chrome);

  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  applyTheme(getTheme());
  return chrome;
}

/**
 * @param {{ homeHref?: string, homeLabel?: string }} opts
 */
export function initChrome(opts = {}) {
  initThemeFromStorage();

  const chrome = ensureAppChrome();
  const start = chrome.querySelector('.app-chrome-start');
  if (!start) return;

  start.innerHTML = '';
  if (opts.homeHref) {
    const homeBtn = document.createElement('button');
    homeBtn.type = 'button';
    homeBtn.className = 'btn btn-ghost btn-nav';
    homeBtn.dataset.navHref = opts.homeHref;
    homeBtn.textContent = opts.homeLabel || '← Home';
    start.appendChild(homeBtn);
  }

  initNavButtons();
}
