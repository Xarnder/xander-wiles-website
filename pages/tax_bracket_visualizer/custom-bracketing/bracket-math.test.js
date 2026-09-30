/**
 * Run: node --test pages/tax_bracket_visualizer/custom-bracketing/bracket-math.test.js
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const math = require('./bracket-math.js');

function bracket(from, to, rates, names) {
    return {
        id: 'b-' + from + '-' + String(to),
        from: from,
        to: to,
        deductions: (Array.isArray(rates) ? rates : [rates]).map(function (rate, index) {
            return {
                id: 'd-' + from + '-' + index,
                name: names && names[index] ? names[index] : '',
                rate: rate
            };
        })
    };
}

const example = [
    bracket(0, 12570, [0], ['Income Tax']),
    bracket(12570, 29385, [20, 8], ['Income Tax', 'National Insurance']),
    bracket(29385, 52280, [20, 8, 9], ['Income Tax', 'National Insurance', 'Student Loan']),
    bracket(52280, null, [40, 2, 9], ['Income Tax', 'National Insurance', 'Student Loan'])
];

test('£0 income keeps nothing to deduct and does not return NaN', function () {
    const result = math.calculateCustomNetIncome(0, example);
    assert.equal(result.ok, true);
    assert.equal(result.net, 0);
    assert.equal(result.totalDeducted, 0);
    assert.equal(result.effectiveRate, 0);
    assert.equal(Number.isNaN(result.net), false);
});

test('income inside the 0% bracket is kept in full', function () {
    const result = math.calculateCustomNetIncome(10000, example);
    assert.equal(result.ok, true);
    assert.equal(result.totalDeducted, 0);
    assert.equal(result.net, 10000);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].slice, 10000);
});

test('income exactly on a boundary stays in the lower bracket', function () {
    const amount = math.calculateBracketAmount(12570, example[1]);
    assert.equal(amount, 0);
    const result = math.calculateCustomNetIncome(12570, example);
    assert.equal(result.totalDeducted, 0);
    assert.equal(result.net, 12570);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].slice, 12570);
});

test('one penny above a boundary enters the next bracket', function () {
    const bands = [
        bracket(0, 100, 10),
        bracket(100, null, 50)
    ];
    const onBoundary = math.calculateCustomNetIncome(100, bands);
    assert.equal(onBoundary.totalDeducted, 10);
    assert.equal(onBoundary.net, 90);
    assert.equal(math.calculateBracketAmount(100, bands[1]), 0);

    const above = math.calculateCustomNetIncome(100.01, bands);
    assert.equal(above.rows.length, 2);
    assert.equal(above.rows[1].slice, 0.01);
    assert.equal(above.totalDeducted, 10.01);
    assert.equal(above.net, 90);
});

test('income spanning two brackets uses each rate only on its slice', function () {
    const bands = [
        bracket(0, 1000, 0),
        bracket(1000, null, 10)
    ];
    const result = math.calculateCustomNetIncome(1500, bands);
    assert.equal(result.rows[0].deducted, 0);
    assert.equal(result.rows[1].slice, 500);
    assert.equal(result.rows[1].deducted, 50);
    assert.equal(result.net, 1450);
});

test('£45,000 across the example brackets matches the marginal breakdown', function () {
    const result = math.calculateCustomNetIncome(45000, example);
    assert.equal(result.ok, true);
    assert.deepEqual(result.rows.map(function (row) {
        return [row.slice, row.rate, row.deducted, row.kept];
    }), [
        [12570, 0, 0, 12570],
        [16815, 28, 4708.2, 12106.8],
        [15615, 37, 5777.55, 9837.45]
    ]);
    assert.equal(result.totalDeducted, 10485.75);
    assert.equal(result.net, 34514.25);
    assert.equal(math.roundMoney(result.effectiveRate), 23.3);
    assert.equal(math.roundMoney(result.keepRate), 76.7);
    assert.equal(result.equivalents.monthly, 34514.25 / 12);
    assert.equal(result.equivalents.weekly, 34514.25 / 52);
});

test('income in the open-ended bracket is charged only above the last boundary', function () {
    const result = math.calculateCustomNetIncome(60000, example);
    const open = result.rows[result.rows.length - 1];
    assert.equal(open.from, 52280);
    assert.equal(open.slice, 7720);
    assert.equal(open.rate, 51);
    assert.equal(open.deducted, math.roundMoney(7720 * 0.51));
    assert.equal(result.net, math.roundMoney(60000 - result.totalDeducted));
});

test('several deductions in one bracket are summed and itemised', function () {
    const bands = [bracket(0, null, [20, 8, 9], ['Tax', 'NI', 'Loan'])];
    const result = math.calculateCustomNetIncome(1000, bands);
    assert.equal(math.calculateBracketDeduction(1000, bands[0]), 370);
    assert.equal(result.totalDeducted, 370);
    assert.equal(result.net, 630);
    assert.deepEqual(result.rows[0].parts.map(function (part) { return part.amount; }), [200, 80, 90]);
});

test('decimal percentages apply to the slice', function () {
    const bands = [bracket(0, null, 12.5)];
    const result = math.calculateCustomNetIncome(80, bands);
    assert.equal(result.totalDeducted, 10);
    assert.equal(result.net, 70);
});

test('0% and 100% totals keep all or none of the income', function () {
    const keepAll = math.calculateCustomNetIncome(80, [bracket(0, null, 0)]);
    assert.equal(keepAll.totalDeducted, 0);
    assert.equal(keepAll.net, 80);
    assert.equal(keepAll.keepRate, 100);

    const keepNone = math.calculateCustomNetIncome(80, [bracket(0, null, 100)]);
    assert.equal(keepNone.totalDeducted, 80);
    assert.equal(keepNone.net, 0);
    assert.equal(keepNone.effectiveRate, 100);
});

test('adding and removing a boundary keeps a continuous range from £0', function () {
    const added = math.addBoundary(example, 80000);
    assert.equal(added.ok, true);
    assert.equal(added.brackets.length, 5);
    assert.equal(added.brackets[0].from, 0);
    assert.equal(added.brackets[3].to, 80000);
    assert.equal(added.brackets[4].from, 80000);
    assert.equal(added.brackets[4].to, null);
    assert.equal(added.brackets[4].deductions.length, 3);

    const removed = math.removeBracket(added.brackets, added.brackets.length - 1);
    assert.equal(removed.ok, true);
    assert.equal(removed.brackets.length, 4);
    assert.equal(removed.brackets[0].from, 0);
    assert.equal(removed.brackets[3].from, 52280);
    assert.equal(removed.brackets[3].to, null);

    const calculated = math.calculateCustomNetIncome(45000, removed.brackets);
    assert.equal(calculated.ok, true);
    assert.equal(calculated.net, 34514.25);
});

test('adding and removing deductions changes the bracket total', function () {
    const added = math.addDeduction(example, 0);
    assert.equal(added.ok, true);
    assert.equal(added.brackets[0].deductions.length, 2);
    assert.equal(math.deductionRate(added.brackets[0].deductions), 0);

    const removed = math.removeDeduction(example, 1, example[1].deductions[1].id);
    assert.equal(removed.brackets[1].deductions.length, 1);
    assert.equal(math.deductionRate(removed.brackets[1].deductions), 20);
    const result = math.calculateCustomNetIncome(20000, removed.brackets);
    assert.equal(result.rows[1].rate, 20);
    assert.equal(result.rows[1].deducted, math.roundMoney(7430 * 0.2));
});

test('kept percent rewrites the deductions so the cut is 100 minus kept', function () {
    const updated = math.setBracketKeep(example, 1, 72);
    assert.equal(updated.ok, true);
    assert.equal(math.deductionRate(updated.brackets[1].deductions), 28);
    assert.equal(math.keepRate(updated.brackets[1].deductions), 72);

    const halved = math.setBracketCut(example, 1, 14);
    assert.equal(halved.ok, true);
    assert.equal(math.deductionRate(halved.brackets[1].deductions), 14);
    assert.equal(math.keepRate(halved.brackets[1].deductions), 86);
});

test('invalid brackets are rejected without a NaN result', function () {
    const overlap = math.calculateCustomNetIncome(1000, [
        bracket(0, 500, 10),
        { id: 'gap', from: 400, to: null, deductions: [{ id: 'x', name: '', rate: 10 }] }
    ]);
    assert.equal(overlap.ok, false);
    assert.equal(Number.isNaN(overlap.net), false);
    assert.ok(overlap.errors.length > 0);

    const negative = math.validateBrackets(1000, [bracket(0, null, -5)]);
    assert.ok(negative.some(function (error) { return /negative/.test(error); }));

    const over = math.validateBrackets(1000, [bracket(0, null, [60, 50])]);
    assert.ok(over.some(function (error) { return /100%/.test(error); }));

    const crossed = math.setBracketEnd(example, 1, 12570);
    assert.equal(crossed.ok, false);
    assert.equal(example[1].to, 29385);

    const backwards = math.setBracketEnd(example, 0, 40000);
    assert.equal(backwards.ok, false);

    const badIncome = math.calculateCustomNetIncome(-1, example);
    assert.equal(badIncome.ok, false);
    assert.equal(badIncome.net, 0);
});

function assertMatchesNetDifference(current, extra, brackets) {
    const result = math.calculateAdditionalNetIncome(current, extra, brackets);
    const finalIncome = math.roundMoney(math.roundMoney(current) + math.roundMoney(extra));
    const before = math.calculateCustomNetIncome(math.roundMoney(current), brackets);
    const after = math.calculateCustomNetIncome(finalIncome, brackets);
    assert.equal(result.ok, true);
    assert.equal(result.additionalNet, math.roundMoney(after.net - before.net));
    assert.equal(result.additionalDeductions, math.roundMoney(after.totalDeducted - before.totalDeducted));
    const deducted = math.roundMoney(result.breakdown.reduce(function (sum, row) { return sum + row.deducted; }, 0));
    const kept = math.roundMoney(result.breakdown.reduce(function (sum, row) { return sum + row.kept; }, 0));
    assert.equal(deducted, result.additionalDeductions);
    assert.equal(kept, result.additionalNet);
}

test('additional income from £0 matches a total-income calculation', function () {
    const result = math.calculateAdditionalNetIncome(0, 45000, example);
    const total = math.calculateCustomNetIncome(45000, example);
    assert.equal(result.ok, true);
    assert.equal(result.additionalNet, total.net);
    assert.equal(result.additionalDeductions, total.totalDeducted);
    assert.equal(result.finalGrossIncome, 45000);
    assert.equal(result.breakdown.length, total.rows.length);
    assertMatchesNetDifference(0, 45000, example);
});

test('extra income entirely inside one bracket keeps that bracket rate', function () {
    const result = math.calculateAdditionalNetIncome(13000, 7000, example);
    assert.equal(result.ok, true);
    assert.equal(result.additionalGross, 7000);
    assert.equal(result.additionalDeductions, 1960);
    assert.equal(result.additionalNet, 5040);
    assert.equal(result.effectiveDeductionRate, 28);
    assert.equal(result.keepRate, 72);
    assert.equal(result.finalGrossIncome, 20000);
    assert.equal(result.breakdown.length, 1);
    assert.equal(result.breakdown[0].from, 13000);
    assert.equal(result.breakdown[0].to, 20000);
    assert.equal(result.breakdown[0].slice, 7000);
    assert.equal(result.breakdown[0].rate, 28);
    assert.notEqual(result.additionalDeductions, math.roundMoney(7000 * 0));
    assertMatchesNetDifference(13000, 7000, example);
});

test('extra income starting exactly on a boundary uses the next bracket', function () {
    const result = math.calculateAdditionalNetIncome(12570, 1000, example);
    assert.equal(result.ok, true);
    assert.equal(result.breakdown.length, 1);
    assert.equal(result.breakdown[0].from, 12570);
    assert.equal(result.breakdown[0].to, 13570);
    assert.equal(result.breakdown[0].slice, 1000);
    assert.equal(result.breakdown[0].rate, 28);
    assert.equal(result.additionalDeductions, 280);
    assert.equal(result.additionalNet, 720);
    assertMatchesNetDifference(12570, 1000, example);
});

test('extra income crossing one boundary is split, not charged at the top rate', function () {
    const result = math.calculateAdditionalNetIncome(28000, 5000, example);
    assert.equal(result.ok, true);
    assert.equal(result.finalGrossIncome, 33000);
    assert.equal(result.breakdown.length, 2);
    assert.deepEqual(result.breakdown.map(function (row) {
        return [row.from, row.to, row.slice, row.rate, row.deducted, row.kept];
    }), [
        [28000, 29385, 1385, 28, 387.8, 997.2],
        [29385, 33000, 3615, 37, 1337.55, 2277.45]
    ]);
    assert.equal(result.additionalDeductions, 1725.35);
    assert.equal(result.additionalNet, 3274.65);
    assert.equal(result.effectiveDeductionRate, 34.51);
    assert.equal(result.keepRate, 65.49);
    assert.ok(result.additionalDeductions < math.roundMoney(5000 * 0.37));
    assertMatchesNetDifference(28000, 5000, example);
});

test('extra income crossing several brackets keeps each band rate', function () {
    const result = math.calculateAdditionalNetIncome(10000, 40000, example);
    assert.equal(result.ok, true);
    assert.equal(result.breakdown.length, 3);
    assert.deepEqual(result.breakdown.map(function (row) { return row.rate; }), [0, 28, 37]);
    assert.deepEqual(result.breakdown.map(function (row) { return row.slice; }), [2570, 16815, 20615]);
    assert.equal(result.additionalDeductions, math.roundMoney(16815 * 0.28) + math.roundMoney(20615 * 0.37));
    assert.ok(result.additionalDeductions < math.roundMoney(40000 * 0.37));
    assertMatchesNetDifference(10000, 40000, example);
});

test('extra income already inside the open-ended bracket uses only that rate', function () {
    const result = math.calculateAdditionalNetIncome(60000, 10000, example);
    assert.equal(result.ok, true);
    assert.equal(result.breakdown.length, 1);
    assert.equal(result.breakdown[0].from, 60000);
    assert.equal(result.breakdown[0].to, 70000);
    assert.equal(result.breakdown[0].rate, 51);
    assert.equal(result.additionalDeductions, 5100);
    assert.equal(result.additionalNet, 4900);
    assertMatchesNetDifference(60000, 10000, example);
});

test('zero extra income keeps the result at zero', function () {
    const result = math.calculateAdditionalNetIncome(28000, 0, example);
    assert.equal(result.ok, true);
    assert.equal(result.additionalGross, 0);
    assert.equal(result.additionalDeductions, 0);
    assert.equal(result.additionalNet, 0);
    assert.equal(result.finalGrossIncome, 28000);
    assert.equal(result.breakdown.length, 0);
    assert.equal(Number.isNaN(result.additionalNet), false);
    assertMatchesNetDifference(28000, 0, example);
});

test('a very large extra income stays finite and matches the net difference', function () {
    const result = math.calculateAdditionalNetIncome(10000, 10000000, example);
    assert.equal(result.ok, true);
    assert.equal(Number.isFinite(result.additionalNet), true);
    assert.equal(result.finalGrossIncome, 10010000);
    assert.equal(result.breakdown[result.breakdown.length - 1].rate, 51);
    assert.ok(result.additionalDeductions < math.roundMoney(10000000 * 0.51));
    assertMatchesNetDifference(10000, 10000000, example);
});

test('decimal deduction rates apply only to the extra income', function () {
    const bands = [
        bracket(0, 100, 10),
        bracket(100, null, 12.5)
    ];
    const result = math.calculateAdditionalNetIncome(90, 20, bands);
    assert.equal(result.ok, true);
    assert.equal(result.breakdown.length, 2);
    assert.equal(result.breakdown[0].slice, 10);
    assert.equal(result.breakdown[0].deducted, 1);
    assert.equal(result.breakdown[1].slice, 10);
    assert.equal(result.breakdown[1].rate, 12.5);
    assert.equal(result.breakdown[1].deducted, 1.25);
    assert.equal(result.additionalDeductions, 2.25);
    assert.equal(result.additionalNet, 17.75);
    assertMatchesNetDifference(90, 20, bands);
});

test('invalid additional income does not produce NaN', function () {
    const negative = math.calculateAdditionalNetIncome(-5, 1000, example);
    assert.equal(negative.ok, false);
    assert.equal(negative.additionalNet, 0);
    assert.equal(Number.isNaN(negative.additionalNet), false);

    const missing = math.calculateAdditionalNetIncome(1000, Number.NaN, example);
    assert.equal(missing.ok, false);
    assert.equal(missing.breakdown.length, 0);

    const overlap = math.calculateAdditionalNetIncome(1000, 500, [
        bracket(0, 500, 10),
        { id: 'gap', from: 400, to: null, deductions: [{ id: 'x', name: '', rate: 10 }] }
    ]);
    assert.equal(overlap.ok, false);
    assert.equal(overlap.additionalNet, 0);
});

function assertDifferenceMatchesNets(current, next, brackets) {
    const result = math.calculateIncomeDifference(current, next, brackets);
    const before = math.calculateCustomNetIncome(current, brackets);
    const after = math.calculateCustomNetIncome(next, brackets);
    assert.equal(result.ok, true);
    assert.equal(before.ok, true);
    assert.equal(after.ok, true);
    assert.equal(result.netDifference, math.roundMoney(after.net - before.net));
    assert.equal(result.currentNet, before.net);
    assert.equal(result.newNet, after.net);
    assert.equal(result.grossDifference, math.roundMoney(math.roundMoney(next) - math.roundMoney(current)));
    assert.equal(result.deductionsOnDifference, math.roundMoney(result.grossDifference - result.netDifference));
    const deducted = math.roundMoney(result.breakdown.reduce(function (sum, row) { return sum + row.deducted; }, 0));
    const kept = math.roundMoney(result.breakdown.reduce(function (sum, row) { return sum + row.kept; }, 0));
    if (result.grossDifference === 0) {
        assert.equal(result.breakdown.length, 0);
        assert.equal(result.keepRateOnIncrease, null);
        assert.equal(result.effectiveCutOnIncrease, null);
    } else {
        assert.equal(deducted, Math.abs(result.deductionsOnDifference));
        assert.equal(kept, Math.abs(result.netDifference));
    }
    if (result.grossDifference > 0) {
        const span = math.calculateAdditionalNetIncome(current, math.roundMoney(next - current), brackets);
        assert.equal(result.netDifference, span.additionalNet);
        assert.equal(result.keepRateOnIncrease, span.keepRate);
        assert.equal(result.effectiveCutOnIncrease, span.effectiveDeductionRate);
    } else {
        assert.equal(result.keepRateOnIncrease, null);
        assert.equal(result.effectiveCutOnIncrease, null);
    }
    assert.equal(Number.isNaN(result.netDifference), false);
    assert.equal(Number.isFinite(result.netDifference), true);
}

test('the same salary twice has no take-home change', function () {
    const result = math.calculateIncomeDifference(30000, 30000, example);
    assert.equal(result.direction, 'same');
    assert.equal(result.grossDifference, 0);
    assert.equal(result.netDifference, 0);
    assert.equal(result.deductionsOnDifference, 0);
    assert.equal(result.equivalents.monthly, 0);
    assertDifferenceMatchesNets(30000, 30000, example);
});

test('a higher new salary reports the take-home increase', function () {
    const result = math.calculateIncomeDifference(30000, 40000, example);
    assert.equal(result.direction, 'increase');
    assert.equal(result.grossDifference, 10000);
    assert.equal(result.netDifference, 6300);
    assert.equal(result.deductionsOnDifference, 3700);
    assert.equal(result.keepRateOnIncrease, 63);
    assert.equal(result.effectiveCutOnIncrease, 37);
    assert.equal(result.equivalents.monthly, 525);
    assert.equal(result.equivalents.annual, 6300);
    assert.equal(result.equivalents.weekly, 6300 / 52);
    assert.equal(result.breakdown.length, 1);
    assert.equal(result.breakdown[0].from, 30000);
    assert.equal(result.breakdown[0].to, 40000);
    assert.equal(result.breakdown[0].slice, 10000);
    assert.equal(result.breakdown[0].rate, 37);
    assert.equal(result.breakdown[0].deducted, 3700);
    assert.equal(result.breakdown[0].kept, 6300);
    assertDifferenceMatchesNets(30000, 40000, example);
});

test('a lower new salary reports a take-home decrease without a keep rate', function () {
    const result = math.calculateIncomeDifference(50000, 42000, example);
    assert.equal(result.direction, 'decrease');
    assert.equal(result.grossDifference, -8000);
    assert.equal(result.netDifference, -5040);
    assert.equal(result.deductionsOnDifference, -2960);
    assert.equal(result.keepRateOnIncrease, null);
    assert.equal(result.effectiveCutOnIncrease, null);
    assert.equal(result.equivalents.monthly, math.roundMoney(-5040 / 12));
    assert.equal(result.breakdown.length, 1);
    assert.equal(result.breakdown[0].slice, 8000);
    assert.equal(result.breakdown[0].from, 42000);
    assert.equal(result.breakdown[0].to, 50000);
    assert.equal(result.breakdown[0].deducted, 2960);
    assert.equal(result.breakdown[0].kept, 5040);
    assertDifferenceMatchesNets(50000, 42000, example);
});

test('a salary increase entirely inside one bracket uses that bracket rate', function () {
    const result = math.calculateIncomeDifference(30000, 40000, example);
    assert.equal(result.breakdown.length, 1);
    assert.equal(result.breakdown[0].rate, 37);
    assertDifferenceMatchesNets(30000, 40000, example);
});

test('a salary increase crossing one bracket boundary is split', function () {
    const result = math.calculateIncomeDifference(28000, 35000, example);
    assert.equal(result.direction, 'increase');
    assert.equal(result.grossDifference, 7000);
    assert.equal(result.breakdown.length, 2);
    assert.equal(result.breakdown[0].from, 28000);
    assert.equal(result.breakdown[0].to, 29385);
    assert.equal(result.breakdown[0].slice, 1385);
    assert.equal(result.breakdown[0].rate, 28);
    assert.equal(result.breakdown[0].deducted, 387.8);
    assert.equal(result.breakdown[0].kept, 997.2);
    assert.equal(result.breakdown[1].from, 29385);
    assert.equal(result.breakdown[1].to, 35000);
    assert.equal(result.breakdown[1].slice, 5615);
    assert.equal(result.breakdown[1].rate, 37);
    assert.equal(result.breakdown[1].deducted, 2077.55);
    assert.equal(result.breakdown[1].kept, 3537.45);
    assert.equal(result.netDifference, 4534.65);
    assert.equal(result.deductionsOnDifference, 2465.35);
    assertDifferenceMatchesNets(28000, 35000, example);
});

test('a salary increase crossing several bracket boundaries is split across each', function () {
    const result = math.calculateIncomeDifference(10000, 60000, example);
    assert.equal(result.breakdown.length, 4);
    assert.equal(result.breakdown[0].rate, 0);
    assert.equal(result.breakdown[0].slice, 2570);
    assert.equal(result.breakdown[1].rate, 28);
    assert.equal(result.breakdown[2].rate, 37);
    assert.equal(result.breakdown[3].rate, 51);
    assert.equal(result.breakdown[3].from, 52280);
    assert.equal(result.breakdown[3].to, 60000);
    assertDifferenceMatchesNets(10000, 60000, example);
});

test('a current salary exactly on a bracket boundary starts the increase in the next bracket', function () {
    const result = math.calculateIncomeDifference(12570, 13570, example);
    assert.equal(result.breakdown.length, 1);
    assert.equal(result.breakdown[0].from, 12570);
    assert.equal(result.breakdown[0].to, 13570);
    assert.equal(result.breakdown[0].rate, 28);
    assert.equal(result.breakdown[0].slice, 1000);
    assert.equal(result.netDifference, 720);
    assertDifferenceMatchesNets(12570, 13570, example);
});

test('a new salary exactly on a bracket boundary stays in the lower bracket', function () {
    const result = math.calculateIncomeDifference(28000, 29385, example);
    assert.equal(result.breakdown.length, 1);
    assert.equal(result.breakdown[0].from, 28000);
    assert.equal(result.breakdown[0].to, 29385);
    assert.equal(result.breakdown[0].rate, 28);
    assert.equal(result.breakdown[0].slice, 1385);
    assert.equal(result.breakdown[0].deducted, 387.8);
    assert.equal(result.breakdown[0].kept, 997.2);
    assertDifferenceMatchesNets(28000, 29385, example);
});

test('a salary increase entering the final open-ended bracket uses that rate on the remainder', function () {
    const result = math.calculateIncomeDifference(50000, 60000, example);
    assert.equal(result.breakdown.length, 2);
    assert.equal(result.breakdown[0].rate, 37);
    assert.equal(result.breakdown[0].from, 50000);
    assert.equal(result.breakdown[0].to, 52280);
    assert.equal(result.breakdown[1].rate, 51);
    assert.equal(result.breakdown[1].from, 52280);
    assert.equal(result.breakdown[1].to, 60000);
    assert.equal(result.breakdown[1].limit, null);
    assertDifferenceMatchesNets(50000, 60000, example);
});

test('decimal deduction rates apply to a salary difference', function () {
    const bands = [
        bracket(0, 100, 10),
        bracket(100, null, 12.5)
    ];
    const result = math.calculateIncomeDifference(90, 110, bands);
    assert.equal(result.breakdown.length, 2);
    assert.equal(result.breakdown[0].slice, 10);
    assert.equal(result.breakdown[0].deducted, 1);
    assert.equal(result.breakdown[1].slice, 10);
    assert.equal(result.breakdown[1].rate, 12.5);
    assert.equal(result.breakdown[1].deducted, 1.25);
    assert.equal(result.netDifference, 17.75);
    assert.equal(result.deductionsOnDifference, 2.25);
    assertDifferenceMatchesNets(90, 110, bands);
});

test('zero salaries compare as no change and a rise from zero matches total net', function () {
    const same = math.calculateIncomeDifference(0, 0, example);
    assert.equal(same.ok, true);
    assert.equal(same.netDifference, 0);
    assert.equal(same.breakdown.length, 0);
    assert.equal(Number.isNaN(same.netDifference), false);

    const rise = math.calculateIncomeDifference(0, 10000, example);
    assert.equal(rise.netDifference, 10000);
    assert.equal(rise.deductionsOnDifference, 0);
    assertDifferenceMatchesNets(0, 0, example);
    assertDifferenceMatchesNets(0, 10000, example);
});

test('a very large salary difference stays finite and matches the net difference', function () {
    const result = math.calculateIncomeDifference(10000, 10010000, example);
    assert.equal(result.ok, true);
    assert.equal(Number.isFinite(result.netDifference), true);
    assert.equal(result.breakdown[result.breakdown.length - 1].rate, 51);
    assertDifferenceMatchesNets(10000, 10010000, example);
});

test('invalid salary difference does not produce NaN', function () {
    const negative = math.calculateIncomeDifference(-5, 40000, example);
    assert.equal(negative.ok, false);
    assert.equal(negative.netDifference, 0);
    assert.equal(negative.keepRateOnIncrease, null);
    assert.equal(Number.isNaN(negative.netDifference), false);

    const missing = math.calculateIncomeDifference(30000, Number.NaN, example);
    assert.equal(missing.ok, false);
    assert.equal(missing.breakdown.length, 0);
});

test('blank names fall back to Deduction N and empty amounts parse safely', function () {
    assert.equal(math.deductionLabel({ name: '  ' }, 0), 'Deduction 1');
    assert.equal(math.deductionLabel({ name: 'Fee' }, 2), 'Fee');
    assert.deepEqual(math.parseAmount(''), { empty: true });
    assert.deepEqual(math.parseAmount('£12,570.50'), { value: 12570.5 });
    assert.equal(math.parsePercent('').empty, true);
    assert.equal(math.parsePercent('-2').negative, true);
    assert.equal(math.parsePercent('8.75').value, 8.75);
});
