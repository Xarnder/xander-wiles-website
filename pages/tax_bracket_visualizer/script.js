console.log("Debug: Script loaded successfully.");

// --- Constants (Tax 2024/25) ---
const PERSONAL_ALLOWANCE_DEFAULT = 12570;
const TAPER_THRESHOLD = 100000;
const BASIC_RATE_LIMIT = 50270;
const HIGHER_RATE_LIMIT = 125140;

const RATE_BASIC = 0.20;
const RATE_HIGHER = 0.40;
const RATE_ADDITIONAL = 0.45;

// --- Constants (Dividends & CGT) ---
const DIVIDEND_ALLOWANCE = 500;
const DIVIDEND_RATE_BASIC = 0.0875;
const DIVIDEND_RATE_HIGHER = 0.3375;
const DIVIDEND_RATE_ADDITIONAL = 0.3935;

const CGT_ALLOWANCE = 3000;
const CGT_RATE_BASIC = 0.18;
const CGT_RATE_HIGHER = 0.24;

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

// --- Passive Mode Elements ---
const passiveModeToggle = document.getElementById('passiveModeToggle');
const passiveIncomeTypeGroup = document.getElementById('passiveIncomeTypeGroup');
const passiveGoalGroup = document.getElementById('passiveGoalGroup');
const passiveValueGroup = document.getElementById('passiveValueGroup');
const passiveRateGroup = document.getElementById('passiveRateGroup');
const passiveSummaryCard = document.getElementById('passiveSummaryCard');
const passiveGraphCard = document.getElementById('passiveGraphCard');

const standardInputCard = document.getElementById('standardInputCard');
const standardIncomeGroup = document.getElementById('standardIncomeGroup');
const standardCalcBtnGroup = document.getElementById('standardCalcBtnGroup');
const standardSummaryCard = document.getElementById('standardSummaryCard');
const standardBreakdownCard = document.getElementById('standardBreakdownCard');
const standardFormulaCard = document.getElementById('standardFormulaCard');
const standardGraphCard1 = document.getElementById('standardGraphCard1');
const standardGraphCard2 = document.getElementById('standardGraphCard2');

const passiveIncomeTypeSelect = document.getElementById('passiveIncomeTypeSelect');
const passiveModeSelect = document.getElementById('passiveModeSelect');
const passiveValueInput = document.getElementById('passiveValueInput');
const passiveRateInput = document.getElementById('passiveRateInput');

const passivePotDisplay = document.getElementById('passivePotDisplay');
const passiveGrossDisplay = document.getElementById('passiveGrossDisplay');
const passiveTaxDisplay = document.getElementById('passiveTaxDisplay');
const passiveNetDisplay = document.getElementById('passiveNetDisplay');

// New toggle elements (created later)
let rateModeToggle = null;   // Average vs Marginal
let rateModeCaption = null;  // "Showing: Average view / Marginal view"

// Chart Contexts
const ctx = document.getElementById('taxChart').getContext('2d');
const ctxComp = document.getElementById('comparisonChart').getContext('2d');
const ctxPassive = document.getElementById('passiveChart') ? document.getElementById('passiveChart').getContext('2d') : null;

let taxChart = null;
let comparisonChart = null;
let passiveChart = null;

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

// --- Reverse Calculation: Gross from Net ---
function calculateGrossFromNet(targetNet, type = 'paye') {
    if (targetNet <= 0) return 0;
    
    let low = 0;
    let high = targetNet * 3; // safe upper bound
    let currentGross = 0;
    
    for (let i = 0; i < 60; i++) { // binary search iterations
        currentGross = (low + high) / 2;
        const tax = calculateIncomeTax(currentGross, type);
        const ni = calculateNI(currentGross, type);
        const net = currentGross - tax - ni;
        
        if (Math.abs(net - targetNet) < 0.01) break;
        
        if (net < targetNet) {
            low = currentGross;
        } else {
            high = currentGross;
        }
    }
    return currentGross;
}

// --- Calculation: Income Tax ---
function calculateIncomeTax(income, type = 'paye') {
    let tempIncome = income;
    let tax = 0;

    if (type === 'cgt') {
        const exemptChunk = Math.min(tempIncome, CGT_ALLOWANCE);
        tempIncome -= exemptChunk;
        
        const basicChunk = Math.min(tempIncome, BASIC_RATE_LIMIT);
        tax += basicChunk * CGT_RATE_BASIC;
        tempIncome -= basicChunk;
        
        if (tempIncome > 0) {
            tax += tempIncome * CGT_RATE_HIGHER;
        }
        return tax;
    }

    const allowance = getPersonalAllowance(income);
    const paChunk = Math.min(tempIncome, allowance);
    tempIncome -= paChunk;

    if (type === 'dividends') {
        const daChunk = Math.min(tempIncome, DIVIDEND_ALLOWANCE);
        tempIncome -= daChunk;
        
        const basicBandRemaining = Math.max(0, 37700 - daChunk);
        const basicChunk = Math.min(tempIncome, basicBandRemaining);
        tax += basicChunk * DIVIDEND_RATE_BASIC;
        tempIncome -= basicChunk;
        
        const accountedSoFar = allowance + daChunk + basicChunk;
        const higherBandSize = Math.max(0, HIGHER_RATE_LIMIT - accountedSoFar);
        const higherChunk = Math.min(tempIncome, higherBandSize);
        tax += higherChunk * DIVIDEND_RATE_HIGHER;
        tempIncome -= higherChunk;
        
        if (tempIncome > 0) {
            tax += tempIncome * DIVIDEND_RATE_ADDITIONAL;
        }
        return tax;
    }

    // Default PAYE logic
    const basicChunk = Math.min(tempIncome, 37700);
    tax += basicChunk * RATE_BASIC;
    tempIncome -= basicChunk;
    
    const accountedSoFar = allowance + basicChunk;
    const higherBandSize = Math.max(0, HIGHER_RATE_LIMIT - accountedSoFar);
    const higherChunk = Math.min(tempIncome, higherBandSize);
    tax += higherChunk * RATE_HIGHER;
    tempIncome -= higherChunk;
    
    if (tempIncome > 0) {
        tax += tempIncome * RATE_ADDITIONAL;
    }

    return tax;
}

// --- Calculation: NI ---
function calculateNI(income, type = 'paye') {
    if (type === 'dividends' || type === 'cgt') return 0;
    
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
function updateBreakdownUI(income, tax, ni, type = 'paye') {
    let html = '';

    if (type === 'cgt') {
        html += `<div class="breakdown-header">Capital Gains Tax</div>`;
        const exemptAmount = Math.min(income, CGT_ALLOWANCE);
        html += `<div class="breakdown-row">
                    <span class="breakdown-label">Annual Exempt Amount</span>
                    <span class="breakdown-val">£0 <span class="sub-text">on first ${formatCurrency(exemptAmount)}</span></span>
                 </div>`;
                 
        let tempIncome = Math.max(0, income - CGT_ALLOWANCE);
        if (tempIncome > 0) {
            const basicChunk = Math.min(tempIncome, BASIC_RATE_LIMIT);
            const taxBasic = basicChunk * CGT_RATE_BASIC;
            if (basicChunk > 0) {
                html += `<div class="breakdown-row">
                            <span class="breakdown-label">Basic Rate (18%)</span>
                            <span class="breakdown-val">${formatCurrency(taxBasic)} <span class="sub-text">on next ${formatCurrency(basicChunk)}</span></span>
                         </div>`;
            }
            
            tempIncome -= basicChunk;
            if (tempIncome > 0) {
                const taxHigher = tempIncome * CGT_RATE_HIGHER;
                html += `<div class="breakdown-row">
                            <span class="breakdown-label">Higher Rate (24%)</span>
                            <span class="breakdown-val">${formatCurrency(taxHigher)} <span class="sub-text">on remaining ${formatCurrency(tempIncome)}</span></span>
                         </div>`;
            }
        }
    } else if (type === 'dividends') {
        html += `<div class="breakdown-header">Dividend Tax</div>`;
        
        const allowance = getPersonalAllowance(income);
        const paChunk = Math.min(income, allowance);
        html += `<div class="breakdown-row">
                    <span class="breakdown-label">Personal Allowance</span>
                    <span class="breakdown-val">£0 <span class="sub-text">on first ${formatCurrency(paChunk)}</span></span>
                 </div>`;
                 
        let tempIncome = Math.max(0, income - paChunk);
        
        if (tempIncome > 0) {
            const daChunk = Math.min(tempIncome, DIVIDEND_ALLOWANCE);
            if (daChunk > 0) {
                html += `<div class="breakdown-row">
                            <span class="breakdown-label">Dividend Allowance</span>
                            <span class="breakdown-val">£0 <span class="sub-text">on next ${formatCurrency(daChunk)}</span></span>
                         </div>`;
            }
            tempIncome -= daChunk;
            
            const basicBandRemaining = Math.max(0, 37700 - daChunk);
            const basicChunk = Math.min(tempIncome, basicBandRemaining);
            const taxBasic = basicChunk * DIVIDEND_RATE_BASIC;
            
            if (basicChunk > 0) {
                html += `<div class="breakdown-row">
                            <span class="breakdown-label">Basic Rate (8.75%)</span>
                            <span class="breakdown-val">${formatCurrency(taxBasic)} <span class="sub-text">on next ${formatCurrency(basicChunk)}</span></span>
                         </div>`;
            }
            tempIncome -= basicChunk;
            
            const accountedSoFar = paChunk + daChunk + basicChunk;
            const higherBandSize = Math.max(0, HIGHER_RATE_LIMIT - accountedSoFar);
            const higherChunk = Math.min(tempIncome, higherBandSize);
            const taxHigher = higherChunk * DIVIDEND_RATE_HIGHER;
            
            if (higherChunk > 0) {
                html += `<div class="breakdown-row">
                            <span class="breakdown-label">Higher Rate (33.75%)</span>
                            <span class="breakdown-val">${formatCurrency(taxHigher)} <span class="sub-text">on next ${formatCurrency(higherChunk)}</span></span>
                         </div>`;
            }
            tempIncome -= higherChunk;
            
            if (tempIncome > 0) {
                const taxAdd = tempIncome * DIVIDEND_RATE_ADDITIONAL;
                html += `<div class="breakdown-row">
                            <span class="breakdown-label">Additional Rate (39.35%)</span>
                            <span class="breakdown-val">${formatCurrency(taxAdd)} <span class="sub-text">on remaining ${formatCurrency(tempIncome)}</span></span>
                         </div>`;
            }
        }
    } else {
        // PAYE breakdown
        const allowance = getPersonalAllowance(income);
        const paChunk = Math.min(income, allowance);
        html += `<div class="breakdown-header">Income Tax</div>`;
        html += `<div class="breakdown-row">
                    <span class="breakdown-label">Personal Allowance</span>
                    <span class="breakdown-val">£0 <span class="sub-text">on first ${formatCurrency(paChunk)}</span></span>
                 </div>`;

        let tempIncome = Math.max(0, income - paChunk);
        
        if (tempIncome > 0) {
            const basicChunk = Math.min(tempIncome, 37700);
            const taxBasic = basicChunk * RATE_BASIC;
            if (basicChunk > 0) {
                html += `<div class="breakdown-row">
                            <span class="breakdown-label">Basic Rate (20%)</span>
                            <span class="breakdown-val">${formatCurrency(taxBasic)} <span class="sub-text">on next ${formatCurrency(basicChunk)}</span></span>
                         </div>`;
            }

            tempIncome -= basicChunk;
            
            const accountedSoFar = paChunk + basicChunk;
            const higherBandSize = Math.max(0, HIGHER_RATE_LIMIT - accountedSoFar);
            const higherChunk = Math.min(tempIncome, higherBandSize);
            const taxHigher = higherChunk * RATE_HIGHER;
            
            if (higherChunk > 0) {
                html += `<div class="breakdown-row">
                            <span class="breakdown-label">Higher Rate (40%)</span>
                            <span class="breakdown-val">${formatCurrency(taxHigher)} <span class="sub-text">on next ${formatCurrency(higherChunk)}</span></span>
                         </div>`;
            }
            tempIncome -= higherChunk;

            if (tempIncome > 0) {
                const taxAdd = tempIncome * RATE_ADDITIONAL;
                html += `<div class="breakdown-row">
                            <span class="breakdown-label">Additional Rate (45%)</span>
                            <span class="breakdown-val">${formatCurrency(taxAdd)} <span class="sub-text">on remaining ${formatCurrency(tempIncome)}</span></span>
                         </div>`;
            }
        }
    }

    // NI breakdown (only for PAYE)
    if (type === 'paye') {
        const niRates = getNIRates(niLetterSelect.value);
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
    }

    breakdownList.innerHTML = html;
}

// --- UI: Formula text ---
function generateFormula(income, type = 'paye') {
    let parts = [];
    let tempIncome = income;

    if (type === 'cgt') {
        const exemptChunk = Math.min(tempIncome, CGT_ALLOWANCE);
        if (exemptChunk > 0) {
            parts.push(`(<span class="math-num">£${exemptChunk.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">1.00</span>)`);
        }
        tempIncome -= exemptChunk;

        const basicChunk = Math.min(tempIncome, BASIC_RATE_LIMIT);
        if (basicChunk > 0) {
            const mult = (1 - CGT_RATE_BASIC).toFixed(2);
            parts.push(`(<span class="math-num">£${basicChunk.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">${mult}</span>)`);
        }
        tempIncome -= basicChunk;

        if (tempIncome > 0) {
            const mult = (1 - CGT_RATE_HIGHER).toFixed(2);
            parts.push(`(<span class="math-num">£${tempIncome.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">${mult}</span>)`);
        }
    } else if (type === 'dividends') {
        const allowance = getPersonalAllowance(income);
        const paChunk = Math.min(tempIncome, allowance);
        if (paChunk > 0) {
            parts.push(`(<span class="math-num">£${paChunk.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">1.00</span>)`);
        }
        tempIncome -= paChunk;

        const daChunk = Math.min(tempIncome, DIVIDEND_ALLOWANCE);
        if (daChunk > 0) {
            parts.push(`(<span class="math-num">£${daChunk.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">1.00</span>)`);
        }
        tempIncome -= daChunk;

        const basicBandRemaining = Math.max(0, 37700 - daChunk);
        const basicChunk = Math.min(tempIncome, basicBandRemaining);
        if (basicChunk > 0) {
            const mult = (1 - DIVIDEND_RATE_BASIC).toFixed(4);
            parts.push(`(<span class="math-num">£${basicChunk.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">${mult}</span>)`);
        }
        tempIncome -= basicChunk;

        const accountedSoFar = paChunk + daChunk + basicChunk;
        const higherBandSize = Math.max(0, HIGHER_RATE_LIMIT - accountedSoFar);
        const higherChunk = Math.min(tempIncome, higherBandSize);
        if (higherChunk > 0) {
            const mult = (1 - DIVIDEND_RATE_HIGHER).toFixed(4);
            parts.push(`(<span class="math-num">£${higherChunk.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">${mult}</span>)`);
        }
        tempIncome -= higherChunk;

        if (tempIncome > 0) {
            const mult = (1 - DIVIDEND_RATE_ADDITIONAL).toFixed(4);
            parts.push(`(<span class="math-num">£${tempIncome.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">${mult}</span>)`);
        }
    } else {
        const niRates = getNIRates(niLetterSelect.value);
        const allowance = getPersonalAllowance(income);
        
        const paChunk = Math.min(tempIncome, allowance);
        if (paChunk > 0) {
            parts.push(`(<span class="math-num">£${paChunk.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">1.00</span>)`);
        }
        tempIncome -= paChunk;

        const basicChunk = Math.min(tempIncome, 37700);
        if (basicChunk > 0) {
            const mult = (1 - RATE_BASIC - niRates.main).toFixed(2);
            parts.push(`(<span class="math-num">£${basicChunk.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">${mult}</span>)`);
        }
        tempIncome -= basicChunk;

        const accountedSoFar = paChunk + basicChunk;
        const higherBandSize = Math.max(0, HIGHER_RATE_LIMIT - accountedSoFar);
        const higherChunk = Math.min(tempIncome, higherBandSize);
        if (higherChunk > 0) {
            const mult = (1 - RATE_HIGHER - niRates.upper).toFixed(2);
            parts.push(`(<span class="math-num">£${higherChunk.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">${mult}</span>)`);
        }
        tempIncome -= higherChunk;

        if (tempIncome > 0) {
            const mult = (1 - RATE_ADDITIONAL - niRates.upper).toFixed(2);
            parts.push(`(<span class="math-num">£${tempIncome.toLocaleString()}</span> <span class="math-op">×</span> <span class="math-mult">${mult}</span>)`);
        }
    }

    const tax = calculateIncomeTax(income, type);
    const ni = calculateNI(income, type);
    const takeHome = income - tax - ni;

    let html = parts.join('<span class="math-op"> + </span>');
    html += ` <span class="math-op"> = </span> <span class="math-total">${formatCurrency(takeHome)}</span>`;
    formulaDisplay.innerHTML = html;
}

// --- Marginal helpers (for marginal view) ---
function getMarginalTaxRate(incomePoint, type = 'paye') {
    if (type === 'cgt') {
        if (incomePoint <= CGT_ALLOWANCE) return 0;
        if (incomePoint <= CGT_ALLOWANCE + BASIC_RATE_LIMIT) return CGT_RATE_BASIC * 100;
        return CGT_RATE_HIGHER * 100;
    }

    const allowance = getPersonalAllowance(incomePoint);
    
    if (type === 'dividends') {
        if (incomePoint <= allowance + DIVIDEND_ALLOWANCE) return 0;
        if (incomePoint > 100000 && incomePoint <= 125140) return DIVIDEND_RATE_HIGHER * 100 + 20; // Taper effect
        if (incomePoint <= allowance + DIVIDEND_ALLOWANCE + 37700) return DIVIDEND_RATE_BASIC * 100;
        if (incomePoint <= HIGHER_RATE_LIMIT) return DIVIDEND_RATE_HIGHER * 100;
        return DIVIDEND_RATE_ADDITIONAL * 100;
    }

    // PAYE
    if (incomePoint <= allowance) return 0;
    if (incomePoint > 100000 && incomePoint <= 125140) return 60;

    if (incomePoint <= 50270) return 20;
    if (incomePoint <= 125140) return 40;
    return 45;
}

function getMarginalNIRate(incomePoint, type = 'paye') {
    if (type === 'dividends' || type === 'cgt') return 0;
    const rates = getNIRates(niLetterSelect.value);
    if (incomePoint <= NI_PRIMARY_THRESHOLD) return 0;
    if (incomePoint <= NI_UPPER_LIMIT) return rates.main * 100;
    return rates.upper * 100;
}

// --- Main Chart (supports Average vs Marginal + Green/Red bottom) ---
function updateChart(income, type = 'paye') {
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
        const tax = calculateIncomeTax(point, type);
        const ni = calculateNI(point, type);
        const taxPct = point > 0 ? (tax / point) * 100 : 0;
        const niPct = point > 0 ? (ni / point) * 100 : 0;
        const keepPct = Math.max(0, 100 - taxPct - niPct);

        avgTaxOnly.push(taxPct);
        avgTaxAndNi.push(taxPct + niPct);
        avgTakeHome.push(keepPct);
        avgTakeHomeAndNi.push(keepPct + niPct);

        // Marginal
        const tRate = getMarginalTaxRate(point, type);
        const nRate = getMarginalNIRate(point, type);
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
                            const pct = ctxTooltip.parsed.y;
                            const income = ctxTooltip.parsed.x;
                            const absValue = (pct / 100) * income;
                            const suffix = showMarginal
                                ? ' of your next £'
                                : ' of your total income';
                            
                            if (showMarginal) {
                                return `${label}: ${pct.toFixed(1)}%`;
                            } else {
                                return `${label}: ${pct.toFixed(1)}% (${formatCurrency(absValue)})`;
                            }
                        }
                    }
                }
            }
        }
    });
}

// --- Comparison chart (unchanged logic) ---
function updateComparisonChart(income, type = 'paye') {
    const maxRange = Math.max(income * 1.2, 120000);
    const step = maxRange / 50;
    const labels = [];
    const dataPoints = [];

    for (let i = 0; i <= maxRange; i += step) {
        labels.push(i);
        const total = calculateIncomeTax(i, type) + calculateNI(i, type);
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
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: (ctxTooltip) => {
                            const label = ctxTooltip.dataset.label || '';
                            const value = ctxTooltip.parsed.y;
                            const x = ctxTooltip.parsed.x;
                            return `${label}: ${formatCurrency(value)} at gross ${formatCurrency(x)}`;
                        }
                    }
                },
                annotation: {
                    annotations: {
                        userPoint: {
                            type: 'point',
                            xValue: income,
                            yValue: income - (calculateIncomeTax(income, type) + calculateNI(income, type)),
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

// --- Passive Logic ---
function processPassiveInput() {
    const mode = passiveModeSelect.value;
    const value = parseFloat(passiveValueInput.value);
    const ratePct = parseFloat(passiveRateInput.value);
    const type = passiveIncomeTypeSelect ? passiveIncomeTypeSelect.value : 'paye';
    
    if (isNaN(value) || value < 0 || isNaN(ratePct) || ratePct <= 0) {
        alert('Invalid inputs for passive mode');
        return;
    }
    
    const rate = ratePct / 100;
    let potSize = 0;
    let gross = 0;
    
    if (mode === 'pot') {
        potSize = value;
        gross = potSize * rate;
    } else if (mode === 'gross') {
        gross = value;
        potSize = gross / rate;
    } else if (mode === 'net') {
        gross = calculateGrossFromNet(value, type);
        potSize = gross / rate;
    }
    
    const tax = calculateIncomeTax(gross, type);
    const ni = calculateNI(gross, type);
    const totalTax = tax + ni;
    const net = gross - totalTax;
    
    passivePotDisplay.textContent = formatCurrency(potSize);
    passiveGrossDisplay.textContent = formatCurrency(gross);
    passiveTaxDisplay.textContent = formatCurrency(totalTax);
    passiveNetDisplay.textContent = formatCurrency(net);
    
    // Also update the standard UI components using the calculated gross
    const rate_eff = gross > 0 ? (totalTax / gross) * 100 : 0;
    totalTaxDisplay.textContent = formatCurrency(totalTax);
    takeHomeDisplay.textContent = formatCurrency(net);
    effectiveRateDisplay.textContent = rate_eff.toFixed(1) + '%';
    
    updateBreakdownUI(gross, tax, ni, type);
    generateFormula(gross, type);
    updateChart(gross, type);
    updateComparisonChart(gross, type);
    
    updatePassiveChart(potSize, ratePct, type);
}

function updatePassiveChart(currentPotSize, ratePct, type = 'paye') {
    if (!ctxPassive) return;
    const rate = ratePct / 100;
    const maxPot = Math.max(currentPotSize * 1.5, 2000000);
    const step = maxPot / 50;
    
    const labels = [];
    const netData = [];
    
    for (let i = 0; i <= maxPot; i += step) {
        labels.push(i);
        const g = i * rate;
        const t = calculateIncomeTax(g, type);
        const n = calculateNI(g, type);
        netData.push(g - t - n);
    }
    
    if (passiveChart) passiveChart.destroy();
    
    const greenGradient = ctxPassive.createLinearGradient(0, 0, 0, 400);
    greenGradient.addColorStop(0, 'rgba(74, 222, 128, 0.7)');
    greenGradient.addColorStop(1, 'rgba(74, 222, 128, 0.1)');
    
    const currentGross = currentPotSize * rate;
    const currentTax = calculateIncomeTax(currentGross, type);
    const currentNI = calculateNI(currentGross, type);
    const currentNet = currentGross - currentTax - currentNI;
    
    passiveChart = new Chart(ctxPassive, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Net Income',
                data: netData,
                borderColor: '#4ade80',
                backgroundColor: greenGradient,
                borderWidth: 3,
                fill: true,
                pointRadius: 0,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Investment Pot Size (£)', color: '#94a3b8' },
                    ticks: { color: '#cbd5e1' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    title: { display: true, text: 'Net Passive Income (£)', color: '#94a3b8' },
                    ticks: { color: '#cbd5e1' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    min: 0
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: (ctxTooltip) => {
                            const label = ctxTooltip.dataset.label || '';
                            const value = ctxTooltip.parsed.y;
                            const x = ctxTooltip.parsed.x;
                            return `Pot: ${formatCurrency(x)} -> Net: ${formatCurrency(value)}`;
                        }
                    }
                },
                annotation: {
                    annotations: {
                        userPoint: {
                            type: 'point',
                            xValue: currentPotSize,
                            yValue: currentNet,
                            backgroundColor: '#38bdf8',
                            radius: 6,
                            borderColor: '#fff',
                            borderWidth: 2,
                            label: {
                                display: true,
                                content: `Pot: ${formatCurrency(currentPotSize)}`,
                                position: 'top',
                                backgroundColor: 'rgba(0,0,0,0.8)',
                                color: '#fff'
                            }
                        }
                    }
                }
            }
        }
    });
}

// Event Listeners
document.getElementById('btnDownloadPNG').addEventListener('click', () =>
    downloadChart('png')
);
document.getElementById('btnDownloadJPEG').addEventListener('click', () =>
    downloadChart('jpeg')
);
calculateBtn.addEventListener('click', () => {
    if (passiveModeToggle && passiveModeToggle.checked) {
        processPassiveInput();
    } else {
        processInput();
    }
});
niLetterSelect.addEventListener('change', () => {
    if (passiveModeToggle && passiveModeToggle.checked) {
        processPassiveInput();
    } else {
        processInput();
    }
});
viewToggle.addEventListener('change', () =>
    updateChart(parseFloat(incomeInput.value) || 0)
);
incomeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') processInput();
});

// Passive Mode Event Listeners
if (passiveModeToggle) {
    passiveModeToggle.addEventListener('change', () => {
        const isPassive = passiveModeToggle.checked;
        
        if (isPassive) {
            // Disable annual income input
            incomeInput.disabled = true;
            incomeInput.parentElement.style.opacity = '0.5';
            
            // Show passive inputs in the same row
            if (passiveIncomeTypeGroup) passiveIncomeTypeGroup.style.display = 'block';
            if (passiveGoalGroup) passiveGoalGroup.style.display = 'block';
            if (passiveValueGroup) passiveValueGroup.style.display = 'block';
            if (passiveRateGroup) passiveRateGroup.style.display = 'block';
            
            // Show summary and graph
            passiveSummaryCard.style.display = 'grid';
            passiveGraphCard.style.display = 'flex';
            
            processPassiveInput();
        } else {
            // Enable annual income input
            incomeInput.disabled = false;
            incomeInput.parentElement.style.opacity = '1';
            
            // Hide passive inputs
            if (passiveIncomeTypeGroup) passiveIncomeTypeGroup.style.display = 'none';
            if (passiveGoalGroup) passiveGoalGroup.style.display = 'none';
            if (passiveValueGroup) passiveValueGroup.style.display = 'none';
            if (passiveRateGroup) passiveRateGroup.style.display = 'none';
            
            // Hide summary and graph
            passiveSummaryCard.style.display = 'none';
            passiveGraphCard.style.display = 'none';
            
            processInput();
        }
    });
}

if (passiveIncomeTypeSelect) {
    passiveIncomeTypeSelect.addEventListener('change', processPassiveInput);
}

if (passiveModeSelect) {
    passiveModeSelect.addEventListener('change', () => {
        const mode = passiveModeSelect.value;
        const label = document.querySelector('label[for="passiveValueInput"]');
        if (label) {
            if (mode === 'pot') {
                label.textContent = 'Pot Size (£)';
                passiveValueInput.placeholder = 'e.g. 1000000';
                passiveValueInput.value = '1000000';
            } else if (mode === 'gross') {
                label.textContent = 'Target Pre-Tax (£)';
                passiveValueInput.placeholder = 'e.g. 50000';
                passiveValueInput.value = '50000';
            } else if (mode === 'net') {
                label.textContent = 'Target Post-Tax (£)';
                passiveValueInput.placeholder = 'e.g. 40000';
                passiveValueInput.value = '40000';
            }
        }
        processPassiveInput();
    });
}

if (passiveValueInput) {
    passiveValueInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') processPassiveInput();
    });
}
if (passiveRateInput) {
    passiveRateInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') processPassiveInput();
    });
}

// Initialise after everything is loaded
window.addEventListener('load', () => {
    setupRateModeToggle();
    processInput();
});
