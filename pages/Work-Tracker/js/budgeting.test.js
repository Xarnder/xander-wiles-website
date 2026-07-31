import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BUDGET_MAX_DIVISIONS,
    BUDGET_MIN_PERCENT,
    PERCENT_EPSILON,
    addDivision,
    applyBoundaryDrag,
    applyTypedPercentage,
    canAddDivision,
    computeAmounts,
    createSeedBudgetPlan,
    normalizePercentages,
    percentToAngle,
    angleToClockwisePercent,
    removeDivision,
    equalizeDivisions,
    getSnapOptionsForMode,
    sanitizeBudgetPlan,
    validateBudgetPlan
} from './budgeting.js';
import { roundMoney } from './savingPots.js';

function sumPct(divisions) {
    return divisions.reduce((sum, d) => sum + d.percentage, 0);
}

function assertNear(actual, expected, epsilon = PERCENT_EPSILON) {
    assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${expected}, got ${actual}`);
}

test('seed plan sums to 100% with Rent/Food/Other', () => {
    const plan = createSeedBudgetPlan();
    assert.equal(plan.totalAmount, 0);
    assert.equal(plan.divisions.length, 3);
    assert.deepEqual(plan.divisions.map((d) => d.name), ['Rent', 'Food', 'Other']);
    assert.deepEqual(plan.divisions.map((d) => d.percentage), [40, 20, 40]);
    assertNear(sumPct(plan.divisions), 100);
});

test('normalizePercentages enforces min percent and sum ≈ 100', () => {
    const normalized = normalizePercentages([
        { id: 'a', name: 'A', percentage: 90 },
        { id: 'b', name: 'B', percentage: 0.2 },
        { id: 'c', name: 'C', percentage: 0.2 }
    ]);
    assert.equal(normalized.length, 3);
    normalized.forEach((d) => assert.ok(d.percentage >= BUDGET_MIN_PERCENT - PERCENT_EPSILON));
    assertNear(sumPct(normalized), 100);
});

test('computeAmounts uses roundMoney', () => {
    const divisions = createSeedBudgetPlan().divisions;
    const amounts = computeAmounts(10000, divisions);
    assert.equal(amounts[0], roundMoney(4000));
    assert.equal(amounts[1], roundMoney(2000));
    assert.equal(amounts[2], roundMoney(4000));
});

test('applyBoundaryDrag only changes adjacent slices and respects floors', () => {
    const divisions = createSeedBudgetPlan().divisions;
    // Boundary 0 between Rent(40) and Food(20). Start of Rent at 0; move seam to 30%.
    const angle = percentToAngle(30);
    const next = applyBoundaryDrag(divisions, 0, angle);
    assertNear(next[0].percentage, 30);
    assertNear(next[1].percentage, 30);
    assertNear(next[2].percentage, 40);
    assertNear(sumPct(next), 100);

    // Try to push Food below 1% — clamp at floor.
    const clamped = applyBoundaryDrag(divisions, 0, percentToAngle(59.5));
    assert.ok(clamped[1].percentage >= BUDGET_MIN_PERCENT - PERCENT_EPSILON);
    assert.ok(clamped[0].percentage >= BUDGET_MIN_PERCENT - PERCENT_EPSILON);
    assertNear(sumPct(clamped), 100);
});

test('applyBoundaryDrag snaps left percentage to 5% steps when enabled', () => {
    const divisions = createSeedBudgetPlan().divisions;
    const snapped = applyBoundaryDrag(divisions, 0, percentToAngle(33), { snap: true, snapStep: 5 });
    assert.equal(snapped[0].percentage % 5, 0);
    assert.equal(snapped[1].percentage % 5, 0);
    assertNear(sumPct(snapped), 100);
    assertNear(snapped[0].percentage, 35, 0.01);
});

test('applyBoundaryDrag snaps to 1% steps when enabled', () => {
    const divisions = createSeedBudgetPlan().divisions;
    const snapped = applyBoundaryDrag(divisions, 0, percentToAngle(33.4), { snap: true, snapStep: 1 });
    assert.equal(Number.isInteger(snapped[0].percentage) || Math.abs(snapped[0].percentage - Math.round(snapped[0].percentage)) < PERCENT_EPSILON, true);
    assertNear(snapped[0].percentage, 33, 0.01);
    assertNear(sumPct(snapped), 100);
});

test('getSnapOptionsForMode maps three-way toggle', () => {
    assert.deepEqual(getSnapOptionsForMode('off'), { snap: false, snapStep: 5 });
    assert.deepEqual(getSnapOptionsForMode('1'), { snap: true, snapStep: 1 });
    assert.deepEqual(getSnapOptionsForMode('5'), { snap: true, snapStep: 5 });
    assert.deepEqual(getSnapOptionsForMode('nope'), { snap: true, snapStep: 5 });
});

test('applyTypedPercentage takes from largest other', () => {
    const divisions = createSeedBudgetPlan().divisions;
    const foodId = divisions[1].id;
    // Increase Food from 20 → 30; largest others are Rent and Other both 40 — first max is Rent (index 0).
    const result = applyTypedPercentage(divisions, foodId, 30);
    assert.equal(result.applied, true);
    assertNear(result.divisions[1].percentage, 30);
    assertNear(result.divisions[0].percentage, 30);
    assertNear(result.divisions[2].percentage, 40);
    assertNear(sumPct(result.divisions), 100);
});

test('applyTypedPercentage rejects increase past max / when others at floor', () => {
    const divisions = normalizePercentages([
        { id: 'a', name: 'A', percentage: 90 },
        { id: 'b', name: 'B', percentage: 5 },
        { id: 'c', name: 'C', percentage: 5 }
    ]);
    // With min 1%, max for one of three is 98% — 99 should fail.
    const overMax = applyTypedPercentage(divisions, 'a', 99);
    assert.equal(overMax.applied, false);
    assert.ok(overMax.error);

    // Large slice already at max given six others at the 1% floor.
    const tight = normalizePercentages([
        { id: 'big', name: 'Big', percentage: 94 },
        { id: 'b', name: 'B', percentage: 1 },
        { id: 'c', name: 'C', percentage: 1 },
        { id: 'd', name: 'D', percentage: 1 },
        { id: 'e', name: 'E', percentage: 1 },
        { id: 'f', name: 'F', percentage: 1 },
        { id: 'g', name: 'G', percentage: 1 }
    ]);
    const blocked = applyTypedPercentage(tight, 'big', 95);
    assert.equal(blocked.applied, false);
    assert.ok(blocked.error);
});

test('addDivision and removeDivision preserve invariants', () => {
    let divisions = createSeedBudgetPlan().divisions;
    const added = addDivision(divisions, 'Savings');
    assert.ok(added.added);
    assert.equal(added.divisions.length, 4);
    assert.ok(added.added.percentage >= BUDGET_MIN_PERCENT - PERCENT_EPSILON);
    added.divisions.forEach((d) => assert.ok(d.percentage >= BUDGET_MIN_PERCENT - PERCENT_EPSILON));
    assertNear(sumPct(added.divisions), 100);

    const removed = removeDivision(added.divisions, added.added.id);
    assert.ok(removed.removed);
    assert.equal(removed.divisions.length, 3);
    assertNear(sumPct(removed.divisions), 100);
});

test('canAddDivision false at max or without headroom', () => {
    assert.equal(canAddDivision(createSeedBudgetPlan().divisions), true);

    const many = [];
    for (let i = 0; i < BUDGET_MAX_DIVISIONS; i += 1) {
        many.push({ id: `d${i}`, name: `D${i}`, percentage: 100 / BUDGET_MAX_DIVISIONS });
    }
    const normalized = normalizePercentages(many);
    assert.equal(canAddDivision(normalized), false);
});

test('cannot remove last division', () => {
    const one = normalizePercentages([{ id: 'only', name: 'Only', percentage: 100 }]);
    const result = removeDivision(one, 'only');
    assert.ok(result.error);
    assert.equal(result.divisions.length, 1);
});

test('equalizeDivisions splits percentages evenly', () => {
    const divisions = createSeedBudgetPlan().divisions;
    const result = equalizeDivisions(divisions);
    assert.equal(result.divisions.length, 3);
    result.divisions.forEach((d) => assertNear(d.percentage, 100 / 3, 0.02));
    assertNear(sumPct(result.divisions), 100);
    assert.deepEqual(result.divisions.map((d) => d.name), ['Rent', 'Food', 'Other']);
});

test('angle ↔ percent round-trip within tolerance', () => {
    for (const pct of [0, 25, 40, 50, 75, 99]) {
        const angle = percentToAngle(pct);
        const back = angleToClockwisePercent(angle);
        assertNear(back, pct, 0.05);
    }
});

test('sanitizeBudgetPlan seeds missing/empty docs', () => {
    const seeded = sanitizeBudgetPlan(null);
    assert.deepEqual(seeded.divisions.map((d) => d.name), ['Rent', 'Food', 'Other']);

    const withTotal = sanitizeBudgetPlan({ totalAmount: 5000, divisions: [] });
    assert.equal(withTotal.totalAmount, 5000);
    assert.equal(withTotal.divisions.length, 3);
});

test('validateBudgetPlan accepts seed and rejects bad totals', () => {
    const plan = createSeedBudgetPlan();
    assert.equal(validateBudgetPlan(plan).ok, true);
    assert.equal(validateBudgetPlan({ ...plan, totalAmount: -1 }).ok, false);
});
