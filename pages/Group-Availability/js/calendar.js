import { enumerateDates, formatHourRangeLabel, eventAllowsEdits, slotsToDaySelection } from './utils.js';
import { heatColor, heatTextColor } from './heatmap.js';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateStr(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function mondayIndex(year, month, day) {
  const jsDay = new Date(year, month, day).getDay();
  return (jsDay + 6) % 7;
}

function monthsInRange(startDate, endDate) {
  const months = [];
  const [sy, sm] = startDate.split('-').map(Number);
  const [ey, em] = endDate.split('-').map(Number);
  let y = sy;
  let m = sm - 1;
  const endY = ey;
  const endM = em - 1;
  while (y < endY || (y === endY && m <= endM)) {
    months.push({ year: y, month: m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return months;
}

function monthTitle(year, month, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month, 15));
}

function weeksForMonth(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = mondayIndex(year, month, 1);
  const cells = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(dateStr(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function createDayCell(dateKey, state, event, readOnly, inRange) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'day-cell';

  if (!dateKey) {
    cell.classList.add('empty');
    cell.disabled = true;
    cell.setAttribute('aria-hidden', 'true');
    cell.tabIndex = -1;
    return cell;
  }

  cell.dataset.date = dateKey;
  const dayNum = parseInt(dateKey.slice(8, 10), 10);
  cell.textContent = String(dayNum);

  if (!inRange.has(dateKey)) {
    cell.classList.add('out-of-range');
    cell.disabled = true;
    cell.setAttribute('aria-label', 'Outside event range');
    return cell;
  }

  cell.classList.add('in-range');
  const conf = state.get(dateKey);
  if (conf) {
    cell.classList.add(conf);
    cell.dataset.confidence = conf;
  }

  cell.setAttribute(
    'aria-label',
    new Intl.DateTimeFormat('en-GB', {
      timeZone: event.timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(`${dateKey}T12:00:00`))
  );

  if (readOnly || !eventAllowsEdits(event)) {
    cell.disabled = true;
  }

  return cell;
}

function attachPaintHandlers(root, state, event, getPaintMode, onChange, readOnly, inRange) {
  if (readOnly || !eventAllowsEdits(event)) return () => {};

  let painting = false;
  let activePointerId = null;

  function applyDay(cell, dateKey, mode) {
    if (!inRange.has(dateKey)) return;
    if (mode === 'erase') {
      state.delete(dateKey);
      cell.className = 'day-cell in-range';
      cell.dataset.confidence = '';
    } else {
      state.set(dateKey, mode);
      cell.className = `day-cell in-range ${mode}`;
      cell.dataset.confidence = mode;
    }
    onChange?.(new Map(state));
  }

  function paintAt(cell) {
    const key = cell?.dataset?.date;
    if (!key || !cell.classList.contains('in-range')) return;
    applyDay(cell, key, getPaintMode());
  }

  function paintFromPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    const cell = el?.closest?.('.day-cell.in-range');
    if (cell && root.contains(cell)) paintAt(cell);
  }

  function endPaint(e) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    painting = false;
    activePointerId = null;
    root.classList.remove('is-painting');
  }

  function onPointerDown(e) {
    const cell = e.target.closest('.day-cell.in-range');
    if (!cell || !root.contains(cell)) return;
    e.preventDefault();
    painting = true;
    activePointerId = e.pointerId;
    root.classList.add('is-painting');
    root.setPointerCapture(e.pointerId);
    paintAt(cell);
  }

  function onPointerMove(e) {
    if (!painting || e.pointerId !== activePointerId) return;
    e.preventDefault();
    paintFromPoint(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    if (e.pointerId !== activePointerId) return;
    try {
      root.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    endPaint(e);
  }

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('pointerup', endPaint);
  document.addEventListener('pointercancel', endPaint);

  return () => {
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerUp);
    document.removeEventListener('pointerup', endPaint);
    document.removeEventListener('pointercancel', endPaint);
  };
}

export function buildDayCalendar(container, event, dayMap, options) {
  const {
    brush = 'likely',
    onChange,
    readOnly = false,
    separateMonths = false,
  } = options;

  const inRange = new Set(enumerateDates(event.start_date, event.end_date));
  const state = new Map(dayMap);
  let paintMode = brush;
  let detachPaint = () => {};

  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = separateMonths ? 'day-calendar-months-grid' : 'day-calendar-compact glass-card';

  const paintSurface = document.createElement('div');
  paintSurface.className = separateMonths
    ? 'day-calendar-paint-surface day-calendar-paint-surface--separate'
    : 'day-calendar-paint-surface';

  for (const { year, month } of monthsInRange(event.start_date, event.end_date)) {
    const monthBlock = document.createElement('section');
    monthBlock.className = separateMonths ? 'day-calendar-month glass-card' : 'day-calendar-month';

    const title = document.createElement('h3');
    title.className = 'month-title';
    title.textContent = monthTitle(year, month, event.timezone);
    monthBlock.appendChild(title);

    const weekdayRow = document.createElement('div');
    weekdayRow.className = 'day-calendar-weekdays';
    for (const label of WEEKDAYS) {
      const span = document.createElement('span');
      span.textContent = label;
      weekdayRow.appendChild(span);
    }
    monthBlock.appendChild(weekdayRow);

    const weeksEl = document.createElement('div');
    weeksEl.className = 'day-calendar-weeks';

    for (const week of weeksForMonth(year, month)) {
      const row = document.createElement('div');
      row.className = 'day-calendar-week';
      for (const dateKey of week) {
        row.appendChild(createDayCell(dateKey, state, event, readOnly, inRange));
      }
      weeksEl.appendChild(row);
    }

    monthBlock.appendChild(weeksEl);
    paintSurface.appendChild(monthBlock);
  }

  root.appendChild(paintSurface);
  container.appendChild(root);

  detachPaint = attachPaintHandlers(
    paintSurface,
    state,
    event,
    () => paintMode,
    onChange,
    readOnly,
    inRange
  );

  return {
    setBrush(mode) {
      paintMode = mode;
    },
    getDays() {
      return new Map(state);
    },
    setDays(map) {
      state.clear();
      for (const [k, v] of map.entries()) state.set(k, v);
      container.querySelectorAll('.day-cell.in-range').forEach((cell) => {
        const conf = state.get(cell.dataset.date);
        cell.className = 'day-cell in-range';
        if (conf) {
          cell.classList.add(conf);
          cell.dataset.confidence = conf;
        } else {
          cell.dataset.confidence = '';
        }
      });
    },
    destroy() {
      detachPaint();
    },
  };
}

export function buildMultiDayCalendar(container, event, participants, slotsByParticipant, options = {}) {
  const { canRemoveGuest, onRemoveGuest } = options;
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'multi-day-calendar';

  for (const p of participants) {
    const slots = slotsByParticipant.get(p.id) || new Map();
    const { days, startHour, endHour } = slotsToDaySelection(slots);

    const section = document.createElement('div');
    section.className = 'participant-calendar-section';

    const header = document.createElement('div');
    header.className = 'participant-grid-header';
    if (p.avatar_url) {
      const img = document.createElement('img');
      img.src = p.avatar_url;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.className = 'avatar-sm';
      img.onerror = () => img.remove();
      header.appendChild(img);
    }
    const name = document.createElement('span');
    name.className = 'participant-grid-name';
    name.textContent = p.display_name + (p.is_organizer ? ' (organizer)' : '');
    header.appendChild(name);

    if (canRemoveGuest?.(p)) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-ghost btn-danger participant-remove-btn';
      removeBtn.textContent = 'Remove guest';
      removeBtn.addEventListener('click', () => onRemoveGuest?.(p));
      header.appendChild(removeBtn);
    }

    section.appendChild(header);

    if (!days.size) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No days selected yet';
      section.appendChild(empty);
    } else {
      const timeNote = document.createElement('p');
      timeNote.className = 'participant-time-range muted';
      timeNote.textContent = `Times: ${formatHourRangeLabel(startHour, endHour)}`;
      section.appendChild(timeNote);

      const calHost = document.createElement('div');
      calHost.className = 'participant-calendar-host';
      buildDayCalendar(calHost, event, days, { readOnly: true, separateMonths: true });
      section.appendChild(calHost);
    }

    wrap.appendChild(section);
  }

  container.appendChild(wrap);
}

function createHeatDayCell(dateKey, count, max, event, inRange) {
  const cell = document.createElement('div');
  cell.className = 'day-cell heat-cell';

  if (!dateKey) {
    cell.classList.add('empty');
    cell.setAttribute('aria-hidden', 'true');
    return cell;
  }

  cell.dataset.date = dateKey;
  const dayNum = parseInt(dateKey.slice(8, 10), 10);
  const dayLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: event.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${dateKey}T12:00:00`));

  if (!inRange.has(dateKey)) {
    cell.classList.add('out-of-range');
    cell.textContent = String(dayNum);
    cell.setAttribute('aria-label', 'Outside event range');
    return cell;
  }

  cell.classList.add('in-range');
  const intensity = max > 0 && count > 0 ? count / max : 0;
  cell.style.background = heatColor(intensity);
  cell.style.color = heatTextColor(intensity);
  cell.style.borderColor = intensity > 0 ? heatColor(intensity) : 'rgba(255,255,255,0.08)';

  const peopleLabel = count === 1 ? '1 person' : `${count} people`;
  cell.setAttribute(
    'aria-label',
    count > 0 ? `${dayLabel}: ${peopleLabel} available` : `${dayLabel}: no availability`
  );
  cell.title = count > 0 ? `${peopleLabel} available` : 'No availability';

  const num = document.createElement('span');
  num.className = 'heat-day-num';
  num.textContent = String(dayNum);
  cell.appendChild(num);

  if (count > 0) {
    const badge = document.createElement('span');
    badge.className = 'heat-day-count';
    badge.textContent = String(count);
    cell.appendChild(badge);
  }

  return cell;
}

export function buildGroupHeatCalendar(container, event, byDate, max) {
  const inRange = new Set(enumerateDates(event.start_date, event.end_date));

  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'day-calendar-months-grid';

  const paintSurface = document.createElement('div');
  paintSurface.className = 'day-calendar-paint-surface day-calendar-paint-surface--separate';

  for (const { year, month } of monthsInRange(event.start_date, event.end_date)) {
    const monthBlock = document.createElement('section');
    monthBlock.className = 'day-calendar-month glass-card';

    const title = document.createElement('h3');
    title.className = 'month-title';
    title.textContent = monthTitle(year, month, event.timezone);
    monthBlock.appendChild(title);

    const weekdayRow = document.createElement('div');
    weekdayRow.className = 'day-calendar-weekdays';
    for (const label of WEEKDAYS) {
      const span = document.createElement('span');
      span.textContent = label;
      weekdayRow.appendChild(span);
    }
    monthBlock.appendChild(weekdayRow);

    const weeksEl = document.createElement('div');
    weeksEl.className = 'day-calendar-weeks';

    for (const week of weeksForMonth(year, month)) {
      const row = document.createElement('div');
      row.className = 'day-calendar-week';
      for (const dateKey of week) {
        const count = dateKey ? byDate.get(dateKey) || 0 : 0;
        row.appendChild(createHeatDayCell(dateKey, count, max, event, inRange));
      }
      weeksEl.appendChild(row);
    }

    monthBlock.appendChild(weeksEl);
    paintSurface.appendChild(monthBlock);
  }

  root.appendChild(paintSurface);
  container.appendChild(root);
}
