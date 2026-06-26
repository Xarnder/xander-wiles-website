/**
 * Mystery countdown — counts down to a fixed instant, then counts up.
 */
(function () {
    'use strict';

    const TARGET_ISO = '2037-07-16T08:11:00+01:00';
    const TARGET_MS = Date.parse(TARGET_ISO);

    const MS_SECOND = 1000;
    const MS_MINUTE = 60 * MS_SECOND;
    const MS_HOUR = 60 * MS_MINUTE;
    const MS_DAY = 24 * MS_HOUR;
    const MS_YEAR = 365.25 * MS_DAY;

    const UNIT_ORDER = ['years', 'days', 'hours', 'minutes', 'seconds'];
    const ALWAYS_VISIBLE_UNITS = new Set(['minutes', 'seconds']);

    const UNIT_LABELS = {
        years: ['year', 'years'],
        days: ['day', 'days'],
        hours: ['hour', 'hours'],
        minutes: ['minute', 'minutes'],
        seconds: ['second', 'seconds'],
    };

    const stageEl = document.getElementById('countdown-stage');
    const displayEl = document.getElementById('countdown-display');
    const canvas = document.getElementById('particle-canvas');
    const audioToggle = document.getElementById('audio-toggle');

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let columns = {};
    let lastSummaryMinute = -1;
    let audioCtx = null;
    let ambientNodes = null;
    let audioEnabled = false;

    if (!Number.isFinite(TARGET_MS)) {
        console.error('Countdown: invalid TARGET_ISO', TARGET_ISO);
        return;
    }

    function getSignedDelta(nowMs) {
        const rawDelta = TARGET_MS - nowMs;
        const mode = rawDelta >= 0 ? 'down' : 'up';
        return { mode, absMs: Math.abs(rawDelta) };
    }

    function decomposeTime(absMs) {
        let remaining = absMs;
        const years = Math.floor(remaining / MS_YEAR);
        remaining -= years * MS_YEAR;
        const days = Math.floor(remaining / MS_DAY);
        remaining -= days * MS_DAY;
        const hours = Math.floor(remaining / MS_HOUR);
        remaining -= hours * MS_HOUR;
        const minutes = Math.floor(remaining / MS_MINUTE);
        remaining -= minutes * MS_MINUTE;
        const seconds = Math.floor(remaining / MS_SECOND);
        return { years, days, hours, minutes, seconds };
    }

    function getUnitLabel(key, value) {
        const pair = UNIT_LABELS[key];
        return value === 1 ? pair[0] : pair[1];
    }

    function getVisibleUnits(parts) {
        return UNIT_ORDER
            .map((key) => ({ key, value: parts[key] }))
            .filter(({ key, value }) => ALWAYS_VISIBLE_UNITS.has(key) || value > 0);
    }

    function formatValue(key, value) {
        if (key === 'years' || key === 'days') {
            return String(value);
        }
        return String(value).padStart(2, '0');
    }

    function buildSummary(parts, mode) {
        const visible = getVisibleUnits(parts);
        const fragment = visible
            .map(({ key, value }) => `${formatValue(key, value)} ${key}`)
            .join(', ');
        return mode === 'down' ? `${fragment} remaining` : `${fragment} elapsed`;
    }

    function ensureColumn(key) {
        if (columns[key]) return columns[key];

        const col = document.createElement('div');
        col.className = 'unit-column';
        col.dataset.unit = key;

        const glowHost = document.createElement('div');
        glowHost.className = 'digit-glow-host';

        const digit = document.createElement('span');
        digit.className = 'digit-value';
        digit.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.className = 'unit-label';

        glowHost.appendChild(digit);
        col.appendChild(glowHost);
        col.appendChild(label);
        displayEl.appendChild(col);

        columns[key] = { col, glowHost, digit, label, value: null };
        return columns[key];
    }

    function removeColumn(key) {
        const column = columns[key];
        if (!column) return;
        const { col } = column;
        col.classList.add('unit-exit');
        let removed = false;
        const remove = () => {
            if (removed) return;
            removed = true;
            col.remove();
        };
        col.addEventListener('transitionend', remove, { once: true });
        window.setTimeout(remove, 500);
        delete columns[key];
    }

    function setDigit(column, key, newValue) {
        const formatted = formatValue(key, newValue);
        if (column.value === formatted) return;

        column.digit.textContent = formatted;
        column.value = formatted;

        if (key === 'seconds' && !reducedMotion) {
            column.glowHost.classList.add('tick-pulse');
            window.setTimeout(() => column.glowHost.classList.remove('tick-pulse'), 400);
        }
    }

    function render() {
        const now = Date.now();
        const { mode, absMs } = getSignedDelta(now);
        const parts = decomposeTime(absMs);
        const visible = getVisibleUnits(parts);
        const visibleKeys = new Set(visible.map((u) => u.key));

        stageEl.classList.toggle('is-elapsed', mode === 'up');

        Object.keys(columns).forEach((key) => {
            if (!visibleKeys.has(key)) removeColumn(key);
        });

        visible.forEach(({ key, value }) => {
            const column = ensureColumn(key);
            setDigit(column, key, value);
            column.label.textContent = getUnitLabel(key, value);
        });

        const order = visible.map((u) => u.key);
        order.forEach((key, index) => {
            const column = columns[key];
            if (column) {
                displayEl.appendChild(column.col);
                column.col.style.order = String(index);
            }
        });

        const totalMinutes = Math.floor(absMs / MS_MINUTE);
        if (totalMinutes !== lastSummaryMinute) {
            lastSummaryMinute = totalMinutes;
            displayEl.setAttribute('aria-label', buildSummary(parts, mode));
        }
    }

    function initParticles() {
        if (!canvas || reducedMotion || typeof initParticleBackground !== 'function') return;

        initParticleBackground(canvas, {
            getHue: () => (stageEl.classList.contains('is-elapsed') ? 280 : 195),
        });
    }

    function createAmbient() {
        if (audioCtx) return;

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        const master = audioCtx.createGain();
        master.gain.value = 0;
        master.connect(audioCtx.destination);

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 520;
        filter.Q.value = 0.6;
        filter.connect(master);

        const oscA = audioCtx.createOscillator();
        oscA.type = 'sine';
        oscA.frequency.value = 55;

        const oscB = audioCtx.createOscillator();
        oscB.type = 'sine';
        oscB.frequency.value = 82.5;

        const lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.04;

        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 18;
        lfo.connect(lfoGain);
        lfoGain.connect(oscA.frequency);
        lfoGain.connect(oscB.frequency);

        const mix = audioCtx.createGain();
        mix.gain.value = 0.12;

        oscA.connect(mix);
        oscB.connect(mix);
        mix.connect(filter);

        oscA.start();
        oscB.start();
        lfo.start();

        ambientNodes = { master, oscA, oscB, lfo };
    }

    function setAudioEnabled(enabled) {
        audioEnabled = enabled;
        audioToggle.setAttribute('aria-pressed', String(enabled));
        audioToggle.classList.toggle('is-audio-on', enabled);
        audioToggle.setAttribute(
            'aria-label',
            enabled ? 'Turn ambient sound off' : 'Turn ambient sound on'
        );

        if (!enabled) {
            if (ambientNodes) {
                const now = audioCtx.currentTime;
                ambientNodes.master.gain.cancelScheduledValues(now);
                ambientNodes.master.gain.setValueAtTime(ambientNodes.master.gain.value, now);
                ambientNodes.master.gain.linearRampToValueAtTime(0, now + 0.6);
            }
            return;
        }

        createAmbient();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const now = audioCtx.currentTime;
        ambientNodes.master.gain.cancelScheduledValues(now);
        ambientNodes.master.gain.setValueAtTime(0, now);
        ambientNodes.master.gain.linearRampToValueAtTime(0.35, now + 1.2);
    }

    function initChromeAutoHide() {
        const HIDE_DELAY_MS = 2000;
        const homeBtn = document.querySelector('.home-escape');
        let hideTimer = null;

        function showChrome() {
            document.body.classList.remove('chrome-hidden');
            window.clearTimeout(hideTimer);
            hideTimer = window.setTimeout(() => {
                document.body.classList.add('chrome-hidden');
            }, HIDE_DELAY_MS);
        }

        document.addEventListener('mousemove', showChrome, { passive: true });
        document.addEventListener('touchstart', showChrome, { passive: true });

        if (homeBtn) homeBtn.addEventListener('focus', showChrome);
        if (audioToggle) audioToggle.addEventListener('focus', showChrome);

        showChrome();
    }

    function initAudio() {
        if (!audioToggle) return;

        audioToggle.addEventListener('click', () => {
            setAudioEnabled(!audioEnabled);
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden && audioEnabled && ambientNodes) {
                const now = audioCtx.currentTime;
                ambientNodes.master.gain.cancelScheduledValues(now);
                ambientNodes.master.gain.setValueAtTime(ambientNodes.master.gain.value, now);
                ambientNodes.master.gain.linearRampToValueAtTime(0, now + 0.3);
            } else if (!document.hidden && audioEnabled && ambientNodes) {
                const now = audioCtx.currentTime;
                ambientNodes.master.gain.cancelScheduledValues(now);
                ambientNodes.master.gain.setValueAtTime(0, now);
                ambientNodes.master.gain.linearRampToValueAtTime(0.35, now + 0.8);
            }
        });
    }

    function init() {
        render();
        setInterval(render, 1000);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') render();
        });

        initParticles();
        initAudio();
        initChromeAutoHide();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
