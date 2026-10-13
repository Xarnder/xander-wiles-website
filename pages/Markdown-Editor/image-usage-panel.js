/**
 * Settings → “Drive image data today” card: a bar with the real numbers, time
 * until the daily reset, this hour’s per-kind counts, and a colour that turns
 * amber then red as the budget runs out. Updates live while Settings is open.
 */

import { HOURLY_LIMITS, formatBytes, formatDuration } from './image-files.js';
import { IMAGE_USAGE_EVENT, IMAGE_USAGE_STORAGE_KEY, readImageUsageSummary } from './image-preview.js';

const KIND_LABELS = { thumb: 'thumbnails', screen: 'screen copies', original: 'full resolution' };
const TICK_MS = 30_000;

let els = null;
let timer = 0;

function bind() {
    if (els) return els;
    const root = document.getElementById('image-usage');
    if (!root) return null;
    els = {
        root,
        value: document.getElementById('image-usage-value'),
        bar: document.getElementById('image-usage-bar'),
        fill: document.getElementById('image-usage-fill'),
        percent: document.getElementById('image-usage-percent'),
        reset: document.getElementById('image-usage-reset'),
        hourly: document.getElementById('image-usage-hourly'),
    };
    return els;
}

function isVisible() {
    return Boolean(els?.root && els.root.isConnected && !els.root.closest('[hidden]'));
}

/** Draw the card from the current ledger. */
export function renderImageUsagePanel() {
    if (!bind()) return;
    const s = readImageUsageSummary();
    const pct = Math.round(s.fraction * 100);
    els.root.dataset.level = s.level;

    els.value.textContent = `${formatBytes(s.bytes) || '0 KB'} of ${formatBytes(s.allowance)}`;
    els.value.title = s.raised ? 'Today’s limit was raised after you allowed more.' : '';
    els.fill.style.width = `${s.bytes > 0 ? Math.max(pct, 1) : 0}%`;
    els.bar.setAttribute('aria-valuenow', String(pct));
    els.bar.setAttribute('aria-valuetext', `${pct}% used, ${els.value.textContent}`);

    els.percent.textContent =
        s.level === 'over'
            ? 'Limit reached — asks before loading more'
            : `${pct}% used${s.raised ? ' (limit raised today)' : ''}`;
    els.reset.textContent = `Resets in ${formatDuration(s.resetInMs)}`;

    const paused = s.hourly.filter((h) => h.retryInMs > 0);
    els.hourly.dataset.paused = paused.length ? '1' : '';
    if (paused.length) {
        const text = paused
            .map((h) => `${KIND_LABELS[h.kind]} paused for ${formatDuration(h.retryInMs)} (${h.limit}/hour limit)`)
            .join(' · ');
        els.hourly.textContent = text.charAt(0).toUpperCase() + text.slice(1);
    } else {
        els.hourly.textContent = `This hour: ${s.hourly
            .map((h) => `${h.used}/${HOURLY_LIMITS[h.kind]} ${KIND_LABELS[h.kind]}`)
            .join(' · ')}`;
    }
}

function tick() {
    if (!isVisible()) {
        clearInterval(timer);
        timer = 0;
        return;
    }
    renderImageUsagePanel();
}

/** Render now and keep the countdown fresh while Settings stays open. */
export function showImageUsagePanel() {
    renderImageUsagePanel();
    if (!timer) timer = setInterval(tick, TICK_MS);
}

/** Wire live updates once (image loads in this tab, or another tab). */
export function initImageUsagePanel() {
    if (!bind()) return;
    window.addEventListener(IMAGE_USAGE_EVENT, () => {
        if (isVisible()) renderImageUsagePanel();
    });
    window.addEventListener('storage', (event) => {
        if (event.key === IMAGE_USAGE_STORAGE_KEY && isVisible()) renderImageUsagePanel();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isVisible()) renderImageUsagePanel();
    });
}
