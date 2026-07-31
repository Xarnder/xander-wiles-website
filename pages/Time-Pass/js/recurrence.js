/**
 * Recurrence: next + last occurrence.
 * Weekly occurrences fall on Mondays (Q14). Monthly/yearly clamp invalid days (Q15).
 */

import {
  clampDay,
  getZonedParts,
  resolveEventInstant,
  zonedCivilToUtcMs,
} from './time-engine.js';
import { effectiveTimeZone } from './constants.js';

function eventClock(event) {
  if (!event.time) return { hour: 0, minute: 0, second: 0 };
  const bits = String(event.time).split(':').map(Number);
  return { hour: bits[0] || 0, minute: bits[1] || 0, second: bits[2] || 0 };
}

function atCivil(year, month, day, event, tz) {
  const { hour, minute, second } = eventClock(event);
  const d = clampDay(year, month, day);
  return zonedCivilToUtcMs(year, month, d, hour, minute, second, tz);
}

/** JS getUTCDay: 0=Sun … 1=Mon. We want Monday=0 for week math. */
function mondayBasedWeekday(utcDay) {
  return (utcDay + 6) % 7; // Mon=0 … Sun=6
}

function zonedWeekdayMonday0(ms, tz) {
  const p = getZonedParts(ms, tz);
  // Use Date.UTC noon trick to get weekday of that civil date
  const utcNoon = Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0);
  return mondayBasedWeekday(new Date(utcNoon).getUTCDay());
}

function addDaysCivil(year, month, day, deltaDays) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

/**
 * @returns {{ lastMs: number|null, nextMs: number|null }}
 */
export function resolveOccurrenceWindow(event, nowMs = Date.now()) {
  const freq = event.recurrence?.frequency || 'none';
  const tz = effectiveTimeZone(event.timeZone);

  if (freq === 'none') {
    const anchor = resolveEventInstant(event, nowMs);
    if (anchor >= nowMs) return { lastMs: null, nextMs: anchor };
    return { lastMs: anchor, nextMs: null };
  }

  const base = resolveEventInstant(event, nowMs);
  const baseParts = getZonedParts(base, tz);
  const { hour, minute, second } = eventClock(event);

  if (freq === 'daily') {
    const today = getZonedParts(nowMs, tz);
    let todayOcc = atCivil(today.year, today.month, today.day, event, tz);
    if (todayOcc <= nowMs) {
      const n = addDaysCivil(today.year, today.month, today.day, 1);
      return {
        lastMs: todayOcc,
        nextMs: atCivil(n.year, n.month, n.day, event, tz),
      };
    }
    const y = addDaysCivil(today.year, today.month, today.day, -1);
    return {
      lastMs: atCivil(y.year, y.month, y.day, event, tz),
      nextMs: todayOcc,
    };
  }

  if (freq === 'weekly') {
    // Occurrences on Mondays at event clock
    const today = getZonedParts(nowMs, tz);
    const wd = zonedWeekdayMonday0(nowMs, tz); // 0=Mon
    const daysSinceMon = wd;
    const mon = addDaysCivil(today.year, today.month, today.day, -daysSinceMon);
    let thisMon = atCivil(mon.year, mon.month, mon.day, event, tz);
    if (thisMon <= nowMs) {
      const nextMon = addDaysCivil(mon.year, mon.month, mon.day, 7);
      return {
        lastMs: thisMon,
        nextMs: atCivil(nextMon.year, nextMon.month, nextMon.day, event, tz),
      };
    }
    const prevMon = addDaysCivil(mon.year, mon.month, mon.day, -7);
    return {
      lastMs: atCivil(prevMon.year, prevMon.month, prevMon.day, event, tz),
      nextMs: thisMon,
    };
  }

  if (freq === 'monthly') {
    const anchorDay = baseParts.day;
    const nowP = getZonedParts(nowMs, tz);
    let y = nowP.year;
    let m = nowP.month;
    let thisOcc = atCivil(y, m, anchorDay, event, tz);
    if (thisOcc <= nowMs) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      return {
        lastMs: thisOcc,
        nextMs: atCivil(y, m, anchorDay, event, tz),
      };
    }
    let py = y;
    let pm = m - 1;
    if (pm < 1) {
      pm = 12;
      py -= 1;
    }
    return {
      lastMs: atCivil(py, pm, anchorDay, event, tz),
      nextMs: thisOcc,
    };
  }

  if (freq === 'yearly') {
    const anchorMonth = baseParts.month;
    const anchorDay = baseParts.day;
    const nowP = getZonedParts(nowMs, tz);
    let y = nowP.year;
    let thisOcc = atCivil(y, anchorMonth, anchorDay, event, tz);
    if (thisOcc <= nowMs) {
      return {
        lastMs: thisOcc,
        nextMs: atCivil(y + 1, anchorMonth, anchorDay, event, tz),
      };
    }
    return {
      lastMs: atCivil(y - 1, anchorMonth, anchorDay, event, tz),
      nextMs: thisOcc,
    };
  }

  return { lastMs: null, nextMs: null };
}
