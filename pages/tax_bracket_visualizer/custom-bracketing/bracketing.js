const STORAGE_KEY = 'xw-custom-bracketing-v1';
const SEGMENT_COLORS = ['#38bdf8', '#818cf8', '#2dd4bf', '#4ade80', '#fb923c', '#f472b6'];

const grossInput = document.getElementById('grossInput');
const earnedInput = document.getElementById('earnedInput');
const extraInput = document.getElementById('extraInput');
const currentInput = document.getElementById('currentInput');
const newInput = document.getElementById('newInput');
const changeSentence = document.getElementById('changeSentence');
const salaryCompare = document.getElementById('salaryCompare');
const incomeSpan = document.getElementById('incomeSpan');
const incomeMarkEnd = document.getElementById('incomeMarkEnd');
const incomeMarkLabel = document.getElementById('incomeMarkLabel');
const comparisonEl = document.getElementById('comparison');
const netKicker = document.getElementById('netKicker');
const cardsEl = document.getElementById('cards');
const handlesEl = document.getElementById('bandHandles');
const segmentsEl = document.getElementById('bandSegments');
const incomeMark = document.getElementById('incomeMark');
const band = document.getElementById('band');
const bandTrack = document.getElementById('bandTrack');
const structureError = document.getElementById('structureError');
const resultMessage = document.getElementById('resultMessage');
const netHero = document.getElementById('netHero');
const statsEl = document.getElementById('stats');
const equivalentsEl = document.getElementById('equivalents');
const breakdownBody = document.getElementById('breakdownBody');
const form = document.getElementById('bracketing');

const wholePounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const pencePounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const grouped = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

const DEDUCTION_COLORS = [
    { hex: '#f87171', rgb: '248, 113, 113' },
    { hex: '#fb923c', rgb: '251, 146, 60' },
    { hex: '#2dd4bf', rgb: '45, 212, 191' },
    { hex: '#818cf8', rgb: '129, 140, 248' },
    { hex: '#f472b6', rgb: '244, 114, 182' },
    { hex: '#38bdf8', rgb: '56, 189, 248' },
    { hex: '#facc15', rgb: '250, 204, 21' }
];

let state = loadState();
let drag = null;
let chartMode = 'average';
let shareChart = null;
let netChart = null;

function loadState() {
    const fallback = exampleState();
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.brackets) || !parsed.brackets.length) return fallback;
        const usable = parsed.brackets.every(function (bracket) {
            return bracket && typeof bracket.from === 'number' && Array.isArray(bracket.deductions);
        });
        if (!usable) return fallback;
        return {
            mode: parsed.mode === 'additional' || parsed.mode === 'difference' ? parsed.mode : 'total',
            grossText: parsed.grossText != null ? String(parsed.grossText) : fallback.grossText,
            earnedText: parsed.earnedText != null ? String(parsed.earnedText) : fallback.earnedText,
            extraText: parsed.extraText != null ? String(parsed.extraText) : fallback.extraText,
            currentText: parsed.currentText != null ? String(parsed.currentText) : fallback.currentText,
            newText: parsed.newText != null ? String(parsed.newText) : fallback.newText,
            brackets: CustomBrackets.cloneBrackets(parsed.brackets)
        };
    } catch (error) {
        return fallback;
    }
}

function exampleState() {
    const example = CustomBrackets.exampleConfig();
    return {
        mode: 'total',
        grossText: String(example.gross),
        earnedText: '13000',
        extraText: '7000',
        currentText: '30000',
        newText: '40000',
        brackets: example.brackets
    };
}

function persist() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            mode: state.mode,
            grossText: state.grossText,
            earnedText: state.earnedText,
            extraText: state.extraText,
            currentText: state.currentText,
            newText: state.newText,
            brackets: state.brackets
        }));
    } catch (error) {
        /* The calculator still works if storage is unavailable. */
    }
}

function formatMoney(value) {
    const rounded = CustomBrackets.roundMoney(value);
    const whole = Math.abs(rounded - Math.round(rounded)) < 0.001;
    return (whole ? wholePounds : pencePounds).format(rounded);
}

function formatGrouped(value) {
    return grouped.format(CustomBrackets.roundMoney(value));
}

function formatRate(value) {
    return String(CustomBrackets.roundRate(value));
}

function formatPercent(value) {
    const rounded = CustomBrackets.roundRate(value);
    const text = Math.abs(rounded - Math.round(rounded)) < 0.0001
        ? String(Math.round(rounded))
        : String(rounded);
    return text + '%';
}

function rangeLabel(bracket, upperOverride) {
    const upper = upperOverride === undefined ? bracket.to : upperOverride;
    if (upper == null) return formatMoney(bracket.from) + ' and above';
    return formatMoney(bracket.from) + ' – ' + formatMoney(upper);
}

function parsedMoney(text, emptyMessage, invalidMessage) {
    const parsed = CustomBrackets.parseAmount(text);
    if (parsed.empty) return { ok: false, error: emptyMessage };
    if (parsed.invalid || parsed.value < 0) return { ok: false, error: invalidMessage };
    return { ok: true, value: parsed.value };
}

function parsedGross() {
    return parsedMoney(state.grossText, 'Enter a gross income.', 'That income does not look like a number.');
}

function parsedEarned() {
    return parsedMoney(state.earnedText, 'Enter the income you have already earned.', 'Income already earned does not look like a number.');
}

function parsedExtra() {
    return parsedMoney(state.extraText, 'Enter the extra income.', 'Extra income does not look like a number.');
}

function parsedCurrent() {
    return parsedMoney(state.currentText, 'Enter the current salary.', 'Current salary does not look like a number.');
}

function parsedNew() {
    return parsedMoney(state.newText, 'Enter the new salary.', 'New salary does not look like a number.');
}

function activeScale() {
    if (drag) return drag.scale;
    const tops = state.brackets.map(function (bracket) { return bracket.to; }).filter(function (value) {
        return value != null;
    });
    const anchors = incomeAnchors();
    const highest = Math.max.apply(null, [0].concat(tops, anchors));
    return Math.max(1000, highest * 1.18);
}

function showError(node, message) {
    if (!node) return;
    node.hidden = !message;
    node.textContent = message || '';
}

function incomeAnchors() {
    if (state.mode === 'additional') {
        const earned = parsedEarned();
        const extra = parsedExtra();
        const values = [];
        if (earned.ok) values.push(earned.value);
        if (earned.ok && extra.ok) values.push(earned.value + extra.value);
        return values;
    }
    if (state.mode === 'difference') {
        const current = parsedCurrent();
        const next = parsedNew();
        const values = [];
        if (current.ok) values.push(current.value);
        if (next.ok) values.push(next.value);
        return values;
    }
    const gross = parsedGross();
    return gross.ok ? [gross.value] : [];
}

function renderAll() {
    grossInput.value = state.grossText;
    earnedInput.value = state.earnedText;
    extraInput.value = state.extraText;
    currentInput.value = state.currentText;
    newInput.value = state.newText;
    applyModeVisibility();
    renderSlider();
    renderCards();
    renderResults();
}

function applyModeVisibility() {
    const mode = state.mode;
    document.getElementById('totalFields').hidden = mode !== 'total';
    document.getElementById('additionalFields').hidden = mode !== 'additional';
    document.getElementById('differenceFields').hidden = mode !== 'difference';
    document.getElementById('modeTotal').setAttribute('aria-pressed', mode === 'total' ? 'true' : 'false');
    document.getElementById('modeAdditional').setAttribute('aria-pressed', mode === 'additional' ? 'true' : 'false');
    document.getElementById('modeDifference').setAttribute('aria-pressed', mode === 'difference' ? 'true' : 'false');
    comparisonEl.hidden = mode !== 'additional';
    salaryCompare.hidden = mode !== 'difference';
    changeSentence.hidden = mode !== 'difference';
    netKicker.textContent = mode === 'additional'
        ? 'Additional net income'
        : (mode === 'difference' ? 'Take-home change' : 'Net income');
    document.getElementById('breakdownHeading').textContent = mode === 'additional'
        ? 'How the extra income is worked out'
        : (mode === 'difference' ? 'Where the salary change falls' : 'How this is worked out');
    document.getElementById('breakdownNote').textContent = mode === 'additional'
        ? 'Each row is only the extra income that falls inside that band.'
        : (mode === 'difference'
            ? 'Each row is the part of the salary change that falls inside that band.'
            : 'Each row is only the income that falls inside that band. The cut is not applied to the whole salary.');
    document.getElementById('sliceHeading').textContent = mode === 'additional'
        ? 'Extra income in bracket'
        : (mode === 'difference' ? 'Salary change in bracket' : 'Income in bracket');
    document.getElementById('bandNote').textContent = mode === 'difference'
        ? 'Drag the green handles to compare the two incomes. The green stretch is drawn wider than the rest of the slider so those handles stay easy to grab.'
        : (mode === 'additional'
            ? 'Drag the green handles to move income already earned and the end of the extra income. The green stretch is drawn wider than the rest of the slider so those handles stay easy to grab.'
            : 'Drag a boundary, or type an exact amount and press Enter. The last band continues upward with no limit. Each percentage applies only to the income inside its band.');
}

function linearMap(scale) {
    return {
        scale: scale,
        expanded: false,
        toPercent: function (value) {
            if (!scale) return 0;
            return Math.min(100, Math.max(0, (value / scale) * 100));
        },
        toValue: function (ratio) {
            return Math.min(1, Math.max(0, ratio)) * scale;
        }
    };
}

function sliderSpan() {
    if (state.mode === 'additional') {
        const earned = parsedEarned();
        const extra = parsedExtra();
        if (!earned.ok || !extra.ok || extra.value <= 0) return null;
        return { start: earned.value, end: earned.value + extra.value };
    }
    if (state.mode === 'difference') {
        const current = parsedCurrent();
        const next = parsedNew();
        if (!current.ok || !next.ok) return null;
        const start = Math.min(current.value, next.value);
        const end = Math.max(current.value, next.value);
        if (!(end > start)) return null;
        return { start: start, end: end };
    }
    return null;
}

function buildSliderMap() {
    const scale = activeScale();
    const span = sliderSpan();
    if (!span || scale <= 0) return linearMap(scale);

    const start = Math.min(scale, Math.max(0, span.start));
    const end = Math.min(scale, Math.max(start, span.end));
    const extraMoney = end - start;
    if (extraMoney <= 0) return linearMap(scale);

    const beforeMoney = start;
    const afterMoney = Math.max(0, scale - end);
    const naturalShare = extraMoney / scale;
    const extraShare = Math.max(naturalShare, 0.62);
    const restShare = 1 - extraShare;
    const restMoney = beforeMoney + afterMoney;
    const beforeShare = restMoney > 0 ? restShare * (beforeMoney / restMoney) : 0;
    const afterShare = restMoney > 0 ? restShare * (afterMoney / restMoney) : restShare;

    return {
        scale: scale,
        expanded: true,
        start: start,
        end: end,
        toPercent: function (value) {
            const amount = Math.min(scale, Math.max(0, value));
            if (amount <= start) {
                if (beforeMoney <= 0) return 0;
                return (amount / beforeMoney) * beforeShare * 100;
            }
            if (amount <= end) {
                return (beforeShare + ((amount - start) / extraMoney) * extraShare) * 100;
            }
            if (afterMoney <= 0) return 100;
            return (beforeShare + extraShare + ((amount - end) / afterMoney) * afterShare) * 100;
        },
        toValue: function (ratio) {
            const t = Math.min(1, Math.max(0, ratio));
            if (t <= beforeShare || beforeShare === 0 && t === 0) {
                if (beforeShare <= 0) return start;
                return (t / beforeShare) * beforeMoney;
            }
            if (t <= beforeShare + extraShare) {
                return start + ((t - beforeShare) / extraShare) * extraMoney;
            }
            if (afterShare <= 0) return end;
            return end + ((t - beforeShare - extraShare) / afterShare) * afterMoney;
        }
    };
}

function currentMap() {
    if (drag && drag.layout) return drag.layout;
    return buildSliderMap();
}

function trackLeft(percent) {
    return 'calc(12px + (100% - 24px) * ' + (percent / 100) + ')';
}

function renderSlider() {
    handlesEl.replaceChildren();
    state.brackets.slice(0, -1).forEach(function (bracket, index) {
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'band-handle';
        handle.dataset.handle = String(index);
        handle.setAttribute('role', 'slider');
        handle.setAttribute('aria-label', 'Boundary ' + formatMoney(bracket.to));
        handle.setAttribute('aria-valuemin', String(bracket.from));
        handle.setAttribute('aria-valuenow', String(bracket.to));
        const nextLimit = state.brackets[index + 1].to;
        handle.setAttribute('aria-valuemax', nextLimit == null ? '' : String(nextLimit));

        const label = document.createElement('span');
        label.className = 'handle-label';
        label.textContent = formatMoney(bracket.to);
        handle.appendChild(label);

        handle.addEventListener('pointerdown', onHandlePointerDown);
        handle.addEventListener('keydown', onHandleKeyDown);
        handlesEl.appendChild(handle);
    });
    positionHandles();
}

function positionHandles() {
    const map = currentMap();
    const scroll = document.getElementById('bandScroll');
    const scrollStyle = window.getComputedStyle(scroll);
    const contentWidth = (scroll.clientWidth || 0) - parseFloat(scrollStyle.paddingLeft) - parseFloat(scrollStyle.paddingRight);
    const minWidth = Math.max(contentWidth, (state.brackets.length - 1) * 130, 280);
    band.style.minWidth = minWidth + 'px';

    segmentsEl.replaceChildren();
    state.brackets.forEach(function (bracket, index) {
        const start = map.toPercent(bracket.from);
        const end = bracket.to == null ? 100 : map.toPercent(bracket.to);
        const segment = document.createElement('div');
        segment.className = 'band-segment';
        segment.style.left = Math.max(0, start) + '%';
        segment.style.width = Math.max(0, end - start) + '%';
        segment.style.background = SEGMENT_COLORS[index % SEGMENT_COLORS.length];
        segmentsEl.appendChild(segment);
    });

    const handles = handlesEl.querySelectorAll('.band-handle');
    const positions = [];
    handles.forEach(function (handle) {
        const index = Number(handle.dataset.handle);
        const value = state.brackets[index].to;
        const percent = map.toPercent(value);
        positions.push(percent);
        handle.style.left = trackLeft(percent);
        handle.setAttribute('aria-valuenow', String(value));
        handle.setAttribute('aria-label', 'Boundary ' + formatMoney(value));
        const label = handle.querySelector('.handle-label');
        label.textContent = formatMoney(value);
        const previous = positions[positions.length - 2];
        label.hidden = previous != null && percent - previous < 8;
    });

    placeIncomeMarks(map);
}

function placeIncomeMarks(map) {
    incomeMark.hidden = true;
    incomeMarkEnd.hidden = true;
    incomeSpan.hidden = true;
    incomeMark.classList.remove('is-handle');
    incomeMarkEnd.classList.remove('is-handle');
    incomeMark.tabIndex = -1;
    incomeMarkEnd.tabIndex = -1;
    incomeMark.removeAttribute('role');
    incomeMarkEnd.removeAttribute('role');
    incomeMark.removeAttribute('aria-label');
    incomeMarkEnd.removeAttribute('aria-label');
    incomeMark.removeAttribute('aria-valuenow');
    incomeMarkEnd.removeAttribute('aria-valuenow');
    incomeSpan.classList.remove('is-wide');
    incomeMarkLabel.hidden = false;
    document.getElementById('bandScroll').classList.remove('has-income-labels');

    if (state.mode === 'difference') {
        placeSalaryHandles(map);
        return;
    }

    if (state.mode !== 'additional') {
        const gross = parsedGross();
        if (!gross.ok || gross.value <= 0) return;
        const percent = map.toPercent(gross.value);
        incomeMark.hidden = false;
        incomeMark.style.left = trackLeft(percent);
        incomeMarkLabel.textContent = 'Income';
        return;
    }

    const earned = parsedEarned();
    const extra = parsedExtra();
    if (!earned.ok) return;
    const startPercent = map.toPercent(earned.value);
    incomeMark.hidden = false;
    incomeMark.classList.add('is-handle');
    document.getElementById('bandScroll').classList.add('has-income-labels');
    incomeMark.tabIndex = 0;
    incomeMark.setAttribute('role', 'slider');
    incomeMark.style.left = trackLeft(startPercent);
    incomeMarkLabel.textContent = 'Already ' + formatMoney(earned.value);
    incomeMark.dataset.incomeHandle = 'earned';
    incomeMark.setAttribute('aria-label', 'Already earned ' + formatMoney(earned.value));
    incomeMark.setAttribute('aria-valuenow', String(earned.value));
    if (!extra.ok || extra.value <= 0) return;

    const endValue = earned.value + extra.value;
    const endPercent = map.toPercent(endValue);
    incomeMarkEnd.hidden = false;
    incomeMarkEnd.classList.add('is-handle');
    incomeMarkEnd.tabIndex = 0;
    incomeMarkEnd.setAttribute('role', 'slider');
    incomeMarkEnd.style.left = trackLeft(endPercent);
    incomeMarkEnd.dataset.incomeHandle = 'extra';
    document.getElementById('incomeMarkEndLabel').textContent = 'After ' + formatMoney(endValue);
    incomeMarkEnd.setAttribute('aria-label', 'End of extra income ' + formatMoney(endValue));
    incomeMarkEnd.setAttribute('aria-valuenow', String(endValue));
    if (endPercent <= startPercent) return;
    incomeSpan.hidden = false;
    incomeSpan.classList.toggle('is-wide', map.expanded);
    incomeSpan.style.left = trackLeft(startPercent);
    incomeSpan.style.right = 'calc(12px + (100% - 24px) * ' + ((100 - endPercent) / 100) + ')';
}

function placeSalaryHandles(map) {
    const current = parsedCurrent();
    const next = parsedNew();
    document.getElementById('bandScroll').classList.add('has-income-labels');
    if (current.ok) showIncomeHandle(incomeMark, incomeMarkLabel, current.value, 'Current', 'Current salary', 'current', map);
    if (!next.ok) return;
    showIncomeHandle(incomeMarkEnd, document.getElementById('incomeMarkEndLabel'), next.value, 'New', 'New salary', 'new', map);
    if (!current.ok) return;
    const startPercent = map.toPercent(Math.min(current.value, next.value));
    const endPercent = map.toPercent(Math.max(current.value, next.value));
    if (Math.abs(endPercent - startPercent) < 14) incomeMarkLabel.hidden = true;
    if (endPercent <= startPercent) return;
    incomeSpan.hidden = false;
    incomeSpan.classList.toggle('is-wide', map.expanded);
    incomeSpan.style.left = trackLeft(startPercent);
    incomeSpan.style.right = 'calc(12px + (100% - 24px) * ' + ((100 - endPercent) / 100) + ')';
}

function showIncomeHandle(handle, label, value, name, aria, kind, map) {
    const percent = map.toPercent(value);
    handle.hidden = false;
    handle.classList.add('is-handle');
    handle.tabIndex = 0;
    handle.setAttribute('role', 'slider');
    handle.dataset.incomeHandle = kind;
    handle.style.left = trackLeft(percent);
    label.hidden = false;
    label.textContent = name + ' ' + formatMoney(value);
    handle.setAttribute('aria-label', aria + ' ' + formatMoney(value));
    handle.setAttribute('aria-valuenow', String(value));
}

function renderCards() {
    cardsEl.replaceChildren();
    state.brackets.forEach(function (bracket, index) {
        const card = document.createElement('article');
        card.className = 'bracket-card';
        card.dataset.card = String(index);

        const head = document.createElement('div');
        head.className = 'card-head';
        const title = document.createElement('h3');
        title.dataset.range = String(index);
        title.textContent = rangeLabel(bracket);
        head.appendChild(title);
        if (state.brackets.length > 1) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'quiet-btn';
            remove.dataset.removeBracket = String(index);
            remove.textContent = 'Remove bracket';
            head.appendChild(remove);
        }
        card.appendChild(head);

        if (bracket.to != null) {
            const field = document.createElement('label');
            field.className = 'boundary-field';
            field.textContent = 'Upper boundary';
            const input = document.createElement('input');
            input.type = 'text';
            input.inputMode = 'decimal';
            input.autocomplete = 'off';
            input.spellcheck = false;
            input.dataset.boundary = String(index);
            input.value = formatGrouped(bracket.to);
            input.setAttribute('aria-describedby', 'boundary-error-' + index);
            field.appendChild(input);
            const error = document.createElement('p');
            error.className = 'field-error';
            error.id = 'boundary-error-' + index;
            error.hidden = true;
            field.appendChild(error);
            card.appendChild(field);
        } else {
            const note = document.createElement('p');
            note.className = 'section-note';
            note.textContent = 'This band has no upper limit.';
            card.appendChild(note);
        }

        const list = document.createElement('div');
        list.className = 'deduction-list';
        if (!bracket.deductions.length) {
            const empty = document.createElement('p');
            empty.className = 'section-note';
            empty.textContent = 'No deductions in this band, so the income here is kept in full.';
            list.appendChild(empty);
        }
        bracket.deductions.forEach(function (deduction, deductionIndex) {
            list.appendChild(deductionRow(index, deduction, deductionIndex));
        });
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'text-btn';
        add.dataset.addDeduction = String(index);
        add.textContent = 'Add deduction';
        list.appendChild(add);
        card.appendChild(list);

        const totals = document.createElement('div');
        totals.className = 'totals';
        totals.appendChild(percentField('Total deducted', 'cut', index, CustomBrackets.deductionRate(bracket.deductions)));
        totals.appendChild(percentField('You keep', 'keep', index, CustomBrackets.keepRate(bracket.deductions)));
        card.appendChild(totals);

        const summary = document.createElement('p');
        summary.className = 'keep-note';
        summary.dataset.summary = String(index);
        summary.textContent = summaryText(bracket);
        card.appendChild(summary);

        const cardError = document.createElement('p');
        cardError.className = 'field-error';
        cardError.dataset.cardError = String(index);
        cardError.hidden = true;
        card.appendChild(cardError);
        cardsEl.appendChild(card);
        refreshCardError(index);
    });
}

function deductionRow(bracketIndex, deduction, deductionIndex) {
    const row = document.createElement('div');
    row.className = 'deduction-row';

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name';
    const name = document.createElement('input');
    name.type = 'text';
    name.autocomplete = 'off';
    name.dataset.name = deduction.id;
    name.dataset.bracket = String(bracketIndex);
    name.value = deduction.name || '';
    name.placeholder = CustomBrackets.deductionLabel({ name: '' }, deductionIndex);
    nameLabel.appendChild(name);

    const rateLabel = document.createElement('label');
    rateLabel.textContent = 'Rate';
    const wrap = document.createElement('div');
    wrap.className = 'rate-wrap';
    const rate = document.createElement('input');
    rate.type = 'text';
    rate.inputMode = 'decimal';
    rate.autocomplete = 'off';
    rate.dataset.rate = deduction.id;
    rate.dataset.bracket = String(bracketIndex);
    rate.value = formatRate(deduction.rate);
    rate.setAttribute('aria-describedby', 'rate-error-' + deduction.id);
    const suffix = document.createElement('span');
    suffix.className = 'rate-suffix';
    suffix.textContent = '%';
    wrap.appendChild(rate);
    wrap.appendChild(suffix);
    rateLabel.appendChild(wrap);
    const rateError = document.createElement('p');
    rateError.className = 'field-error';
    rateError.id = 'rate-error-' + deduction.id;
    rateError.hidden = true;
    rateLabel.appendChild(rateError);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.dataset.removeDeduction = deduction.id;
    remove.dataset.bracket = String(bracketIndex);
    remove.setAttribute('aria-label', 'Remove ' + CustomBrackets.deductionLabel(deduction, deductionIndex));
    remove.textContent = '×';

    row.appendChild(nameLabel);
    row.appendChild(rateLabel);
    row.appendChild(remove);
    return row;
}

function percentField(labelText, kind, index, value) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const wrap = document.createElement('div');
    wrap.className = 'rate-wrap';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.dataset[kind] = String(index);
    input.value = formatRate(value);
    input.setAttribute('aria-describedby', kind + '-error-' + index);
    const suffix = document.createElement('span');
    suffix.className = 'rate-suffix';
    suffix.textContent = '%';
    wrap.appendChild(input);
    wrap.appendChild(suffix);
    label.appendChild(wrap);
    const error = document.createElement('p');
    error.className = 'field-error';
    error.id = kind + '-error-' + index;
    error.hidden = true;
    label.appendChild(error);
    return label;
}

function summaryText(bracket) {
    const total = CustomBrackets.deductionRate(bracket.deductions);
    if (total > 100) {
        return 'Total deduction: ' + formatPercent(total) + '. Bring this down to 100% or less.';
    }
    return 'Total deduction: ' + formatPercent(total) + '. You keep: ' + formatPercent(CustomBrackets.keepRate(bracket.deductions)) + '.';
}

function refreshCardError(index) {
    const node = document.querySelector('[data-card-error="' + index + '"]');
    const total = CustomBrackets.deductionRate(state.brackets[index].deductions);
    if (total > 100) {
        showError(node, 'Total deductions in this bracket cannot exceed 100%.');
    } else {
        showError(node, '');
    }
}

function refreshSummary(index) {
    const bracket = state.brackets[index];
    const summary = document.querySelector('[data-summary="' + index + '"]');
    if (summary) summary.textContent = summaryText(bracket);
    const cut = document.querySelector('[data-cut="' + index + '"]');
    const keep = document.querySelector('[data-keep="' + index + '"]');
    if (cut && document.activeElement !== cut) cut.value = formatRate(CustomBrackets.deductionRate(bracket.deductions));
    if (keep && document.activeElement !== keep) keep.value = formatRate(CustomBrackets.keepRate(bracket.deductions));
    refreshCardError(index);
}

function updateRangeLabels() {
    state.brackets.forEach(function (bracket, index) {
        const title = document.querySelector('[data-range="' + index + '"]');
        if (title) title.textContent = rangeLabel(bracket);
    });
}

function renderResults() {
    const view = state.mode === 'additional'
        ? renderAdditionalResults()
        : (state.mode === 'difference' ? renderDifferenceResults() : renderTotalResults());
    if (!drag) {
        positionHandles();
        updateVisuals(view);
    }
}

function renderTotalResults() {
    clearSalaryCompare();
    netHero.classList.remove('is-decrease');
    const gross = parsedGross();
    showError(document.getElementById('grossError'), gross.ok ? '' : gross.error);
    const result = gross.ok
        ? CustomBrackets.calculateCustomNetIncome(gross.value, state.brackets)
        : emptyResult(gross.error);
    const figure = result.ok ? formatMoney(result.net) : '—';

    if (!result.ok) {
        netHero.textContent = '—';
        showError(resultMessage, result.errors.join(' '));
    } else {
        netHero.textContent = figure;
        showError(resultMessage, '');
    }

    const effective = result.ok ? result.effectiveRate.toFixed(1) + '%' : '—';
    const keep = result.ok ? result.keepRate.toFixed(1) + '%' : '—';
    statsEl.replaceChildren(
        stat('Gross income', result.ok ? formatMoney(result.gross) : '—', false),
        stat('Total deductions', result.ok ? formatMoney(result.totalDeducted) : '—', false),
        stat('Net income', result.ok ? formatMoney(result.net) : '—', true),
        stat('Effective deduction rate', effective, false),
        stat('You keep', keep, true)
    );
    comparisonEl.replaceChildren();
    fillEquivalents(result.ok ? result.equivalents : null, 'Annual net income', 'Monthly net income', 'Weekly net income');
    renderBreakdown(result.ok ? result.rows : null, result.ok ? '' : 'The breakdown appears once the income and brackets are valid.');
    return {
        ok: result.ok,
        rows: result.ok ? result.rows : null,
        net: result.ok ? result.net : 0,
        marker: result.ok ? result.gross : null,
        earned: null,
        formulaNote: 'Each band is multiplied by the share you keep. The cut applies only to the income inside that band.',
        deductionNote: 'Each deduction is worked out on the income that falls inside its band.',
        curveNote: 'How much you keep as income rises through your brackets.',
        emptyMessage: result.ok ? '' : 'The breakdown appears once the income and brackets are valid.'
    };
}

function renderAdditionalResults() {
    clearSalaryCompare();
    netHero.classList.remove('is-decrease');
    const earned = parsedEarned();
    const extra = parsedExtra();
    showError(document.getElementById('earnedError'), earned.ok ? '' : earned.error);
    showError(document.getElementById('extraError'), extra.ok ? '' : extra.error);
    updateAdditionalHint(extra);

    const result = earned.ok && extra.ok
        ? CustomBrackets.calculateAdditionalNetIncome(earned.value, extra.value, state.brackets)
        : emptyResult(!earned.ok ? earned.error : extra.error);

    if (!result.ok) {
        netHero.textContent = '—';
        showError(resultMessage, result.errors.join(' '));
    } else {
        netHero.textContent = formatMoney(result.additionalNet);
        showError(resultMessage, '');
    }

    const effective = result.ok ? formatShare(result.effectiveDeductionRate) : '—';
    const keep = result.ok ? formatShare(result.keepRate) : '—';
    statsEl.replaceChildren(
        stat('Additional gross income', result.ok ? formatMoney(result.additionalGross) : '—', false),
        stat('Deductions on additional income', result.ok ? formatMoney(result.additionalDeductions) : '—', false),
        stat('Additional net income', result.ok ? formatMoney(result.additionalNet) : '—', true),
        stat('Effective deduction rate', effective, false),
        stat('You keep', keep, true)
    );
    comparisonEl.replaceChildren(
        stat('Income before additional earnings', result.ok ? formatMoney(result.currentIncome) : '—', false),
        stat('Income after additional earnings', result.ok ? formatMoney(result.finalGrossIncome) : '—', false),
        stat('Additional take-home income', result.ok ? formatMoney(result.additionalNet) : '—', true)
    );
    fillEquivalents(
        result.ok ? result.equivalents : null,
        'Additional net each year',
        'Additional net each month',
        'Additional net each week'
    );
    const emptyNote = result.ok && !result.breakdown.length
        ? 'Enter extra income to see how it falls across the bands.'
        : 'The breakdown appears once the income and brackets are valid.';
    renderBreakdown(result.ok ? result.breakdown : null, emptyNote);
    return {
        ok: result.ok,
        rows: result.ok ? result.breakdown : null,
        net: result.ok ? result.additionalNet : 0,
        marker: result.ok ? result.finalGrossIncome : null,
        earned: result.ok ? result.currentIncome : null,
        formulaNote: 'Each slice of the extra income is multiplied by the share you keep in that band.',
        deductionNote: 'These amounts are only the extra income, starting from what you have already earned.',
        curveNote: 'The curve is your take-home at each total income. The marks show income already earned and the end of the extra income.',
        emptyMessage: emptyNote
    };
}

function renderDifferenceResults() {
    const current = parsedCurrent();
    const next = parsedNew();
    showError(document.getElementById('currentError'), current.ok ? '' : current.error);
    showError(document.getElementById('newError'), next.ok ? '' : next.error);
    updateDifferenceHint(current, next);

    const result = current.ok && next.ok
        ? CustomBrackets.calculateIncomeDifference(current.value, next.value, state.brackets)
        : emptyResult(!current.ok ? current.error : next.error);
    const direction = result.ok ? result.direction : 'same';
    const increasing = direction === 'increase';
    const decreasing = direction === 'decrease';

    netKicker.textContent = increasing ? 'Take-home increase' : (decreasing ? 'Take-home decrease' : 'Take-home change');
    netHero.classList.toggle('is-decrease', result.ok && decreasing);
    if (!result.ok) {
        netHero.textContent = '—';
        showError(resultMessage, result.errors.join(' '));
        changeSentence.hidden = true;
        changeSentence.textContent = '';
    } else {
        netHero.textContent = formatSignedMoney(result.netDifference);
        showError(resultMessage, '');
        changeSentence.hidden = false;
        changeSentence.textContent = differenceSentence(result);
    }

    const stats = [
        stat(
            increasing ? 'Gross salary increase' : 'Gross salary change',
            result.ok ? formatSignedMoney(result.grossDifference) : '—',
            false
        ),
        stat(
            increasing ? 'Deductions on the increase' : 'Change in deductions',
            result.ok ? formatSignedMoney(result.deductionsOnDifference) : '—',
            false
        )
    ];
    if (result.ok && increasing) {
        stats.push(stat('You keep from the increase', formatShare(result.keepRateOnIncrease), true));
        stats.push(stat('Effective cut on the increase', formatShare(result.effectiveCutOnIncrease), false));
    }
    statsEl.replaceChildren.apply(statsEl, stats);
    comparisonEl.replaceChildren();
    renderSalaryTable(result);
    fillEquivalents(
        result.ok ? result.equivalents : null,
        increasing ? 'Annual take-home increase' : 'Annual take-home change',
        increasing ? 'Monthly take-home increase' : 'Monthly take-home change',
        increasing ? 'Weekly take-home increase' : 'Weekly take-home change',
        increasing
    );
    document.getElementById('sliceHeading').textContent = decreasing
        ? 'Salary decrease in bracket'
        : (increasing ? 'Salary increase in bracket' : 'Salary change in bracket');
    document.getElementById('breakdownNote').textContent = result.ok
        ? 'Income ' + (decreasing ? 'decrease' : (increasing ? 'increase' : 'change')) + ': ' + formatMoney(result.currentIncome) + ' → ' + formatMoney(result.newIncome) + '. Each row is the part of that change inside one band.'
        : 'Each row is the part of the salary change that falls inside that band.';
    const emptyNote = result.ok && !result.breakdown.length
        ? 'These salaries take home the same amount, so there is no change to split across the bands.'
        : 'The breakdown appears once both salaries and the brackets are valid.';
    renderBreakdown(result.ok ? result.breakdown : null, emptyNote);
    return {
        ok: result.ok,
        rows: result.ok ? result.breakdown : null,
        net: result.ok ? Math.abs(result.netDifference) : 0,
        marker: result.ok ? result.newIncome : null,
        earned: result.ok ? result.currentIncome : null,
        formulaNote: decreasing
            ? 'Each slice is salary given up, multiplied by the share kept in that band. The total is the take-home pay you lose.'
            : 'Each slice of the salary change is multiplied by the share you keep in that band.',
        deductionNote: 'These amounts cover only the change between the two salaries.',
        curveNote: 'The curve is take-home at each gross income. The marks show the current salary and the new salary.',
        emptyMessage: emptyNote
    };
}

function clearSalaryCompare() {
    changeSentence.hidden = true;
    changeSentence.textContent = '';
    salaryCompare.hidden = true;
    salaryCompare.replaceChildren();
}

function renderSalaryTable(result) {
    salaryCompare.replaceChildren();
    if (!result.ok) {
        salaryCompare.hidden = true;
        return;
    }
    salaryCompare.hidden = false;
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['', 'Current', 'New'].forEach(function (label) {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = label;
        headRow.appendChild(th);
    });
    head.appendChild(headRow);
    const body = document.createElement('tbody');
    [
        ['Gross income', result.currentIncome, result.newIncome],
        ['Net income', result.currentNet, result.newNet],
        ['Total deductions', result.currentDeductions, result.newDeductions]
    ].forEach(function (row) {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = row[0];
        tr.appendChild(th);
        tr.appendChild(cell(formatMoney(row[1]), true));
        tr.appendChild(cell(formatMoney(row[2]), true));
        body.appendChild(tr);
    });
    table.appendChild(head);
    table.appendChild(body);
    salaryCompare.appendChild(table);
}

function differenceSentence(result) {
    const monthly = formatMoney(Math.abs(result.equivalents.monthly));
    const from = formatMoney(result.currentIncome);
    const to = formatMoney(result.newIncome);
    if (result.direction === 'increase') {
        return 'Moving from ' + from + ' to ' + to + ' gives you ' + monthly + ' more take-home per month.';
    }
    if (result.direction === 'decrease') {
        return 'Moving from ' + from + ' to ' + to + ' is ' + monthly + ' less take-home per month.';
    }
    return 'These salaries take home the same amount.';
}

function updateDifferenceHint(current, next) {
    const hint = document.getElementById('differenceHint');
    if (current && current.ok && next && next.ok && current.value !== next.value) {
        hint.textContent = 'Moving from ' + formatMoney(current.value) + ' to ' + formatMoney(next.value) + ' changes gross income by ' + formatMoney(Math.abs(next.value - current.value)) + '.';
        return;
    }
    hint.textContent = 'Compare two gross incomes and see how much of the change you actually keep.';
}

function formatSignedMoney(value) {
    const rounded = CustomBrackets.roundMoney(value);
    const money = formatMoney(Math.abs(rounded));
    if (rounded > 0) return '+' + money;
    if (rounded < 0) return '−' + money;
    return formatMoney(0);
}

function updateAdditionalHint(extra) {
    const hint = document.getElementById('additionalHint');
    if (extra && extra.ok && extra.value > 0) {
        hint.textContent = 'See how much of your next ' + formatMoney(extra.value) + ' you will actually keep based on the income you\'ve already earned.';
        return;
    }
    hint.textContent = 'See how much of your next earnings you will actually keep based on the income you\'ve already earned.';
}

function formatShare(rate) {
    if (!Number.isFinite(rate)) return '—';
    const rounded = Math.round((rate + Number.EPSILON) * 100) / 100;
    if (Math.abs(rounded - Math.round(rounded)) < 0.001) return String(Math.round(rounded)) + '%';
    return rounded.toFixed(2) + '%';
}

function fillEquivalents(equivalents, annualLabel, monthlyLabel, weeklyLabel, highlightAnnual) {
    equivalentsEl.replaceChildren(
        stat(annualLabel, equivalents ? formatMoney(equivalents.annual) : '—', highlightAnnual !== false),
        stat(monthlyLabel, equivalents ? formatMoney(equivalents.monthly) : '—', false),
        stat(weeklyLabel, equivalents ? formatMoney(equivalents.weekly) : '—', false)
    );
    equivalentsEl.querySelectorAll('.stat').forEach(function (node) {
        node.classList.add('equivalent');
    });
}

function emptyResult(message) {
    return {
        ok: false,
        errors: [message],
        equivalents: CustomBrackets.incomeEquivalents(0)
    };
}

function stat(label, value, highlight) {
    const article = document.createElement('article');
    article.className = highlight ? 'stat highlight' : 'stat';
    const heading = document.createElement('h3');
    heading.textContent = label;
    const figure = document.createElement('p');
    figure.textContent = value;
    article.appendChild(heading);
    article.appendChild(figure);
    return article;
}

function renderBreakdown(rows, emptyMessage) {
    breakdownBody.replaceChildren();
    if (!rows || !rows.length) {
        const row = document.createElement('tr');
        const note = document.createElement('td');
        note.colSpan = 5;
        note.textContent = emptyMessage;
        row.appendChild(note);
        breakdownBody.appendChild(row);
        return;
    }

    rows.forEach(function (rowData) {
        const row = document.createElement('tr');
        row.appendChild(cell(breakdownRange(rowData)));
        row.appendChild(cell(formatMoney(rowData.slice), true));

        const cutCell = document.createElement('td');
        cutCell.className = 'num';
        cutCell.appendChild(document.createTextNode(formatPercent(rowData.rate)));
        if (rowData.parts.length > 1) {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = rowData.parts.length + ' deductions';
            details.appendChild(summary);
            const list = document.createElement('ul');
            list.className = 'part-list';
            rowData.parts.forEach(function (part) {
                const item = document.createElement('li');
                item.textContent = part.name + ' ' + formatPercent(part.rate) + ' · ' + formatMoney(part.amount);
                list.appendChild(item);
            });
            details.appendChild(list);
            cutCell.appendChild(details);
        }
        row.appendChild(cutCell);
        row.appendChild(cell(formatMoney(rowData.deducted), true));
        row.appendChild(cell(formatMoney(rowData.kept), true));
        breakdownBody.appendChild(row);
    });
}

function breakdownRange(rowData) {
    const upper = rowData.limit == null || (rowData.to != null && rowData.to < rowData.limit)
        ? rowData.to
        : rowData.limit;
    if (upper == null) return formatMoney(rowData.from) + ' and above';
    return formatMoney(rowData.from) + ' – ' + formatMoney(upper);
}

function cell(text, numeric) {
    const node = document.createElement('td');
    if (numeric) node.className = 'num';
    node.textContent = text;
    return node;
}

function onHandlePointerDown(event) {
    const handle = event.currentTarget;
    const index = Number(handle.dataset.handle);
    drag = {
        kind: 'boundary',
        index: index,
        pointerId: event.pointerId,
        scale: activeScale(),
        layout: buildSliderMap(),
        startX: event.clientX,
        moved: false,
        handle: handle
    };
    handle.classList.add('is-active');
    try {
        handle.setPointerCapture(event.pointerId);
    } catch (error) {
        /* A synthetic pointer cannot be captured. Document listeners still track the drag. */
    }
}

function onHandlePointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > 4) drag.moved = true;
    const rect = bandTrack.getBoundingClientRect();
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    if (drag.kind === 'earned' || drag.kind === 'extra' || drag.kind === 'current' || drag.kind === 'new') {
        moveIncomeHandle(ratio);
        return;
    }
    let value = Math.round(drag.layout.toValue(ratio));
    const bracket = state.brackets[drag.index];
    const nextLimit = state.brackets[drag.index + 1].to;
    const min = CustomBrackets.roundMoney(bracket.from + 0.01);
    const max = nextLimit == null ? drag.scale : CustomBrackets.roundMoney(nextLimit - 0.01);
    value = Math.min(max, Math.max(min, value));
    const updated = CustomBrackets.setBracketEnd(state.brackets, drag.index, value);
    if (!updated.ok) return;
    state.brackets = updated.brackets;
    const input = document.querySelector('[data-boundary="' + drag.index + '"]');
    if (input) input.value = formatGrouped(value);
    updateRangeLabels();
    positionHandles();
    renderResults();
}

function moveIncomeHandle(ratio) {
    const value = Math.max(0, Math.round(drag.layout.toValue(ratio)));
    if (drag.kind === 'current') {
        state.currentText = formatGrouped(value);
        currentInput.value = state.currentText;
    } else if (drag.kind === 'new') {
        state.newText = formatGrouped(value);
        newInput.value = state.newText;
    } else {
        const earned = parsedEarned();
        const extra = parsedExtra();
        const start = earned.ok ? earned.value : 0;
        const extraValue = extra.ok ? extra.value : 0;
        if (drag.kind === 'earned') {
            state.earnedText = formatGrouped(value);
            earnedInput.value = state.earnedText;
            state.extraText = formatGrouped(extraValue);
            extraInput.value = state.extraText;
        } else {
            const end = Math.max(start + 1, value);
            state.extraText = formatGrouped(end - start);
            extraInput.value = state.extraText;
        }
    }
    positionHandles();
    renderResults();
}

function onIncomePointerDown(event) {
    if (!event.currentTarget.classList.contains('is-handle')) return;
    event.preventDefault();
    const handle = event.currentTarget;
    drag = {
        kind: handle.dataset.incomeHandle,
        pointerId: event.pointerId,
        scale: activeScale(),
        layout: buildSliderMap(),
        startX: event.clientX,
        moved: false,
        handle: handle
    };
    handle.classList.add('is-active');
    try {
        handle.setPointerCapture(event.pointerId);
    } catch (error) {
        /* A synthetic pointer cannot be captured. Document listeners still track the drag. */
    }
}

function onIncomeKeyDown(event) {
    if (!event.currentTarget.classList.contains('is-handle')) return;
    const step = event.altKey ? 1 : (event.shiftKey ? 1000 : 100);
    let delta = 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = step;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -step;
    if (!delta) return;
    event.preventDefault();
    const kind = event.currentTarget.dataset.incomeHandle;
    if (kind === 'current' || kind === 'new') {
        const parsed = kind === 'current' ? parsedCurrent() : parsedNew();
        if (!parsed.ok) return;
        const next = Math.max(0, CustomBrackets.roundMoney(parsed.value + delta));
        if (kind === 'current') {
            state.currentText = formatGrouped(next);
            currentInput.value = state.currentText;
        } else {
            state.newText = formatGrouped(next);
            newInput.value = state.newText;
        }
    } else {
        const earned = parsedEarned();
        const extra = parsedExtra();
        if (!earned.ok) return;
        if (kind === 'earned') {
            const next = Math.max(0, CustomBrackets.roundMoney(earned.value + delta));
            state.earnedText = formatGrouped(next);
            earnedInput.value = state.earnedText;
        } else if (extra.ok) {
            const next = Math.max(1, CustomBrackets.roundMoney(extra.value + delta));
            state.extraText = formatGrouped(next);
            extraInput.value = state.extraText;
        }
    }
    persist();
    positionHandles();
    renderResults();
}

function onHandlePointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const handle = drag.handle;
    const moved = drag.moved;
    const kind = drag.kind;
    const index = drag.index;
    drag = null;
    handle.classList.remove('is-active');
    persist();
    renderResults();
    if (!moved) {
        const input = kind === 'earned'
            ? earnedInput
            : (kind === 'extra'
                ? extraInput
                : (kind === 'current'
                    ? currentInput
                    : (kind === 'new' ? newInput : document.querySelector('[data-boundary="' + index + '"]'))));
        if (input) {
            input.focus();
            input.select();
        }
    }
}

function onHandleKeyDown(event) {
    const index = Number(event.currentTarget.dataset.handle);
    const step = event.altKey ? 1 : (event.shiftKey ? 1000 : 100);
    let delta = 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = step;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -step;
    if (!delta) return;
    event.preventDefault();
    const updated = CustomBrackets.setBracketEnd(state.brackets, index, CustomBrackets.roundMoney(state.brackets[index].to + delta));
    if (!updated.ok) {
        showError(structureError, updated.error);
        return;
    }
    showError(structureError, '');
    state.brackets = updated.brackets;
    persist();
    const input = document.querySelector('[data-boundary="' + index + '"]');
    if (input) input.value = formatGrouped(state.brackets[index].to);
    updateRangeLabels();
    positionHandles();
    renderResults();
}

function commitBoundary(input) {
    const index = Number(input.dataset.boundary);
    const errorNode = document.getElementById(input.getAttribute('aria-describedby'));
    const parsed = CustomBrackets.parseAmount(input.value);
    if (parsed.empty) {
        showError(errorNode, 'Enter a boundary.');
        return;
    }
    if (parsed.invalid) {
        showError(errorNode, 'That boundary does not look like a number.');
        return;
    }
    const updated = CustomBrackets.setBracketEnd(state.brackets, index, parsed.value);
    if (!updated.ok) {
        showError(errorNode, updated.error);
        return;
    }
    showError(errorNode, '');
    state.brackets = updated.brackets;
    input.value = formatGrouped(parsed.value);
    persist();
    updateRangeLabels();
    positionHandles();
    renderResults();
}

function commitRate(input) {
    const errorNode = document.getElementById(input.getAttribute('aria-describedby'));
    const index = Number(input.dataset.bracket);
    const deduction = state.brackets[index].deductions.find(function (item) {
        return item.id === input.dataset.rate;
    });
    if (!deduction) return;
    const parsed = CustomBrackets.parsePercent(input.value);
    if (parsed.empty) {
        deduction.rate = 0;
        showError(errorNode, '');
    } else if (parsed.invalid) {
        showError(errorNode, parsed.negative ? 'Percentages cannot be negative.' : 'Enter a percentage.');
        renderResults();
        return;
    } else {
        deduction.rate = parsed.value;
        showError(errorNode, '');
    }
    persist();
    refreshSummary(index);
    renderResults();
}

function commitShare(input, kind) {
    const index = Number(input.dataset[kind]);
    const errorNode = document.getElementById(input.getAttribute('aria-describedby'));
    const parsed = CustomBrackets.parsePercent(input.value);
    if (parsed.empty || parsed.invalid) {
        showError(errorNode, parsed.negative ? 'Percentages cannot be negative.' : 'Enter a percentage.');
        return;
    }
    const updated = kind === 'keep'
        ? CustomBrackets.setBracketKeep(state.brackets, index, parsed.value)
        : CustomBrackets.setBracketCut(state.brackets, index, parsed.value);
    if (!updated.ok) {
        showError(errorNode, updated.error);
        return;
    }
    showError(errorNode, '');
    state.brackets = updated.brackets;
    persist();
    syncDeductionRates(index);
    refreshSummary(index);
    renderResults();
}

function syncDeductionRates(index) {
    state.brackets[index].deductions.forEach(function (deduction) {
        const input = document.querySelector('[data-rate="' + deduction.id + '"]');
        if (input && document.activeElement !== input) input.value = formatRate(deduction.rate);
    });
}

function removeBracket(index) {
    const updated = CustomBrackets.removeBracket(state.brackets, index);
    if (!updated.ok) {
        showError(structureError, updated.error);
        return;
    }
    showError(structureError, '');
    state.brackets = updated.brackets;
    persist();
    renderSlider();
    renderCards();
    renderResults();
}

function addBoundary() {
    const updated = CustomBrackets.addBoundary(state.brackets);
    if (!updated.ok) {
        showError(structureError, updated.error);
        return;
    }
    showError(structureError, '');
    state.brackets = updated.brackets;
    persist();
    renderSlider();
    renderCards();
    renderResults();
    const newest = state.brackets[state.brackets.length - 2];
    const input = newest ? document.querySelector('[data-boundary="' + (state.brackets.length - 2) + '"]') : null;
    if (input) input.focus();
}

form.addEventListener('submit', function (event) {
    event.preventDefault();
});

grossInput.addEventListener('input', function () {
    state.grossText = grossInput.value;
    persist();
    renderResults();
});

grossInput.addEventListener('blur', function () {
    formatMoneyField(grossInput, function (value) { state.grossText = value; });
});

earnedInput.addEventListener('input', function () {
    state.earnedText = earnedInput.value;
    persist();
    renderResults();
});

earnedInput.addEventListener('blur', function () {
    formatMoneyField(earnedInput, function (value) { state.earnedText = value; });
});

extraInput.addEventListener('input', function () {
    state.extraText = extraInput.value;
    persist();
    renderResults();
});

extraInput.addEventListener('blur', function () {
    formatMoneyField(extraInput, function (value) { state.extraText = value; });
});

currentInput.addEventListener('input', function () {
    state.currentText = currentInput.value;
    persist();
    renderResults();
});

currentInput.addEventListener('blur', function () {
    formatMoneyField(currentInput, function (value) { state.currentText = value; });
});

newInput.addEventListener('input', function () {
    state.newText = newInput.value;
    persist();
    renderResults();
});

newInput.addEventListener('blur', function () {
    formatMoneyField(newInput, function (value) { state.newText = value; });
});

function formatMoneyField(input, assign) {
    const parsed = CustomBrackets.parseAmount(input.value);
    if (parsed.value != null) {
        input.value = formatGrouped(parsed.value);
        assign(input.value);
        persist();
    }
}

document.getElementById('modeTotal').addEventListener('click', function () {
    setIncomeMode('total');
});

document.getElementById('modeAdditional').addEventListener('click', function () {
    setIncomeMode('additional');
});

document.getElementById('modeDifference').addEventListener('click', function () {
    setIncomeMode('difference');
});

function setIncomeMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    persist();
    applyModeVisibility();
    renderResults();
}

cardsEl.addEventListener('input', function (event) {
    const input = event.target;
    if (input.dataset.rate != null) commitRate(input);
    else if (input.dataset.cut != null) commitShare(input, 'cut');
    else if (input.dataset.keep != null) commitShare(input, 'keep');
    else if (input.dataset.name != null) {
        const index = Number(input.dataset.bracket);
        const deduction = state.brackets[index].deductions.find(function (item) {
            return item.id === input.dataset.name;
        });
        if (!deduction) return;
        deduction.name = input.value;
        persist();
        renderResults();
    }
});

cardsEl.addEventListener('focusout', function (event) {
    const input = event.target;
    if (!input || !input.dataset) return;
    if (input.dataset.boundary != null) commitBoundary(input);
    else if (input.dataset.rate != null && input.value.trim() !== '') {
        const parsed = CustomBrackets.parsePercent(input.value);
        if (!parsed.invalid && !parsed.negative) input.value = formatRate(parsed.empty ? 0 : parsed.value);
    } else if ((input.dataset.cut != null || input.dataset.keep != null) && input.value.trim() !== '') {
        const parsed = CustomBrackets.parsePercent(input.value);
        if (!parsed.invalid && !parsed.negative) input.value = formatRate(parsed.value);
    }
});

cardsEl.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || !event.target.dataset || event.target.dataset.boundary == null) return;
    event.preventDefault();
    commitBoundary(event.target);
});

cardsEl.addEventListener('click', function (event) {
    const add = event.target.closest('[data-add-deduction]');
    const removeDeduction = event.target.closest('[data-remove-deduction]');
    const remove = event.target.closest('[data-remove-bracket]');
    if (add) {
        const index = Number(add.dataset.addDeduction);
        const updated = CustomBrackets.addDeduction(state.brackets, index);
        state.brackets = updated.brackets;
        persist();
        renderCards();
        renderResults();
        const created = state.brackets[index].deductions[state.brackets[index].deductions.length - 1];
        const field = document.querySelector('[data-name="' + created.id + '"]');
        if (field) field.focus();
    } else if (removeDeduction) {
        const index = Number(removeDeduction.dataset.bracket);
        const updated = CustomBrackets.removeDeduction(state.brackets, index, removeDeduction.dataset.removeDeduction);
        state.brackets = updated.brackets;
        persist();
        renderCards();
        renderResults();
    } else if (remove) {
        removeBracket(Number(remove.dataset.removeBracket));
    }
});

document.getElementById('chartAverage').addEventListener('click', function () { setChartMode('average'); });
document.getElementById('chartMarginal').addEventListener('click', function () { setChartMode('marginal'); });
document.getElementById('chartPng').addEventListener('click', function () { downloadShareChart('png'); });
document.getElementById('chartJpeg').addEventListener('click', function () { downloadShareChart('jpeg'); });
document.getElementById('addBoundary').addEventListener('click', addBoundary);
document.getElementById('resetBrackets').addEventListener('click', function () {
    const confirmed = window.confirm('Reset the brackets to the example? Your income figures stay as they are.');
    if (!confirmed) return;
    const income = {
        mode: state.mode,
        grossText: state.grossText,
        earnedText: state.earnedText,
        extraText: state.extraText,
        currentText: state.currentText,
        newText: state.newText
    };
    state = exampleState();
    state.mode = income.mode;
    state.grossText = income.grossText;
    state.earnedText = income.earnedText;
    state.extraText = income.extraText;
    state.currentText = income.currentText;
    state.newText = income.newText;
    persist();
    renderAll();
});

function structureValid() {
    return CustomBrackets.validateBrackets(0, state.brackets).length === 0;
}

function activeDeductionNames() {
    const names = [];
    state.brackets.forEach(function (bracket) {
        (bracket.deductions || []).forEach(function (deduction, index) {
            const rate = Number(deduction.rate) || 0;
            const name = CustomBrackets.deductionLabel(deduction, index);
            if (rate > 0 && names.indexOf(name) === -1) names.push(name);
        });
    });
    return names;
}

function bracketContaining(income) {
    let match = state.brackets[0];
    state.brackets.forEach(function (bracket, index) {
        const open = bracket.to == null;
        const covers = income >= bracket.from && (open || income <= bracket.to);
        const startsAtPreviousBoundary = index > 0 && income === bracket.from;
        if (covers && !startsAtPreviousBoundary) match = bracket;
    });
    return match;
}

function chartCeiling(marker, earned) {
    const boundaries = state.brackets.map(function (bracket) { return bracket.to; }).filter(function (value) {
        return value != null && value > 0;
    });
    const highest = boundaries.length ? Math.max.apply(null, boundaries) : 0;
    const marked = Math.max(marker || 0, earned || 0);
    return Math.max(marked * 1.2, highest * 1.08, 10000);
}

function uniqueSorted(values) {
    return values.filter(function (value) {
        return Number.isFinite(value) && value >= 0;
    }).sort(function (a, b) {
        return a - b;
    }).filter(function (value, index, list) {
        return index === 0 || value - list[index - 1] > 0.01;
    });
}

function axisPoints(max, marker, earned) {
    const points = [0, max];
    if (marker != null) points.push(marker);
    if (earned != null) points.push(earned);
    state.brackets.forEach(function (bracket) {
        if (bracket.to == null || bracket.to <= 0 || bracket.to >= max) return;
        points.push(bracket.to);
        points.push(Math.min(max, bracket.to + 1));
    });
    const step = max / 48;
    for (let index = 1; index < 48; index += 1) points.push(step * index);
    return uniqueSorted(points);
}

function blankSample(names) {
    const parts = {};
    names.forEach(function (name) { parts[name] = 0; });
    return { keep: 0, parts: parts };
}

function averageSample(income, names) {
    const sample = blankSample(names);
    if (income <= 0) {
        sample.keep = 100;
        return sample;
    }
    const result = CustomBrackets.calculateCustomNetIncome(income, state.brackets);
    if (!result.ok) {
        sample.keep = 100;
        return sample;
    }
    result.rows.forEach(function (row) {
        (row.parts || []).forEach(function (part) {
            if (sample.parts[part.name] == null) return;
            sample.parts[part.name] += part.amount;
        });
    });
    names.forEach(function (name) {
        sample.parts[name] = (sample.parts[name] / income) * 100;
    });
    sample.keep = Math.max(0, result.keepRate);
    return sample;
}

function marginalSample(income, names) {
    const sample = blankSample(names);
    const bracket = bracketContaining(income);
    let cut = 0;
    (bracket.deductions || []).forEach(function (deduction, index) {
        const rate = Number(deduction.rate) || 0;
        const name = CustomBrackets.deductionLabel(deduction, index);
        cut += rate;
        if (sample.parts[name] != null) sample.parts[name] += rate;
    });
    sample.keep = Math.max(0, 100 - cut);
    return sample;
}

function fade(context, rgb, strong) {
    const gradient = context.createLinearGradient(0, 0, 0, 420);
    gradient.addColorStop(0, 'rgba(' + rgb + ', ' + (strong ? 0.9 : 0.75) + ')');
    gradient.addColorStop(1, 'rgba(' + rgb + ', ' + (strong ? 0.45 : 0.28) + ')');
    return gradient;
}

function chartScales(xTitle, yTitle, yMax, xMax) {
    const y = {
        min: 0,
        title: { display: true, text: yTitle, color: '#94a3b8' },
        ticks: {
            color: '#cbd5e1',
            callback: function (value) { return axisPounds(value); }
        },
        grid: { color: 'rgba(255,255,255,0.05)' }
    };
    if (yMax != null) {
        y.max = yMax;
        y.ticks.callback = function (value) { return value + '%'; };
    }
    return {
        x: {
            type: 'linear',
            min: 0,
            max: xMax,
            title: { display: true, text: xTitle, color: '#94a3b8' },
            ticks: {
                color: '#cbd5e1',
                maxTicksLimit: 8,
                callback: function (value) { return axisPounds(value); }
            },
            grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: y
    };
}

function asPoints(labels, values) {
    return labels.map(function (x, index) {
        return { x: x, y: values[index] };
    });
}

function axisPounds(value) {
    const amount = Math.round(value);
    if (Math.abs(amount) >= 1000000) return '£' + (amount / 1000000).toFixed(1) + 'm';
    if (Math.abs(amount) >= 10000) return '£' + Math.round(amount / 1000) + 'k';
    return '£' + amount.toLocaleString('en-GB');
}

function markerAnnotations(max, marker, earned) {
    const annotations = {};
    state.brackets.forEach(function (bracket, index) {
        if (bracket.to == null || bracket.to <= 0 || bracket.to >= max) return;
        annotations['boundary' + index] = {
            type: 'line',
            xMin: bracket.to,
            xMax: bracket.to,
            borderColor: 'rgba(255,255,255,0.22)',
            borderDash: [5, 5],
            borderWidth: 1,
            label: {
                display: true,
                content: formatMoney(bracket.to),
                position: 'end',
                color: '#cbd5e1',
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                font: { size: 10 }
            }
        };
    });
    if (earned != null && marker != null && Math.abs(earned - marker) > 1 && earned <= max) {
        const alreadyLabel = state.mode === 'difference' ? 'Current' : 'Already';
        annotations.already = incomeLine(earned, alreadyLabel, '#4ade80', 'start');
    }
    if (marker != null && marker <= max) {
        const label = state.mode === 'difference' ? 'New' : (state.mode === 'additional' ? 'After' : 'You');
        annotations.you = incomeLine(marker, label, '#ffffff', 'center');
    }
    return annotations;
}

function incomeLine(value, label, color, position) {
    return {
        type: 'line',
        xMin: value,
        xMax: value,
        borderColor: color,
        borderWidth: 2,
        label: {
            display: true,
            content: label,
            position: position,
            backgroundColor: 'rgba(255,255,255,0.92)',
            color: '#0f172a',
            font: { weight: 'bold', size: 11 }
        }
    };
}

function updateVisuals(view) {
    renderFormula(view);
    renderDeductionList(view);
    updateShareChart(view);
    updateNetChart(view);
}

function renderFormula(view) {
    const box = document.getElementById('formulaDisplay');
    const note = document.getElementById('formulaNote');
    note.textContent = view.formulaNote;
    box.replaceChildren();
    const rows = (view.rows || []).filter(function (row) { return row.slice > 0; });
    if (!view.ok || !rows.length) {
        box.textContent = '—';
        return;
    }
    rows.forEach(function (row, index) {
        if (index) box.appendChild(mathText(' + ', 'math-op'));
        box.appendChild(mathText('(', 'math-op'));
        box.appendChild(mathText(formatMoney(row.slice), 'math-num'));
        box.appendChild(mathText(' × ', 'math-op'));
        box.appendChild(mathText(keepMultiplier(row.rate), 'math-mult'));
        box.appendChild(mathText(')', 'math-op'));
    });
    box.appendChild(mathText(' = ', 'math-op'));
    box.appendChild(mathText(formatMoney(view.net), 'math-total'));
}

function keepMultiplier(rate) {
    const keep = Math.max(0, 1 - (Number(rate) || 0) / 100);
    return String(Math.round((keep + Number.EPSILON) * 10000) / 10000);
}

function mathText(text, className) {
    const node = document.createElement('span');
    node.className = className;
    node.textContent = text;
    return node;
}

function renderDeductionList(view) {
    const root = document.getElementById('deductionBreakdown');
    document.getElementById('deductionNote').textContent = view.deductionNote;
    root.replaceChildren();
    const rows = view.ok ? (view.rows || []).filter(function (row) { return row.slice > 0; }) : [];
    if (!rows.length) {
        const empty = document.createElement('p');
        empty.className = 'section-note';
        empty.textContent = view.emptyMessage || 'The breakdown appears once the income and brackets are valid.';
        root.appendChild(empty);
        return;
    }

    const groups = [];
    rows.forEach(function (row) {
        (row.parts || []).forEach(function (part) {
            if (!(part.amount > 0) && !(part.rate > 0)) return;
            let group = groups.find(function (item) { return item.name === part.name; });
            if (!group) {
                group = { name: part.name, items: [] };
                groups.push(group);
            }
            group.items.push({ row: row, part: part });
        });
    });

    groups.forEach(function (group) {
        const header = document.createElement('div');
        header.className = 'breakdown-header';
        header.textContent = group.name;
        root.appendChild(header);
        group.items.forEach(function (item) {
            root.appendChild(deductionLine(
                formatPercent(item.part.rate) + ' · ' + breakdownRange(item.row),
                formatMoney(item.part.amount),
                'on ' + formatMoney(item.row.slice)
            ));
        });
    });

    const kept = rows.reduce(function (sum, row) { return sum + row.kept; }, 0);
    const keepHeader = document.createElement('div');
    keepHeader.className = 'breakdown-header';
    keepHeader.textContent = 'You keep';
    root.appendChild(keepHeader);
    root.appendChild(deductionLine('After the deductions in these bands', formatMoney(kept), ''));
}

function deductionLine(label, value, detail) {
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    const name = document.createElement('span');
    name.className = 'breakdown-label';
    name.textContent = label;
    const amount = document.createElement('span');
    amount.className = 'breakdown-val';
    amount.appendChild(document.createTextNode(value));
    if (detail) {
        const sub = document.createElement('span');
        sub.className = 'sub-text';
        sub.textContent = detail;
        amount.appendChild(sub);
    }
    row.appendChild(name);
    row.appendChild(amount);
    return row;
}

function updateShareChart(view) {
    const note = document.getElementById('shareChartNote');
    const canvas = document.getElementById('shareChart');
    if (!structureValid() || typeof Chart === 'undefined') {
        destroyChart('share');
        document.getElementById('shareLegend').replaceChildren();
        note.textContent = typeof Chart === 'undefined'
            ? 'The income chart could not be loaded.'
            : 'The chart appears once the brackets are valid.';
        return;
    }

    const names = activeDeductionNames();
    const max = chartCeiling(view.marker, view.earned);
    const marginal = chartMode === 'marginal';
    const labels = axisPoints(max, view.marker, view.earned);
    const samples = labels.map(function (income) {
        return marginal ? marginalSample(income, names) : averageSample(income, names);
    });
    const context = canvas.getContext('2d');
    const keepData = [];
    const bandData = names.map(function () { return []; });
    samples.forEach(function (sample) {
        let running = sample.keep;
        keepData.push(Math.min(100, Math.max(0, running)));
        names.forEach(function (name, index) {
            running += sample.parts[name] || 0;
            bandData[index].push(Math.min(100, Math.max(0, running)));
        });
    });

    const datasets = [{
        label: marginal ? 'You keep (next £)' : 'You keep',
        data: asPoints(labels, keepData),
        borderColor: '#4ade80',
        borderWidth: 2,
        stepped: marginal ? 'after' : false,
        fill: 'origin',
        backgroundColor: fade(context, '74, 222, 128', false),
        pointRadius: 0
    }];
    names.forEach(function (name, index) {
        const color = DEDUCTION_COLORS[index % DEDUCTION_COLORS.length];
        datasets.push({
            label: name,
            data: asPoints(labels, bandData[index]),
            borderColor: color.hex,
            borderWidth: 2,
            stepped: marginal ? 'after' : false,
            fill: '-1',
            backgroundColor: fade(context, color.rgb, true),
            pointRadius: 0
        });
    });

    destroyChart('share');
    try {
    shareChart = new Chart(context, {
        type: 'line',
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: chartScales('Income (£)', marginal ? 'Share of the next £ (%)' : 'Share of income so far (%)', 100, max),
            plugins: {
                legend: { display: false },
                annotation: { annotations: markerAnnotations(max, view.marker, view.earned) },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: function (items) {
                            return items.length ? formatMoney(items[0].parsed.x) : '';
                        },
                        label: function (item) {
                            const share = bandShare(item);
                            if (share < 0.05) return '';
                            const income = item.parsed.x;
                            if (marginal || income <= 0) return item.dataset.label + ': ' + share.toFixed(1) + '%';
                            return item.dataset.label + ': ' + share.toFixed(1) + '% (' + formatMoney(income * share / 100) + ')';
                        }
                    }
                }
            }
        }
    });
    } catch (error) {
        note.textContent = 'The income chart could not be drawn.';
        return;
    }
    renderShareLegend(names);
    note.textContent = marginal
        ? 'Each colour is that deduction\'s share of the next £1. The steps are your bracket boundaries.'
        : 'Each colour is that deduction\'s share of everything earned up to that income.';
}

function bandShare(item) {
    if (item.datasetIndex === 0) return item.parsed.y;
    const previous = item.chart.data.datasets[item.datasetIndex - 1].data[item.dataIndex];
    return item.parsed.y - previous.y;
}

function renderShareLegend(names) {
    const legend = document.getElementById('shareLegend');
    legend.replaceChildren();
    const items = [{ name: 'You keep', color: '#4ade80' }];
    names.forEach(function (name, index) {
        items.push({ name: name, color: DEDUCTION_COLORS[index % DEDUCTION_COLORS.length].hex });
    });
    items.forEach(function (item) {
        const entry = document.createElement('div');
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.backgroundColor = item.color;
        entry.appendChild(dot);
        entry.appendChild(document.createTextNode(item.name));
        legend.appendChild(entry);
    });
}

function updateNetChart(view) {
    const note = document.getElementById('curveNote');
    const canvas = document.getElementById('netChart');
    note.textContent = view.curveNote;
    if (!structureValid() || typeof Chart === 'undefined') {
        destroyChart('net');
        if (typeof Chart === 'undefined') note.textContent = 'The take-home chart could not be loaded.';
        else note.textContent = 'The chart appears once the brackets are valid.';
        return;
    }

    const max = chartCeiling(view.marker, view.earned);
    const labels = axisPoints(max, view.marker, view.earned);
    const nets = labels.map(function (income) {
        const result = CustomBrackets.calculateCustomNetIncome(income, state.brackets);
        return result.ok ? result.net : 0;
    });
    const annotations = {};
    if (view.marker != null) {
        const atMarker = CustomBrackets.calculateCustomNetIncome(view.marker, state.brackets);
        annotations.you = {
            type: 'point',
            xValue: view.marker,
            yValue: atMarker.ok ? atMarker.net : 0,
            backgroundColor: '#4ade80',
            radius: 6,
            borderColor: '#ffffff',
            borderWidth: 2
        };
    }
    if (view.earned != null && view.marker != null && Math.abs(view.earned - view.marker) > 1) {
        const atEarned = CustomBrackets.calculateCustomNetIncome(view.earned, state.brackets);
        annotations.already = {
            type: 'point',
            xValue: view.earned,
            yValue: atEarned.ok ? atEarned.net : 0,
            backgroundColor: '#38bdf8',
            radius: 6,
            borderColor: '#ffffff',
            borderWidth: 2
        };
    }

    destroyChart('net');
    try {
    netChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            datasets: [{
                label: 'Take-home',
                data: asPoints(labels, nets),
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                borderWidth: 3,
                fill: 'origin',
                tension: 0,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: chartScales('Income (£)', 'Take-home (£)', null, max),
            plugins: {
                legend: { display: false },
                annotation: { annotations: annotations },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: function (items) {
                            return items.length ? 'Income ' + formatMoney(items[0].parsed.x) : '';
                        },
                        label: function (item) {
                            return 'Take-home: ' + formatMoney(item.parsed.y);
                        }
                    }
                }
            }
        }
    });
    } catch (error) {
        note.textContent = 'The take-home chart could not be drawn.';
    }
}

function destroyChart(which) {
    if (which === 'share' && shareChart) {
        shareChart.destroy();
        shareChart = null;
    }
    if (which === 'net' && netChart) {
        netChart.destroy();
        netChart = null;
    }
}

function downloadShareChart(format) {
    const canvas = document.getElementById('shareChart');
    if (!canvas || !shareChart) return;
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext('2d');
    context.fillStyle = '#0f172a';
    context.fillRect(0, 0, copy.width, copy.height);
    context.drawImage(canvas, 0, 0);
    const link = document.createElement('a');
    link.download = 'custom-bracketing-chart.' + (format === 'jpeg' ? 'jpg' : 'png');
    link.href = copy.toDataURL('image/' + format, 1);
    link.click();
}

function setChartMode(mode) {
    chartMode = mode;
    document.getElementById('chartAverage').setAttribute('aria-pressed', mode === 'average' ? 'true' : 'false');
    document.getElementById('chartMarginal').setAttribute('aria-pressed', mode === 'marginal' ? 'true' : 'false');
    renderResults();
}

incomeMark.dataset.incomeHandle = 'earned';
incomeMarkEnd.dataset.incomeHandle = 'extra';
incomeMark.addEventListener('pointerdown', onIncomePointerDown);
incomeMarkEnd.addEventListener('pointerdown', onIncomePointerDown);
incomeMark.addEventListener('keydown', onIncomeKeyDown);
incomeMarkEnd.addEventListener('keydown', onIncomeKeyDown);
document.addEventListener('pointermove', onHandlePointerMove);
document.addEventListener('pointerup', onHandlePointerUp);
document.addEventListener('pointercancel', onHandlePointerUp);
window.addEventListener('resize', positionHandles);
renderAll();
