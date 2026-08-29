import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PAY_SCALES,
    accumulateDailyPayEarnings,
    computePayEarningsInWindow,
    computePayPeriodEarnings,
    filterPayPeriods,
    formatPayRate,
    getCombinedEquivalentHourlyRate,
    getCurrentPayUnitProgress,
    getEquivalentHourlyRate,
    isPayPeriodActive,
    sanitizePayPeriod,
    sanitizePayPeriods
} from './payPeriods.js';

function makeMonthlyPay(overrides = {}) {
    return sanitizePayPeriod({
        id: 'p1',
        amount: 2000,
        scale: PAY_SCALES.MONTH,
        startDate: '2026-08-01',
        endDate: null,
        dailyHours: 8,
        workingDaysPerWeek: 5,
        ...overrides
    });
}

test('sanitizePayPeriod defaults invalid scale and clamps values', () => {
    const period = sanitizePayPeriod({
        amount: -10,
        scale: 'fortnight',
        startDate: 'not-a-date',
        endDate: '2026-07-01',
        dailyHours: 40,
        workingDaysPerWeek: 9
    }, { startDate: '2026-08-01' });

    assert.equal(period.amount, 0);
    assert.equal(period.scale, PAY_SCALES.MONTH);
    assert.equal(period.startDate, '2026-08-01');
    assert.equal(period.endDate, '2026-08-01');
    assert.equal(period.dailyHours, 24);
    assert.equal(period.workingDaysPerWeek, 7);
});

test('sanitizePayPeriods drops zero-amount rows', () => {
    const periods = sanitizePayPeriods([
        { amount: 0, scale: 'month', startDate: '2026-08-01' },
        { amount: 2000, scale: 'month', startDate: '2026-08-01' }
    ]);
    assert.equal(periods.length, 1);
    assert.equal(periods[0].amount, 2000);
});

test('monthly pay accrues the full amount across a completed month', () => {
    const period = makeMonthlyPay();
    const now = new Date(2026, 8, 15, 12, 0, 0);
    const earned = computePayPeriodEarnings(
        period,
        new Date(2026, 7, 1),
        new Date(2026, 8, 1),
        now
    );
    assert.equal(Number(earned.toFixed(2)), 2000);
});

test('monthly pay prorates month-to-date and ignores the future', () => {
    const period = makeMonthlyPay();
    const now = new Date(2026, 7, 16, 0, 0, 0);
    const earned = computePayPeriodEarnings(
        period,
        new Date(2026, 7, 1),
        new Date(2026, 8, 1),
        now
    );

    // 15 elapsed days of 31 in August.
    assert.equal(Number(earned.toFixed(2)), Number(((2000 * 15) / 31).toFixed(2)));
});

test('monthly pay started mid-month is prorated', () => {
    const period = makeMonthlyPay({ startDate: '2026-08-16' });
    const now = new Date(2026, 8, 1, 0, 0, 0);
    const earned = computePayPeriodEarnings(
        period,
        new Date(2026, 7, 1),
        new Date(2026, 8, 1),
        now
    );

    assert.equal(Number(earned.toFixed(2)), Number(((2000 * 16) / 31).toFixed(2)));
});

test('ended pay period stops accruing after the last inclusive day', () => {
    const period = makeMonthlyPay({ startDate: '2026-07-01', endDate: '2026-07-31' });
    const now = new Date(2026, 7, 29, 12, 0, 0);

    assert.equal(isPayPeriodActive(period, now), false);
    assert.equal(computePayPeriodEarnings(
        period,
        new Date(2026, 7, 1),
        new Date(2026, 8, 1),
        now
    ), 0);
});

test('weekly pay uses the configured start of week', () => {
    const period = sanitizePayPeriod({
        amount: 700,
        scale: PAY_SCALES.WEEK,
        startDate: '2026-08-03',
        dailyHours: 8,
        workingDaysPerWeek: 5
    });
    const now = new Date(2026, 7, 10, 0, 0, 0);
    const mondayStart = new Date(2026, 7, 3);
    const nextMonday = new Date(2026, 7, 10);

    const earned = computePayPeriodEarnings(period, mondayStart, nextMonday, now, { startOfWeek: 1 });
    assert.equal(Number(earned.toFixed(2)), 700);
});

test('daily pay counts each covered calendar day', () => {
    const period = sanitizePayPeriod({
        amount: 100,
        scale: PAY_SCALES.DAY,
        startDate: '2026-08-01',
        dailyHours: 8,
        workingDaysPerWeek: 5
    });
    const now = new Date(2026, 7, 4, 0, 0, 0);
    const earned = computePayPeriodEarnings(
        period,
        new Date(2026, 7, 1),
        new Date(2026, 7, 4),
        now
    );
    assert.equal(Number(earned.toFixed(2)), 300);
});

test('hourly pay is spread across the working week, not 24-hour clock time', () => {
    const period = sanitizePayPeriod({
        amount: 20,
        scale: PAY_SCALES.HOUR,
        startDate: '2026-08-03',
        dailyHours: 8,
        workingDaysPerWeek: 5
    });
    const now = new Date(2026, 7, 10, 0, 0, 0);
    const earned = computePayPeriodEarnings(
        period,
        new Date(2026, 7, 3),
        new Date(2026, 7, 10),
        now,
        { startOfWeek: 1 }
    );

    assert.equal(Number(earned.toFixed(2)), 800);
});

test('current unit progress reports contracted and accrued monthly pay', () => {
    const period = makeMonthlyPay();
    const now = new Date(2026, 7, 16, 0, 0, 0);
    const progress = getCurrentPayUnitProgress(period, now);

    assert.equal(progress.label, 'This month');
    assert.equal(Number(progress.contracted.toFixed(2)), 2000);
    assert.equal(Number(progress.accrued.toFixed(2)), Number(((2000 * 15) / 31).toFixed(2)));
});

test('equivalent hourly rate converts monthly pay using work settings', () => {
    const period = makeMonthlyPay();
    const now = new Date(2026, 7, 16, 12, 0, 0);
    const hoursInAugust = 8 * 5 * (31 / 7);
    const expected = 2000 / hoursInAugust;

    assert.equal(Number(getEquivalentHourlyRate(period, now).toFixed(4)), Number(expected.toFixed(4)));
});

test('combined equivalent hourly rate only includes active periods', () => {
    const now = new Date(2026, 7, 16, 12, 0, 0);
    const active = makeMonthlyPay({ id: 'active', amount: 2000 });
    const ended = makeMonthlyPay({ id: 'ended', amount: 4000, endDate: '2026-07-31' });
    const combined = getCombinedEquivalentHourlyRate([active, ended], now);
    assert.equal(Number(combined.toFixed(4)), Number(getEquivalentHourlyRate(active, now).toFixed(4)));
});

test('window totals sum overlapping pay periods', () => {
    const now = new Date(2026, 7, 16, 0, 0, 0);
    const periods = [
        makeMonthlyPay({ id: 'salary', amount: 2000 }),
        sanitizePayPeriod({
            id: 'side',
            amount: 100,
            scale: PAY_SCALES.DAY,
            startDate: '2026-08-15',
            dailyHours: 8,
            workingDaysPerWeek: 5
        })
    ];

    const earned = computePayEarningsInWindow(
        periods,
        new Date(2026, 7, 15),
        new Date(2026, 7, 16),
        now
    );

    assert.equal(Number(earned.toFixed(2)), Number(((2000 / 31) + 100).toFixed(2)));
});

test('filterPayPeriods hides salary when a project filter is active', () => {
    const periods = [makeMonthlyPay({ company: 'Acme' })];
    assert.equal(filterPayPeriods(periods, { company: 'Acme' }).length, 1);
    assert.equal(filterPayPeriods(periods, { company: 'Other' }).length, 0);
    assert.equal(filterPayPeriods(periods, { project: 'Website' }).length, 0);
});

test('daily pay map marks covered calendar days', () => {
    const period = makeMonthlyPay();
    const now = new Date(2026, 7, 3, 12, 0, 0);
    const daily = accumulateDailyPayEarnings(
        [period],
        new Date(2026, 7, 1),
        new Date(2026, 7, 4),
        now
    );

    assert.ok(daily['2026-08-01'] > 0);
    assert.ok(daily['2026-08-02'] > 0);
    assert.equal(daily['2026-08-03'] > 0, true);
    assert.equal(daily['2026-08-04'], undefined);
});

test('formatPayRate uses the selected scale', () => {
    assert.equal(formatPayRate(2000, PAY_SCALES.MONTH, '£'), '£2000.00 / month');
});
