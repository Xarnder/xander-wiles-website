console.log("Debug: Script loaded successfully.");

// --- Constants (Tax 2024/25) ---
const PERSONAL_ALLOWANCE_DEFAULT = 12570;
const TAPER_THRESHOLD = 100000;
const BASIC_RATE_LIMIT = 50270;
const HIGHER_RATE_LIMIT = 125140;

const RATE_BASIC = 0.20;
const RATE_HIGHER = 0.40;
const RATE_ADDITIONAL = 0.45;

// --- Constants (NI 2024/25) ---
const NI_PRIMARY_THRESHOLD = 12570;
const NI_UPPER_LIMIT = 50270;

// --- Elements ---
const incomeInput = document.getElementById('incomeInput');
const niLetterSelect = document.getElementById('niLetter');
const calculateBtn = document.getElementById('calculateBtn');
const viewToggle = document.getElementById('viewToggle'); // Green bottom / Red bottom
const totalTaxDisplay = document.getElementById('totalTaxDisplay');
const takeHomeDisplay = document.getElementById('takeHomeDisplay');
const effectiveRateDisplay = document.getElementById('effectiveRateDisplay');
const breakdownList = document.getElementById('breakdownList');
const formulaDisplay = document.getElementById('formulaDisplay');

// New toggle elements (created later)
let rateModeToggle = null;   // Average vs Marginal
let rateModeCaption = null;  // "Showing: Average view / Marginal view"

// Chart Contexts
const ctx = document.getElementById('taxChart').getContext('2d');
const ctxComp = document.getElementById('comparisonChart').getContext('2d');

let taxChart = null;
let comparisonChart = null;

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        maximumFractionDigits: 0
    }).format(amount);
};

// --- Logic: Dynamic Personal Allowance (The Taper) ---
function getPersonalAllowance(income) {
    if (income <= TAPER_THRESHOLD) return PERSONAL_ALLOWANCE_DEFAULT;
    const reduction = (income - TAPER_THRESHOLD) / 2;
    return Math.max(0, PERSONAL_ALLOWANCE_DEFAULT - reduction);
}

// --- Logic: NI Rates based on Letter ---
function getNIRates(letter) {
    switch (letter) {
        case 'A':
        case 'H':
        case 'M':
        case 'V':
            return { main: 0.08, upper: 0.02, name: 'Standard (8%)' };
        case 'B':
        case 'I':
        case 'E':
            return { main: 0.0185, upper: 0.02, name: 'Reduced (1.85%)' };
        case 'C':
        case 'S':
        case 'K':
            return { main: 0, upper: 0, name: 'Exempt (0%)' };
        case 'J':
        case 'Z':
        case 'L':
            return { main: 0.02, upper: 0.02, name: 'Deferred (2%)' };
        default:
            return { main: 0.08, upper: 0.02, name: 'Standard (8%)' };
    }
}

// --- Calculation: Income Tax ---
function calculateIncomeTax(income) {
    const allowance = getPersonalAllowance(income);
    let tax = 0;
    const taxableIncome = Math.max(0, income - allowance);

    const BASIC_BAND_WIDTH = 37700; // 50,270 - 12,570
    let tempTaxable = taxableIncome;

    // Basic 20%
    const basicChunk = Math.min(tempTaxable, BASIC_BAND_WIDTH);
    tax += basicChunk * RATE_BASIC;
    tempTaxable -= basicChunk;

    const additionalThreshold = 125140;

    if (income > additionalThreshold) {
        const additionalChunk = income - additionalThreshold;
        tax += additionalChunk * RATE_ADDITIONAL;

        const startHigher = allowance + BASIC_BAND_WIDTH;
        if (additionalThreshold > startHigher) {
            tax += (additionalThreshold - startHigher) * RATE_HIGHER;
        }
    } else if (tempTaxable > 0) {
        tax += tempTaxable * RATE_HIGHER;
    }

    return tax;
}

// --- Calculation: NI ---
function calculateNI(income) {
    const rates = getNIRates(niLetterSelect.value);
    let ni = 0;

    if (income > NI_PRIMARY_THRESHOLD) {
        ni += (Math.min(income, NI_UPPER_LIMIT) - NI_PRIMARY_THRESHOLD) * rates.main;
    }
    if (income > NI_UPPER_LIMIT) {
        ni += (income - NI_UPPER_LIMIT) * rates.upper;
    }
    return ni;
}

// --- UI: Breakdown ---
function updateBreakdownUI(income, tax, ni) {
    const allowance = getPersonalAllowance(income);
    const taxableIncome = Math.max(0, income - allowance);
    const niRates = getNIRates(niLetterSelect.value);
    let html = '';

    // Income Tax breakdown
    html += `<div class="breakdown-header">Income Tax</div>`;
    html += `<div class="breakdown-row">
                <span class="breakdown-label">Personal Allowance</span>
                <span class="breakdown-val">£0 <span class="sub-text">on first ${formatCurrency(
                    allowance
                )}</span></span>
            </div>`;

    if (taxableIncome > 0) {
        const BASIC_BAND_WIDTH = 37700;
        const basicChunk = Math.min(taxableIncome, BASIC_BAND_WIDTH);
        const taxBasic = basicChunk * RATE_BASIC;
        if (basicChunk > 0) {
            html += `<div class="breakdown-row">
                        <span class="breakdown-label">Basic Rate (20%)</span>
                        <span class="breakdown-val">${formatCurrency(
                            taxBasic
                        )} <span class="sub-text">on next ${formatCurrency(basicChunk)}</span></span>
                     </div>`;
        }

        const remaining = taxableIncome - basicChunk;
        if (remaining > 0) {
            const additionalThreshold = 125140;
            const higherChunk =
                income > additionalThreshold
                    ? additionalThreshold - (allowance + BASIC_BAND_WIDTH)
                    : remaining;
            const taxHigher = Math.max(0, higherChunk * RATE_HIGHER);
            if (higherChunk > 0) {
                html += `<div class="breakdown-row">
                            <span class="breakdown-label">Higher Rate (40%)</span>
                            <span class="breakdown-val">${formatCurrency(
                                taxHigher
                            )} <span class="sub-text">on next ${formatCurrency(higherChunk)}</span></span>
                         </div>`;
            }

            if (income > additionalThreshold) {
                const addChunk = income - additionalThreshold;
                const taxAdd = addChunk * RATE_ADDITIONAL;
                html += `<div class="breakdown-row">
                            <span class="breakdown-label">Additional Rate (45%)</span>
                            <span class="breakdown-val">${formatCurrency(
                                taxAdd
                            )} <span class="sub-text">on remaining ${formatCurrency(addChunk)}</span></span>
                         </div>`;
            }
        }
    }

    // NI breakdown
    html += `<div class="breakdown-header" style="margin-top:20px; color:#fb923c;">
                National Insurance (${niRates.name})
             </div>`;

    if (income > NI_PRIMARY_THRESHOLD) {
        const niTaxable = Math.min(income, NI_UPPER_LIMIT) - NI_PRIMARY_THRESHOLD;
        const niVal = niTaxable * niRates.main;
        if (niRates.main > 0) {
            html += `<div class="breakdown-row">
                        <span class="breakdown-label">Main Rate (${niRates.main * 100}%)</span>
                        <span class="breakdown-val">${formatCurrency(
                            niVal
                        )} <span class="sub-text">on next ${formatCurrency(niTaxable)}</span></span>
                     </div>`;
        }
    }
    if (income > NI_UPPER_LIMIT) {
        const niTaxable = income - NI_UPPER_LIMIT;
        const niVal = niTaxable * niRates.upper;
        if (niRates.upper > 0) {
            html += `<div class="breakdown-row">
                        <span class="breakdown-label">Upper Rate (${niRates.upper * 100}%)</span>
                        <span class="breakdown-val">${formatCurrency(
                            niVal
                        )} <span class="sub-text">on remaining ${formatCurrency(niTaxable)}</span></span>
                     </div>`;
        }
    }

    breakdownList.innerHTML = html;
}

// --- UI: Formula text ---
function generateFormula(income) {
    const niRates = getNIRates(niLetterSelect.value);
    let parts = [];

    const allowance = getPersonalAllowance(income);
    const chunk1 = Math.min(income, allowance);
    if (allowance > 0 && chunk1 > 0) {
        parts.push(
            `(<span class="math-num">£${chunk1.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">1.00</span>)`
        );
    }

    const basicEnd = 50270;
    const basicStart = allowance;
    if (income > basicStart) {
        const chunk2 = Math.min(income, basicEnd) - basicStart;
        if (chunk2 > 0) {
            const mult = (1 - 0.20 - niRates.main).toFixed(2);
            parts.push(
                `(<span class="math-num">£${chunk2.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">${mult}</span>)`
            );
        }
    }

    const higherEnd = 125140;
    if (income > basicEnd) {
        const chunk3 = Math.min(income, higherEnd) - basicEnd;
        if (chunk3 > 0) {
            const mult = (1 - 0.40 - niRates.upper).toFixed(2);
            parts.push(
                `(<span class="math-num">£${chunk3.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">${mult}</span>)`
            );
        }
    }

    if (income > higherEnd) {
        const chunk4 = income - higherEnd;
        const mult = (1 - 0.45 - niRates.upper).toFixed(2);
        parts.push(
            `(<span class="math-num">£${chunk4.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">${mult}</span>)`
        );
    }

    const tax = calculateIncomeTax(income);
    const ni = calculateNI(income);
    const takeHome = income - tax - ni;

    let html = parts.join('<span class="math-op"> + </span>');
    html += ` <span class="math-op"> = </span> <span class="math-total">${formatCurrency(
        takeHome
    )}</span>`;
    formulaDisplay.innerHTML = html;
}

// --- Marginal helpers (for marginal view) ---
function getMarginalTaxRate(incomePoint) {
    const allowance = getPersonalAllowance(incomePoint);
    if (incomePoint <= allowance) return 0;

    // 60% effective band from 100k–125,140
    if (incomePoint > 100000 && incomePoint <= 125140) return 60;
    if (incomePoint <= 50270) return 20;
    if (incomePoint <= 125140) return 40;
    return 45;
}

function getMarginalNIRate(incomePoint) {
    const rates = getNIRates(niLetterSelect.value);
    if (incomePoint <= NI_PRIMARY_THRESHOLD) return 0;
    if (incomePoint <= NI_UPPER_LIMIT) return rates.main * 100;
    return rates.upper * 100;
}

// --- Main Chart (supports Average vs Marginal + Green/Red bottom) ---
function updateChart(income) {
    const maxView = Math.max(income, 60000);

    // Decide mode
    const showMarginal = rateModeToggle && rateModeToggle.checked; // false = Average
    const isRedBottom = viewToggle && viewToggle.checked;          // false = Green bottom

    // Build x-points
    const keyPoints = [];
    const steps = 70;
    const stepSize = maxView / steps;
    for (let i = 0; i <= steps; i++) keyPoints.push(i * stepSize);

    [0, 12570, 50270, 100000, 125140, income, maxView].forEach((p) => keyPoints.push(p));

    const labels = [...new Set(keyPoints)]
        .filter((p) => p >= 0 && p <= maxView)
        .sort((a, b) => a - b);

    // AVERAGE arrays
    const avgTaxOnly = [];
    const avgTaxAndNi = [];
    const avgTakeHome = [];
    const avgTakeHomeAndNi = [];

    // MARGINAL arrays
    const margTaxOnly = [];
    const margTaxAndNi = [];
    const margTakeHome = [];
    const margTakeHomeAndNi = [];

    const ceiling = [];

    labels.forEach((point) => {
        if (point <= 0) {
            avgTaxOnly.push(0);
            avgTaxAndNi.push(0);
            avgTakeHome.push(100);
            avgTakeHomeAndNi.push(100);

            margTaxOnly.push(0);
            margTaxAndNi.push(0);
            margTakeHome.push(100);
            margTakeHomeAndNi.push(100);

            ceiling.push(100);
            return;
        }

        // Average
        const tax = calculateIncomeTax(point);
        const ni = calculateNI(point);
        const taxPct = (tax / point) * 100;
        const niPct = (ni / point) * 100;
        const keepPct = Math.max(0, 100 - taxPct - niPct);

        avgTaxOnly.push(taxPct);
        avgTaxAndNi.push(taxPct + niPct);
        avgTakeHome.push(keepPct);
        avgTakeHomeAndNi.push(keepPct + niPct);

        // Marginal
        const tRate = getMarginalTaxRate(point);
        const nRate = getMarginalNIRate(point);
        const keepMarg = Math.max(0, 100 - tRate - nRate);

        margTaxOnly.push(tRate);
        margTaxAndNi.push(tRate + nRate);
        margTakeHome.push(keepMarg);
        margTakeHomeAndNi.push(keepMarg + nRate);

        ceiling.push(100);
    });

    // Gradients
    const greenGradient = ctx.createLinearGradient(0, 0, 0, 400);
    greenGradient.addColorStop(0, 'rgba(74, 222, 128, 0.7)');
    greenGradient.addColorStop(1, 'rgba(74, 222, 128, 0.3)');

    const redGradient = ctx.createLinearGradient(0, 0, 0, 400);
    redGradient.addColorStop(0, 'rgba(248, 113, 113, 0.9)');
    redGradient.addColorStop(1, 'rgba(248, 113, 113, 0.5)');

    const orangeGradient = ctx.createLinearGradient(0, 0, 0, 400);
    orangeGradient.addColorStop(0, 'rgba(251, 146, 60, 0.9)');
    orangeGradient.addColorStop(1, 'rgba(251, 146, 60, 0.5)');

    if (taxChart) taxChart.destroy();

    let datasets;
    let yAxisTitle;

    if (showMarginal) {
        // --- Marginal view ---
        yAxisTitle = 'Share of your next £ (%)';

        if (isRedBottom) {
            // Red bottom
            datasets = [
                {
                    label: 'Income Tax (next £)',
                    data: margTaxOnly,
                    borderColor: '#f87171',
                    borderWidth: 2,
                    stepped: 'after',
                    fill: 'origin',
                    backgroundColor: redGradient,
                    pointRadius: 0
                },
                {
                    label: 'National Insurance (next £)',
                    data: margTaxAndNi,
                    borderColor: '#fb923c',
                    borderWidth: 2,
                    stepped: 'after',
                    fill: '-1',
                    backgroundColor: orangeGradient,
                    pointRadius: 0
                },
                {
                    label: 'You Keep (next £)',
                    data: ceiling,
                    borderColor: 'transparent',
                    stepped: 'after',
                    fill: '-1',
                    backgroundColor: greenGradient,
                    pointRadius: 0
                }
            ];
        } else {
            // Green bottom
            datasets = [
                {
                    label: 'You Keep (next £)',
                    data: margTakeHome,
                    borderColor: '#4ade80',
                    borderWidth: 2,
                    stepped: 'after',
                    fill: 'origin',
                    backgroundColor: greenGradient,
                    pointRadius: 0
                },
                {
                    label: 'National Insurance (next £)',
                    data: margTakeHomeAndNi,
                    borderColor: '#fb923c',
                    borderWidth: 2,
                    stepped: 'after',
                    fill: '-1',
                    backgroundColor: orangeGradient,
                    pointRadius: 0
                },
                {
                    label: 'Income Tax (next £)',
                    data: ceiling,
                    borderColor: 'transparent',
                    stepped: 'after',
                    fill: '-1',
                    backgroundColor: redGradient,
                    pointRadius: 0
                }
            ];
        }
    } else {
        // --- Average view ---
        yAxisTitle = 'Share of your total income (%)';

        if (isRedBottom) {
            // Red bottom
            datasets = [
                {
                    label: 'Income Tax (total)',
                    data: avgTaxOnly,
                    borderColor: '#f87171',
                    borderWidth: 2,
                    stepped: 'after',
                    fill: 'origin',
                    backgroundColor: redGradient,
                    pointRadius: 0
                },
                {
                    label: 'National Insurance (total)',
                    data: avgTaxAndNi,
                    borderColor: '#fb923c',
                    borderWidth: 2,
                    stepped: 'after',
                    fill: '-1',
                    backgroundColor: orangeGradient,
                    pointRadius: 0
                },
                {
                    label: 'You Keep (total)',
                    data: ceiling,
                    borderColor: 'transparent',
                    stepped: 'after',
                    fill: '-1',
                    backgroundColor: greenGradient,
                    pointRadius: 0
                }
            ];
        } else {
            // Green bottom
            datasets = [
                {
                    label: 'You Keep (total)',
                    data: avgTakeHome,
                    borderColor: '#4ade80',
                    borderWidth: 2,
                    stepped: 'after',
                    fill: 'origin',
                    backgroundColor: greenGradient,
                    pointRadius: 0
                },
                {
                    label: 'National Insurance (total)',
                    data: avgTakeHomeAndNi,
                    borderColor: '#fb923c',
                    borderWidth: 2,
                    stepped: 'after',
                    fill: '-1',
                    backgroundColor: orangeGradient,
                    pointRadius: 0
                },
                {
                    label: 'Income Tax (total)',
                    data: ceiling,
                    borderColor: 'transparent',
                    stepped: 'after',
                    fill: '-1',
                    backgroundColor: redGradient,
                    pointRadius: 0
                }
            ];
        }
    }

    const annotationsObj = {};
    const thresholdLines = [12570, 50270, 100000, 125140];
    thresholdLines.forEach((t, i) => {
        if (t < maxView) {
            annotationsObj['line' + i] = {
                type: 'line',
                xMin: t,
                xMax: t,
                borderColor: 'rgba(255,255,255,0.3)',
                borderDash: [5, 5],
                borderWidth: 1,
                label: {
                    display: true,
                    content: `£${t.toLocaleString()}`,
                    position: 'end',
                    color: '#cbd5e1',
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    font: { size: 9 }
                }
            };
        }
    });

    annotationsObj['userLine'] = {
        type: 'line',
        xMin: income,
        xMax: income,
        borderColor: '#fff',
        borderWidth: 2,
        borderDash: [2, 2],
        label: {
            display: true,
            content: 'You',
            position: 'start',
            backgroundColor: 'rgba(255,255,255,0.9)',
            color: '#0f172a',
            font: { weight: 'bold' }
        }
    };

    taxChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Annual Income (£)',
                        color: '#94a3b8'
                    },
                    ticks: { color: '#cbd5e1' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    max: maxView
                },
                y: {
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: yAxisTitle,
                        color: '#94a3b8'
                    },
                    ticks: { color: '#cbd5e1' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            },
            plugins: {
                legend: { display: false },
                annotation: { annotations: annotationsObj },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: (ctxTooltip) => {
                            const label = ctxTooltip.dataset.label || '';
                            const value = ctxTooltip.parsed.y;
                            const suffix = showMarginal
                                ? ' of your next £'
                                : ' of your total income';
                            return `${label}: ${value.toFixed(1)}%${suffix}`;
                        }
                    }
                }
            }
        }
    });
}

// --- Comparison chart (unchanged logic) ---
function updateComparisonChart(income) {
    const maxRange = Math.max(income * 1.2, 120000);
    const step = maxRange / 50;
    const labels = [];
    const dataPoints = [];

    for (let i = 0; i <= maxRange; i += step) {
        labels.push(i);
        const total = calculateIncomeTax(i) + calculateNI(i);
        dataPoints.push(i - total);
    }

    if (comparisonChart) comparisonChart.destroy();

    comparisonChart = new Chart(ctxComp, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Take Home',
                    data: dataPoints,
                    borderColor: '#38bdf8',
                    borderWidth: 3,
                    tension: 0.4,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Gross (£)', color: '#94a3b8' },
                    ticks: { color: '#cbd5e1' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    title: { display: true, text: 'Net (£)', color: '#94a3b8' },
                    ticks: { color: '#cbd5e1' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            },
            plugins: {
                legend: { display: false },
                annotation: {
                    annotations: {
                        userPoint: {
                            type: 'point',
                            xValue: income,
                            yValue: income - (calculateIncomeTax(income) + calculateNI(income)),
                            backgroundColor: '#4ade80',
                            radius: 6,
                            borderColor: '#fff',
                            borderWidth: 2
                        }
                    }
                }
            }
        }
    });
}

// --- Download Logic ---
function downloadChart(format) {
    const canvas = document.getElementById('taxChart');
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = '#0f172a';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);

    const link = document.createElement('a');
    link.download = `tax-visualiser-chart.${format}`;
    link.href = tempCanvas.toDataURL(`image/${format}`, 1.0);
    link.click();
}

// --- New: create Average/Marginal toggle in the UI ---
function setupRateModeToggle() {
    // Find the existing Graph View toggle-group
    const existingToggleGroup = document.querySelector('.input-card .toggle-group');
    if (!existingToggleGroup) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'toggle-group';
    wrapper.innerHTML = `
        <label>Rate Mode</label>
        <div class="toggle-wrapper">
            <span class="toggle-label">Average</span>
            <label class="switch">
                <input type="checkbox" id="rateModeToggle">
                <span class="slider round"></span>
            </label>
            <span class="toggle-label">Marginal</span>
        </div>
        <p class="toggle-caption" id="rateModeCaption">Showing: Average view</p>
    `;

    // Insert just after the existing toggle-group
    existingToggleGroup.parentNode.insertBefore(wrapper, existingToggleGroup.nextSibling);

    rateModeToggle = document.getElementById('rateModeToggle');
    rateModeCaption = document.getElementById('rateModeCaption');

    if (rateModeToggle) {
        rateModeToggle.addEventListener('change', () => {
            updateRateModeCaption();
            const income = parseFloat(incomeInput.value) || 0;
            updateChart(income);
        });
    }
}

function updateRateModeCaption() {
    if (!rateModeCaption || !rateModeToggle) return;
    if (rateModeToggle.checked) {
        rateModeCaption.textContent = 'Showing: Marginal view (next £)';
    } else {
        rateModeCaption.textContent = 'Showing: Average view (total income)';
    }
}

// --- Main ---
function processInput() {
    const income = parseFloat(incomeInput.value);
    if (isNaN(income) || income < 0) {
        alert('Invalid income');
        return;
    }
    const tax = calculateIncomeTax(income);
    const ni = calculateNI(income);
    const total = tax + ni;
    const takeHome = income - total;
    const rate = income > 0 ? (total / income) * 100 : 0;

    totalTaxDisplay.textContent = formatCurrency(total);
    takeHomeDisplay.textContent = formatCurrency(takeHome);
    effectiveRateDisplay.textContent = rate.toFixed(1) + '%';

    updateBreakdownUI(income, tax, ni);
    generateFormula(income);
    updateChart(income);
    updateComparisonChart(income);
}

// Event Listeners
document.getElementById('btnDownloadPNG').addEventListener('click', () =>
    downloadChart('png')
);
document.getElementById('btnDownloadJPEG').addEventListener('click', () =>
    downloadChart('jpeg')
);
calculateBtn.addEventListener('click', processInput);
niLetterSelect.addEventListener('change', processInput);
viewToggle.addEventListener('change', () =>
    updateChart(parseFloat(incomeInput.value) || 0)
);
incomeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') processInput();
});

// Initialise after everything is loaded
window.addEventListener('load', () => {
    setupRateModeToggle();
    processInput();
});
