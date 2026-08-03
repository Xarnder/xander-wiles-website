/**
 * CSV parse + forgiving date/time normalisation for Time Pass mass import.
 * Output dates/times always match validateEventInput: YYYY-MM-DD, HH:mm[:ss].
 */

import { COLOR_PALETTE, NAME_MAX } from './constants.js';
import { DEFAULT_CATEGORY } from './categories.js';

const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const TITLE_HINTS = [
  'title',
  'name',
  'event',
  'subject',
  'summary',
  'label',
  'description',
  'what',
  'task',
  'item',
];
const DATE_HINTS = [
  'date',
  'day',
  'when',
  'datetime',
  'date time',
  'date/time',
  'start',
  'starts',
  'start date',
  'event date',
  'due',
  'due date',
];
const TIME_HINTS = ['time', 'hour', 'start time', 'event time', 'at', 'clock'];

/** Parse CSV text into { headers, rows } (rows are objects keyed by header). */
export function parseCsv(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  if (!raw.trim()) throw new Error('CSV file is empty.');

  const delimiter = detectDelimiter(raw);
  const rows = parseCsvRows(raw, delimiter);
  if (!rows.length) throw new Error('CSV has no rows.');

  const headers = rows[0].map((h, i) => {
    const label = String(h ?? '').trim();
    return label || `Column ${i + 1}`;
  });
  // De-dupe header labels so object keys stay unique
  const seen = new Map();
  const uniqueHeaders = headers.map((h) => {
    const n = (seen.get(h) || 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });

  const dataRows = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.every((c) => String(c ?? '').trim() === '')) continue;
    const obj = {};
    for (let c = 0; c < uniqueHeaders.length; c++) {
      obj[uniqueHeaders[c]] = cells[c] != null ? String(cells[c]).trim() : '';
    }
    dataRows.push(obj);
  }

  if (!dataRows.length) throw new Error('CSV has a header row but no data.');
  return { headers: uniqueHeaders, rows: dataRows };
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r\n|\n|\r/)[0] || '';
  let inQuotes = false;
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      if (inQuotes && firstLine[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch in counts) counts[ch]++;
  }
  if (counts['\t'] >= counts[','] && counts['\t'] >= counts[';'] && counts['\t'] > 0) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
}

function parseCsvRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\r') {
      if (next === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }

  if (inQuotes) throw new Error('CSV has an unclosed quote.');
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function guessColumnMap(headers) {
  const norm = (h) => String(h || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  const scored = (hints) => {
    let best = '';
    let bestScore = 0;
    for (const h of headers) {
      const n = norm(h);
      for (const hint of hints) {
        let score = 0;
        if (n === hint) score = 100;
        else if (n.includes(hint)) score = 60 + hint.length;
        else if (hint.includes(n) && n.length >= 3) score = 40;
        if (score > bestScore) {
          bestScore = score;
          best = h;
        }
      }
    }
    return bestScore >= 40 ? best : '';
  };

  const title = scored(TITLE_HINTS);
  let date = scored(DATE_HINTS);
  let time = scored(TIME_HINTS);

  // Prefer a dedicated "date" over a combined "datetime" for the date slot when both exist
  if (!date) {
    for (const h of headers) {
      const n = norm(h);
      if (n.includes('date') || n.includes('day')) {
        date = h;
        break;
      }
    }
  }
  if (time && date && time === date) time = '';

  // Avoid mapping the same column to title and date
  const used = new Set([title, date, time].filter(Boolean));
  if (!title) {
    for (const h of headers) {
      if (!used.has(h)) {
        return { title: h, date: date || '', time: time || '', dateOrder: 'auto' };
      }
    }
  }

  return { title: title || '', date: date || '', time: time || '', dateOrder: 'auto' };
}

/**
 * @param {'auto'|'dmy'|'mdy'|'ymd'} order
 * @returns {{ ok: true, date: string, time: string|null } | { ok: false, error: string }}
 */
export function parseFlexibleDateTime(dateRaw, timeRaw, order = 'auto') {
  const dateStr = String(dateRaw ?? '').trim();
  const timeStr = String(timeRaw ?? '').trim();

  if (!dateStr) return { ok: false, error: 'Missing date' };

  // Excel serial (date or date+fraction)
  if (/^\d+(\.\d+)?$/.test(dateStr)) {
    const serial = Number(dateStr);
    if (serial > 20000 && serial < 80000) {
      const excel = excelSerialToParts(serial);
      if (excel) {
        let time = timeStr ? parseFlexibleTime(timeStr) : excel.time;
        if (timeStr && !time.ok) return { ok: false, error: time.error };
        return {
          ok: true,
          date: excel.date,
          time: timeStr ? time.value : excel.time,
        };
      }
    }
  }

  // Pull datetime strings apart
  const combined = splitDateAndTime(dateStr);
  const datePart = combined.date;
  let inferredTime = combined.time;

  const parsedDate = parseFlexibleDate(datePart, order);
  if (!parsedDate.ok) return parsedDate;

  let time = null;
  if (timeStr) {
    const t = parseFlexibleTime(timeStr);
    if (!t.ok) return { ok: false, error: t.error };
    time = t.value;
  } else if (inferredTime) {
    const t = parseFlexibleTime(inferredTime);
    if (t.ok) time = t.value;
  }

  return { ok: true, date: parsedDate.date, time };
}

function excelSerialToParts(serial) {
  // Excel's day 0 is 1899-12-30 (accounts for the 1900 leap-year bug)
  const whole = Math.floor(serial);
  const frac = serial - whole;
  const utc = Date.UTC(1899, 11, 30) + whole * 86400000;
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (y < 1900 || y > 2100) return null;

  let time = null;
  if (frac > 0.000001) {
    const totalSec = Math.round(frac * 86400);
    const hh = Math.floor(totalSec / 3600) % 24;
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    time = ss ? pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss) : pad2(hh) + ':' + pad2(mm);
  }

  return { date: `${y}-${pad2(m)}-${pad2(day)}`, time };
}

function splitDateAndTime(raw) {
  const s = String(raw).trim();
  // ISO-ish: 2026-08-03T14:30:00Z or with space
  const iso = s.match(
    /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})[T\s]+(\d{1,2}[:.]\d{2}(?::\d{2})?(?:\.\d+)?(?:\s*[AaPp][Mm]?)?)/
  );
  if (iso) return { date: iso[1], time: iso[2] };

  // 03/08/2026 2:30 PM
  const spaced = s.match(
    /^(.+?)\s+(\d{1,2}[:.]\d{2}(?::\d{2})?(?:\.\d+)?(?:\s*[AaPp][Mm])?|\d{1,2}\s*[AaPp][Mm])\s*$/i
  );
  if (spaced) return { date: spaced[1].trim(), time: spaced[2].trim() };

  return { date: s, time: null };
}

/**
 * @param {'auto'|'dmy'|'mdy'|'ymd'} order
 */
export function parseFlexibleDate(raw, order = 'auto') {
  let s = String(raw ?? '').trim();
  if (!s) return { ok: false, error: 'Missing date' };

  // Strip weekday prefixes: "Mon, 3 Aug 2026" / "Monday 03-08-2026"
  s = s.replace(
    /^(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)[,\s]+/i,
    ''
  );

  // YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return finishDate(+m[1], +m[2], +m[3]);

  // YYYYMMDD
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return finishDate(+m[1], +m[2], +m[3]);

  // D Mon YYYY / DD Month YYYY / Mon D, YYYY / Month D YYYY
  m = s.match(
    /^(\d{1,2})[\s\-./]+([A-Za-z]{3,9})[\s\-./,]+(\d{2,4})$/
  );
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month) return finishDate(expandYear(+m[3]), month, +m[1]);
  }
  m = s.match(/^([A-Za-z]{3,9})[\s\-./]+(\d{1,2})(?:st|nd|rd|th)?[\s\-./,]+(\d{2,4})$/i);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    if (month) return finishDate(expandYear(+m[3]), month, +m[2]);
  }

  // Numeric with separators: D/M/Y or M/D/Y or Y/M/D
  m = s.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const c = +m[3];
    return resolveNumericDate(a, b, c, order);
  }

  // Compact ambiguous without separators is too risky — skip

  return { ok: false, error: `Unrecognised date “${raw}”` };
}

function resolveNumericDate(a, b, c, order) {
  // Four-digit year in first position → YMD
  if (a >= 1000) return finishDate(a, b, c);
  // Four-digit year in last position
  if (c >= 1000) {
    const y = c;
    if (order === 'ymd') return finishDate(a >= 1000 ? a : expandYear(a), b, c);
    if (order === 'mdy') return finishDate(y, a, b);
    if (order === 'dmy') return finishDate(y, b, a);

    // auto
    if (a > 12 && b <= 12) return finishDate(y, b, a); // D/M/Y
    if (b > 12 && a <= 12) return finishDate(y, a, b); // M/D/Y
    // Both ≤ 12 — prefer DMY (international default)
    return finishDate(y, b, a);
  }

  // Two-digit years both ends — treat last as year (common)
  if (a < 100 && c < 100) {
    const y = expandYear(c);
    if (order === 'mdy') return finishDate(y, a, b);
    if (order === 'dmy' || order === 'auto') return finishDate(y, b, a);
    if (order === 'ymd') return finishDate(expandYear(a), b, c);
  }

  return { ok: false, error: 'Ambiguous numeric date' };
}

function expandYear(y) {
  if (y >= 1000) return y;
  // 00–69 → 2000–2069, 70–99 → 1970–1999
  return y <= 69 ? 2000 + y : 1900 + y;
}

function finishDate(y, m, d) {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return { ok: false, error: 'Invalid date numbers' };
  }
  if (y < 1900 || y > 2100) return { ok: false, error: `Year ${y} out of range` };
  if (m < 1 || m > 12) return { ok: false, error: `Month ${m} invalid` };
  const dim = daysInMonth(y, m);
  if (d < 1 || d > dim) return { ok: false, error: `Day ${d} invalid for ${y}-${pad2(m)}` };
  return { ok: true, date: `${y}-${pad2(m)}-${pad2(d)}` };
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function parseFlexibleTime(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return { ok: false, error: 'Missing time' };

  // Excel fraction alone
  if (/^0?\.\d+$/.test(s) || s === '0' || s === '1') {
    const frac = Number(s);
    if (frac >= 0 && frac < 1) {
      const totalSec = Math.round(frac * 86400);
      const hh = Math.floor(totalSec / 3600) % 24;
      const mm = Math.floor((totalSec % 3600) / 60);
      const ss = totalSec % 60;
      return {
        ok: true,
        value: ss ? `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}` : `${pad2(hh)}:${pad2(mm)}`,
      };
    }
  }

  // 2pm / 2 pm / 14h / 14hr
  let m = s.match(/^(\d{1,2})\s*([AaPp][Mm])$/);
  if (m) return finishTime(applyAmPm(+m[1], 0, 0, m[2]));

  m = s.match(/^(\d{1,2})\s*[hH](?:rs?|ours?)?$/);
  if (m) return finishTime({ h: +m[1], min: 0, sec: 0 });

  // Strip timezone suffixes we don't keep (Z, +00:00, GMT, UTC)
  s = s.replace(/\s*(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)\s*$/i, '').trim();

  // 2:30 PM / 14:30:00 / 2.30pm / 14.30
  m = s.match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\.\d+)?(?:\s*([AaPp][Mm]))?$/);
  if (m) {
    const parts = m[4]
      ? applyAmPm(+m[1], +m[2], m[3] ? +m[3] : 0, m[4])
      : { h: +m[1], min: +m[2], sec: m[3] ? +m[3] : 0 };
    return finishTime(parts);
  }

  // 1430 / 143000 military
  m = s.match(/^(\d{2})(\d{2})(\d{2})?$/);
  if (m) return finishTime({ h: +m[1], min: +m[2], sec: m[3] ? +m[3] : 0 });

  return { ok: false, error: `Unrecognised time “${raw}”` };
}

function applyAmPm(h, min, sec, mer) {
  const isPm = /^p/i.test(mer);
  const isAm = /^a/i.test(mer);
  let hour = h;
  if (isAm) {
    if (hour === 12) hour = 0;
  } else if (isPm) {
    if (hour < 12) hour += 12;
  }
  return { h: hour, min, sec };
}

function finishTime({ h, min, sec }) {
  if (h < 0 || h > 23) return { ok: false, error: `Hour ${h} invalid` };
  if (min < 0 || min > 59) return { ok: false, error: `Minute ${min} invalid` };
  if (sec < 0 || sec > 59) return { ok: false, error: `Second ${sec} invalid` };
  const value =
    sec > 0 ? `${pad2(h)}:${pad2(min)}:${pad2(sec)}` : `${pad2(h)}:${pad2(min)}`;
  return { ok: true, value };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Convert mapped CSV rows into event payloads for importEvents.
 * Skips blank titles; collects per-row errors.
 */
export function rowsToEvents(rows, map) {
  const { title: titleCol, date: dateCol, time: timeCol, dateOrder = 'auto' } = map;
  if (!titleCol) throw new Error('Pick a title / event name column.');
  if (!dateCol) throw new Error('Pick a date column.');

  const events = [];
  const errors = [];
  const color = COLOR_PALETTE[0];

  rows.forEach((row, index) => {
    const line = index + 2; // 1-based + header
    const name = String(row[titleCol] ?? '').trim();
    if (!name) {
      errors.push({ line, error: 'Empty title — skipped' });
      return;
    }

    const dt = parseFlexibleDateTime(row[dateCol], timeCol ? row[timeCol] : '', dateOrder);
    if (!dt.ok) {
      errors.push({ line, error: dt.error, name });
      return;
    }

    events.push({
      name: name.slice(0, NAME_MAX),
      date: dt.date,
      time: dt.time,
      timeZone: null,
      color,
      category: DEFAULT_CATEGORY,
      recurrence: { frequency: 'none' },
    });
  });

  return { events, errors };
}

/** Sample first N rows with current mapping for preview UI. */
export function previewMappedRows(rows, map, limit = 5) {
  const { title: titleCol, date: dateCol, time: timeCol, dateOrder = 'auto' } = map;
  return rows.slice(0, limit).map((row, index) => {
    const name = titleCol ? String(row[titleCol] ?? '').trim() : '';
    const dt =
      dateCol
        ? parseFlexibleDateTime(row[dateCol], timeCol ? row[timeCol] : '', dateOrder)
        : { ok: false, error: 'No date column' };
    return {
      line: index + 2,
      name: name || '—',
      rawDate: dateCol ? row[dateCol] : '',
      rawTime: timeCol ? row[timeCol] : '',
      date: dt.ok ? dt.date : null,
      time: dt.ok ? dt.time : null,
      error: dt.ok ? (name ? null : 'Empty title') : dt.error,
    };
  });
}
