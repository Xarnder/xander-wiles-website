import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEntryAge } from './entryAge.js';

test('screenshot entry age is measured to today independently of travel', () => {
    assert.equal(formatEntryAge('2025-06-24', '2026-11-04'), '16 months, 1 week, 4 days');
    assert.equal(formatEntryAge('2025-06-24', '2026-01-08'), '6 months, 2 weeks, 1 day');
});

test('entry age handles today, future dates, invalid input and midnight rollover', () => {
    assert.equal(formatEntryAge('2026-11-04', '2026-11-04'), 'Today');
    assert.equal(formatEntryAge('2026-11-04', '2026-11-05'), '1 day');
    assert.equal(formatEntryAge('2026-11-05', '2026-11-04'), '');
    assert.equal(formatEntryAge('invalid', '2026-11-04'), '');
});

test('entry age handles month ends, leap days and daylight saving', () => {
    assert.equal(formatEntryAge('2024-01-31', '2024-02-29'), '1 month');
    assert.equal(formatEntryAge('2024-02-29', '2025-02-28'), '12 months');
    assert.equal(formatEntryAge('2026-03-28', '2026-03-30'), '2 days');
    assert.equal(formatEntryAge('2026-10-24', '2026-10-26'), '2 days');
});
