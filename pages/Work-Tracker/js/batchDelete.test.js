import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BATCH_DELETE_CONFIRM_PHRASE,
    BATCH_DELETE_RANGE_MODES,
    chunkItems,
    currentYearMonthValue,
    describeBatchDeleteSelection,
    filterEntriesInRange,
    isBatchDeleteConfirmPhrase,
    monthBoundsFromValue,
    parseLocalDateInput,
    parseYearMonthInput,
    resolveBatchDeleteRange,
    selectEntriesForBatchDelete
} from './batchDelete.js';

test('parseYearMonthInput reads YYYY-MM and rejects invalid months', () => {
    assert.deepEqual(parseYearMonthInput('2026-08'), { year: 2026, month: 7 });
    assert.equal(parseYearMonthInput('2026-13'), null);
    assert.equal(parseYearMonthInput('08-2026'), null);
});

test('parseLocalDateInput uses local calendar dates and rejects impossible days', () => {
    const date = parseLocalDateInput('2026-08-31');
    assert.equal(date.getFullYear(), 2026);
    assert.equal(date.getMonth(), 7);
    assert.equal(date.getDate(), 31);
    assert.equal(parseLocalDateInput('2026-02-31'), null);
});

test('month range covers the whole local calendar month and excludes the next month', () => {
    const bounds = monthBoundsFromValue('2026-08');
    const inMonth = new Date(2026, 7, 31, 23, 59, 59, 999).getTime();
    const nextMonth = new Date(2026, 8, 1, 0, 0, 0, 0).getTime();

    assert.equal(bounds.label, 'August 2026');
    assert.equal(bounds.fromDate, '2026-08-01');
    assert.equal(bounds.toDate, '2026-08-31');
    assert.equal(inMonth >= bounds.startMs && inMonth < bounds.endMs, true);
    assert.equal(nextMonth >= bounds.startMs && nextMonth < bounds.endMs, false);
});

test('custom range is inclusive of both chosen days', () => {
    const range = resolveBatchDeleteRange({
        mode: BATCH_DELETE_RANGE_MODES.CUSTOM,
        fromDate: '2026-08-01',
        toDate: '2026-08-15'
    });
    const lastIncluded = new Date(2026, 7, 15, 23, 59, 59, 999).getTime();
    const firstExcluded = new Date(2026, 7, 16, 0, 0, 0, 0).getTime();

    assert.equal(range.ok, true);
    assert.equal(range.label, '1 August 2026 – 15 August 2026');
    assert.equal(lastIncluded >= range.startMs && lastIncluded < range.endMs, true);
    assert.equal(firstExcluded >= range.startMs && firstExcluded < range.endMs, false);
});

test('custom range rejects missing or reversed dates', () => {
    assert.equal(resolveBatchDeleteRange({
        mode: BATCH_DELETE_RANGE_MODES.CUSTOM,
        fromDate: '2026-08-01',
        toDate: ''
    }).ok, false);

    assert.equal(resolveBatchDeleteRange({
        mode: BATCH_DELETE_RANGE_MODES.CUSTOM,
        fromDate: '2026-08-20',
        toDate: '2026-08-01'
    }).ok, false);
});

test('month mode uses the current month when no value is provided', () => {
    const now = new Date(2026, 8, 2, 12, 0, 0);
    const range = resolveBatchDeleteRange({
        mode: BATCH_DELETE_RANGE_MODES.MONTH,
        monthValue: currentYearMonthValue(now)
    });

    assert.equal(range.ok, true);
    assert.equal(range.label, 'September 2026');
});

test('filterEntriesInRange keeps entries that start inside the window', () => {
    const range = resolveBatchDeleteRange({
        mode: BATCH_DELETE_RANGE_MODES.MONTH,
        monthValue: '2026-08'
    });
    const entries = [
        { id: 'in', startTime: new Date(2026, 7, 10, 9, 0, 0).getTime() },
        { id: 'out', startTime: new Date(2026, 8, 1, 9, 0, 0).getTime() },
        { id: '', startTime: new Date(2026, 7, 12, 9, 0, 0).getTime() },
        { startTime: new Date(2026, 7, 12, 9, 0, 0).getTime() }
    ];

    const matched = filterEntriesInRange(entries, range.startMs, range.endMs);
    assert.deepEqual(matched.map((entry) => entry.id), ['in']);
});

test('selectEntriesForBatchDelete honours session and break checkboxes', () => {
    const range = resolveBatchDeleteRange({
        mode: BATCH_DELETE_RANGE_MODES.MONTH,
        monthValue: '2026-08'
    });
    const sessions = [{ id: 's1', startTime: new Date(2026, 7, 2, 9).getTime() }];
    const breaks = [{ id: 'b1', startTime: new Date(2026, 7, 2, 12).getTime() }];

    const sessionsOnly = selectEntriesForBatchDelete({
        sessions,
        breaks,
        includeSessions: true,
        includeBreaks: false,
        range
    });
    assert.deepEqual(sessionsOnly.sessionIds, ['s1']);
    assert.deepEqual(sessionsOnly.breakIds, []);

    const none = selectEntriesForBatchDelete({
        sessions,
        breaks,
        includeSessions: false,
        includeBreaks: false,
        range
    });
    assert.deepEqual(none.sessionIds, []);
    assert.deepEqual(none.breakIds, []);
});

test('describeBatchDeleteSelection requires matches before delete is allowed', () => {
    const range = resolveBatchDeleteRange({
        mode: BATCH_DELETE_RANGE_MODES.MONTH,
        monthValue: '2026-08'
    });
    const empty = describeBatchDeleteSelection({ sessionIds: [], breakIds: [] }, range, {
        includeSessions: true,
        includeBreaks: false
    });
    assert.equal(empty.canDelete, false);

    const noneSelected = describeBatchDeleteSelection({ sessionIds: ['s1'], breakIds: [] }, range, {
        includeSessions: false,
        includeBreaks: false
    });
    assert.equal(noneSelected.canDelete, false);
    assert.match(noneSelected.text, /Choose paid sessions/);

    const ready = describeBatchDeleteSelection({
        sessionIds: ['s1', 's2'],
        breakIds: ['b1']
    }, range, {
        includeSessions: true,
        includeBreaks: true
    });
    assert.equal(ready.canDelete, true);
    assert.match(ready.text, /2 paid sessions and 1 break/);
    assert.match(ready.confirmMessage, new RegExp(BATCH_DELETE_CONFIRM_PHRASE));
});

test('typed confirmation phrase is exact after trimming', () => {
    assert.equal(isBatchDeleteConfirmPhrase(`  ${BATCH_DELETE_CONFIRM_PHRASE}  `), true);
    assert.equal(isBatchDeleteConfirmPhrase('delete confirmation'), false);
    assert.equal(isBatchDeleteConfirmPhrase('Delete Confimation'), false);
});

test('chunkItems splits ids into Firestore-sized batches', () => {
    const ids = Array.from({ length: 12 }, (_, index) => `id-${index}`);
    assert.deepEqual(chunkItems(ids, 5).map((chunk) => chunk.length), [5, 5, 2]);
    assert.deepEqual(chunkItems([], 5), []);
});
