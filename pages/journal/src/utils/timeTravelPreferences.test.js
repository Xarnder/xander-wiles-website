import test from 'node:test';
import assert from 'node:assert/strict';
import { format } from 'date-fns';
import { loadTimeTravelPeriod, saveTimeTravelPeriod } from '../lib/timeTravelPreferences.js';
import { calculateTargetDate, formatOffsetDescription } from './dateOffset.js';

function storage(t, initial = null) {
    let value = initial;
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: () => value,
        setItem: (_key, next) => { value = next; }
    } });
    t.after(() => {
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
        else delete globalThis.localStorage;
    });
    return () => JSON.parse(value);
}

test('restores the last period and direction while tomorrow uses a fresh starting date', (t) => {
    const read = storage(t);
    const offset = { years: 0, months: 1, weeks: 0, days: 2 };
    for (const direction of ['backward', 'forward']) {
        saveTimeTravelPeriod(offset, direction);
        assert.deepEqual(loadTimeTravelPeriod(), { offset, direction });
        assert.deepEqual(Object.keys(read()).sort(), ['direction', 'offset']);
    }
    const saved = loadTimeTravelPeriod();
    assert.equal(formatOffsetDescription(saved.offset, saved.direction), '1 month and 2 days forward');
    assert.equal(format(calculateTargetDate(new Date(2026, 10, 7), saved.offset, saved.direction), 'yyyy-MM-dd'), '2026-12-09');
    assert.equal(format(calculateTargetDate(new Date(2026, 10, 8), saved.offset, saved.direction), 'yyyy-MM-dd'), '2026-12-10');
});

test('missing, corrupt or malformed saved settings fall back safely', (t) => {
    storage(t);
    const fallback = loadTimeTravelPeriod();
    for (const invalid of ['bad json', 'null', '{}', '{"direction":"sideways"}', '{"direction":"forward","offset":{"years":-1}}']) {
        globalThis.localStorage.setItem('', invalid);
        assert.deepEqual(loadTimeTravelPeriod(), fallback);
    }
    saveTimeTravelPeriod({ years: 0, months: 0, weeks: 0, days: 0 }, 'backward');
    assert.equal(loadTimeTravelPeriod().offset.months, 0);
});

test('blocked storage does not prevent calculating', (t) => {
    storage(t);
    globalThis.localStorage.getItem = () => { throw new Error('blocked'); };
    globalThis.localStorage.setItem = () => { throw new Error('blocked'); };
    assert.equal(loadTimeTravelPeriod().direction, 'backward');
    assert.doesNotThrow(() => saveTimeTravelPeriod({ years: 0, months: 1, weeks: 0, days: 2 }, 'forward'));
});
