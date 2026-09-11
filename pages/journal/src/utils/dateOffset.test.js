import test from 'node:test';
import assert from 'node:assert/strict';
import { format } from 'date-fns';
import {
    calculateTargetDate,
    parseOffsetString,
    formatOffsetDescription,
    formatDateDiscrepancy
} from './dateOffset.js';

test('calculateTargetDate correctly subtracts years, months, weeks, and days', () => {
    // 2026-09-11 minus 1 year -> 2025-09-11
    // minus 2 months -> 2025-07-11
    // minus 3 weeks (21 days) -> 2025-06-20
    const base = new Date(2026, 8, 11); // Sept 11, 2026
    const target = calculateTargetDate(base, { years: 1, months: 2, weeks: 3, days: 0 }, 'backward');
    assert.equal(format(target, 'yyyy-MM-dd'), '2025-06-20');
});

test('calculateTargetDate correctly adds years, months, weeks, and days forward', () => {
    // 8th January 2026 + 4 months + 2 weeks -> 22nd May 2026
    const base = new Date(2026, 0, 8); // Jan 8, 2026
    const target = calculateTargetDate(base, { years: 0, months: 4, weeks: 2, days: 0 }, 'forward');
    assert.equal(format(target, 'yyyy-MM-dd'), '2026-05-22');
});

test('calculateTargetDate handles single unit offsets', () => {
    const base = new Date(2026, 8, 11);
    assert.equal(format(calculateTargetDate(base, { years: 1 }), 'yyyy-MM-dd'), '2025-09-11');
    assert.equal(format(calculateTargetDate(base, { months: 6 }), 'yyyy-MM-dd'), '2026-03-11');
    assert.equal(format(calculateTargetDate(base, { weeks: 2 }), 'yyyy-MM-dd'), '2026-08-28');
    assert.equal(format(calculateTargetDate(base, { days: 10 }), 'yyyy-MM-dd'), '2026-09-01');

    // Forward single units
    assert.equal(format(calculateTargetDate(base, { years: 1 }, 'forward'), 'yyyy-MM-dd'), '2027-09-11');
    assert.equal(format(calculateTargetDate(base, { months: 3 }, 'forward'), 'yyyy-MM-dd'), '2026-12-11');
});

test('calculateTargetDate handles 0 offset', () => {
    const base = new Date(2026, 8, 11);
    assert.equal(format(calculateTargetDate(base, {}), 'yyyy-MM-dd'), '2026-09-11');
});

test('parseOffsetString correctly parses multiple formats and directions', () => {
    assert.deepEqual(parseOffsetString('1 year 2 months 3 weeks'), {
        years: 1,
        months: 2,
        weeks: 3,
        days: 0,
        direction: 'backward'
    });

    assert.deepEqual(parseOffsetString('4 months and 2 weeks forward'), {
        years: 0,
        months: 4,
        weeks: 2,
        days: 0,
        direction: 'forward'
    });

    assert.deepEqual(parseOffsetString('1y 2m 3w 4d ahead'), {
        years: 1,
        months: 2,
        weeks: 3,
        days: 4,
        direction: 'forward'
    });

    assert.deepEqual(parseOffsetString('6 months ago'), {
        years: 0,
        months: 6,
        weeks: 0,
        days: 0,
        direction: 'backward'
    });

    assert.deepEqual(parseOffsetString('100 days'), {
        years: 0,
        months: 0,
        weeks: 0,
        days: 100,
        direction: 'backward'
    });

    assert.deepEqual(parseOffsetString('100 days forward'), {
        years: 0,
        months: 0,
        weeks: 0,
        days: 100,
        direction: 'forward'
    });

    assert.equal(parseOffsetString('hello world'), null);
    assert.equal(parseOffsetString(''), null);
    assert.equal(parseOffsetString(null), null);
});

test('formatOffsetDescription produces human friendly text with direction and base date', () => {
    assert.equal(
        formatOffsetDescription({ years: 1, months: 2, weeks: 3, days: 0 }, 'backward'),
        '1 year, 2 months, and 3 weeks ago'
    );
    assert.equal(
        formatOffsetDescription({ years: 0, months: 4, weeks: 2, days: 0 }, 'forward'),
        '4 months and 2 weeks forward'
    );
    assert.equal(
        formatOffsetDescription({ years: 0, months: 4, weeks: 2, days: 0 }, 'forward', '8 January 2026'),
        '4 months and 2 weeks after 8 January 2026'
    );
    assert.equal(
        formatOffsetDescription({ years: 1, months: 2, weeks: 0, days: 0 }, 'backward', 'today'),
        '1 year and 2 months before today'
    );
    assert.equal(
        formatOffsetDescription({ years: 0, months: 0, weeks: 0, days: 0 }, 'forward'),
        'Today'
    );
});

test('formatDateDiscrepancy formats exact match and day discrepancies correctly', () => {
    const exact = formatDateDiscrepancy(0);
    assert.equal(exact.exact, true);
    assert.equal(exact.diffDays, 0);
    assert.equal(exact.badgeLabel, 'Exact match');

    const twoDaysLater = formatDateDiscrepancy(2);
    assert.equal(twoDaysLater.exact, false);
    assert.equal(twoDaysLater.diffDays, 2);
    assert.equal(twoDaysLater.badgeLabel, 'Off by +2 days');
    assert.match(twoDaysLater.summary, /2 days later/);

    const oneDayEarlier = formatDateDiscrepancy(-1);
    assert.equal(oneDayEarlier.exact, false);
    assert.equal(oneDayEarlier.diffDays, -1);
    assert.equal(oneDayEarlier.badgeLabel, 'Off by -1 day');
    assert.match(oneDayEarlier.summary, /1 day earlier/);
});
