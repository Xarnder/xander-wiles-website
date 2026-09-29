// Shared UK tax maths used by the visualiser and the income calculator.
// Classic script: constants are globals so script.js can keep using them.

var PERSONAL_ALLOWANCE_DEFAULT = 12570;
var TAPER_THRESHOLD = 100000;
var BASIC_RATE_LIMIT = 50270;
var HIGHER_RATE_LIMIT = 125140;

var RATE_BASIC = 0.20;
var RATE_HIGHER = 0.40;
var RATE_ADDITIONAL = 0.45;

var DIVIDEND_ALLOWANCE = 500;
var DIVIDEND_RATE_BASIC = 0.0875;
var DIVIDEND_RATE_HIGHER = 0.3375;
var DIVIDEND_RATE_ADDITIONAL = 0.3935;

var CGT_ALLOWANCE = 3000;
var CGT_RATE_BASIC = 0.18;
var CGT_RATE_HIGHER = 0.24;

var NI_PRIMARY_THRESHOLD = 12570;
var NI_UPPER_LIMIT = 50270;

var PGL_THRESHOLD = 21000;
var PGL_RATE = 0.06;
var STUDENT_LOAN_PLANS = {
    plan1: {
        label: 'Plan 1',
        threshold: 26900,
        rate: 0.09,
        hint: 'Plan 1 (2026/27): repay 9% of income above £26,900. Based on gross pay before tax & NI.'
    },
    plan2: {
        label: 'Plan 2',
        threshold: 29385,
        rate: 0.09,
        hint: 'Plan 2 (2026/27): repay 9% of income above £29,385. Based on gross pay before tax & NI.'
    },
    plan4: {
        label: 'Plan 4',
        threshold: 33795,
        rate: 0.09,
        hint: 'Plan 4 / Scotland (2026/27): repay 9% of income above £33,795. Based on gross pay before tax & NI.'
    },
    plan5: {
        label: 'Plan 5',
        threshold: 25000,
        rate: 0.09,
        hint: 'Plan 5 (2026/27): repay 9% of income above £25,000. Based on gross pay before tax & NI.'
    },
    pgl: {
        label: 'Postgraduate Loan',
        threshold: PGL_THRESHOLD,
        rate: PGL_RATE,
        hint: 'Postgraduate Loan: repay 6% of income above £21,000. Can stack with an undergraduate plan.'
    },
    custom: {
        label: 'Custom',
        threshold: 29385,
        rate: 0.09,
        hint: 'Custom estimate: set any repayment threshold and percentage cut. Still applied to gross income.'
    }
};

function getPersonalAllowance(income) {
    if (income <= TAPER_THRESHOLD) return PERSONAL_ALLOWANCE_DEFAULT;
    const reduction = (income - TAPER_THRESHOLD) / 2;
    return Math.max(0, PERSONAL_ALLOWANCE_DEFAULT - reduction);
}

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

function nationalInsurance(income, type = 'paye', letter = 'A') {
    if (type === 'dividends' || type === 'cgt') return 0;

    const rates = getNIRates(letter);
    let ni = 0;

    if (income > NI_PRIMARY_THRESHOLD) {
        ni += (Math.min(income, NI_UPPER_LIMIT) - NI_PRIMARY_THRESHOLD) * rates.main;
    }
    if (income > NI_UPPER_LIMIT) {
        ni += (income - NI_UPPER_LIMIT) * rates.upper;
    }
    return ni;
}

function studentLoanAmount(income, type, cfg) {
    if (type !== 'paye' || !cfg || !cfg.enabled) return 0;

    let repayment = Math.max(0, income - cfg.threshold) * cfg.rate;
    if (cfg.planKey !== 'pgl' && cfg.includePgl) {
        repayment += Math.max(0, income - cfg.pglThreshold) * cfg.pglRate;
    }
    return repayment;
}

function takeHome(gross, type = 'paye', options = {}) {
    const tax = calculateIncomeTax(gross, type);
    const ni = nationalInsurance(gross, type, options.niLetter || 'A');
    const loan = studentLoanAmount(gross, type, options.studentLoan || null);
    const total = tax + ni + loan;
    return { gross, tax, ni, loan, total, net: gross - total };
}

function roundMoney(value) {
    return Math.round(value * 100) / 100;
}

function grossFromNet(targetNet, type = 'paye', options = {}) {
    if (targetNet <= 0) return 0;

    let low = 0;
    let high = Math.max(targetNet * 3, targetNet + 100000);
    let currentGross = 0;

    for (let i = 0; i < 60; i++) {
        currentGross = (low + high) / 2;
        const home = takeHome(currentGross, type, options);
        if (Math.abs(home.net - targetNet) < 0.005) break;
        if (home.net < targetNet) {
            low = currentGross;
        } else {
            high = currentGross;
        }
    }

    const penny = roundMoney(currentGross);
    const target = roundMoney(targetNet);
    let best = penny;
    let bestGap = Infinity;
    for (let pence = -2; pence <= 2; pence++) {
        const candidate = roundMoney(penny + pence / 100);
        if (candidate < 0) continue;
        const home = takeHome(candidate, type, options);
        const net = roundMoney(candidate - roundMoney(home.tax + home.ni + home.loan));
        const gap = Math.abs(net - target);
        if (gap < bestGap) {
            bestGap = gap;
            best = candidate;
        }
    }
    return best;
}

var UKTax = {
    incomeTax: calculateIncomeTax,
    nationalInsurance: nationalInsurance,
    studentLoan: studentLoanAmount,
    takeHome: takeHome,
    grossFromNet: grossFromNet,
    getPersonalAllowance: getPersonalAllowance,
    getNIRates: getNIRates
};
