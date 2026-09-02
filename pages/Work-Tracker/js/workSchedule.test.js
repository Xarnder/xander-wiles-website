import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addHoursToTime,
    createDefaultWorkSchedule,
    formatScheduleSummary,
    getEnabledScheduleDay,
    getScheduleAverageDailyHours,
    getScheduleDayHours,
    getScheduleHoursPerWeek,
    getScheduleWorkingDayCount,
    sanitizeWorkSchedule
} from './workSchedule.js';

test('default schedule uses Monday–Friday from working days', () => {
    const schedule = createDefaultWorkSchedule({
        dailyHours: 8,
        workingDaysPerWeek: 5,
        defaultStartTime: '09:00'
    });

    assert.equal(schedule.days[0].enabled, false);
    assert.equal(schedule.days[1].enabled, true);
    assert.equal(schedule.days[5].enabled, true);
    assert.equal(schedule.days[6].enabled, false);
    assert.equal(schedule.days[1].start, '09:00');
    assert.equal(schedule.days[1].end, '17:00');
    assert.equal(getScheduleDayHours(schedule.days[1]), 8);
    assert.equal(getScheduleWorkingDayCount(schedule), 5);
    assert.equal(getScheduleHoursPerWeek(schedule), 40);
});

test('schedule can mix different hours on different days', () => {
    const schedule = sanitizeWorkSchedule({
        days: [
            { day: 1, enabled: true, start: '09:00', end: '17:00' },
            { day: 3, enabled: true, start: '10:00', end: '14:00' }
        ]
    }, { dailyHours: 8, workingDaysPerWeek: 0, defaultStartTime: '09:00' });

    assert.equal(getEnabledScheduleDay(schedule, new Date(2026, 8, 6)), null); // Sunday
    assert.equal(getEnabledScheduleDay(schedule, new Date(2026, 8, 7))?.start, '09:00'); // Monday
    assert.equal(getScheduleDayHours(schedule.days[1]), 8);
    assert.equal(getScheduleDayHours(schedule.days[3]), 4);
    assert.equal(getScheduleHoursPerWeek(schedule), 12);
    assert.equal(Number(getScheduleAverageDailyHours(schedule).toFixed(2)), 6);
});

test('addHoursToTime stays on the same calendar day', () => {
    assert.equal(addHoursToTime('09:00', 8), '17:00');
    assert.equal(addHoursToTime('22:00', 8), '23:59');
});

test('formatScheduleSummary describes enabled days', () => {
    const empty = sanitizeWorkSchedule({ days: [] }, { workingDaysPerWeek: 0 });
    assert.equal(formatScheduleSummary(empty), 'No working days set');

    const weekdays = createDefaultWorkSchedule();
    assert.equal(formatScheduleSummary(weekdays), '5 days · 40h / week');
});
