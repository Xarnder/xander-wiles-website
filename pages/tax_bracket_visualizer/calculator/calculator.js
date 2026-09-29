const directionInputs = document.querySelectorAll('input[name="direction"]');
const investedFields = document.getElementById('investedFields');
const incomeFields = document.getElementById('incomeFields');
const investedInput = document.getElementById('investedInput');
const incomeInput = document.getElementById('incomeInput');
const rateInput = document.getElementById('rateInput');
const investedHint = document.getElementById('investedHint');
const incomeHint = document.getElementById('incomeHint');
const periodMonth = document.getElementById('periodMonth');
const periodYear = document.getElementById('periodYear');
const taxBefore = document.getElementById('taxBefore');
const taxAfter = document.getElementById('taxAfter');
const taxHint = document.getElementById('taxHint');
const yearLabel = document.getElementById('yearLabel');
const monthLabel = document.getElementById('monthLabel');
const potYearLabel = document.getElementById('potYearLabel');
const potMonthLabel = document.getElementById('potMonthLabel');
const rateChips = document.querySelectorAll('.rate-chip');

const resultLead = document.getElementById('resultLead');
const payoutResults = document.getElementById('payoutResults');
const potResults = document.getElementById('potResults');
const yearOut = document.getElementById('yearOut');
const monthOut = document.getElementById('monthOut');
const potOut = document.getElementById('potOut');
const potYear = document.getElementById('potYear');
const potMonth = document.getElementById('potMonth');
const workingSteps = document.getElementById('workingSteps');
const equation = document.getElementById('equation');

let period = 'month';
let taxBasis = 'before';

const SALARY_TAX = { niLetter: 'A' };

const wholePounds = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
});

const pence = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const grouped = new Intl.NumberFormat('en-GB', {
    maximumFractionDigits: 2
});

function formatMoney(value) {
    const rounded = Math.round(value * 100) / 100;
    const whole = Math.abs(rounded - Math.round(rounded)) < 0.001;
    return (whole ? wholePounds : pence).format(rounded);
}

function parseAmount(raw) {
    const cleaned = String(raw).trim().toLowerCase().replace(/£/g, '').replace(/,/g, '').replace(/\s+/g, '');
    if (cleaned === '') return { empty: true };
    const match = cleaned.match(/^(\d+\.?\d*|\.\d+)([km])?$/);
    if (!match) return { invalid: true };
    let value = Number(match[1]);
    if (match[2] === 'k') value *= 1000;
    if (match[2] === 'm') value *= 1000000;
    if (!Number.isFinite(value)) return { invalid: true };
    return { value };
}

function parseRate(raw) {
    const cleaned = String(raw).trim().replace(/%/g, '').replace(/\s+/g, '');
    if (cleaned === '') return { empty: true };
    if (!/^(\d+\.?\d*|\.\d+)$/.test(cleaned)) return { invalid: true };
    const value = Number(cleaned);
    if (!Number.isFinite(value) || value < 0) return { invalid: true };
    return { value };
}

function formatRate(value) {
    return String(Math.round(value * 1000) / 1000);
}

function formatFactor(percent) {
    const factor = Math.round((percent / 100) * 1e10) / 1e10;
    return String(factor);
}

function direction() {
    const selected = document.querySelector('input[name="direction"]:checked');
    return selected ? selected.value : 'invested';
}

function wantsAfterTax() {
    return taxBasis === 'after';
}

function shownTakeHome(gross) {
    const home = UKTax.takeHome(gross, 'paye', SALARY_TAX);
    const shownGross = Math.round(gross * 100) / 100;
    const total = Math.round((home.tax + home.ni + home.loan) * 100) / 100;
    return {
        gross: shownGross,
        tax: home.tax,
        ni: home.ni,
        total,
        net: Math.round((shownGross - total) * 100) / 100
    };
}

function setResultLabels() {
    if (!wantsAfterTax()) {
        yearLabel.textContent = 'Each year';
        monthLabel.textContent = 'Each month';
        potYearLabel.textContent = 'Pays each year';
        potMonthLabel.textContent = 'Pays each month';
        return;
    }
    yearLabel.textContent = 'After tax each year';
    monthLabel.textContent = 'After tax each month';
    potYearLabel.textContent = 'Before tax each year';
    potMonthLabel.textContent = 'After tax each month';
}

function setSteps(lines) {
    workingSteps.replaceChildren();
    for (const line of lines) {
        const item = document.createElement('li');
        item.textContent = line;
        workingSteps.append(item);
    }
}

function setEquation(lines) {
    equation.replaceChildren();
    equation.hidden = lines.length === 0;
    for (const line of lines) {
        const row = document.createElement('p');
        row.textContent = line;
        equation.append(row);
    }
}

function setInvalid(input, invalid) {
    input.parentElement.classList.toggle('is-invalid', invalid);
}

function showMessage(message, steps) {
    resultLead.textContent = message;
    payoutResults.hidden = direction() !== 'invested';
    potResults.hidden = direction() !== 'income';
    yearOut.textContent = '—';
    monthOut.textContent = '—';
    potOut.textContent = '—';
    potYear.textContent = '—';
    potMonth.textContent = '—';
    setResultLabels();
    setEquation([]);
    setSteps(steps);
}

function updateHints(invested, income) {
    if (invested.invalid) {
        investedHint.textContent = 'Enter a number, such as 600000 or 600k.';
    } else if (!invested.empty && /[km]/i.test(investedInput.value)) {
        investedHint.textContent = `Read as ${formatMoney(invested.value)}.`;
    } else {
        investedHint.textContent = 'You can type 600k or 1.2m.';
    }

    if (income.empty) {
        incomeHint.textContent = period === 'month'
            ? 'Type the income you want each month.'
            : 'Type the income you want each year.';
    } else if (income.invalid) {
        incomeHint.textContent = 'Enter a number, such as 1200 or 1.2k.';
    } else if (period === 'month') {
        incomeHint.textContent = `${formatMoney(income.value)} each month is ${formatMoney(income.value * 12)} a year.`;
    } else {
        incomeHint.textContent = `${formatMoney(income.value)} each year is ${formatMoney(income.value / 12)} a month.`;
    }
}

function updateChips(rate) {
    rateChips.forEach((chip) => {
        const matches = rate && !rate.empty && !rate.invalid && Math.abs(rate.value - Number(chip.dataset.rate)) < 0.0001;
        chip.setAttribute('aria-pressed', matches ? 'true' : 'false');
    });
}

function render() {
    const mode = direction();
    const invested = parseAmount(investedInput.value);
    const income = parseAmount(incomeInput.value);
    const rate = parseRate(rateInput.value);

    investedFields.hidden = mode !== 'invested';
    incomeFields.hidden = mode !== 'income';
    setInvalid(investedInput, Boolean(invested.invalid));
    setInvalid(incomeInput, Boolean(income.invalid));
    setInvalid(rateInput, Boolean(rate.invalid));
    updateHints(invested, income);
    updateChips(rate);
    setResultLabels();
    taxHint.textContent = wantsAfterTax()
        ? 'After tax uses the Tax Visualiser: Income Tax and National Insurance on a standard salary (NI category A), with no student loan.'
        : 'Income figures are before Income Tax and National Insurance.';

    if (rate.empty) {
        showMessage('Add a yearly growth rate, for example 4%.', ['The rate is the share of the pot paid out each year.']);
        return;
    }
    if (rate.invalid) {
        showMessage('That growth rate does not look like a number.', ['Use a yearly percentage, such as 4 or 4.5.']);
        return;
    }

    const rateLabel = `${formatRate(rate.value)}%`;

    if (mode === 'invested') {
        payoutResults.hidden = false;
        potResults.hidden = true;

        if (invested.empty) {
            showMessage('Type how much you have invested.', ['Income each year is the pot multiplied by the growth rate.', 'Income each month is that yearly amount divided by 12.']);
            payoutResults.hidden = false;
            return;
        }
        if (invested.invalid) {
            showMessage('That invested amount does not look like a number.', ['Try 600000, 600,000, or 600k.']);
            payoutResults.hidden = false;
            return;
        }

        const grossYear = invested.value * (rate.value / 100);
        const factor = formatFactor(rate.value);
        if (wantsAfterTax()) {
            const home = shownTakeHome(grossYear);
            const netMonth = home.net / 12;
            yearOut.textContent = formatMoney(home.net);
            monthOut.textContent = formatMoney(netMonth);
            resultLead.textContent = `${formatMoney(invested.value)} at ${rateLabel} pays ${formatMoney(grossYear)} before tax, which is ${formatMoney(home.net)} after tax each year, or ${formatMoney(netMonth)} each month.`;
            setEquation([
                `${formatMoney(invested.value)} × ${factor} = ${formatMoney(grossYear)} before tax`,
                `${formatMoney(grossYear)} − ${formatMoney(home.total)} tax and NI = ${formatMoney(home.net)} after tax`,
                `${formatMoney(home.net)} ÷ 12 = ${formatMoney(netMonth)} each month`
            ]);
            setSteps([
                `${rateLabel} of ${formatMoney(invested.value)} is ${formatMoney(grossYear)} before tax.`,
                `Income Tax is ${formatMoney(home.tax)} and National Insurance is ${formatMoney(home.ni)}.`,
                `${formatMoney(home.net)} after tax divided by 12 is ${formatMoney(netMonth)} each month.`
            ]);
            return;
        }

        const monthly = grossYear / 12;
        yearOut.textContent = formatMoney(grossYear);
        monthOut.textContent = formatMoney(monthly);
        resultLead.textContent = `${formatMoney(invested.value)} at ${rateLabel} a year pays ${formatMoney(grossYear)} each year, which is ${formatMoney(monthly)} each month.`;
        setEquation([
            `${formatMoney(invested.value)} × ${factor} = ${formatMoney(grossYear)} each year`,
            `${formatMoney(grossYear)} ÷ 12 = ${formatMoney(monthly)} each month`
        ]);
        setSteps([
            `${rateLabel} of ${formatMoney(invested.value)} is ${formatMoney(grossYear)} each year.`,
            `${formatMoney(grossYear)} divided by 12 is ${formatMoney(monthly)} each month.`
        ]);
        return;
    }

    payoutResults.hidden = true;
    potResults.hidden = false;

    if (income.empty) {
        showMessage(period === 'month' ? 'Type the income you want each month.' : 'Type the income you want each year.', ['A monthly target is multiplied by 12 to get the yearly income.', 'The pot is that yearly income divided by the growth rate.']);
        potResults.hidden = false;
        return;
    }
    if (income.invalid) {
        showMessage('That income does not look like a number.', ['Try 1200, 1,200, or 1.2k.']);
        potResults.hidden = false;
        return;
    }

    const netYear = period === 'month' ? income.value * 12 : income.value;
    const netMonth = netYear / 12;
    const grossYear = wantsAfterTax() ? UKTax.grossFromNet(netYear, 'paye', SALARY_TAX) : netYear;
    const home = wantsAfterTax() ? shownTakeHome(grossYear) : null;

    if (rate.value === 0) {
        potOut.textContent = income.value === 0 ? formatMoney(0) : '—';
        potYear.textContent = formatMoney(grossYear);
        potMonth.textContent = formatMoney(wantsAfterTax() ? netMonth : netYear / 12);
        resultLead.textContent = income.value === 0
            ? 'An income of £0 needs nothing invested.'
            : `At 0% the pot never pays out, so no amount invested produces ${formatMoney(income.value)} ${period === 'month' ? 'each month' : 'each year'}.`;
        const sums = [];
        if (period === 'month') {
            sums.push(`${formatMoney(income.value)} × 12 = ${formatMoney(netYear)} ${wantsAfterTax() ? 'after tax ' : ''}each year`);
        }
        if (wantsAfterTax()) {
            sums.push(`${formatMoney(netYear)} after tax needs ${formatMoney(grossYear)} before tax`);
            sums.push(`${formatMoney(grossYear)} − ${formatMoney(home.total)} tax and NI = ${formatMoney(home.net)}`);
        } else if (period === 'year') {
            sums.push(`${formatMoney(netYear)} ÷ 12 = ${formatMoney(netMonth)} each month`);
        }
        setEquation(sums);
        const zeroSteps = [
            period === 'month'
                ? `${formatMoney(income.value)} each month is ${formatMoney(netYear)} a year.`
                : `${formatMoney(income.value)} a year is ${formatMoney(netMonth)} a month.`
        ];
        if (wantsAfterTax()) {
            zeroSteps.push(`That after-tax income needs ${formatMoney(grossYear)} before tax.`);
        }
        zeroSteps.push('A growth rate above 0% is needed before a pot size can be worked out.');
        setSteps(zeroSteps);
        return;
    }

    const factor = formatFactor(rate.value);
    const pot = grossYear / (rate.value / 100);
    potOut.textContent = formatMoney(pot);
    potYear.textContent = formatMoney(wantsAfterTax() ? grossYear : netYear);
    potMonth.textContent = formatMoney(wantsAfterTax() ? netMonth : netYear / 12);
    const wanted = `${formatMoney(income.value)} ${period === 'month' ? 'each month' : 'each year'}`;
    resultLead.textContent = wantsAfterTax()
        ? `To keep ${wanted} after tax at ${rateLabel}, you need ${formatMoney(grossYear)} before tax, which takes ${formatMoney(pot)} invested.`
        : `To receive ${wanted} at ${rateLabel} a year, you need ${formatMoney(pot)} invested.`;
    const sums = [];
    if (period === 'month') {
        sums.push(`${formatMoney(income.value)} × 12 = ${formatMoney(netYear)} ${wantsAfterTax() ? 'after tax ' : ''}each year`);
    }
    if (wantsAfterTax()) {
        sums.push(`${formatMoney(netYear)} after tax needs ${formatMoney(grossYear)} before tax`);
        sums.push(`${formatMoney(grossYear)} − ${formatMoney(home.total)} tax and NI = ${formatMoney(home.net)}`);
    }
    sums.push(`${formatMoney(grossYear)} ÷ ${factor} = ${formatMoney(pot)} invested`);
    if (!wantsAfterTax() && period === 'year') {
        sums.push(`${formatMoney(netYear)} ÷ 12 = ${formatMoney(netMonth)} each month`);
    }
    setEquation(sums);
    const steps = [];
    if (period === 'month') {
        steps.push(`${formatMoney(income.value)} each month is ${formatMoney(netYear)} a year${wantsAfterTax() ? ' after tax' : ''}.`);
    }
    if (wantsAfterTax()) {
        steps.push(`The Tax Visualiser needs ${formatMoney(grossYear)} before tax to leave ${formatMoney(home.net)}. Income Tax is ${formatMoney(home.tax)} and National Insurance is ${formatMoney(home.ni)}.`);
    }
    steps.push(`${formatMoney(grossYear)} a year divided by ${rateLabel} is ${formatMoney(pot)} invested.`);
    if (!wantsAfterTax() && period === 'year') {
        steps.push(`That same pot pays ${formatMoney(netMonth)} each month.`);
    }
    setSteps(steps);
}

function setPeriod(next) {
    period = next;
    periodMonth.setAttribute('aria-pressed', next === 'month' ? 'true' : 'false');
    periodYear.setAttribute('aria-pressed', next === 'year' ? 'true' : 'false');
    render();
}

directionInputs.forEach((input) => input.addEventListener('change', render));
investedInput.addEventListener('input', render);
incomeInput.addEventListener('input', render);
rateInput.addEventListener('input', render);

investedInput.addEventListener('blur', () => {
    const parsed = parseAmount(investedInput.value);
    if (!parsed.empty && !parsed.invalid) investedInput.value = grouped.format(parsed.value);
    render();
});

incomeInput.addEventListener('blur', () => {
    const parsed = parseAmount(incomeInput.value);
    if (!parsed.empty && !parsed.invalid) incomeInput.value = grouped.format(parsed.value);
    render();
});

rateInput.addEventListener('blur', () => {
    const parsed = parseRate(rateInput.value);
    if (!parsed.empty && !parsed.invalid) rateInput.value = formatRate(parsed.value);
    render();
});

document.getElementById('calculator').addEventListener('submit', (event) => {
    event.preventDefault();
});

function setTaxBasis(next) {
    taxBasis = next;
    taxBefore.setAttribute('aria-pressed', next === 'before' ? 'true' : 'false');
    taxAfter.setAttribute('aria-pressed', next === 'after' ? 'true' : 'false');
    render();
}

periodMonth.addEventListener('click', () => setPeriod('month'));
periodYear.addEventListener('click', () => setPeriod('year'));
taxBefore.addEventListener('click', () => setTaxBasis('before'));
taxAfter.addEventListener('click', () => setTaxBasis('after'));

rateChips.forEach((chip) => {
    chip.addEventListener('click', () => {
        rateInput.value = chip.dataset.rate;
        render();
    });
});

investedInput.value = grouped.format(parseAmount(investedInput.value).value);
incomeInput.value = grouped.format(parseAmount(incomeInput.value).value);
render();
