import { roundMoney } from './savingPots.js';

export const BUDGET_MAX_DIVISIONS = 16;
export const BUDGET_MIN_PERCENT = 1;
export const BUDGET_SNAP_PERCENT = 5;
export const BUDGET_SNAP_MODES = {
    OFF: 'off',
    ONE: '1',
    FIVE: '5'
};
export const PERCENT_EPSILON = 0.01;

export function sanitizeBudgetSnapMode(mode) {
    if (mode === BUDGET_SNAP_MODES.OFF || mode === BUDGET_SNAP_MODES.ONE || mode === BUDGET_SNAP_MODES.FIVE) {
        return mode;
    }
    return BUDGET_SNAP_MODES.FIVE;
}

/** Map snap mode → applyBoundaryDrag options. */
export function getSnapOptionsForMode(mode) {
    const sanitized = sanitizeBudgetSnapMode(mode);
    if (sanitized === BUDGET_SNAP_MODES.OFF) {
        return { snap: false, snapStep: BUDGET_SNAP_PERCENT };
    }
    if (sanitized === BUDGET_SNAP_MODES.ONE) {
        return { snap: true, snapStep: 1 };
    }
    return { snap: true, snapStep: 5 };
}

export const BUDGET_COLOR_PALETTE = [
    '#00d4ff',
    '#00e676',
    '#7c3aed',
    '#ff1744',
    '#38bdf8',
    '#34d399',
    '#a78bfa',
    '#fb7185',
    '#22d3ee',
    '#4ade80',
    '#c084fc',
    '#f97316',
    '#67e8f9',
    '#86efac',
    '#e879f9',
    '#fbbf24'
];

function createDivisionId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `budget-div-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDivision(name = '', percentage = BUDGET_MIN_PERCENT) {
    return {
        id: createDivisionId(),
        name: String(name || '').trim(),
        percentage: Number(percentage) || 0
    };
}

export function createSeedBudgetPlan() {
    return {
        totalAmount: 0,
        divisions: [
            createDivision('Rent', 40),
            createDivision('Food', 20),
            createDivision('Other', 40)
        ]
    };
}

export function getDivisionColor(index) {
    const i = Math.max(0, Number(index) || 0);
    return BUDGET_COLOR_PALETTE[i % BUDGET_COLOR_PALETTE.length];
}

function cloneDivisions(divisions) {
    return (divisions || []).map((division) => ({
        id: division.id || createDivisionId(),
        name: String(division.name || '').trim(),
        percentage: Number(division.percentage) || 0
    }));
}

function sumPercentages(divisions) {
    return (divisions || []).reduce((sum, division) => sum + (Number(division.percentage) || 0), 0);
}

function findLargestIndex(divisions, excludeIndex = -1) {
    let bestIndex = -1;
    let bestValue = -Infinity;

    divisions.forEach((division, index) => {
        if (index === excludeIndex) return;
        const value = Number(division.percentage) || 0;
        if (value > bestValue) {
            bestValue = value;
            bestIndex = index;
        }
    });

    return bestIndex;
}

function absorbEpsilonRemainder(divisions) {
    if (!divisions.length) return divisions;

    const sum = sumPercentages(divisions);
    const drift = 100 - sum;
    if (Math.abs(drift) < PERCENT_EPSILON / 10) {
        return divisions;
    }

    const largestIndex = findLargestIndex(divisions);
    if (largestIndex < 0) return divisions;

    const next = cloneDivisions(divisions);
    next[largestIndex] = {
        ...next[largestIndex],
        percentage: roundPercent(next[largestIndex].percentage + drift)
    };
    return next;
}

export function roundPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 10000) / 10000;
}

/**
 * Snap a percentage to the nearest step within [min, max].
 * When snap is off, only clamps.
 */
export function snapPercentToStep(value, {
    snap = false,
    step = BUDGET_SNAP_PERCENT,
    min = BUDGET_MIN_PERCENT,
    max = 100
} = {}) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    let next = Number(value);
    if (!Number.isFinite(next)) next = lo;

    if (snap && step > 0) {
        next = Math.round(next / step) * step;
    }

    next = Math.min(Math.max(next, lo), hi);

    if (snap && step > 0) {
        // Re-snap after clamp in case clamp landed off-grid (e.g. max = 47).
        const snappedLo = Math.ceil(lo / step) * step;
        const snappedHi = Math.floor(hi / step) * step;
        if (snappedLo <= snappedHi) {
            next = Math.min(Math.max(Math.round(next / step) * step, snappedLo), snappedHi);
        } else {
            // No valid step inside range — keep clamped value (usually min floor).
            next = lo;
        }
    }

    return roundPercent(next);
}

/**
 * Force each division ≥ min%, sum ≈ 100%, length within 1..max.
 */
export function normalizePercentages(divisions, {
    minPercent = BUDGET_MIN_PERCENT,
    maxDivisions = BUDGET_MAX_DIVISIONS
} = {}) {
    let next = cloneDivisions(divisions)
        .slice(0, maxDivisions)
        .map((division, index) => ({
            ...division,
            name: division.name || `Division ${index + 1}`,
            percentage: Math.max(Number(division.percentage) || 0, 0)
        }));

    if (!next.length) {
        return createSeedBudgetPlan().divisions;
    }

    const floorTotal = minPercent * next.length;
    if (floorTotal > 100 + PERCENT_EPSILON) {
        // Too many divisions for the floor — equal split (should not happen at max 16 / min 5).
        const equal = roundPercent(100 / next.length);
        next = next.map((division, index) => ({
            ...division,
            percentage: index === next.length - 1
                ? roundPercent(100 - equal * (next.length - 1))
                : equal
        }));
        return absorbEpsilonRemainder(next);
    }

    next = next.map((division) => ({
        ...division,
        percentage: Math.max(roundPercent(division.percentage), minPercent)
    }));

    let sum = sumPercentages(next);
    if (sum > 100 + PERCENT_EPSILON) {
        let excess = sum - 100;
        // Shrink largest slices first while respecting floors.
        const order = next
            .map((division, index) => ({ index, percentage: division.percentage }))
            .sort((a, b) => b.percentage - a.percentage);

        for (const item of order) {
            if (excess <= PERCENT_EPSILON) break;
            const reducible = next[item.index].percentage - minPercent;
            if (reducible <= 0) continue;
            const take = Math.min(reducible, excess);
            next[item.index] = {
                ...next[item.index],
                percentage: roundPercent(next[item.index].percentage - take)
            };
            excess = roundPercent(excess - take);
        }
    } else if (sum < 100 - PERCENT_EPSILON) {
        const largestIndex = findLargestIndex(next);
        if (largestIndex >= 0) {
            next[largestIndex] = {
                ...next[largestIndex],
                percentage: roundPercent(next[largestIndex].percentage + (100 - sum))
            };
        }
    }

    return absorbEpsilonRemainder(next);
}

export function computeAmounts(totalAmount, divisions) {
    const total = Math.max(Number(totalAmount) || 0, 0);
    return (divisions || []).map((division) =>
        roundMoney(total * ((Number(division.percentage) || 0) / 100))
    );
}

/**
 * Convert pointer angle (radians, atan2 style: 0 = east, CCW-positive in math,
 * which matches clockwise-from-top on an SVG canvas where y grows downward)
 * to clockwise percent from 12 o'clock (0..100).
 */
export function angleToClockwisePercent(angleRad) {
    let fromTop = Number(angleRad) + Math.PI / 2;
    fromTop = ((fromTop % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
    return (fromTop / (2 * Math.PI)) * 100;
}

export function percentToAngle(clockwisePercent) {
    const pct = ((Number(clockwisePercent) % 100) + 100) % 100;
    return (pct / 100) * 2 * Math.PI - Math.PI / 2;
}

export function angleToPoint(cx, cy, radius, angleRad) {
    return {
        x: cx + radius * Math.cos(angleRad),
        y: cy + radius * Math.sin(angleRad)
    };
}

export function percentsToAngles(divisions) {
    const normalized = divisions || [];
    const slices = [];
    let cumulative = 0;

    normalized.forEach((division) => {
        const startPercent = cumulative;
        cumulative += Number(division.percentage) || 0;
        const endPercent = cumulative;
        slices.push({
            id: division.id,
            startPercent,
            endPercent,
            startAngle: percentToAngle(startPercent),
            endAngle: percentToAngle(endPercent)
        });
    });

    return slices;
}

export function getBoundaryPercents(divisions) {
    const boundaries = [];
    let cumulative = 0;
    const list = divisions || [];

    list.forEach((division, index) => {
        cumulative += Number(division.percentage) || 0;
        boundaries.push({
            boundaryIndex: index,
            percent: cumulative,
            leftIndex: index,
            rightIndex: (index + 1) % list.length
        });
    });

    return boundaries;
}

/**
 * Drag boundary between divisions[boundaryIndex] and the next (wrapping).
 * Only those two percentages change; each stays ≥ minPercent.
 */
export function applyBoundaryDrag(divisions, boundaryIndex, angleRad, {
    minPercent = BUDGET_MIN_PERCENT,
    snap = false,
    snapStep = BUDGET_SNAP_PERCENT
} = {}) {
    const next = cloneDivisions(divisions);
    const n = next.length;
    if (n < 2) return next;

    const i = ((Number(boundaryIndex) % n) + n) % n;
    const leftIndex = i;
    const rightIndex = (i + 1) % n;
    let targetCumulative = angleToClockwisePercent(angleRad);

    const startLeft = next.slice(0, leftIndex).reduce((s, d) => s + d.percentage, 0);
    const pairTotal = next[leftIndex].percentage + next[rightIndex].percentage;
    let newLeft = targetCumulative - startLeft;
    if (i === n - 1 && newLeft < 0) {
        newLeft += 100;
    }

    const maxLeft = pairTotal - minPercent;
    newLeft = snapPercentToStep(newLeft, {
        snap,
        step: snapStep,
        min: minPercent,
        max: Math.max(minPercent, maxLeft)
    });
    const newRight = roundPercent(pairTotal - newLeft);

    next[leftIndex] = { ...next[leftIndex], percentage: roundPercent(newLeft) };
    next[rightIndex] = { ...next[rightIndex], percentage: newRight };
    return absorbEpsilonRemainder(next);
}

/**
 * Set one division's percentage; take from / give to the largest other (floors respected).
 * Returns { divisions, applied, error? }.
 */
export function applyTypedPercentage(divisions, id, nextPct, {
    minPercent = BUDGET_MIN_PERCENT
} = {}) {
    const next = cloneDivisions(divisions);
    const index = next.findIndex((division) => division.id === id);
    if (index < 0) {
        return { divisions: next, applied: false, error: 'Division not found.' };
    }

    if (next.length === 1) {
        next[0] = { ...next[0], percentage: 100 };
        return { divisions: next, applied: true };
    }

    const maxForThis = 100 - minPercent * (next.length - 1);
    let desired = Number(nextPct);
    if (!Number.isFinite(desired)) {
        return { divisions: next, applied: false, error: 'Enter a valid percentage.' };
    }
    if (desired < minPercent - PERCENT_EPSILON) {
        return {
            divisions: next,
            applied: false,
            error: `Each division must be at least ${minPercent}%.`
        };
    }
    if (desired > maxForThis + PERCENT_EPSILON) {
        return {
            divisions: next,
            applied: false,
            error: `Maximum for this division is ${roundPercent(maxForThis)}% with ${next.length} divisions.`
        };
    }
    desired = roundPercent(Math.min(Math.max(desired, minPercent), maxForThis));

    const current = next[index].percentage;
    let delta = roundPercent(desired - current);
    if (Math.abs(delta) < PERCENT_EPSILON / 10) {
        return { divisions: next, applied: true };
    }

    const otherIndex = findLargestIndex(next, index);
    if (otherIndex < 0) {
        return { divisions: next, applied: false, error: 'No other division to adjust.' };
    }

    if (delta > 0) {
        const available = next[otherIndex].percentage - minPercent;
        if (available < PERCENT_EPSILON / 10) {
            return {
                divisions: next,
                applied: false,
                error: `Cannot increase: other divisions are already at the ${minPercent}% minimum.`
            };
        }
        const take = Math.min(delta, available);
        next[index] = { ...next[index], percentage: roundPercent(current + take) };
        next[otherIndex] = {
            ...next[otherIndex],
            percentage: roundPercent(next[otherIndex].percentage - take)
        };
        if (take + PERCENT_EPSILON < delta) {
            return {
                divisions: absorbEpsilonRemainder(next),
                applied: true,
                error: `Only increased to ${next[index].percentage}% (limited by the ${minPercent}% floor on other divisions).`
            };
        }
    } else {
        const give = -delta;
        next[index] = { ...next[index], percentage: roundPercent(current - give) };
        next[otherIndex] = {
            ...next[otherIndex],
            percentage: roundPercent(next[otherIndex].percentage + give)
        };
    }

    return { divisions: absorbEpsilonRemainder(next), applied: true };
}

export function canAddDivision(divisions, {
    minPercent = BUDGET_MIN_PERCENT,
    maxDivisions = BUDGET_MAX_DIVISIONS
} = {}) {
    const list = divisions || [];
    if (list.length >= maxDivisions) return false;
    // Need a slice with at least minPercent headroom above the floor so both stay ≥ min.
    return list.some((division) => (Number(division.percentage) || 0) >= minPercent * 2);
}

export function addDivision(divisions, name = 'New', {
    minPercent = BUDGET_MIN_PERCENT,
    maxDivisions = BUDGET_MAX_DIVISIONS
} = {}) {
    const next = cloneDivisions(divisions);
    if (!canAddDivision(next, { minPercent, maxDivisions })) {
        return { divisions: next, added: null, error: `Cannot add another division (max ${maxDivisions}, or not enough room above ${minPercent}%).` };
    }

    const largestIndex = findLargestIndex(next);
    const carve = minPercent;
    next[largestIndex] = {
        ...next[largestIndex],
        percentage: roundPercent(next[largestIndex].percentage - carve)
    };

    const added = createDivision(name || `Division ${next.length + 1}`, carve);
    next.push(added);
    return { divisions: absorbEpsilonRemainder(next), added, error: null };
}

export function removeDivision(divisions, id, {
    minPercent = BUDGET_MIN_PERCENT
} = {}) {
    const next = cloneDivisions(divisions);
    if (next.length <= 1) {
        return { divisions: next, removed: null, error: 'At least one division is required.' };
    }

    const index = next.findIndex((division) => division.id === id);
    if (index < 0) {
        return { divisions: next, removed: null, error: 'Division not found.' };
    }

    const [removed] = next.splice(index, 1);
    const largestIndex = findLargestIndex(next);
    if (largestIndex >= 0) {
        next[largestIndex] = {
            ...next[largestIndex],
            percentage: roundPercent(next[largestIndex].percentage + (Number(removed.percentage) || 0))
        };
    }

    return {
        divisions: normalizePercentages(next, { minPercent }),
        removed,
        error: null
    };
}

/**
 * Set every division to an equal share of 100% (names/ids preserved).
 */
export function equalizeDivisions(divisions, {
    minPercent = BUDGET_MIN_PERCENT,
    maxDivisions = BUDGET_MAX_DIVISIONS
} = {}) {
    const next = cloneDivisions(divisions);
    if (!next.length) {
        return { divisions: createSeedBudgetPlan().divisions, error: null };
    }

    const equal = roundPercent(100 / next.length);
    const equalized = next.map((division, index) => ({
        ...division,
        percentage: index === next.length - 1
            ? roundPercent(100 - equal * (next.length - 1))
            : equal
    }));

    return {
        divisions: normalizePercentages(equalized, { minPercent, maxDivisions }),
        error: null
    };
}

export function renameDivision(divisions, id, name) {
    const next = cloneDivisions(divisions);
    const index = next.findIndex((division) => division.id === id);
    if (index < 0) {
        return { divisions: next, error: 'Division not found.' };
    }

    const trimmed = String(name || '').trim();
    if (!trimmed) {
        return { divisions: next, error: 'Name cannot be empty.' };
    }

    next[index] = { ...next[index], name: trimmed };
    return { divisions: next, error: null };
}

export function validateBudgetPlan(plan, {
    minPercent = BUDGET_MIN_PERCENT,
    maxDivisions = BUDGET_MAX_DIVISIONS
} = {}) {
    const totalAmount = Number(plan?.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        return { ok: false, error: 'Total must be a non-negative number.' };
    }

    const divisions = plan?.divisions;
    if (!Array.isArray(divisions) || divisions.length < 1 || divisions.length > maxDivisions) {
        return { ok: false, error: `Divisions must be between 1 and ${maxDivisions}.` };
    }

    for (const division of divisions) {
        if (!division || typeof division.id !== 'string' || !division.id) {
            return { ok: false, error: 'Each division needs an id.' };
        }
        if (typeof division.name !== 'string' || !division.name.trim()) {
            return { ok: false, error: 'Each division needs a name.' };
        }
        const pct = Number(division.percentage);
        if (!Number.isFinite(pct) || pct < minPercent - PERCENT_EPSILON) {
            return { ok: false, error: `Each division must be at least ${minPercent}%.` };
        }
    }

    const sum = sumPercentages(divisions);
    if (Math.abs(sum - 100) > PERCENT_EPSILON * 10) {
        return { ok: false, error: 'Percentages must sum to 100%.' };
    }

    return { ok: true };
}

export function sanitizeBudgetPlan(raw, {
    minPercent = BUDGET_MIN_PERCENT,
    maxDivisions = BUDGET_MAX_DIVISIONS
} = {}) {
    if (!raw || typeof raw !== 'object') {
        return createSeedBudgetPlan();
    }

    const totalRaw = Number(raw.totalAmount);
    const totalAmount = Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : 0;

    if (!Array.isArray(raw.divisions) || raw.divisions.length === 0) {
        return { ...createSeedBudgetPlan(), totalAmount };
    }

    const divisions = normalizePercentages(raw.divisions, { minPercent, maxDivisions });
    return { totalAmount, divisions };
}

export function describeBoundary(divisions, boundaryIndex) {
    const list = divisions || [];
    const n = list.length;
    if (n < 2) return '';
    const i = ((Number(boundaryIndex) % n) + n) % n;
    const left = list[i];
    const right = list[(i + 1) % n];
    return `${left?.name || 'Division'} / ${right?.name || 'Division'} boundary`;
}

/** Mid-angle (radians) of a slice for label placement. */
export function getSliceMidAngle(startAngle, endAngle) {
    let delta = endAngle - startAngle;
    if (delta < 0) delta += 2 * Math.PI;
    return startAngle + delta / 2;
}

/**
 * Build SVG path for a solid pie slice from startAngle to endAngle (radians, SVG coords).
 */
export function describeSlicePath(cx, cy, radius, startAngle, endAngle) {
    const start = angleToPoint(cx, cy, radius, startAngle);
    const end = angleToPoint(cx, cy, radius, endAngle);
    let delta = endAngle - startAngle;
    // Clockwise pie: angles from percentToAngle increase clockwise in screen space
    // because y grows downward... percentToAngle: 0% → -π/2, 25% → 0, 50% → π/2.
    // That's clockwise on screen. Large arc if span > 180°.
    if (delta < 0) delta += 2 * Math.PI;
    const largeArc = delta > Math.PI ? 1 : 0;
    // sweep-flag 1 = clockwise in SVG
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}
