/**
 * Derive a display emoji from an event title via curated phrase/keyword rules.
 * Longer phrases win. No external dependency — suited to static ES modules.
 */

export const DEFAULT_EVENT_EMOJI = '📅';

/**
 * Rules are matched case-insensitively with word boundaries.
 * Multi-word / longer patterns should appear before shorter ones that overlap.
 * @type {Array<{ pattern: RegExp, emoji: string }>}
 */
const TITLE_EMOJI_RULES = [
  // —— Life milestones ——
  { pattern: /\bbirth\s*days?\b/i, emoji: '🎂' },
  { pattern: /\bbirthdays?\b/i, emoji: '🎂' },
  { pattern: /\bbirth\b/i, emoji: '🎂' },
  { pattern: /\banniversar(?:y|ies)\b/i, emoji: '💍' },
  { pattern: /\bwedding\b/i, emoji: '💒' },
  { pattern: /\bengagement\b/i, emoji: '💎' },
  { pattern: /\bbachelor(?:ette)?\b/i, emoji: '🎉' },
  { pattern: /\bbaby\s*shower\b/i, emoji: '🍼' },
  { pattern: /\b(baby|newborn|due\s*date)\b/i, emoji: '👶' },
  { pattern: /\bchristening\b|\bbaptism\b/i, emoji: '✝️' },
  { pattern: /\bfuneral\b|\bmemorial\b|\bwake\b/i, emoji: '🕊️' },

  // —— Holidays & seasons ——
  { pattern: /\bnew\s*year'?s?\b|\bnye\b/i, emoji: '🥳' },
  { pattern: /\bchristmas\b|\bxmas\b/i, emoji: '🎄' },
  { pattern: /\bhanukkah\b|\bchanukah\b/i, emoji: '🕎' },
  { pattern: /\beaster\b/i, emoji: '🐣' },
  { pattern: /\bhalloween\b/i, emoji: '🎃' },
  { pattern: /\bthanksgiving\b/i, emoji: '🦃' },
  { pattern: /\bvalentine'?s?\b/i, emoji: '💘' },
  { pattern: /\bmother'?s?\s*day\b/i, emoji: '🌷' },
  { pattern: /\bfather'?s?\s*day\b/i, emoji: '👔' },
  { pattern: /\bindependence\s*day\b|\b4th\s*of\s*july\b/i, emoji: '🎆' },
  { pattern: /\bdiwali\b/i, emoji: '🪔' },
  { pattern: /\beid\b/i, emoji: '🌙' },
  { pattern: /\bholiday\b|\bholidays\b/i, emoji: '🏖️' },

  // —— Education ——
  { pattern: /\bgraduation\b|\bgraduat(?:e|ing|es|ed)\b/i, emoji: '🎓' },
  { pattern: /\bdegree\b|\bdiploma\b|\bconvocation\b/i, emoji: '🎓' },
  { pattern: /\buniversity\b|\bcollege\b|\bcampus\b/i, emoji: '🏫' },
  { pattern: /\bschool\b|\bclassroom\b|\bterm\s*starts?\b/i, emoji: '🏫' },
  { pattern: /\bexam\b|\bexams\b|\btest\b|\btests\b/i, emoji: '📝' },
  { pattern: /\bthesis\b|\bdissertation\b/i, emoji: '📚' },
  { pattern: /\blibrary\b/i, emoji: '📚' },

  // —— Work & money ——
  { pattern: /\binterview\b/i, emoji: '💼' },
  { pattern: /\bmeeting\b|\bstandup\b|\bstand-?up\b/i, emoji: '🗓️' },
  { pattern: /\bdeadline\b|\bdue\b/i, emoji: '⏰' },
  { pattern: /\bpayroll\b|\bsalary\b|\bpaycheck\b/i, emoji: '💰' },
  { pattern: /\btax(?:es)?\b/i, emoji: '🧾' },
  { pattern: /\bpromotion\b|\braise\b/i, emoji: '📈' },
  { pattern: /\bretirement\b|\bretire\b/i, emoji: '🧓' },
  { pattern: /\bwork\b|\boffice\b|\bjob\b/i, emoji: '💼' },

  // —— Travel ——
  { pattern: /\bflight\b|\bairport\b|\bplane\b|\bairline\b/i, emoji: '✈️' },
  { pattern: /\btrain\b|\brail\b|\bstation\b/i, emoji: '🚆' },
  { pattern: /\bbus\b/i, emoji: '🚌' },
  { pattern: /\bcruise\b|\bferry\b/i, emoji: '🚢' },
  { pattern: /\bhotel\b|\bcheck-?in\b|\bcheck-?out\b/i, emoji: '🏨' },
  { pattern: /\btrip\b|\btravel\b|\bvaca(?:tion)?\b|\bgetaway\b/i, emoji: '🧳' },
  { pattern: /\bpassport\b|\bvisa\b/i, emoji: '🛂' },

  // —— Health ——
  { pattern: /\bdentist\b|\bdental\b/i, emoji: '🦷' },
  { pattern: /\bdoctor\b|\bgp\b|\bclinic\b|\bhospital\b|\bsurgery\b/i, emoji: '🏥' },
  { pattern: /\bvaccine\b|\bvaccination\b|\bjab\b/i, emoji: '💉' },
  { pattern: /\bphysio\b|\btherapy\b|\bcounselling\b|\bcounseling\b/i, emoji: '🩺' },
  { pattern: /\bgym\b|\bworkout\b|\bfitness\b|\brun\b|\bmarathon\b/i, emoji: '💪' },

  // —— Home & life admin ——
  { pattern: /\bmoving\b|\bmove\s*out\b|\bmove\s*in\b|\bhouse\s*move\b/i, emoji: '📦' },
  { pattern: /\brent\b|\bmortgage\b|\blease\b/i, emoji: '🏠' },
  { pattern: /\bbill\b|\bills\b|\butilit(?:y|ies)\b/i, emoji: '💡' },
  { pattern: /\binsurance\b/i, emoji: '🛡️' },
  { pattern: /\bclean(?:ing)?\b|\blaundry\b/i, emoji: '🧹' },
  { pattern: /\bgarden\b|\bplant\b/i, emoji: '🌱' },
  { pattern: /\bpet\b|\bdog\b|\bcat\b|\bvets?\b/i, emoji: '🐾' },

  // —— Food & social ——
  { pattern: /\bdinner\b|\bsupper\b/i, emoji: '🍽️' },
  { pattern: /\blunch\b|\bbrunch\b/i, emoji: '🥗' },
  { pattern: /\bbreakfast\b/i, emoji: '🍳' },
  { pattern: /\bcoffee\b|\bcafe\b|\bcafé\b/i, emoji: '☕' },
  { pattern: /\bparty\b|\bcelebration\b|\bbash\b/i, emoji: '🎉' },
  { pattern: /\bconcert\b|\bgig\b|\bfestival\b/i, emoji: '🎵' },
  { pattern: /\bmovie\b|\bcinema\b|\bfilm\b|\btheatre\b|\btheater\b/i, emoji: '🎬' },
  { pattern: /\bgame\b|\bmatch\b|\bfootball\b|\bsoccer\b|\brugby\b|\bcricket\b/i, emoji: '⚽' },
  { pattern: /\bbasketball\b|\bnba\b/i, emoji: '🏀' },
  { pattern: /\btennis\b/i, emoji: '🎾' },

  // —— Tech / misc ——
  { pattern: /\blaunch\b|\brelease\b|\bdeploy\b/i, emoji: '🚀' },
  { pattern: /\bbirthday\b/i, emoji: '🎂' },
];

/**
 * Pick an emoji for an event title.
 * @param {string} name
 * @returns {string}
 */
export function emojiFromTitle(name) {
  const text = String(name || '').trim();
  if (!text) return DEFAULT_EVENT_EMOJI;

  let best = null;
  let bestLen = -1;

  for (const rule of TITLE_EMOJI_RULES) {
    const m = text.match(rule.pattern);
    if (!m) continue;
    const len = m[0].length;
    // Prefer longer matched phrases; first rule wins ties (rules are ordered).
    if (len > bestLen) {
      best = rule.emoji;
      bestLen = len;
    }
  }

  return best || DEFAULT_EVENT_EMOJI;
}

/**
 * Normalize a stored emoji override. Empty / "auto" → null (use title auto-assign).
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeEventEmoji(raw) {
  if (raw == null || raw === false) return null;
  const s = String(raw).trim();
  if (!s || /^auto$/i.test(s)) return null;
  const chars = [...s];
  if (!chars.length) return null;
  // Cap length so a pasted paragraph cannot bloat the field (ZWJ sequences allowed).
  return chars.length > 8 ? chars.slice(0, 8).join('') : s;
}

/**
 * Display emoji for an event: manual override wins, else title auto-assign.
 * @param {{ name?: string, emoji?: string|null }|string} eventOrName
 * @param {string|null} [emojiOverride] when first arg is a name string
 */
export function resolveEventEmoji(eventOrName, emojiOverride) {
  if (eventOrName && typeof eventOrName === 'object') {
    const override = normalizeEventEmoji(eventOrName.emoji);
    if (override) return override;
    return emojiFromTitle(eventOrName.name);
  }
  const override = normalizeEventEmoji(emojiOverride);
  if (override) return override;
  return emojiFromTitle(eventOrName);
}

/** Unique emojis for the manual picker (rules + a few extras). */
export function emojiPickerChoices() {
  const seen = new Set();
  const out = [];
  const add = (emoji) => {
    if (!emoji || seen.has(emoji)) return;
    seen.add(emoji);
    out.push(emoji);
  };
  add(DEFAULT_EVENT_EMOJI);
  for (const rule of TITLE_EMOJI_RULES) add(rule.emoji);
  for (const extra of ['⭐', '❤️', '🔥', '🌈', '🎯', '✨', '🏆', '🎁', '🔔', '📌', '💡', '🌟']) {
    add(extra);
  }
  return out;
}
