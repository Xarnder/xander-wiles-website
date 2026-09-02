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
    getAssumedLivePaySession,
    isPayPeriodActive,
    sanitizePayPeriod,
    sanitizePayPeriods,
    combinePayAndSessionEarnings,
    collectAssumedWorkSegments,
    getAssumedWorkSegment,
    formatWorkingDaysAssumption,
    isContractedWorkingDay,
    isSessionCoveredByPay,
    summarizePaySessionOverlaps,
    sessionsUncoveredByPay
} from './payPeriods.js';
import { sanitizeWorkSchedule } from './workSchedule.js';

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

test('contracted working days are Monday–Friday for a 5-day week', () => {
    assert.equal(isContractedWorkingDay(new Date(2026, 7, 3), 5), true); // Monday
    assert.equal(isContractedWorkingDay(new Date(2026, 7, 7), 5), true); // Friday
    assert.equal(isContractedWorkingDay(new Date(2026, 7, 8), 5), false); // Saturday
    assert.equal(isContractedWorkingDay(new Date(2026, 7, 9), 5), false); // Sunday
    assert.equal(isContractedWorkingDay(new Date(2026, 7, 8), 5, PAY_SCALES.DAY), true);
    assert.equal(formatWorkingDaysAssumption(8, 5), '8h, Monday–Friday');
});

test('salary covers unlabeled sessions and matching companies, not other companies', () => {
    const salary = makeMonthlyPay({ company: 'Acme' });
    const unlabeled = { id: 's1', startTime: new Date(2026, 7, 10, 9).getTime(), company: '' };
    const acme = { id: 's2', startTime: new Date(2026, 7, 10, 9).getTime(), company: 'Acme' };
    const other = { id: 's3', startTime: new Date(2026, 7, 10, 9).getTime(), company: 'Freelance' };
    const outside = { id: 's4', startTime: new Date(2026, 6, 10, 9).getTime(), company: 'Acme' };

    assert.equal(isSessionCoveredByPay(unlabeled, [salary]), true);
    assert.equal(isSessionCoveredByPay(acme, [salary]), true);
    assert.equal(isSessionCoveredByPay(other, [salary]), false);
    assert.equal(isSessionCoveredByPay(outside, [salary]), false);
    assert.equal(sessionsUncoveredByPay([unlabeled, acme, other], [salary]).map((s) => s.id).join(','), 's3');

    const unscoped = makeMonthlyPay({ company: '' });
    assert.equal(isSessionCoveredByPay(unlabeled, [unscoped]), true);
    assert.equal(isSessionCoveredByPay(acme, [unscoped]), false);
});

test('combined earnings do not double-count sessions covered by monthly pay', () => {
    const salary = makeMonthlyPay();
    const now = new Date(2026, 7, 16, 0, 0, 0);
    const covered = {
        id: 'covered',
        startTime: new Date(2026, 7, 10, 9).getTime(),
        endTime: new Date(2026, 7, 10, 17).getTime(),
        durationMs: 8 * 3600000,
        earnings: 160
    };
    const extra = {
        id: 'extra',
        startTime: new Date(2026, 7, 11, 9).getTime(),
        endTime: new Date(2026, 7, 11, 10).getTime(),
        durationMs: 3600000,
        earnings: 40,
        company: 'Freelance'
    };

    const combined = combinePayAndSessionEarnings(
        [covered, extra],
        [],
        [salary],
        new Date(2026, 7, 1),
        now,
        now
    );
    const payOnly = computePayEarningsInWindow([salary], new Date(2026, 7, 1), now, now);

    assert.equal(Number(combined.toFixed(2)), Number((payOnly + 40).toFixed(2)));
});

test('assumed work segments fill weekday hours and skip logged days, weekends, and the future', () => {
    const salary = makeMonthlyPay();
    const now = new Date(2026, 7, 12, 12, 0, 0); // Wednesday
    const loggedMonday = {
        id: 'logged',
        startTime: new Date(2026, 7, 10, 9).getTime(),
        endTime: new Date(2026, 7, 10, 17).getTime(),
        durationMs: 8 * 3600000
    };

    const segments = collectAssumedWorkSegments(
        [salary],
        new Date(2026, 7, 10),
        new Date(2026, 7, 14),
        {
            sessions: [loggedMonday],
            breaks: [],
            defaultStartTime: '09:00',
            now
        }
    );

    assert.deepEqual(segments.map((segment) => segment.dateKey), ['2026-08-11', '2026-08-12']);
    assert.equal(segments[0].hours, 8);
    assert.equal(segments[0].assumedPay, true);
    assert.equal(segments[0].scheduled, false);
});

test('assumed work can include future weekdays as scheduled, not counted', () => {
    const salary = makeMonthlyPay();
    const now = new Date(2026, 7, 12, 12, 0, 0); // Wednesday
    const segments = collectAssumedWorkSegments(
        [salary],
        new Date(2026, 7, 12),
        new Date(2026, 7, 15),
        {
            sessions: [],
            defaultStartTime: '09:00',
            includeFuture: true,
            now
        }
    );

    assert.deepEqual(segments.map((segment) => segment.dateKey), ['2026-08-12', '2026-08-13', '2026-08-14']);
    assert.equal(segments[0].scheduled, false);
    assert.equal(segments[1].scheduled, true);
    assert.equal(segments[2].scheduled, true);
});

test('assumed work includes today when the window ends at a time of day', () => {
    const salary = makeMonthlyPay();
    const now = new Date(2026, 7, 12, 15, 30, 0);
    const segments = collectAssumedWorkSegments(
        [salary],
        new Date(2026, 7, 12),
        now,
        { sessions: [], defaultStartTime: '09:00', now }
    );

    assert.deepEqual(segments.map((segment) => segment.dateKey), ['2026-08-12']);
});

test('assumed work can use Time Cost hours instead of the pay period snapshot', () => {
    const salary = makeMonthlyPay({ dailyHours: 8 });
    const now = new Date(2026, 7, 11, 12, 0, 0);
    const segments = collectAssumedWorkSegments(
        [salary],
        new Date(2026, 7, 11),
        new Date(2026, 7, 12),
        {
            sessions: [],
            defaultStartTime: '09:00',
            dailyHours: 6,
            workingDaysPerWeek: 5,
            now
        }
    );

    assert.equal(segments.length, 1);
    assert.equal(segments[0].hours, 6);
});

test('live pay session counts today\'s scheduled block, not the month so far', () => {
    const salary = makeMonthlyPay();
    const options = { defaultStartTime: '09:00', dailyHours: 8, workingDaysPerWeek: 5 };
    const during = getAssumedLivePaySession([salary], new Date(2026, 7, 12, 13, 0, 0), options);
    const hourly = getEquivalentHourlyRate(salary, new Date(2026, 7, 12, 13, 0, 0), options);

    assert.equal(during.isLive, true);
    assert.equal(during.elapsedMs, 4 * 60 * 60 * 1000);
    assert.equal(Number(during.earnings.toFixed(4)), Number((hourly * 4).toFixed(4)));
    assert.ok(during.elapsedMs < 24 * 60 * 60 * 1000);

    const before = getAssumedLivePaySession([salary], new Date(2026, 7, 12, 8, 0, 0), options);
    assert.equal(before.isLive, false);
    assert.equal(before.elapsedMs, 0);
    assert.equal(before.earnings, 0);

    const after = getAssumedLivePaySession([salary], new Date(2026, 7, 12, 18, 0, 0), options);
    assert.equal(after.isLive, false);
    assert.equal(after.isComplete, true);
    assert.equal(after.elapsedMs, 8 * 60 * 60 * 1000);
    assert.equal(Number(after.earnings.toFixed(4)), Number((hourly * 8).toFixed(4)));

    assert.equal(getAssumedLivePaySession([salary], new Date(2026, 7, 15, 13, 0, 0), options), null);
});

test('assumed work follows the per-day work schedule', () => {
    const salary = makeMonthlyPay();
    const schedule = sanitizeWorkSchedule({
        days: [
            { day: 3, enabled: true, start: '10:00', end: '14:00' }
        ]
    }, { workingDaysPerWeek: 0 });
    const now = new Date(2026, 7, 12, 12, 0, 0); // Wednesday
    const wednesday = getAssumedWorkSegment(salary, now, { schedule, now, includeFuture: true });
    const thursday = getAssumedWorkSegment(salary, new Date(2026, 7, 13), { schedule, now, includeFuture: true });

    assert.equal(wednesday.hours, 4);
    assert.equal(new Date(wednesday.startTime).getHours(), 10);
    assert.equal(thursday, null);

    const live = getAssumedLivePaySession([salary], now, { schedule });
    const hourly = getEquivalentHourlyRate(salary, now, { schedule });
    const defaultHourly = getEquivalentHourlyRate(salary, now);
    assert.equal(live.isLive, true);
    assert.equal(live.elapsedMs, 2 * 60 * 60 * 1000);
    assert.equal(Number(live.earnings.toFixed(4)), Number((hourly * 2).toFixed(4)));
    assert.ok(hourly > defaultHourly);
});

test('pay overlap summary counts days with both salary coverage and a logged session', () => {
    const salary = makeMonthlyPay();
    const covered = {
        id: 's1',
        startTime: new Date(2026, 7, 10, 9).getTime(),
        endTime: new Date(2026, 7, 10, 17).getTime(),
        durationMs: 8 * 3600000,
        earnings: 160,
        company: ''
    };
    const outside = {
        id: 's2',
        startTime: new Date(2026, 6, 10, 9).getTime(),
        endTime: new Date(2026, 6, 10, 17).getTime(),
        durationMs: 8 * 3600000,
        earnings: 160,
        company: ''
    };
    const freelance = {
        id: 's3',
        startTime: new Date(2026, 7, 11, 9).getTime(),
        endTime: new Date(2026, 7, 11, 10).getTime(),
        durationMs: 3600000,
        earnings: 40,
        company: 'Freelance'
    };

    const empty = summarizePaySessionOverlaps([covered], [], []);
    assert.equal(empty.dayCount, 0);

    const summary = summarizePaySessionOverlaps([covered, outside, freelance], [salary], []);
    assert.equal(summary.dayCount, 2);
    assert.equal(summary.sessionCount, 2);
    assert.equal(summary.coveredSessionCount, 1);
    assert.equal(summary.extraEarningSessionCount, 1);
    assert.equal(summary.fromDate, '2026-08-10');
    assert.equal(summary.toDate, '2026-08-11');
    assert.equal(summary.sameMonth, true);
    assert.equal(summary.monthValue, '2026-08');
    assert.equal(Number(summary.extraEarnings.toFixed(2)), 40);
});
