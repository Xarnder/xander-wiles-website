import {
    calculateRollingPeriodTotals,
    getEffectiveSessionMetrics,
    getStartOfWeekDate
} from './utils.js';

export const POOL_SCOPES = {
    ALL_TIME: 'all_time',
    ROLLING_30D: 'rolling_30d',
    CALENDAR_MONTH: 'calendar_month',
    CALENDAR_WEEK: 'calendar_week'
};

export const POOL_SCOPE_LABELS = {
    [POOL_SCOPES.ALL_TIME]: 'All time',
    [POOL_SCOPES.ROLLING_30D]: 'Last 30 days',
    [POOL_SCOPES.CALENDAR_MONTH]: 'Month to date',
    [POOL_SCOPES.CALENDAR_WEEK]: 'This week'
};

const ALLOWED_POOL_SCOPES = new Set(Object.values(POOL_SCOPES));
export const MONEY_EPSILON = 0.005;

export function roundMoney(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
}

export function sanitizePoolScope(scope) {
    return ALLOWED_POOL_SCOPES.has(scope) ? scope : POOL_SCOPES.ALL_TIME;
}

export function getPoolScopeLabel(scope) {
    return POOL_SCOPE_LABELS[sanitizePoolScope(scope)] || POOL_SCOPE_LABELS[POOL_SCOPES.ALL_TIME];
}

export function getPoolScopeWindow(poolScope, now = new Date(), startOfWeek = 0) {
    const scope = sanitizePoolScope(poolScope);

    if (scope === POOL_SCOPES.ALL_TIME) {
        return { start: null, end: null };
    }

    const end = new Date(now);

    if (scope === POOL_SCOPES.ROLLING_30D) {
        const start = new Date(now);
        start.setDate(now.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        return { start, end };
    }

    if (scope === POOL_SCOPES.CALENDAR_MONTH) {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        return { start, end };
    }

    const start = getStartOfWeekDate(now, startOfWeek);
    return { start, end };
}

export function applyPercentageCuts(baseAmount, percentageCuts = []) {
    const originalAmount = Math.max(Number(baseAmount) || 0, 0);
    let accumulatedAmount = originalAmount;

    if (!Array.isArray(percentageCuts)) {
        return accumulatedAmount;
    }

    percentageCuts.forEach((cut) => {
        const rawPercentage = Number(cut.percentage);
        const percentage = Number.isFinite(rawPercentage) ? Math.min(Math.max(rawPercentage, 0), 100) : 0;
        const sourcePool = cut.basis === 'original' ? originalAmount : accumulatedAmount;
        const deduction = sourcePool * (percentage / 100);
        accumulatedAmount = Math.max(accumulatedAmount - deduction, 0);
    });

    return accumulatedAmount;
}

export function getItemSavedAmount(item) {
    return roundMoney(Math.max(Number(item?.savedAmount) || 0, 0));
}

function sumBreakAdjustedEarningsBeforeCuts(sessions, breaks) {
    return (sessions || []).reduce((total, session) => {
        const metrics = getEffectiveSessionMetrics(session, breaks);
        return total + (Number(metrics.effectiveEarnings) || 0);
    }, 0);
}

export function computeEarningsPool({
    sessions = [],
    breaks = [],
    poolScope = POOL_SCOPES.ALL_TIME,
    startOfWeek = 0,
    percentageCuts = [],
    now = new Date()
} = {}) {
    const scope = sanitizePoolScope(poolScope);
    let beforeCutsTotal = 0;

    if (scope === POOL_SCOPES.ALL_TIME) {
        beforeCutsTotal = sumBreakAdjustedEarningsBeforeCuts(sessions, breaks);
    } else {
        const { start, end } = getPoolScopeWindow(scope, now, startOfWeek);
        const totals = calculateRollingPeriodTotals(sessions, start, end, breaks);
        beforeCutsTotal = Number(totals.totalEarnings) || 0;
    }

    return roundMoney(applyPercentageCuts(beforeCutsTotal, percentageCuts));
}

export function getClosestGoal(items = []) {
    let closest = null;

    items.forEach((item) => {
        const cost = Number(item.cost) || 0;
        const savedAmount = getItemSavedAmount(item);
        if (cost <= 0 || savedAmount >= cost - MONEY_EPSILON) return;

        const percent = (savedAmount / cost) * 100;
        if (!closest || percent > closest.percent) {
            closest = {
                item,
                savedAmount,
                remaining: roundMoney(Math.max(0, cost - savedAmount)),
                percent: roundMoney(percent)
            };
        }
    });

    return closest;
}

export function computeSavingPotState({
    sessions = [],
    breaks = [],
    timeCostItems = [],
    poolScope = POOL_SCOPES.ALL_TIME,
    startOfWeek = 0,
    percentageCuts = [],
    now = new Date()
} = {}) {
    const scope = sanitizePoolScope(poolScope);
    const earningsPool = computeEarningsPool({
        sessions,
        breaks,
        poolScope: scope,
        startOfWeek,
        percentageCuts,
        now
    });

    const itemsWithProgress = (timeCostItems || []).map((item) => {
        const savedAmount = getItemSavedAmount(item);
        const cost = roundMoney(Math.max(Number(item.cost) || 0, 0));
        const remaining = roundMoney(Math.max(0, cost - savedAmount));
        const percent = cost > 0 ? roundMoney(Math.min(100, (savedAmount / cost) * 100)) : 0;
        const isFullyFunded = cost > 0 && savedAmount >= cost - MONEY_EPSILON;

        return {
            ...item,
            savedAmount,
            cost,
            remaining,
            percent,
            isFullyFunded
        };
    });

    const totalAssigned = roundMoney(itemsWithProgress.reduce((sum, item) => sum + item.savedAmount, 0));
    const unassignedBalance = roundMoney(earningsPool - totalAssigned);
    const isOverAssigned = totalAssigned > earningsPool + MONEY_EPSILON;
    const overAssignedBy = isOverAssigned ? roundMoney(totalAssigned - earningsPool) : 0;

    return {
        earningsPool,
        poolScope: scope,
        poolScopeLabel: getPoolScopeLabel(scope),
        totalAssigned,
        unassignedBalance,
        isOverAssigned,
        overAssignedBy,
        itemsWithProgress,
        closestGoal: getClosestGoal(itemsWithProgress)
    };
}

export function clampSavedAmountForCost(savedAmount, cost) {
    const saved = roundMoney(Math.max(Number(savedAmount) || 0, 0));
    const maxCost = roundMoney(Math.max(Number(cost) || 0, 0));
    return roundMoney(Math.min(saved, maxCost));
}

export function validateAssign(amount, item, potState) {
    const parsedAmount = roundMoney(Number(amount));

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return { ok: false, error: 'Enter an amount greater than zero.' };
    }

    if (!item) {
        return { ok: false, error: 'Saved item not found.' };
    }

    if (potState?.isOverAssigned) {
        return {
            ok: false,
            error: 'You are over-assigned. Withdraw from items before assigning more.'
        };
    }

    const unassigned = roundMoney(Number(potState?.unassignedBalance) || 0);
    if (parsedAmount > unassigned + MONEY_EPSILON) {
        return { ok: false, error: 'That amount exceeds your unassigned balance.' };
    }

    const cost = roundMoney(Math.max(Number(item.cost) || 0, 0));
    if (cost <= 0) {
        return { ok: false, error: 'This item has no cost to save toward.' };
    }

    const savedAmount = getItemSavedAmount(item);
    const remaining = roundMoney(Math.max(0, cost - savedAmount));
    if (parsedAmount > remaining + MONEY_EPSILON) {
        return { ok: false, error: 'That amount exceeds what is left for this item.' };
    }

    return { ok: true, amount: parsedAmount };
}

export function validateWithdraw(amount, item) {
    const parsedAmount = roundMoney(Number(amount));

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return { ok: false, error: 'Enter an amount greater than zero.' };
    }

    if (!item) {
        return { ok: false, error: 'Saved item not found.' };
    }

    const savedAmount = getItemSavedAmount(item);
    if (parsedAmount > savedAmount + MONEY_EPSILON) {
        return { ok: false, error: 'You cannot withdraw more than is assigned to this item.' };
    }

    return { ok: true, amount: parsedAmount };
}

export function computeSavingPotStateFromAppState(appState, now = new Date()) {
    return computeSavingPotState({
        sessions: appState?.rawSessions || [],
        breaks: appState?.allBreaks || [],
        timeCostItems: appState?.timeCostItems || [],
        poolScope: appState?.savingPotPoolScope,
        startOfWeek: appState?.startOfWeek ?? 0,
        percentageCuts: appState?.percentageCuts || [],
        now
    });
}
