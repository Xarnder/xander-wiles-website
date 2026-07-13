import test from 'node:test';
import assert from 'node:assert/strict';
import {
    POOL_SCOPES,
    applyPercentageCuts,
    clampSavedAmountForCost,
    computeEarningsPool,
    computeSavingPotState,
    getClosestGoal,
    getPoolScopeWindow,
    roundMoney,
    sanitizePoolScope,
    validateAssign,
    validateWithdraw
} from './savingPots.js';

const HOUR_MS = 60 * 60 * 1000;

function makeSession({ id = 's1', startTime, durationMs = HOUR_MS, earnings = 100 }) {
    return {
        id,
        startTime,
        endTime: startTime + durationMs,
        durationMs,
        earnings,
        rate: earnings
    };
}

test('sanitizePoolScope falls back to all_time', () => {
    assert.equal(sanitizePoolScope('invalid'), POOL_SCOPES.ALL_TIME);
    assert.equal(sanitizePoolScope(POOL_SCOPES.ROLLING_30D), POOL_SCOPES.ROLLING_30D);
});

test('applyPercentageCuts matches accumulative cut behavior', () => {
    const cuts = [
        { name: 'Tax', percentage: 20, basis: 'accumulative' },
        { name: 'Save', percentage: 10, basis: 'accumulative' }
    ];

    assert.equal(applyPercentageCuts(100, cuts), 72);
});

test('computeEarningsPool uses all-time break-adjusted earnings after cuts', () => {
    const now = new Date('2026-07-13T12:00:00');
    const startTime = now.getTime() - (2 * HOUR_MS);
    const sessions = [makeSession({ startTime, durationMs: 2 * HOUR_MS, earnings: 200 })];
    const breaks = [{
        startTime: startTime + (30 * 60 * 1000),
        endTime: startTime + HOUR_MS,
        durationMs: 30 * 60 * 1000
    }];
    const cuts = [{ name: 'Tax', percentage: 10, basis: 'accumulative' }];

    const pool = computeEarningsPool({
        sessions,
        breaks,
        poolScope: POOL_SCOPES.ALL_TIME,
        percentageCuts: cuts,
        now
    });

    assert.equal(pool, roundMoney(150 * 0.9));
});

test('computeEarningsPool scopes earnings to rolling window', () => {
    const now = new Date('2026-07-13T12:00:00');
    const recentStart = now.getTime() - HOUR_MS;
    const oldStart = now.getTime() - (40 * 24 * HOUR_MS);

    const sessions = [
        makeSession({ id: 'recent', startTime: recentStart, earnings: 50 }),
        makeSession({ id: 'old', startTime: oldStart, earnings: 500 })
    ];

    const allTimePool = computeEarningsPool({
        sessions,
        breaks: [],
        poolScope: POOL_SCOPES.ALL_TIME,
        percentageCuts: [],
        now
    });

    const rollingPool = computeEarningsPool({
        sessions,
        breaks: [],
        poolScope: POOL_SCOPES.ROLLING_30D,
        percentageCuts: [],
        now
    });

    assert.equal(allTimePool, 550);
    assert.equal(rollingPool, 50);
});

test('getPoolScopeWindow returns month start for calendar month scope', () => {
    const now = new Date('2026-07-13T15:30:00');
    const window = getPoolScopeWindow(POOL_SCOPES.CALENDAR_MONTH, now, 1);

    assert.equal(window.start.getFullYear(), 2026);
    assert.equal(window.start.getMonth(), 6);
    assert.equal(window.start.getDate(), 1);
    assert.equal(window.start.getHours(), 0);
});

test('computeSavingPotState tracks assigned and unassigned balances', () => {
    const potState = computeSavingPotState({
        sessions: [makeSession({ startTime: Date.now() - HOUR_MS, earnings: 200 })],
        breaks: [],
        timeCostItems: [
            { id: 'a', name: 'Laptop', cost: 1000, savedAmount: 75 },
            { id: 'b', name: 'Mouse', cost: 50, savedAmount: 25 }
        ],
        poolScope: POOL_SCOPES.ALL_TIME,
        percentageCuts: []
    });

    assert.equal(potState.earningsPool, 200);
    assert.equal(potState.totalAssigned, 100);
    assert.equal(potState.unassignedBalance, 100);
    assert.equal(potState.isOverAssigned, false);
});

test('computeSavingPotState flags over-assigned balances', () => {
    const potState = computeSavingPotState({
        sessions: [makeSession({ startTime: Date.now() - HOUR_MS, earnings: 80 })],
        breaks: [],
        timeCostItems: [{ id: 'a', name: 'Laptop', cost: 1000, savedAmount: 100 }],
        poolScope: POOL_SCOPES.ALL_TIME,
        percentageCuts: []
    });

    assert.equal(potState.isOverAssigned, true);
    assert.equal(potState.overAssignedBy, 20);
});

test('validateAssign enforces unassigned and remaining caps', () => {
    const item = { id: 'a', name: 'Laptop', cost: 100, savedAmount: 40 };
    const potState = {
        isOverAssigned: false,
        unassignedBalance: 50
    };

    assert.equal(validateAssign(60, item, potState).ok, false);
    assert.equal(validateAssign(30, item, potState).ok, true);
    assert.equal(validateAssign(30, item, potState).amount, 30);
});

test('validateAssign blocks when over-assigned', () => {
    const item = { id: 'a', name: 'Laptop', cost: 100, savedAmount: 10 };
    const potState = { isOverAssigned: true, unassignedBalance: -5 };

    assert.equal(validateAssign(5, item, potState).ok, false);
});

test('validateWithdraw cannot exceed saved amount', () => {
    const item = { id: 'a', name: 'Laptop', cost: 100, savedAmount: 20 };

    assert.equal(validateWithdraw(25, item).ok, false);
    assert.equal(validateWithdraw(10, item).ok, true);
});

test('clampSavedAmountForCost limits saved amount to cost', () => {
    assert.equal(clampSavedAmountForCost(120, 100), 100);
    assert.equal(clampSavedAmountForCost(80, 100), 80);
});

test('getClosestGoal picks highest progress item that is not fully funded', () => {
    const closest = getClosestGoal([
        { id: 'a', name: 'Laptop', cost: 100, savedAmount: 10 },
        { id: 'b', name: 'Mouse', cost: 50, savedAmount: 40 },
        { id: 'c', name: 'Done', cost: 20, savedAmount: 20 }
    ]);

    assert.equal(closest.item.id, 'b');
    assert.equal(closest.percent, 80);
    assert.equal(closest.remaining, 10);
});
