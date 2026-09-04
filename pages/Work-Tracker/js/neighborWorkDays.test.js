import test from 'node:test';
import assert from 'node:assert/strict';
import {
    findNeighborScheduledWorkDay,
    getNeighborDayRelativeLabel,
    getNeighborWorkDaySummary,
    getScheduledWorkWindow
} from './neighborWorkDays.js';
import { getEquivalentHourlyRate, PAY_SCALES, sanitizePayPeriod } from './payPeriods.js';
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

const weekdayOptions = {
    defaultStartTime: '09:00',
    dailyHours: 8,
    workingDaysPerWeek: 5
};

test('scheduled work window follows the work schedule', () => {
    const schedule = sanitizeWorkSchedule({
        days: [
            { day: 3, enabled: true, start: '10:00', end: '14:00' }
        ]
    }, { workingDaysPerWeek: 0 });
    const wednesday = getScheduledWorkWindow(new Date(2026, 7, 12), { schedule });
    const thursday = getScheduledWorkWindow(new Date(2026, 7, 13), { schedule });

    assert.equal(wednesday.hours, 4);
    assert.equal(new Date(wednesday.startTime).getHours(), 10);
    assert.equal(new Date(wednesday.endTime).getHours(), 14);
    assert.equal(thursday, null);
});

test('next and previous scheduled days skip the live session', () => {
    const options = weekdayOptions;
    const during = new Date(2026, 7, 12, 13, 0, 0);
    const next = findNeighborScheduledWorkDay(during, 'next', options);
    const previous = findNeighborScheduledWorkDay(during, 'previous', options);

    assert.equal(next.window.dateKey, '2026-08-13');
    assert.equal(previous.window.dateKey, '2026-08-11');
});

test('before start, next is today and previous is the last completed day', () => {
    const options = weekdayOptions;
    const before = new Date(2026, 7, 12, 8, 0, 0);
    const next = findNeighborScheduledWorkDay(before, 'next', options);
    const previous = findNeighborScheduledWorkDay(before, 'previous', options);

    assert.equal(next.window.dateKey, '2026-08-12');
    assert.equal(previous.window.dateKey, '2026-08-11');
});

test('after end, previous is today and next is the following work day', () => {
    const options = weekdayOptions;
    const after = new Date(2026, 7, 12, 18, 0, 0);
    const next = findNeighborScheduledWorkDay(after, 'next', options);
    const previous = findNeighborScheduledWorkDay(after, 'previous', options);

    assert.equal(next.window.dateKey, '2026-08-13');
    assert.equal(previous.window.dateKey, '2026-08-12');
});

test('weekend neighbor days jump to Friday and Monday', () => {
    const options = weekdayOptions;
    const saturday = new Date(2026, 7, 15, 13, 0, 0);
    const next = findNeighborScheduledWorkDay(saturday, 'next', options);
    const previous = findNeighborScheduledWorkDay(saturday, 'previous', options);

    assert.equal(previous.window.dateKey, '2026-08-14');
    assert.equal(next.window.dateKey, '2026-08-17');
    assert.equal(getNeighborDayRelativeLabel(previous.day, saturday), 'Yesterday');
    assert.equal(getNeighborDayRelativeLabel(next.day, saturday), 'Monday');
});

test('tomorrow summary uses scheduled hours and salary hourly rate', () => {
    const salary = makeMonthlyPay();
    const now = new Date(2026, 7, 12, 18, 0, 0);
    const summary = getNeighborWorkDaySummary('next', {
        now,
        periods: [salary],
        ...weekdayOptions
    });
    const hourly = getEquivalentHourlyRate(salary, new Date(2026, 7, 13), weekdayOptions);

    assert.equal(summary.dateKey, '2026-08-13');
    assert.equal(summary.scheduledHours, 8);
    assert.equal(summary.hoursWorked, 8);
    assert.equal(summary.hasLogged, false);
    assert.equal(summary.hasPay, true);
    assert.equal(Number(summary.hourlyRate.toFixed(4)), Number(hourly.toFixed(4)));
    assert.equal(Number(summary.earnings.toFixed(4)), Number((hourly * 8).toFixed(4)));
    assert.equal(summary.isFuture, true);
});

test('yesterday summary uses logged hours and keeps salary-day earnings', () => {
    const salary = makeMonthlyPay();
    const now = new Date(2026, 7, 12, 13, 0, 0);
    const sessions = [{
        id: 's1',
        startTime: new Date(2026, 7, 11, 9).getTime(),
        endTime: new Date(2026, 7, 11, 15).getTime(),
        durationMs: 6 * 3600000,
        earnings: 90
    }];
    const summary = getNeighborWorkDaySummary('previous', {
        now,
        periods: [salary],
        sessions,
        ...weekdayOptions
    });
    const hourly = getEquivalentHourlyRate(salary, new Date(2026, 7, 11), weekdayOptions);

    assert.equal(summary.dateKey, '2026-08-11');
    assert.equal(summary.hoursWorked, 6);
    assert.equal(summary.scheduledHours, 8);
    assert.equal(summary.hasLogged, true);
    assert.equal(Number(summary.earnings.toFixed(4)), Number((hourly * 8).toFixed(4)));
});

test('yesterday without pay uses logged session earnings', () => {
    const now = new Date(2026, 7, 12, 13, 0, 0);
    const sessions = [{
        id: 's1',
        startTime: new Date(2026, 7, 11, 9).getTime(),
        endTime: new Date(2026, 7, 11, 17).getTime(),
        durationMs: 8 * 3600000,
        earnings: 160
    }];
    const summary = getNeighborWorkDaySummary('previous', {
        now,
        periods: [],
        sessions,
        fallbackHourlyRate: 20,
        ...weekdayOptions
    });

    assert.equal(summary.hoursWorked, 8);
    assert.equal(summary.earnings, 160);
    assert.equal(summary.hasPay, false);
    assert.equal(summary.source, 'logged');
});
