import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CLOCK_TIME_FORMATS,
    formatAverageClockTime,
    formatClockHourLabel,
    formatClockTime,
    formatClockTimeFromParts,
    formatTimeOfDayLabel,
    parseClockTimeInput,
    sanitizeClockTimeFormat
} from './utils.js';

test('clock time format defaults to 12-hour', () => {
    assert.equal(sanitizeClockTimeFormat(undefined), CLOCK_TIME_FORMATS.HOUR_12);
    assert.equal(sanitizeClockTimeFormat(''), CLOCK_TIME_FORMATS.HOUR_12);
    assert.equal(sanitizeClockTimeFormat('24'), CLOCK_TIME_FORMATS.HOUR_24);
});

test('12-hour clock times use AM and PM', () => {
    assert.equal(formatClockTimeFromParts(0, 0, '12'), '12:00 AM');
    assert.equal(formatClockTimeFromParts(9, 5, '12'), '9:05 AM');
    assert.equal(formatClockTimeFromParts(12, 0, '12'), '12:00 PM');
    assert.equal(formatClockTimeFromParts(17, 30, '12'), '5:30 PM');
    assert.equal(formatTimeOfDayLabel('09:00', '12'), '9:00 AM');
    assert.equal(formatTimeOfDayLabel('17:00', '12'), '5:00 PM');
});

test('24-hour clock times stay zero-padded', () => {
    assert.equal(formatClockTimeFromParts(0, 0, '24'), '00:00');
    assert.equal(formatClockTimeFromParts(9, 5, '24'), '09:05');
    assert.equal(formatClockTimeFromParts(17, 30, '24'), '17:30');
    assert.equal(formatTimeOfDayLabel('09:00', '24'), '09:00');
    assert.equal(formatTimeOfDayLabel('17:00', '24'), '17:00');
});

test('gantt hour labels follow the selected format', () => {
    assert.equal(formatClockHourLabel(0, '12'), '12 AM');
    assert.equal(formatClockHourLabel(12, '12'), '12 PM');
    assert.equal(formatClockHourLabel(16, '12'), '4 PM');
    assert.equal(formatClockHourLabel(24, '12'), '12 AM');
    assert.equal(formatClockHourLabel(0, '24'), '00:00');
    assert.equal(formatClockHourLabel(16, '24'), '16:00');
    assert.equal(formatClockHourLabel(24, '24'), '24:00');
});

test('clock time parser accepts 12-hour and 24-hour input', () => {
    assert.equal(parseClockTimeInput('9:00 AM'), '09:00');
    assert.equal(parseClockTimeInput('9am'), '09:00');
    assert.equal(parseClockTimeInput('12:00 AM'), '00:00');
    assert.equal(parseClockTimeInput('12:00 PM'), '12:00');
    assert.equal(parseClockTimeInput('5:30 pm'), '17:30');
    assert.equal(parseClockTimeInput('17:30'), '17:30');
    assert.equal(parseClockTimeInput('09:00'), '09:00');
    assert.equal(parseClockTimeInput('not a time'), null);
});

test('average clock times honor the selected format', () => {
    assert.equal(formatAverageClockTime(9 * 60, '12'), '9:00 AM');
    assert.equal(formatAverageClockTime(17 * 60 + 30, '24'), '17:30');
});

test('formatClockTime reads hours from a date', () => {
    const date = new Date(2026, 8, 2, 21, 15);
    assert.equal(formatClockTime(date, '12'), '9:15 PM');
    assert.equal(formatClockTime(date, '24'), '21:15');
});
