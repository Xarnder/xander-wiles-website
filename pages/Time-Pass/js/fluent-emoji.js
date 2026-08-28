import {
  FLUENT_EMOJI_SLUGS,
  FLUENT_EMOJI_STYLE,
  FLUENT_EMOJI_VERSION,
} from './fluent-emoji-slugs.js';

const TONE_BY_CP = {
  0x1f3fb: 'light',
  0x1f3fc: 'medium-light',
  0x1f3fd: 'medium',
  0x1f3fe: 'medium-dark',
  0x1f3ff: 'dark',
};

const CDN_BASE = `https://cdn.jsdelivr.net/npm/@fluentui-emoji/svg@${FLUENT_EMOJI_VERSION}/icons/${FLUENT_EMOJI_STYLE}`;

function firstGrapheme(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  try {
    for (const part of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) {
      return part.segment;
    }
  } catch {
    /* ignore */
  }
  return [...s][0] || s;
}

function stripVS(s) {
  return s.replace(/\uFE0F/g, '').replace(/\uFE0E/g, '');
}

function splitSkinTone(glyph) {
  const codes = [...glyph].map((ch) => ch.codePointAt(0));
  let tone = null;
  const rest = [];
  for (const cp of codes) {
    if (TONE_BY_CP[cp]) tone = TONE_BY_CP[cp];
    else rest.push(String.fromCodePoint(cp));
  }
  return { base: rest.join(''), tone };
}

function lookupSlug(glyph) {
  if (!glyph) return null;
  const direct = FLUENT_EMOJI_SLUGS[glyph] || FLUENT_EMOJI_SLUGS[stripVS(glyph)];
  if (direct) return direct;
  const { base, tone } = splitSkinTone(glyph);
  if (!tone || !base) return null;
  const baseSlug = FLUENT_EMOJI_SLUGS[base] || FLUENT_EMOJI_SLUGS[stripVS(base)];
  if (!baseSlug) return null;
  if (baseSlug.endsWith('-default')) return `${baseSlug.slice(0, -'-default'.length)}-${tone}`;
  return `${baseSlug}-${tone}`;
}

/** CDN URL for a unicode emoji, or null if Fluent has no matching asset. */
export function fluentEmojiUrl(glyph) {
  const slug = lookupSlug(firstGrapheme(glyph));
  if (!slug) return null;
  return `${CDN_BASE}/${encodeURIComponent(slug)}.svg`;
}

export function setFluentEmoji(host, glyph) {
  if (!host) return;
  const next = firstGrapheme(glyph);
  const url = fluentEmojiUrl(next);
  const key = `${next}|${url || ''}`;
  if (host.dataset.fluentKey === key) return;
  host.dataset.fluentKey = key;
  host.replaceChildren();
  if (!next) return;
  if (!url) {
    host.textContent = next;
    return;
  }
  const img = document.createElement('img');
  img.className = 'fluent-emoji';
  img.src = url;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.setAttribute('aria-hidden', 'true');
  img.addEventListener(
    'error',
    () => {
      if (host.dataset.fluentKey !== key) return;
      host.textContent = next;
    },
    { once: true }
  );
  host.appendChild(img);
}

export function fluentEmojiHost(glyph, className = '') {
  const host = document.createElement('span');
  host.className = ['fluent-emoji-host', className].filter(Boolean).join(' ');
  host.setAttribute('aria-hidden', 'true');
  setFluentEmoji(host, glyph);
  return host;
}
