import { createPercentageCut, createTcCustomTimeScale, state, updateTcCustomTimeScales, updateTcMatrixSelectedItemIds, updateCsvExportCompany } from './state.js';
import { formatDuration, getStartOfWeekDate, getSessionTimeRange, getMonthlyStatsConfig, getCustomStatsPeriodConfig, calculateRollingPeriodTotals, formatStatsPeriodUnit, computeWorkPatternAnalytics, formatAverageClockTime, formatClockTimeFromMs, formatWorkPatternDay, getEffectiveSessionMetrics, getEffectiveSessionOverlapMs, getBreakOverlapMs, getCalendarDateKey, formatRelativeSessionAge, CSV_UNASSIGNED_COMPANY, accumulateDailySessionHours, accumulateDailyBreakHours, forEachSessionDaySegment } from './utils.js';

export const DOM = {
    authSection: document.getElementById('auth-section'),
    dashboard: document.getElementById('dashboard'),
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    userNameDisplay: document.getElementById('user-name'),
    startBtn: document.getElementById('start-btn'),
    stopBtn: document.getElementById('stop-btn'),
    timerDisplay: document.getElementById('timer'),
    timerShiftRemaining: document.getElementById('timer-shift-remaining'),
    hourlyRateInput: document.getElementById('hourly-rate'),
    timerStartTimeInput: document.getElementById('timer-start-time'),
    timerInputContainer: document.getElementById('timer-input-container'),
    timerLiveMeta: document.getElementById('timer-live-meta'),
    moneyCounterWidget: document.getElementById('widget-money-counter'),
    moneyCounterStatus: document.getElementById('money-counter-status'),
    moneyCounterTotal: document.getElementById('money-counter-total'),
    moneyCounterTime: document.getElementById('money-counter-time'),
    moneyCounterModeLabel: document.getElementById('money-counter-mode-label'),
    moneyCounterModeButtons: document.querySelectorAll('.money-counter-mode-btn'),
    moneyCounterGapSlider: document.getElementById('settings-money-counter-gap-slider'),
    moneyCounterGapValue: document.getElementById('settings-money-counter-gap-value'),
    moneyCounterStage: document.getElementById('money-counter-stage'),
    moneyStack20p: document.getElementById('money-stack-20p'),
    moneyStack1: document.getElementById('money-stack-1'),
    moneyStack10: document.getElementById('money-stack-10'),
    moneyCount20p: document.getElementById('money-count-20p'),
    moneyCount1: document.getElementById('money-count-1'),
    moneyCount10: document.getElementById('money-count-10'),
    companyInput: document.getElementById('company-input'),
    projectInput: document.getElementById('project-input'),
    companySelect: document.getElementById('company-select'),
    projectSelect: document.getElementById('project-select'),
    liveEarningsDisplay: document.getElementById('live-earnings'),
    historyList: document.getElementById('history-list'),
    historyPagination: document.getElementById('history-pagination'),
    dailyHoursDisplay: document.getElementById('daily-hours'),
    dailyEarningsDisplay: document.getElementById('daily-earnings'),
    weeklyHoursDisplay: document.getElementById('weekly-hours'),
    weeklyEarningsDisplay: document.getElementById('weekly-earnings'),
    monthlyHoursDisplay: document.getElementById('monthly-hours'),
    monthlyEarningsDisplay: document.getElementById('monthly-earnings'),
    monthlyHoursLabel: document.getElementById('monthly-hours-label'),
    monthlyEarningsLabel: document.getElementById('monthly-earnings-label'),
    statsPeriodModeHint: document.getElementById('stats-period-mode-hint'),
    cutStatsPeriodModeHint: document.getElementById('cut-stats-period-mode-hint'),
    statsPeriodModeButtons: document.querySelectorAll('.stats-period-mode-btn'),
    customStatsScroll: document.getElementById('custom-stats-scroll'),
    customStatsGrid: document.getElementById('custom-stats-grid'),
    customStatsPeriodsList: document.getElementById('custom-stats-periods-list'),
    customStatsPeriodForm: document.getElementById('custom-stats-period-form'),
    customStatsPeriodAmount: document.getElementById('custom-stats-period-amount'),
    customStatsPeriodUnit: document.getElementById('custom-stats-period-unit'),
    workPatternPeriodHint: document.getElementById('work-pattern-period-hint'),
    workPatternAvgDaysWeek: document.getElementById('work-pattern-avg-days-week'),
    workPatternAvgHoursWeek: document.getElementById('work-pattern-avg-hours-week'),
    workPatternDaysWorked: document.getElementById('work-pattern-days-worked'),
    workPatternAvgHoursDay: document.getElementById('work-pattern-avg-hours-day'),
    workPatternAvgStart: document.getElementById('work-pattern-avg-start'),
    workPatternAvgEnd: document.getElementById('work-pattern-avg-end'),
    workPatternEarliestStart: document.getElementById('work-pattern-earliest-start'),
    workPatternEarliestStartDay: document.getElementById('work-pattern-earliest-start-day'),
    workPatternLatestEnd: document.getElementById('work-pattern-latest-end'),
    workPatternLatestEndDay: document.getElementById('work-pattern-latest-end-day'),
    workPatternAvgEarningsBefore: document.getElementById('work-pattern-avg-earnings-before'),
    workPatternAvgEarningsAfter: document.getElementById('work-pattern-avg-earnings-after'),
    settingsDefaultRate: document.getElementById('settings-default-rate'),
    settingsDefaultCompany: document.getElementById('settings-default-company'),
    settingsDefaultProject: document.getElementById('settings-default-project'),
    settingsDefaultStartTime: document.getElementById('settings-default-start-time'),
    sixMonthsHoursDisplay: document.getElementById('six-months-hours'),
    sixMonthsEarningsDisplay: document.getElementById('six-months-earnings'),
    percentageCutStatsWidget: document.getElementById('widget-cut-stats'),
    percentageCutStats: document.getElementById('percentage-cut-stats'),
    cutStatsTotalPercentage: document.getElementById('cut-stats-total-percentage'),
    prevMonthBtn: document.getElementById('prev-month'),
    nextMonthBtn: document.getElementById('next-month'),
    calendarMonthYear: document.getElementById('calendar-month-year'),
    calendarLegend: document.getElementById('calendar-legend'),
    calendarGrid: document.querySelector('.calendar-grid'),
    weeklyChart: document.getElementById('weekly-chart'),
    prevWeekBtn: document.getElementById('prev-week'),
    nextWeekBtn: document.getElementById('next-week'),
    chartWeekRange: document.getElementById('chart-week-range'),
    chartWeekTotal: document.getElementById('chart-week-total'),
    prevTimelineWeekBtn: document.getElementById('prev-timeline-week'),
    nextTimelineWeekBtn: document.getElementById('next-timeline-week'),
    timelineWeekRange: document.getElementById('timeline-week-range'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsView: document.getElementById('settings-view'),
    viewSettingsBtn: document.getElementById('view-settings-btn'),
    toggleWidgetOrderBtn: document.getElementById('toggle-widget-order-btn'),
    currencySelect: document.getElementById('currency-select'),
    defaultHourlyRateSettingInput: document.getElementById('default-hourly-rate-input'),
    ratePreferenceSelect: document.getElementById('rate-preference-select'),
    defaultCompanySettingInput: document.getElementById('default-company-input'),
    companyPreferenceSelect: document.getElementById('company-preference-select'),
    defaultProjectSettingInput: document.getElementById('default-project-input'),
    projectPreferenceSelect: document.getElementById('project-preference-select'),
    defaultStartTimeSettingInput: document.getElementById('default-start-time-input'),
    startTimePreferenceSelect: document.getElementById('start-time-preference-select'),
    startOfWeekSelect: document.getElementById('start-of-week-select'),
    widgetSpacingSelect: document.getElementById('widget-spacing-select'),
    saveSettingsBtn: document.getElementById('save-settings'),
    alertModal: document.getElementById('alert-modal'),
    alertTitle: document.getElementById('alert-title'),
    alertMessage: document.getElementById('alert-message'),
    alertOkBtn: document.getElementById('alert-ok-btn'),
    confirmModal: document.getElementById('confirm-modal'),
    confirmTitle: document.getElementById('confirm-title'),
    confirmMessage: document.getElementById('confirm-message'),
    confirmOkBtn: document.getElementById('confirm-ok-btn'),
    confirmCancelBtn: document.getElementById('confirm-cancel-btn'),
    widgetOrderList: document.getElementById('widget-order-list'),
    addPercentageCutBtn: document.getElementById('add-percentage-cut-btn'),
    percentageCutList: document.getElementById('percentage-cut-list'),
    showTitlesToggle: document.getElementById('show-titles-toggle'),
    continueSessionToggle: document.getElementById('continue-session-toggle'),
    targetShiftHoursInput: document.getElementById('target-shift-hours-input'),
    ganttChart: document.getElementById('gantt-chart'),
    exportBtn: document.getElementById('export-btn'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
    csvExportFrom: document.getElementById('csv-export-from'),
    csvExportTo: document.getElementById('csv-export-to'),
    csvExportCompanySelect: document.getElementById('csv-export-company'),
    csvExportClearPeriodBtn: document.getElementById('csv-export-clear-period'),
    filterBtn: document.getElementById('filter-btn'),
    filterModal: document.getElementById('filter-modal'),
    closeFilterBtn: document.getElementById('close-filter'),
    filterCompanySelect: document.getElementById('filter-company'),
    filterProjectSelect: document.getElementById('filter-project'),
    applyFilterBtn: document.getElementById('apply-filter-btn'),
    clearFilterBtn: document.getElementById('clear-filter-btn'),
    activeFiltersContainer: document.getElementById('active-filters-container'),
    addSessionBtn: document.getElementById('add-session-btn'),
    sessionModal: document.getElementById('session-modal'),
    sessionModalTitle: document.getElementById('session-modal-title'),
    closeSessionModalBtn: document.getElementById('close-session-modal'),
    editSessionId: document.getElementById('edit-session-id'),
    sessionStart: document.getElementById('session-start'),
    sessionEnd: document.getElementById('session-end'),
    sessionRate: document.getElementById('session-rate'),
    sessionCompany: document.getElementById('session-company'),
    sessionCompanySelect: document.getElementById('session-company-select'),
    sessionProject: document.getElementById('session-project'),
    sessionProjectSelect: document.getElementById('session-project-select'),
    sessionFocused: document.getElementById('session-focused'),
    saveSessionBtn: document.getElementById('save-session-btn'),
    deleteSessionBtn: document.getElementById('delete-session-btn'),

    addBreakBtn: document.getElementById('add-break-btn'),
    breaksPrevDayBtn: document.getElementById('breaks-prev-day-btn'),
    breaksNextDayBtn: document.getElementById('breaks-next-day-btn'),
    breaksTodayBtn: document.getElementById('breaks-today-btn'),
    breaksViewDateLabel: document.getElementById('breaks-view-date-label'),
    breakDayTotalLabel: document.getElementById('break-day-total-label'),
    breakHistoryList: document.getElementById('break-history-list'),
    breakTodayTotal: document.getElementById('break-today-total'),
    breakModal: document.getElementById('break-modal'),
    breakModalTitle: document.getElementById('break-modal-title'),
    closeBreakModalBtn: document.getElementById('close-break-modal'),
    editBreakId: document.getElementById('edit-break-id'),
    breakStart: document.getElementById('break-start'),
    breakEnd: document.getElementById('break-end'),
    breakLabel: document.getElementById('break-label'),
    saveBreakBtn: document.getElementById('save-break-btn'),
    deleteBreakBtn: document.getElementById('delete-break-btn'),

    toggleBatchModeBtn: document.getElementById('toggle-batch-mode'),
    calendarModeButtons: document.querySelectorAll('.calendar-mode-btn'),
    calendarWidget: document.getElementById('widget-calendar'),
    batchModeControls: document.getElementById('batch-mode-controls'),
    batchSelectedLabel: document.getElementById('batch-selected-label'),
    openBatchModalBtn: document.getElementById('open-batch-modal-btn'),
    batchClearBtn: document.getElementById('batch-clear-btn'),

    batchModal: document.getElementById('batch-modal'),
    batchModalTitle: document.getElementById('batch-modal-title'),
    closeBatchModalBtn: document.getElementById('close-batch-modal'),
    batchModalSubtitle: document.getElementById('batch-modal-subtitle'),
    batchWorkFields: document.getElementById('batch-work-fields'),
    batchBreakFields: document.getElementById('batch-break-fields'),

    batchUpdateStart: document.getElementById('batch-update-start'),
    batchStart: document.getElementById('batch-start'),
    batchUpdateEnd: document.getElementById('batch-update-end'),
    batchEnd: document.getElementById('batch-end'),
    batchUpdateRate: document.getElementById('batch-update-rate'),
    batchRate: document.getElementById('batch-rate'),
    batchUpdateCompany: document.getElementById('batch-update-company'),
    batchCompany: document.getElementById('batch-company'),
    batchCompanySelect: document.getElementById('batch-company-select'),
    batchUpdateProject: document.getElementById('batch-update-project'),
    batchProject: document.getElementById('batch-project'),
    batchProjectSelect: document.getElementById('batch-project-select'),
    batchUpdateLabel: document.getElementById('batch-update-label'),
    batchLabel: document.getElementById('batch-label'),

    batchSliderTrack: document.getElementById('batch-slider-track'),
    batchSliderProgress: document.getElementById('batch-slider-progress'),
    batchSliderHandle: document.getElementById('batch-slider-handle'),
    batchSliderText: document.getElementById('batch-slider-text'),
    
    viewDashboardBtn: document.getElementById('view-dashboard-btn'),
    viewTimeCostBtn: document.getElementById('view-time-cost-btn'),
    dashboardView: document.getElementById('dashboard-view'),
    timeCostView: document.getElementById('time-cost-view'),
    tcItemName: document.getElementById('tc-item-name'),
    tcItemCost: document.getElementById('tc-item-cost'),
    tcItemDateBought: document.getElementById('tc-item-date-bought'),
    tcHourlyRate: document.getElementById('tc-hourly-rate'),
    tcDailyHours: document.getElementById('tc-daily-hours'),
    tcWorkingDays: document.getElementById('tc-working-days'),
    tcCutsSummary: document.getElementById('tc-cuts-summary'),
    tcRateBreakdown: document.getElementById('tc-rate-breakdown'),
    tcBreakdownContainer: document.getElementById('tc-breakdown-container'),
    tcSaveBtn: document.getElementById('tc-save-btn'),
    tcSavedItemsContainer: document.getElementById('tc-saved-items-container'),
    tcSavedItemsChart: document.getElementById('tc-saved-items-chart'),
    tcSavedItemsMatrix: document.getElementById('tc-saved-items-matrix'),
    tcSavedFilterSearch: document.getElementById('tc-saved-filter-search'),
    tcSavedFilterDateStatus: document.getElementById('tc-saved-filter-date-status'),
    tcSavedFilterFrom: document.getElementById('tc-saved-filter-from'),
    tcSavedFilterTo: document.getElementById('tc-saved-filter-to'),
    tcSavedFilterClear: document.getElementById('tc-saved-filter-clear'),
    tcItemModal: document.getElementById('tc-item-modal'),
    closeTcItemModalBtn: document.getElementById('close-tc-item-modal'),
    editTcItemId: document.getElementById('edit-tc-item-id'),
    editTcItemName: document.getElementById('edit-tc-item-name'),
    editTcItemCost: document.getElementById('edit-tc-item-cost'),
    editTcItemDateBought: document.getElementById('edit-tc-item-date-bought'),
    saveTcItemBtn: document.getElementById('save-tc-item-btn')
};

export function showAlert(title, message) {
    return new Promise((resolve) => {
        DOM.alertTitle.textContent = title || "Notice";
        DOM.alertMessage.textContent = message;
        DOM.alertModal.classList.remove('hidden');

        const handleOk = () => {
            DOM.alertModal.classList.add('hidden');
            DOM.alertOkBtn.onclick = null;
            resolve();
        };

        DOM.alertOkBtn.onclick = handleOk;
    });
}

export function showConfirm(title, message) {
    return new Promise((resolve) => {
        DOM.confirmTitle.textContent = title || "Confirm Action";
        DOM.confirmMessage.textContent = message;
        DOM.confirmModal.classList.remove('hidden');

        DOM.confirmOkBtn.onclick = () => {
            DOM.confirmModal.classList.add('hidden');
            DOM.confirmOkBtn.onclick = null;
            DOM.confirmCancelBtn.onclick = null;
            resolve(true);
        };
        DOM.confirmCancelBtn.onclick = () => {
            DOM.confirmModal.classList.add('hidden');
            DOM.confirmOkBtn.onclick = null;
            DOM.confirmCancelBtn.onclick = null;
            resolve(false);
        };
    });
}

export function updateCurrencyDisplays() {
    const symbolSpans = document.querySelectorAll('.currency-symbol');
    symbolSpans.forEach(span => { span.textContent = state.currentCurrency; });

    if (state.startTime) {
        const now = Date.now();
        const elapsedMs = now - state.startTime;
        const hoursFloat = elapsedMs / (1000 * 60 * 60);
        const earned = hoursFloat * state.currentSessionRate;
        const after = getAmountAfterPercentageCuts(earned);
        DOM.liveEarningsDisplay.innerHTML = `
            <span class="before-cut">Before: <span class="currency-symbol">${state.currentCurrency}</span>${earned.toFixed(2)}</span>
            <span class="cut-divider">|</span>
            <span class="after-cut">After: <span class="currency-symbol">${state.currentCurrency}</span>${after.toFixed(2)}</span>
        `;
        renderLiveMoneyCounter(earned, true);
    } else {
        DOM.liveEarningsDisplay.innerHTML = `
            <span class="before-cut">Before: <span class="currency-symbol">${state.currentCurrency}</span>0.00</span>
            <span class="cut-divider">|</span>
            <span class="after-cut">After: <span class="currency-symbol">${state.currentCurrency}</span>0.00</span>
        `;
        renderLiveMoneyCounter(0, false);
    }
}

const moneyCounterStackCounts = {
    twentyP: null,
    pound: null,
    note: null
};

function createMoneyPieces(count, type) {
    const isNote = type.includes('note');
    const visibleCount = Math.min(count, isNote ? 18 : 24);
    const overflow = Math.max(count - visibleCount, 0);
    const label = isNote ? '£10' : type.includes('coin-large') ? '£1' : '20p';
    let html = '';

    for (let i = 0; i < visibleCount; i++) {
        let rot = 0;
        let dx = 0;
        let dy = 0;
        
        if (isNote) {
            rot = 0;
            dx = 0;
            dy = 0;
        } else {
            rot = (((i * 3) % 7) - 3) * 0.4; // -1.2 to +1.2 degrees
            dx = (((i * 5) % 5) - 2) * 0.4;  // -0.8px to +0.8px
            dy = (((i * 7) % 5) - 2) * 0.4;  // -0.8px to +0.8px
        }

        html += `<span class="money-piece ${type}" style="--i:${i}; --rot:${rot}deg; --dx:${dx}px; --dy:${dy}px;"><em>${label}</em></span>`;
    }

    if (overflow > 0) {
        html += `<span class="money-stack-more">+${overflow}</span>`;
    }

    return html;
}

function renderMoneyStack(container, count, type, key) {
    if (!container || moneyCounterStackCounts[key] === count) return;

    const currentCount = moneyCounterStackCounts[key] || 0;
    moneyCounterStackCounts[key] = count;
    
    const visibleLimit = type.includes('note') ? 18 : 24;
    const currentVisible = Math.min(currentCount, visibleLimit);
    const newVisible = Math.min(count, visibleLimit);

    // If resetting, count decreased, or list was empty, rebuild completely
    if (count < currentCount || newVisible < currentVisible || currentVisible === 0) {
        container.innerHTML = createMoneyPieces(count, type);
        return;
    }

    // If count increased, append new pieces
    if (newVisible > currentVisible) {
        // Remove existing +overflow if present so new items can be appended at the end
        const overflowEl = container.querySelector('.money-stack-more');
        if (overflowEl) {
            overflowEl.remove();
        }

        // Generate and append new pieces
        const label = type.includes('note') ? '£10' : type.includes('coin-large') ? '£1' : '20p';
        for (let i = currentVisible; i < newVisible; i++) {
            let rot = 0;
            let dx = 0;
            let dy = 0;
            
            if (type.includes('note')) {
                rot = 0;
                dx = 0;
                dy = 0;
            } else {
                rot = (((i * 3) % 7) - 3) * 0.4;
                dx = (((i * 5) % 5) - 2) * 0.4;
                dy = (((i * 7) % 5) - 2) * 0.4;
            }
            
            const tempSpan = document.createElement('span');
            tempSpan.className = `money-piece ${type}`;
            tempSpan.style.cssText = `--i:${i}; --rot:${rot}deg; --dx:${dx}px; --dy:${dy}px;`;
            
            // Stagger animation if multiple items are added at once
            const staggerDelay = (i - currentVisible) * 0.08;
            tempSpan.style.animationDelay = `${staggerDelay}s`;
            
            // Retain fallback label internally
            const emEl = document.createElement('em');
            emEl.textContent = label;
            tempSpan.appendChild(emEl);
            
            container.appendChild(tempSpan);
        }
    }

    // Add back/update the overflow count if needed
    const overflow = Math.max(count - newVisible, 0);
    const existingOverflowEl = container.querySelector('.money-stack-more');
    if (overflow > 0) {
        if (existingOverflowEl) {
            existingOverflowEl.textContent = `+${overflow}`;
        } else {
            const overflowEl = document.createElement('span');
            overflowEl.className = 'money-stack-more';
            overflowEl.textContent = `+${overflow}`;
            container.appendChild(overflowEl);
        }
    } else if (existingOverflowEl) {
        existingOverflowEl.remove();
    }
}

export function renderLiveMoneyCounter(earned = 0, isRunning = Boolean(state.startTime)) {
    if (!DOM.moneyCounterWidget) return;

    const beforeCutsEarned = Math.max(Number(earned) || 0, 0);
    const displayEarned = state.moneyCounterMode === 'after'
        ? getAmountAfterPercentageCuts(beforeCutsEarned)
        : beforeCutsEarned;
    const pennies = Math.floor(displayEarned * 100);
    const noteCount = Math.floor(pennies / 1000);
    const remainingAfterNotes = pennies % 1000;
    const poundCount = Math.floor(remainingAfterNotes / 100);
    const twentyPCount = Math.floor((remainingAfterNotes % 100) / 20);

    DOM.moneyCounterWidget.classList.toggle('money-counter-active', isRunning);

    if (DOM.moneyCounterStatus) {
        DOM.moneyCounterStatus.textContent = isRunning ? 'Live' : 'Idle';
    }

    if (DOM.moneyCounterTotal) {
        DOM.moneyCounterTotal.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>${displayEarned.toFixed(2)}`;
    }

    if (DOM.moneyCounterTime) {
        if (isRunning && state.startTime) {
            const elapsedMs = Date.now() - state.startTime;
            const totalSeconds = Math.floor(elapsedMs / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            DOM.moneyCounterTime.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else {
            DOM.moneyCounterTime.textContent = '00:00:00';
        }
    }

    if (DOM.moneyCounterModeLabel) {
        DOM.moneyCounterModeLabel.textContent = state.moneyCounterMode === 'after'
            ? 'After percentage cuts'
            : 'Before percentage cuts';
    }

    renderMoneyStack(DOM.moneyStack20p, twentyPCount, 'coin coin-small', 'twentyP');
    renderMoneyStack(DOM.moneyStack1, poundCount, 'coin coin-large', 'pound');
    renderMoneyStack(DOM.moneyStack10, noteCount, 'note', 'note');

    if (DOM.moneyCount20p) DOM.moneyCount20p.textContent = twentyPCount;
    if (DOM.moneyCount1) DOM.moneyCount1.textContent = poundCount;
    if (DOM.moneyCount10) DOM.moneyCount10.textContent = noteCount;
}

export function renderMoneyCounterModeControls() {
    DOM.moneyCounterModeButtons.forEach(button => {
        const isActive = button.dataset.moneyCounterMode === state.moneyCounterMode;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    if (DOM.moneyCounterGapSlider && DOM.moneyCounterGapValue && DOM.moneyCounterStage) {
        const gapVal = state.moneyCounterGap !== undefined ? state.moneyCounterGap : 1.0;
        DOM.moneyCounterGapSlider.value = gapVal;
        DOM.moneyCounterGapValue.textContent = gapVal.toFixed(1);
        DOM.moneyCounterStage.style.setProperty('--stack-gap-scale', gapVal);
    }

    if (state.startTime) {
        const elapsedMs = Date.now() - state.startTime;
        const earned = (elapsedMs / (1000 * 60 * 60)) * state.currentSessionRate;
        renderLiveMoneyCounter(earned, true);
    } else {
        renderLiveMoneyCounter(0, false);
    }
}

export function renderStatsPeriodModeControls() {
    const monthlyConfig = getMonthlyStatsConfig(state.statsPeriodMode);

    DOM.statsPeriodModeButtons.forEach(button => {
        const isActive = button.dataset.statsPeriodMode === state.statsPeriodMode;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    if (DOM.statsPeriodModeHint) {
        DOM.statsPeriodModeHint.textContent = monthlyConfig.hint;
    }

    if (DOM.cutStatsPeriodModeHint) {
        DOM.cutStatsPeriodModeHint.textContent = `Monthly totals use ${monthlyConfig.shortLabel.toLowerCase()}.`;
    }

    if (DOM.workPatternPeriodHint) {
        DOM.workPatternPeriodHint.textContent = `Breakdown for ${monthlyConfig.shortLabel.toLowerCase()}.`;
    }

    if (DOM.monthlyHoursLabel) {
        DOM.monthlyHoursLabel.textContent = monthlyConfig.hoursLabel;
    }

    if (DOM.monthlyEarningsLabel) {
        DOM.monthlyEarningsLabel.textContent = monthlyConfig.earningsLabel;
    }
}

function renderStatEarningsDisplay(displayEl, beforeAmount) {
    if (!displayEl) return;

    const before = Number(beforeAmount) || 0;
    const after = getAmountAfterPercentageCuts(before);

    if (!state.percentageCuts.length) {
        displayEl.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>${before.toFixed(2)}`;
        return;
    }

    displayEl.innerHTML = `
        <span class="stats-earnings-after"><span class="currency-symbol">${state.currentCurrency}</span>${after.toFixed(2)}</span>
        <span class="stats-earnings-before">Before cuts <span class="currency-symbol">${state.currentCurrency}</span>${before.toFixed(2)}</span>
    `;
}

export function renderCustomStatsPeriods() {
    if (!DOM.customStatsGrid || !DOM.customStatsScroll) return;

    DOM.customStatsGrid.innerHTML = '';

    if (!state.customStatsPeriods.length) {
        DOM.customStatsScroll.classList.add('hidden');
        return;
    }

    DOM.customStatsScroll.classList.remove('hidden');
    const now = new Date();

    state.customStatsPeriods.forEach((period) => {
        const config = getCustomStatsPeriodConfig(period, now);
        const { totalMs, totalGrossMs, totalBreakMs, totalEarnings } = calculateRollingPeriodTotals(
            state.allSessions,
            config.start,
            config.end,
            state.allBreaks
        );

        const item = document.createElement('div');
        item.className = 'stat-item stat-item-custom';

        const hoursLabel = document.createElement('span');
        hoursLabel.className = 'label';
        hoursLabel.textContent = config.hoursLabel;

        const hoursValue = document.createElement('span');
        hoursValue.className = 'value';
        hoursValue.textContent = formatDuration(totalMs);
        if (totalBreakMs > 0 && totalGrossMs !== totalMs) {
            const grossNote = document.createElement('span');
            grossNote.className = 'stats-hours-gross';
            grossNote.textContent = `${formatDuration(totalGrossMs)} gross · ${formatDuration(totalBreakMs)} breaks`;
            hoursValue.appendChild(document.createElement('br'));
            hoursValue.appendChild(grossNote);
        }

        const earningsLabel = document.createElement('span');
        earningsLabel.className = 'label';
        earningsLabel.style.marginTop = '10px';
        earningsLabel.textContent = config.earningsLabel;

        const earningsValue = document.createElement('span');
        earningsValue.className = 'value';
        earningsValue.style.fontSize = '1.4rem';
        renderStatEarningsDisplay(earningsValue, totalEarnings);

        item.appendChild(hoursLabel);
        item.appendChild(hoursValue);
        item.appendChild(earningsLabel);
        item.appendChild(earningsValue);
        DOM.customStatsGrid.appendChild(item);
    });
}

function getAnalyticsSessions() {
    const sessions = [...state.allSessions];

    if (state.startTime) {
        const elapsedMs = Date.now() - state.startTime;
        sessions.unshift({
            startTime: state.startTime,
            endTime: Date.now(),
            durationMs: elapsedMs,
            earnings: (elapsedMs / (1000 * 60 * 60)) * (state.currentSessionRate || 0)
        });
    }

    return sessions;
}

function formatAverageHours(hours) {
    if (!Number.isFinite(hours)) return '—';
    return formatDuration(Math.round(hours * 60 * 60 * 1000));
}

function formatAverageDays(days) {
    if (!Number.isFinite(days)) return '—';
    const rounded = Math.round(days * 10) / 10;
    return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

function formatAverageEarnings(amount) {
    if (!Number.isFinite(amount)) return '—';
    return `${state.currentCurrency}${amount.toFixed(2)}`;
}

function setWorkPatternDayLabel(element, dayKey) {
    if (!element) return;
    element.textContent = dayKey ? formatWorkPatternDay(dayKey) : '—';
}

export function renderSettingsDefaultFields() {
    const showRateDefault = DOM.ratePreferenceSelect?.value === 'default_rate';
    const showCompanyDefault = DOM.companyPreferenceSelect?.value === 'default_value';
    const showProjectDefault = DOM.projectPreferenceSelect?.value === 'default_value';
    const showStartTimeDefault = DOM.startTimePreferenceSelect?.value === 'default_value';

    DOM.settingsDefaultRate?.classList.toggle('hidden', !showRateDefault);
    DOM.settingsDefaultCompany?.classList.toggle('hidden', !showCompanyDefault);
    DOM.settingsDefaultProject?.classList.toggle('hidden', !showProjectDefault);
    DOM.settingsDefaultStartTime?.classList.toggle('hidden', !showStartTimeDefault);
}

export function renderCsvExportCompanySelect() {
    if (!DOM.csvExportCompanySelect) return;

    const companies = new Set();
    let hasUnassigned = false;

    (state.rawSessions || []).forEach((session) => {
        const company = String(session.company || '').trim();
        if (company) {
            companies.add(company);
        } else {
            hasUnassigned = true;
        }
    });

    const previousValue = state.csvExportCompany || DOM.csvExportCompanySelect.value || '';

    DOM.csvExportCompanySelect.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All Companies';
    DOM.csvExportCompanySelect.appendChild(allOption);

    if (hasUnassigned) {
        const unassignedOption = document.createElement('option');
        unassignedOption.value = CSV_UNASSIGNED_COMPANY;
        unassignedOption.textContent = 'Unassigned';
        DOM.csvExportCompanySelect.appendChild(unassignedOption);
    }

    Array.from(companies)
        .sort((a, b) => a.localeCompare(b))
        .forEach((company) => {
            const option = document.createElement('option');
            option.value = company;
            option.textContent = company;
            DOM.csvExportCompanySelect.appendChild(option);
        });

    const hasPreviousValue = [...DOM.csvExportCompanySelect.options].some(
        (option) => option.value === previousValue
    );

    if (hasPreviousValue) {
        DOM.csvExportCompanySelect.value = previousValue;
    } else {
        DOM.csvExportCompanySelect.value = '';
        if (previousValue) {
            updateCsvExportCompany('');
        }
    }
}

export function renderCalendarEditModeControls() {
    const isBreakMode = state.calendarEditMode === 'break';

    DOM.calendarModeButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.calendarMode === state.calendarEditMode);
    });

    if (DOM.calendarWidget) {
        DOM.calendarWidget.classList.toggle('calendar-mode-break', isBreakMode);
        DOM.calendarWidget.classList.toggle('calendar-mode-work', !isBreakMode);
    }

    if (DOM.toggleBatchModeBtn && !state.batchModeEnabled) {
        DOM.toggleBatchModeBtn.textContent = 'Batch Edit';
    }

    if (DOM.batchModeControls) {
        DOM.batchModeControls.classList.toggle('batch-mode-break', isBreakMode);
        DOM.batchModeControls.classList.toggle('batch-mode-work', !isBreakMode);
    }
}

export function updateBatchModalForMode() {
    const isBreakMode = state.calendarEditMode === 'break';

    if (DOM.batchModalTitle) {
        DOM.batchModalTitle.textContent = isBreakMode ? 'Batch Edit Breaks' : 'Batch Edit Sessions';
    }

    DOM.batchWorkFields?.classList.toggle('hidden', isBreakMode);
    DOM.batchBreakFields?.classList.toggle('hidden', !isBreakMode);
    DOM.batchModal?.classList.toggle('batch-modal-break', isBreakMode);
    DOM.batchModal?.classList.toggle('batch-modal-work', !isBreakMode);
}

export function renderWorkPatternBreakdown() {
    const monthlyConfig = getMonthlyStatsConfig(state.statsPeriodMode);
    const analytics = computeWorkPatternAnalytics(
        getAnalyticsSessions(),
        monthlyConfig.start,
        monthlyConfig.end,
        getAmountAfterPercentageCuts,
        state.allBreaks
    );

    if (DOM.workPatternAvgDaysWeek) {
        DOM.workPatternAvgDaysWeek.textContent = formatAverageDays(analytics.avgDaysPerWeek);
    }

    if (DOM.workPatternAvgHoursWeek) {
        DOM.workPatternAvgHoursWeek.textContent = formatAverageHours(analytics.avgHoursPerWeek);
    }

    if (DOM.workPatternDaysWorked) {
        DOM.workPatternDaysWorked.textContent = analytics.daysWorked > 0
            ? String(analytics.daysWorked)
            : '—';
    }

    if (DOM.workPatternAvgHoursDay) {
        DOM.workPatternAvgHoursDay.textContent = formatAverageHours(analytics.avgHoursPerDay);
    }

    if (DOM.workPatternAvgEarningsBefore) {
        DOM.workPatternAvgEarningsBefore.textContent = formatAverageEarnings(analytics.avgEarningsBefore);
    }

    if (DOM.workPatternAvgEarningsAfter) {
        DOM.workPatternAvgEarningsAfter.textContent = formatAverageEarnings(analytics.avgEarningsAfter);
    }

    if (DOM.workPatternAvgStart) {
        DOM.workPatternAvgStart.textContent = formatAverageClockTime(analytics.avgFirstStartMinutes);
    }

    if (DOM.workPatternAvgEnd) {
        DOM.workPatternAvgEnd.textContent = formatAverageClockTime(analytics.avgLastEndMinutes);
    }

    if (DOM.workPatternEarliestStart) {
        DOM.workPatternEarliestStart.textContent = formatClockTimeFromMs(analytics.earliestStartMs);
    }

    setWorkPatternDayLabel(DOM.workPatternEarliestStartDay, analytics.earliestStartDayKey);

    if (DOM.workPatternLatestEnd) {
        DOM.workPatternLatestEnd.textContent = formatClockTimeFromMs(analytics.latestEndMs);
    }

    setWorkPatternDayLabel(DOM.workPatternLatestEndDay, analytics.latestEndDayKey);
}

export function renderCustomStatsPeriodsSettings() {
    if (!DOM.customStatsPeriodsList) return;

    DOM.customStatsPeriodsList.innerHTML = '';

    if (!state.customStatsPeriods.length) {
        const empty = document.createElement('li');
        empty.className = 'custom-stats-period-empty';
        empty.textContent = 'No custom durations yet.';
        DOM.customStatsPeriodsList.appendChild(empty);
        return;
    }

    state.customStatsPeriods.forEach((period) => {
        const item = document.createElement('li');
        item.className = 'custom-stats-period-item';

        const copy = document.createElement('div');
        const label = document.createElement('div');
        label.className = 'custom-stats-period-label';
        label.textContent = `Last ${formatStatsPeriodUnit(period.amount, period.unit)}`;

        const meta = document.createElement('div');
        meta.className = 'custom-stats-period-meta';
        meta.textContent = 'Rolling window shown below the default statistics.';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-outline btn-small custom-stats-period-remove';
        removeBtn.dataset.periodId = period.id;
        removeBtn.textContent = 'Remove';

        copy.appendChild(label);
        copy.appendChild(meta);
        item.appendChild(copy);
        item.appendChild(removeBtn);
        DOM.customStatsPeriodsList.appendChild(item);
    });
}

function formatMoney(amount) {
    return `${state.currentCurrency}${amount.toFixed(2)}`;
}

function createCutStatMoneyRow(className, label, amount) {
    const row = document.createElement('span');
    row.className = `cut-stat-money ${className}`;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;

    const valueEl = document.createElement('strong');
    const formattedAmount = formatMoney(amount);
    valueEl.textContent = formattedAmount;
    valueEl.style.setProperty('--value-chars', formattedAmount.length);

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    return row;
}

export function renderPercentageCutStats(totals) {
    if (!DOM.percentageCutStats) return;

    DOM.percentageCutStats.innerHTML = '';

    if (!state.percentageCuts.length) {
        if (DOM.percentageCutStatsWidget) {
            DOM.percentageCutStatsWidget.classList.add('hidden');
        }
        return;
    }

    if (DOM.percentageCutStatsWidget) {
        DOM.percentageCutStatsWidget.classList.remove('hidden');
    }

    let remainingPercentage = 100;
    state.percentageCuts.forEach(cut => {
        const sourcePool = cut.basis === 'original' ? 100 : remainingPercentage;
        const deduction = sourcePool * (cut.percentage / 100);
        remainingPercentage = Math.max(remainingPercentage - deduction, 0);
    });
    const totalCutPercentage = 100 - remainingPercentage;

    if (DOM.cutStatsTotalPercentage) {
        DOM.cutStatsTotalPercentage.textContent = `(-${totalCutPercentage.toFixed(1)}%)`;
    }

    let runningTotals = {
        daily: totals.daily || 0,
        weekly: totals.weekly || 0,
        monthly: totals.monthly || 0
    };
    const originalTotals = { ...runningTotals };

    state.percentageCuts.forEach((cut, index) => {
        const beforeTotals = { ...runningTotals };
        const sourceTotals = cut.basis === 'original' ? originalTotals : beforeTotals;
        const deductionTotals = {
            daily: sourceTotals.daily * (cut.percentage / 100),
            weekly: sourceTotals.weekly * (cut.percentage / 100),
            monthly: sourceTotals.monthly * (cut.percentage / 100)
        };
        runningTotals = {
            daily: Math.max(beforeTotals.daily - deductionTotals.daily, 0),
            weekly: Math.max(beforeTotals.weekly - deductionTotals.weekly, 0),
            monthly: Math.max(beforeTotals.monthly - deductionTotals.monthly, 0)
        };

        const layer = document.createElement('div');
        layer.className = 'cut-stat-layer';

        const header = document.createElement('div');
        header.className = 'cut-stat-header';

        const name = document.createElement('span');
        name.className = 'cut-stat-name';
        name.textContent = `${index + 1}. ${cut.name}`;

        const rate = document.createElement('span');
        rate.className = 'cut-stat-rate';
        rate.textContent = `-${cut.percentage}%`;

        const basis = document.createElement('span');
        basis.className = 'cut-stat-basis';
        basis.textContent = cut.basis === 'original' ? 'from original' : 'from accumulated';

        header.appendChild(name);
        header.appendChild(rate);
        header.appendChild(basis);

        const grid = document.createElement('div');
        grid.className = 'cut-stat-grid';

        const monthlyConfig = getMonthlyStatsConfig(state.statsPeriodMode);

        [
            { label: 'Today', key: 'daily' },
            { label: 'This Week', key: 'weekly' },
            { label: monthlyConfig.cutStatsLabel, key: 'monthly' }
        ].forEach(period => {
            if (!state.activeCutStatsPeriods.includes(period.key)) return;

            const beforeAmount = beforeTotals[period.key];
            const sourceAmount = sourceTotals[period.key];
            const afterAmount = runningTotals[period.key];
            const differenceAmount = beforeAmount - afterAmount;
            const item = document.createElement('div');
            item.className = 'cut-stat-item';

            const label = document.createElement('span');
            label.className = 'cut-stat-label';
            label.textContent = period.label;

            const before = createCutStatMoneyRow('cut-stat-before', 'Pool Before', beforeAmount);
            const after = createCutStatMoneyRow('cut-stat-after', 'Pool After', afterAmount);
            const source = createCutStatMoneyRow('cut-stat-source', 'Cut Base', sourceAmount);
            const difference = createCutStatMoneyRow('cut-stat-difference', 'Cut Taken', differenceAmount);

            item.appendChild(label);
            item.appendChild(after);
            item.appendChild(source);
            item.appendChild(before);
            item.appendChild(difference);
            grid.appendChild(item);
        });

        layer.appendChild(header);
        layer.appendChild(grid);
        DOM.percentageCutStats.appendChild(layer);
    });
}

export function toggleLiveIndicators(isLive) {
    const indicators = document.querySelectorAll('.live-indicator');
    indicators.forEach(indicator => {
        if (isLive) {
            indicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
        }
    });
}

export function toggleTimerUI(isRunning) {
    if (isRunning) {
        DOM.startBtn.classList.add('hidden');
        DOM.stopBtn.classList.remove('hidden');
        if (DOM.timerInputContainer) DOM.timerInputContainer.classList.add('hidden');
        if (DOM.timerLiveMeta) {
            DOM.timerLiveMeta.classList.remove('hidden');
            const rateSpan = document.getElementById('live-meta-rate');
            const companySpan = document.getElementById('live-meta-company');
            const projectSpan = document.getElementById('live-meta-project');
            const startSpan = document.getElementById('live-meta-start');
            
            if (rateSpan) rateSpan.textContent = (state.currentSessionRate || 0).toFixed(2);
            if (companySpan) companySpan.textContent = state.currentCompany || 'None';
            if (projectSpan) projectSpan.textContent = state.currentProject || 'None';
            if (startSpan && state.startTime) {
                const startDate = new Date(state.startTime);
                startSpan.textContent = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 
                    ' (' + startDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
            }
        }
    } else {
        DOM.startBtn.classList.remove('hidden');
        DOM.stopBtn.classList.add('hidden');
        if (DOM.timerInputContainer) DOM.timerInputContainer.classList.remove('hidden');
        if (DOM.timerLiveMeta) DOM.timerLiveMeta.classList.add('hidden');
    }

    DOM.hourlyRateInput.disabled = isRunning;
    if (DOM.timerStartTimeInput) DOM.timerStartTimeInput.disabled = isRunning;
    if (DOM.companyInput) DOM.companyInput.disabled = isRunning;
    if (DOM.companySelect) DOM.companySelect.disabled = isRunning;
    if (DOM.projectInput) DOM.projectInput.disabled = isRunning;
    if (DOM.projectSelect) DOM.projectSelect.disabled = isRunning;

    toggleLiveIndicators(isRunning);
    renderCalendar();
    if (!isRunning) {
        updateShiftRemainingDisplay(0);
        renderChart();
    }
}

export function renderCalendar() {
    if (!DOM.calendarGrid || !DOM.calendarMonthYear) return;

    renderCalendarEditModeControls();
    DOM.calendarGrid.innerHTML = '';

    const isBreakMode = state.calendarEditMode === 'break';

    if (DOM.calendarLegend) {
        DOM.calendarLegend.classList.toggle('is-hidden', isBreakMode);
    }

    // Inject Days of Week Header
    const daysArrBase = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daysArrLabel = [...daysArrBase.slice(state.startOfWeek), ...daysArrBase.slice(0, state.startOfWeek)];

    daysArrLabel.forEach(dayName => {
        const headerLabel = document.createElement('div');
        headerLabel.className = 'day-label';
        headerLabel.textContent = dayName;
        DOM.calendarGrid.appendChild(headerLabel);
    });

    const weekTotalHeader = document.createElement('div');
    weekTotalHeader.className = 'calendar-week-total-header day-label';
    weekTotalHeader.textContent = 'Σ';
    weekTotalHeader.title = 'Weekly total';
    weekTotalHeader.setAttribute('aria-label', 'Weekly total');
    DOM.calendarGrid.appendChild(weekTotalHeader);

    const year = state.currentCalendarDate.getFullYear();
    const month = state.currentCalendarDate.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    DOM.calendarMonthYear.textContent = `${monthNames[month]} ${year}`;

    const rawFirstDayIndex = new Date(year, month, 1).getDay();
    const firstDayIndex = (rawFirstDayIndex - state.startOfWeek + 7) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayDate = new Date();

    const { dailyHours, dailyGrossHours } = accumulateDailySessionHours(state.allSessions, state.allBreaks);
    const dailyBreakHours = accumulateDailyBreakHours(state.allBreaks);

    const gridStartDate = new Date(year, month, 1 - firstDayIndex);
    const totalWeeks = Math.ceil((firstDayIndex + daysInMonth) / 7);
    const todayKey = getCalendarDateKey(todayDate);

    for (let week = 0; week < totalWeeks; week++) {
        let weekNetHours = 0;
        let weekGrossHours = 0;
        let weekBreakHours = 0;

        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            const cellDate = new Date(gridStartDate);
            cellDate.setDate(gridStartDate.getDate() + (week * 7) + dayOfWeek);

            const dateKey = getCalendarDateKey(cellDate);
            const dayNum = cellDate.getDate();
            const isCurrentMonth = cellDate.getMonth() === month && cellDate.getFullYear() === year;
            const netHours = dailyHours[dateKey] || 0;
            const grossHours = dailyGrossHours[dateKey] || 0;
            const breakHours = dailyBreakHours[dateKey] || 0;

            weekNetHours += netHours;
            weekGrossHours += grossHours;
            weekBreakHours += breakHours;

            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            if (!isCurrentMonth) {
                dayDiv.classList.add('outside-month');
            }
            dayDiv.textContent = dayNum;
            dayDiv.dataset.date = dateKey;
            dayDiv.dataset.day = dayNum;

            if (isCurrentMonth && state.batchModeEnabled && state.batchSelectedDates.includes(dateKey)) {
                dayDiv.classList.add('batch-selected');
                if (isBreakMode) {
                    dayDiv.classList.add('batch-selected-break');
                }
            }

            if (dateKey === todayKey) {
                dayDiv.classList.add('today');
            }

            const cellDayStart = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate(), 0, 0, 0, 0);
            const cellDayEnd = new Date(cellDayStart);
            cellDayEnd.setDate(cellDayEnd.getDate() + 1);
            const liveOverlapsDay = !isBreakMode
                && state.timerInterval
                && state.startTime
                && state.startTime < cellDayEnd.getTime()
                && Date.now() > cellDayStart.getTime();
            if (liveOverlapsDay) {
                dayDiv.classList.add('live-session-active');
                const liveLabel = document.createElement('div');
                liveLabel.className = 'calendar-live-label';
                liveLabel.textContent = 'Live';
                dayDiv.appendChild(liveLabel);
            }

            if (isBreakMode) {
                if (breakHours > 0) {
                    dayDiv.classList.add('has-break');
                    const breakLabel = document.createElement('div');
                    breakLabel.className = 'break-hours-indicator';
                    breakLabel.textContent = `${breakHours.toFixed(1)}h`;
                    dayDiv.appendChild(breakLabel);
                }
            } else if (netHours > 0) {
                dayDiv.classList.add('has-work');
                const hourLabel = document.createElement('div');
                hourLabel.className = 'work-hours-indicator';
                const hasBreakTime = breakHours > 0 || (grossHours > 0 && Math.abs(grossHours - netHours) > 0.05);
                hourLabel.textContent = `${netHours.toFixed(1)}h`;
                if (hasBreakTime) {
                    hourLabel.title = `${grossHours.toFixed(1)}h gross`;
                    const breakDot = document.createElement('span');
                    breakDot.className = 'calendar-break-dot';
                    breakDot.setAttribute('aria-label', 'Includes break time');
                    dayDiv.appendChild(breakDot);
                }
                dayDiv.appendChild(hourLabel);
            }

            DOM.calendarGrid.appendChild(dayDiv);
        }

        const weekTotalDiv = document.createElement('div');
        weekTotalDiv.className = 'calendar-week-total';

        if (isBreakMode) {
            if (weekBreakHours > 0) {
                weekTotalDiv.classList.add('has-break-total');
                weekTotalDiv.textContent = `${weekBreakHours.toFixed(1)}h`;
            } else {
                weekTotalDiv.classList.add('is-empty');
                weekTotalDiv.textContent = '—';
            }
        } else if (weekNetHours > 0) {
            weekTotalDiv.classList.add('has-work-total');
            weekTotalDiv.textContent = `${weekNetHours.toFixed(1)}h`;
            if (Math.abs(weekGrossHours - weekNetHours) > 0.05) {
                weekTotalDiv.title = `${weekGrossHours.toFixed(1)}h gross`;
            }
        } else {
            weekTotalDiv.classList.add('is-empty');
            weekTotalDiv.textContent = '—';
        }

        DOM.calendarGrid.appendChild(weekTotalDiv);
    }
}

function formatWeekRange(startOfWeek) {
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const options = { month: 'short', day: 'numeric' };
    const startStr = startOfWeek.toLocaleDateString('en-US', options);
    const endStr = endOfWeek.toLocaleDateString('en-US', { ...options, year: 'numeric' });
    
    return `${startStr} - ${endStr}`;
}

export function renderChart() {
    if (!DOM.weeklyChart) return;
    DOM.weeklyChart.innerHTML = '';

    const daysArrBase = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daysArr = [...daysArrBase.slice(state.startOfWeek), ...daysArrBase.slice(0, state.startOfWeek)];

    const currentChartDate = state.currentChartDate || new Date();
    const startOfWeek = getStartOfWeekDate(currentChartDate, state.startOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    const startOfWeekMs = startOfWeek.getTime();
    const endOfWeekMs = endOfWeek.getTime();

    if (DOM.chartWeekRange) {
        DOM.chartWeekRange.textContent = formatWeekRange(startOfWeek);
    }

    const weekData = Array(7).fill().map(() => []);
    let maxDailyHours = 0;

    state.allSessions.forEach(session => {
        const range = getSessionTimeRange(session);
        if (!range) return;

        let segmentStartMs = Math.max(range.startMs, startOfWeekMs);
        const segmentEndLimitMs = Math.min(range.endMs, endOfWeekMs);
        if (segmentStartMs >= segmentEndLimitMs) return;

        while (segmentStartMs < segmentEndLimitMs) {
            const segmentStart = new Date(segmentStartMs);
            const nextDay = new Date(segmentStart);
            nextDay.setHours(24, 0, 0, 0);
            const segmentEndMs = Math.min(nextDay.getTime(), segmentEndLimitMs);
            const grossSegmentDurationMs = segmentEndMs - segmentStartMs;
            const breakMs = getBreakOverlapMs(state.allBreaks, segmentStartMs, segmentEndMs);
            const segmentDurationMs = Math.max(0, grossSegmentDurationMs - breakMs);
            const actualDay = segmentStart.getDay();
            const dayIndex = (actualDay - state.startOfWeek + 7) % 7;

            if (segmentDurationMs > 0) {
                weekData[dayIndex].push({
                    hours: segmentDurationMs / (1000 * 60 * 60),
                    durationMs: segmentDurationMs,
                    company: session.company,
                    project: session.project
                });
            }

            segmentStartMs = segmentEndMs;
        }
    });

    weekData.forEach(daySessions => {
        const dailyTotal = daySessions.reduce((sum, sessionObj) => sum + sessionObj.hours, 0);
        if (dailyTotal > maxDailyHours) maxDailyHours = dailyTotal;
    });

    if (state.timerInterval && state.startTime) {
        let segmentStartMs = Math.max(state.startTime, startOfWeekMs);
        const segmentEndLimitMs = Math.min(Date.now(), endOfWeekMs);
        if (segmentStartMs < segmentEndLimitMs) {
            while (segmentStartMs < segmentEndLimitMs) {
                const segmentStart = new Date(segmentStartMs);
                const nextDay = new Date(segmentStart);
                nextDay.setHours(24, 0, 0, 0);
                const segmentEndMs = Math.min(nextDay.getTime(), segmentEndLimitMs);
                const grossSegmentDurationMs = segmentEndMs - segmentStartMs;
                const breakMs = getBreakOverlapMs(state.allBreaks, segmentStartMs, segmentEndMs);
                const segmentDurationMs = Math.max(0, grossSegmentDurationMs - breakMs);
                const actualDay = segmentStart.getDay();
                const dayIndex = (actualDay - state.startOfWeek + 7) % 7;

                if (segmentDurationMs > 0) {
                    weekData[dayIndex].push({
                        hours: segmentDurationMs / (1000 * 60 * 60),
                        durationMs: segmentDurationMs,
                        company: state.currentCompany,
                        project: state.currentProject,
                        isLive: true
                    });
                    const dailyTotal = weekData[dayIndex].reduce((sum, sessionObj) => sum + sessionObj.hours, 0);
                    if (dailyTotal > maxDailyHours) maxDailyHours = dailyTotal;
                }

                segmentStartMs = segmentEndMs;
            }
        }
    }

    const weeklyNetMs = weekData.reduce(
        (sum, daySessions) => sum + daySessions.reduce((daySum, sessionObj) => daySum + sessionObj.durationMs, 0),
        0
    );

    if (DOM.chartWeekTotal) {
        DOM.chartWeekTotal.textContent = weeklyNetMs > 0
            ? `${formatDuration(weeklyNetMs)} net total`
            : '0h net total';
    }

    const weekEndLimitMs = Math.min(endOfWeekMs, Date.now());
    let totalSessionMs = 0;
    let sessionCount = 0;

    state.allSessions.forEach((session) => {
        const overlapMs = getEffectiveSessionOverlapMs(session, state.allBreaks, startOfWeekMs, weekEndLimitMs);
        if (overlapMs > 0) {
            totalSessionMs += overlapMs;
            sessionCount += 1;
        }
    });

    if (state.timerInterval && state.startTime) {
        const liveOverlapStart = Math.max(state.startTime, startOfWeekMs);
        const liveOverlapEnd = Math.min(Date.now(), weekEndLimitMs);
        if (liveOverlapEnd > liveOverlapStart) {
            const breakMs = getBreakOverlapMs(state.allBreaks, liveOverlapStart, liveOverlapEnd);
            const liveNetMs = Math.max(0, liveOverlapEnd - liveOverlapStart - breakMs);
            if (liveNetMs > 0) {
                totalSessionMs += liveNetMs;
                sessionCount += 1;
            }
        }
    }

    const avgSessionMs = sessionCount > 0 ? totalSessionMs / sessionCount : 0;
    const avgSessionHours = avgSessionMs / (1000 * 60 * 60);
    const scaleMax = Math.ceil(Math.max(maxDailyHours, avgSessionHours, 1));

    // Y Axis Labels
    const yAxisDiv = document.createElement('div');
    yAxisDiv.className = 'chart-y-axis';

    [1, 0.75, 0.5, 0.25, 0].forEach(ratio => {
        const label = document.createElement('div');
        const hours = scaleMax * ratio;
        label.textContent = ratio === 0 ? '0h' : `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
        yAxisDiv.appendChild(label);
    });
    DOM.weeklyChart.appendChild(yAxisDiv);

    const gridDiv = document.createElement('div');
    gridDiv.className = 'chart-grid-lines';
    for (let i = 0; i <= 8; i++) {
        const line = document.createElement('span');
        line.className = i % 2 === 0 ? 'chart-grid-line chart-grid-line-major' : 'chart-grid-line';
        line.style.bottom = `${(i / 8) * 100}%`;
        gridDiv.appendChild(line);
    }

    if (sessionCount > 0 && avgSessionHours > 0) {
        const avgLine = document.createElement('div');
        avgLine.className = 'chart-avg-line';
        avgLine.style.bottom = `${(avgSessionHours / scaleMax) * 100}%`;

        const avgLabel = document.createElement('span');
        avgLabel.className = 'chart-avg-label';
        avgLabel.textContent = `Avg ${formatDuration(avgSessionMs)}`;
        avgLine.appendChild(avgLabel);

        gridDiv.appendChild(avgLine);
    }

    DOM.weeklyChart.appendChild(gridDiv);

    daysArr.forEach((label, index) => {
        const colDiv = document.createElement('div');
        colDiv.className = 'chart-day-column';
        const areaDiv = document.createElement('div');
        areaDiv.className = 'chart-bar-area';

        weekData[index].forEach((sessionObj, sIndex) => {
            const hrs = sessionObj.hours;
            const bar = document.createElement('div');
            bar.className = `chart-sub-session${sessionObj.isLive ? ' chart-sub-session-live' : ''}`;
            bar.style.height = `${(hrs / scaleMax) * 100}%`;

            // Determine color based on project or company
            const identifier = sessionObj.project || sessionObj.company || 'default';
            const color = getColorForIdentifier(identifier);
            if (!sessionObj.isLive) {
                bar.style.background = `linear-gradient(180deg, ${color} 0%, ${adjustColorOpacity(color, 0.8)} 100%)`;
            }

            let titlePrefix = sessionObj.project ? `[${sessionObj.project}] ` : (sessionObj.company ? `[${sessionObj.company}] ` : '');
            const livePrefix = sessionObj.isLive ? 'Live · ' : '';
            bar.title = `${livePrefix}${titlePrefix}Session ${sIndex + 1}: ${formatDuration(sessionObj.durationMs)}`;

            // Add persistent label if an identifier exists
            if (identifier !== 'default' && !sessionObj.isLive) {
                const labelSpan = document.createElement('span');
                labelSpan.className = 'chart-bar-label';
                labelSpan.textContent = sessionObj.project || sessionObj.company;
                bar.appendChild(labelSpan);
            }

            if (sessionObj.isLive) {
                const liveLabel = document.createElement('span');
                liveLabel.className = 'chart-bar-label chart-bar-label-live';
                liveLabel.textContent = 'Live';
                bar.appendChild(liveLabel);
            }

            areaDiv.appendChild(bar);
        });

        const lblDiv = document.createElement('div');
        lblDiv.className = 'chart-day-label';
        lblDiv.textContent = label;

        colDiv.appendChild(areaDiv);
        colDiv.appendChild(lblDiv);
        DOM.weeklyChart.appendChild(colDiv);
    });
}

function getColorForIdentifier(identifier) {
    if (identifier === 'default') return 'rgba(0, 212, 255, 0.8)';

    // Simple string hashing to consistently generate a hue
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
        hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
    }

    const h = Math.abs(hash) % 360;
    const s = 70 + (Math.abs(hash) % 30); // 70-100% saturation
    const l = 45 + (Math.abs(hash) % 15); // 45-60% lightness

    return `hsl(${h}, ${s}%, ${l}%)`;
}

function adjustColorOpacity(hslaString, opacity) {
    if (hslaString.startsWith('rgba')) {
        return hslaString.replace(/[\d\.]+\)$/g, `${opacity})`);
    }
    return hslaString.replace(')', `, ${opacity})`).replace('rgb', 'rgba').replace('hsl', 'hsla');
}

export function renderGanttChart() {
    if (!DOM.ganttChart) return;
    DOM.ganttChart.innerHTML = '';

    const currentTimelineDate = state.currentTimelineDate || new Date();
    const startOfWeek = getStartOfWeekDate(currentTimelineDate, state.startOfWeek);

    if (DOM.timelineWeekRange) {
        DOM.timelineWeekRange.textContent = formatWeekRange(startOfWeek);
    }

    // Header Row for hour markers
    const headerRow = document.createElement('div');
    headerRow.className = 'gantt-header-row';
    for (let i = 0; i <= 24; i += 4) {
        const hourLabel = document.createElement('span');
        hourLabel.className = 'gantt-header-hour';
        hourLabel.style.left = `${(i / 24) * 100}%`;
        hourLabel.textContent = `${i}:00`;
        headerRow.appendChild(hourLabel);
    }
    DOM.ganttChart.appendChild(headerRow);

    const daysContainer = document.createElement('div');
    daysContainer.className = 'gantt-days-container';

    // Build rows for each of the 7 days of the week
    for (let index = 0; index < 7; index++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setDate(startOfWeek.getDate() + index);

        const dayRow = document.createElement('div');
        dayRow.className = 'gantt-day-row';

        const rowLabel = document.createElement('div');
        rowLabel.className = 'gantt-day-row-label';
        // Format e.g. "Sun 28"
        rowLabel.textContent = dayDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
        dayRow.appendChild(rowLabel);

        const rowContainer = document.createElement('div');
        rowContainer.className = 'gantt-container';

        // Add background hour lines to each row
        for (let i = 0; i <= 24; i++) {
            const marker = document.createElement('div');
            const isMajor = i % 4 === 0;
            marker.className = `gantt-hour-marker ${isMajor ? 'gantt-hour-marker-major' : 'gantt-hour-marker-minor'}`;
            marker.style.left = `${(i / 24) * 100}%`;
            rowContainer.appendChild(marker);
        }

        const startOfDay = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        const dayStartMs = startOfDay.getTime();
        const dayEndMs = endOfDay.getTime();

        // Local helper to add a gantt block
        const addGanttBlock = (startTimeObj, durationMs, project, company, isLive, blockType = 'work') => {
            const msSinceMidnight = startTimeObj.getTime() - startOfDay.getTime();
            const msInDay = 24 * 60 * 60 * 1000;

            let leftPercent = (msSinceMidnight / msInDay) * 100;
            let widthPercent = (durationMs / msInDay) * 100;

            if (leftPercent + widthPercent > 100) {
                widthPercent = 100 - leftPercent;
            }

            const block = document.createElement('div');
            block.className = `gantt-block ${isLive ? 'gantt-live' : ''} ${blockType === 'break' ? 'gantt-break' : ''}`;
            block.style.left = `${leftPercent}%`;
            block.style.width = widthPercent > 0.5 ? `${widthPercent}%` : '0.5%';

            let color;
            if (blockType === 'break') {
                color = 'rgba(255, 152, 0, 0.85)';
            } else {
                const identifier = project || company || 'default';
                color = isLive ? 'rgba(255, 60, 60, 0.8)' : getColorForIdentifier(identifier);
            }

            block.style.backgroundColor = color;
            block.style.boxShadow = `0 0 8px ${color}`;

            let titlePrefix = blockType === 'break'
                ? 'Break: '
                : (project ? `[${project}] ` : (company ? `[${company}] ` : ''));
            block.title = `${titlePrefix}${formatDuration(durationMs)}${isLive ? ' (Live)' : ''}`;

            if (widthPercent > 4) {
                const label = document.createElement('span');
                label.className = 'gantt-block-label';
                const durationText = formatDuration(durationMs);
                if (blockType === 'break') {
                    label.textContent = durationText;
                } else if ((project || company) && (project || company) !== 'default') {
                    label.textContent = `${project || company} (${durationText})`;
                } else {
                    label.textContent = durationText;
                }
                block.appendChild(label);
            }

            rowContainer.appendChild(block);
        };

        const dayBreaks = state.allBreaks.filter(breakItem => {
            const range = getSessionTimeRange(breakItem);
            if (!range) return false;
            return range.startMs < dayEndMs && range.endMs > dayStartMs;
        });

        // Render standard sessions (split at midnight)
        state.allSessions.forEach(session => {
            forEachSessionDaySegment(session, state.allBreaks, startOfDay, endOfDay, (segment) => {
                if (segment.grossMs <= 0) return;
                addGanttBlock(
                    new Date(segment.segmentStartMs),
                    segment.grossMs,
                    session.project,
                    session.company,
                    false,
                    'work'
                );
            });
        });

        // Render breaks for this day (split at midnight)
        dayBreaks.forEach(breakItem => {
            const range = getSessionTimeRange(breakItem);
            if (!range) return;

            let segmentStartMs = Math.max(range.startMs, dayStartMs);
            const segmentEndLimitMs = Math.min(range.endMs, dayEndMs);
            while (segmentStartMs < segmentEndLimitMs) {
                const segmentStart = new Date(segmentStartMs);
                const nextDay = new Date(segmentStart);
                nextDay.setHours(24, 0, 0, 0);
                const segmentEndMs = Math.min(nextDay.getTime(), segmentEndLimitMs);
                const segmentDurationMs = segmentEndMs - segmentStartMs;
                if (segmentDurationMs > 0) {
                    addGanttBlock(new Date(segmentStartMs), segmentDurationMs, null, null, false, 'break');
                }
                segmentStartMs = segmentEndMs;
            }
        });

        // Render live active session if it overlaps this day
        if (state.timerInterval && state.startTime) {
            const liveEndMs = Date.now();
            if (state.startTime < dayEndMs && liveEndMs > dayStartMs) {
                const liveStartMs = Math.max(state.startTime, dayStartMs);
                const activeDuration = liveEndMs - liveStartMs;
                if (activeDuration > 0) {
                    addGanttBlock(new Date(liveStartMs), activeDuration, state.currentProject, state.currentCompany, true, 'work');
                }
            }
        }

        dayRow.appendChild(rowContainer);
        daysContainer.appendChild(dayRow);
    }

    DOM.ganttChart.appendChild(daysContainer);
}

export function updateDatalists() {
    if (!DOM.companySelect || !DOM.projectSelect) return;

    const companies = new Set();
    const projects = new Set();

    state.allSessions.forEach(session => {
        if (session.company) companies.add(session.company.trim());
        if (session.project) projects.add(session.project.trim());
    });

    DOM.companySelect.innerHTML = '<option value="">Or pick saved...</option>';
    if (DOM.sessionCompanySelect) DOM.sessionCompanySelect.innerHTML = '<option value="">Or pick saved...</option>';
    if (DOM.batchCompanySelect) DOM.batchCompanySelect.innerHTML = '<option value="">Or pick saved...</option>';

    Array.from(companies).sort().forEach(company => {
        const option = document.createElement('option');
        option.value = company;
        option.textContent = company;
        DOM.companySelect.appendChild(option);

        if (DOM.sessionCompanySelect) {
            const optCopy = option.cloneNode(true);
            DOM.sessionCompanySelect.appendChild(optCopy);
        }
        if (DOM.batchCompanySelect) {
            const optCopy = option.cloneNode(true);
            DOM.batchCompanySelect.appendChild(optCopy);
        }
    });

    DOM.projectSelect.innerHTML = '<option value="">Or pick saved...</option>';
    if (DOM.sessionProjectSelect) DOM.sessionProjectSelect.innerHTML = '<option value="">Or pick saved...</option>';
    if (DOM.batchProjectSelect) DOM.batchProjectSelect.innerHTML = '<option value="">Or pick saved...</option>';

    Array.from(projects).sort().forEach(project => {
        const option = document.createElement('option');
        option.value = project;
        option.textContent = project;
        DOM.projectSelect.appendChild(option);

        if (DOM.sessionProjectSelect) {
            const optCopy = option.cloneNode(true);
            DOM.sessionProjectSelect.appendChild(optCopy);
        }
        if (DOM.batchProjectSelect) {
            const optCopy = option.cloneNode(true);
            DOM.batchProjectSelect.appendChild(optCopy);
        }
    });
}

export function applyWidgetOrder() {
    state.widgetOrder.forEach((id, index) => {
        const el = document.getElementById(id);
        if (el) {
            el.style.order = index;
        }
    });
}

export function applyWidgetVisibility() {
    const DEFAULT_WIDGET_IDS = [
        'widget-timer', 'widget-breaks', 'widget-money-counter', 'widget-stats',
        'widget-work-pattern', 'widget-cut-stats', 'widget-cuts', 'widget-gantt',
        'widget-calendar', 'widget-chart', 'widget-history'
    ];

    DEFAULT_WIDGET_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const isDisabled = state.disabledWidgets.includes(id);
        el.classList.toggle('hidden', isDisabled);
        el.setAttribute('aria-hidden', isDisabled ? 'true' : 'false');
    });
}

export function updateShiftRemainingDisplay(elapsedMs) {
    if (!DOM.timerShiftRemaining) return;

    const targetHours = Number(state.targetShiftHours) || 0;
    if (!state.startTime || targetHours <= 0) {
        DOM.timerShiftRemaining.classList.add('hidden');
        DOM.timerShiftRemaining.textContent = '';
        return;
    }

    const targetMs = targetHours * 60 * 60 * 1000;
    const remainingMs = targetMs - elapsedMs;
    DOM.timerShiftRemaining.classList.remove('hidden');

    if (remainingMs > 0) {
        DOM.timerShiftRemaining.textContent = `${formatDuration(remainingMs)} left until target shift end`;
        DOM.timerShiftRemaining.classList.remove('is-over-target');
    } else {
        DOM.timerShiftRemaining.textContent = `${formatDuration(Math.abs(remainingMs))} over target shift`;
        DOM.timerShiftRemaining.classList.add('is-over-target');
    }
}

export function applyWidgetTitles() {
    if (!state.showWidgetTitles) {
        document.body.classList.add('hide-widget-titles');
    } else {
        document.body.classList.remove('hide-widget-titles');
    }
}

function waitForPaint() {
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

function getWidgetExportTitle(widget) {
    const title = widget.querySelector('.widget-title');
    return (title ? title.textContent : widget.id || 'widget').trim() || 'widget';
}

function getWidgetExportFilename(widget, format) {
    const safeTitle = getWidgetExportTitle(widget)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'widget';
    const date = new Date().toISOString().slice(0, 10);
    const extension = format === 'jpeg' ? 'jpg' : 'png';
    return `work-tracker-${safeTitle}-${date}.${extension}`;
}

function getScrollableExportElements(widget) {
    return [widget, ...widget.querySelectorAll('*')].filter(element => {
        const styles = getComputedStyle(element);
        const overflow = `${styles.overflow} ${styles.overflowX} ${styles.overflowY}`;
        return /(auto|scroll)/.test(overflow);
    });
}

async function prepareWidgetForExport(widget) {
    const restoredStyles = [];
    const restoredScrolls = [];
    const width = Math.ceil(widget.getBoundingClientRect().width);
    const scrollableElements = getScrollableExportElements(widget);

    widget.classList.add('widget-export-capturing');

    [widget, ...scrollableElements].forEach(element => {
        restoredStyles.push([element, element.getAttribute('style')]);
        restoredScrolls.push([element, element.scrollTop, element.scrollLeft]);
        element.style.maxHeight = 'none';
        element.style.overflow = 'visible';
        element.style.overflowX = 'visible';
        element.style.overflowY = 'visible';
        element.scrollTop = 0;
        element.scrollLeft = 0;
    });

    widget.style.width = `${width}px`;
    widget.style.background = '#121625';
    widget.style.backdropFilter = 'none';
    widget.style.webkitBackdropFilter = 'none';
    widget.style.boxShadow = 'none';
    await waitForPaint();
    widget.style.height = `${Math.ceil(widget.scrollHeight)}px`;
    await waitForPaint();

    return () => {
        widget.classList.remove('widget-export-capturing');
        restoredStyles.reverse().forEach(([element, style]) => {
            if (style === null) {
                element.removeAttribute('style');
            } else {
                element.setAttribute('style', style);
            }
        });
        restoredScrolls.forEach(([element, scrollTop, scrollLeft]) => {
            element.scrollTop = scrollTop;
            element.scrollLeft = scrollLeft;
        });
    };
}

let html2CanvasPromise = null;

function loadHtml2Canvas() {
    if (window.html2canvas) {
        return Promise.resolve(window.html2canvas);
    }

    if (!html2CanvasPromise) {
        html2CanvasPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = new URL('../vendor/html2canvas.min.js', import.meta.url).href;
            script.onload = () => {
                if (window.html2canvas) {
                    resolve(window.html2canvas);
                } else {
                    reject(new Error('Widget image exporter did not load.'));
                }
            };
            script.onerror = () => reject(new Error('Could not load widget image exporter.'));
            document.head.appendChild(script);
        });
    }

    return html2CanvasPromise;
}

function downloadCanvas(canvas, widget, format) {
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpeg' ? 0.92 : undefined;

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) {
                reject(new Error('Could not create image file.'));
                return;
            }

            const url = URL.createObjectURL(blob);
            if (Array.isArray(window.__widgetExportDownloads)) {
                window.__widgetExportDownloads.push({
                    download: getWidgetExportFilename(widget, format),
                    hrefStartsWithBlob: url.startsWith('blob:'),
                    size: blob.size,
                    type: blob.type
                });
                URL.revokeObjectURL(url);
                resolve();
                return;
            }

            const link = document.createElement('a');
            link.href = url;
            link.download = getWidgetExportFilename(widget, format);
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            resolve();
        }, mimeType, quality);
    });
}

async function saveWidgetImage(widget, format, button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving...';

    let restoreWidget = null;
    try {
        const html2canvas = await loadHtml2Canvas();
        restoreWidget = await prepareWidgetForExport(widget);
        const rect = widget.getBoundingClientRect();
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = await html2canvas(widget, {
            backgroundColor: '#070913',
            scale,
            useCORS: true,
            allowTaint: false,
            logging: false,
            width: Math.ceil(rect.width),
            height: Math.ceil(widget.scrollHeight),
            windowWidth: Math.ceil(Math.max(document.documentElement.scrollWidth, rect.width)),
            windowHeight: Math.ceil(Math.max(document.documentElement.scrollHeight, widget.scrollHeight)),
            scrollX: -window.scrollX,
            scrollY: -window.scrollY
        });
        await downloadCanvas(canvas, widget, format);
    } catch (error) {
        console.error('Debug: Widget image export failed', error);
        showAlert('Export Error', 'Could not save this widget as an image. Please try again.');
    } finally {
        if (restoreWidget) {
            restoreWidget();
        }
        button.disabled = false;
        button.textContent = originalText;
    }
}

function createWidgetExportFooter(widget) {
    const footer = document.createElement('div');
    footer.className = 'widget-export-footer';

    const formatSelect = document.createElement('select');
    formatSelect.className = 'widget-export-format';
    formatSelect.title = 'Image format';
    formatSelect.innerHTML = `
        <option value="png">PNG</option>
        <option value="jpeg">JPEG</option>
    `;

    const button = document.createElement('button');
    button.className = 'widget-export-button btn-outline btn-small';
    button.type = 'button';
    button.textContent = 'Save Image';
    button.title = `Save ${getWidgetExportTitle(widget)} as an image`;

    button.addEventListener('click', () => {
        saveWidgetImage(widget, formatSelect.value, button);
    });

    footer.appendChild(formatSelect);
    footer.appendChild(button);
    return footer;
}

export function setupWidgetImageExports() {
    document.querySelectorAll('.dashboard-grid > .card[id^="widget-"]').forEach(widget => {
        if (widget.querySelector(':scope > .widget-export-footer')) return;
        widget.appendChild(createWidgetExportFooter(widget));
    });
}

export function applyDashboardDensity() {
    document.body.classList.remove('dashboard-density-compact', 'dashboard-density-comfortable', 'dashboard-density-spacious');
    document.body.classList.add(`dashboard-density-${state.dashboardDensity || 'comfortable'}`);
}

export function updateActiveFilterDisplay() {
    if (!DOM.activeFiltersContainer) return;
    DOM.activeFiltersContainer.innerHTML = '';

    if (state.globalFilterCompany) {
        const badge = document.createElement('span');
        badge.className = 'history-badge history-badge-company';
        badge.textContent = state.globalFilterCompany;
        badge.title = 'Filtered by Company: ' + state.globalFilterCompany;
        DOM.activeFiltersContainer.appendChild(badge);
    }

    if (state.globalFilterProject) {
        const badge = document.createElement('span');
        badge.className = 'history-badge history-badge-project';
        badge.textContent = state.globalFilterProject;
        badge.title = 'Filtered by Project: ' + state.globalFilterProject;
        DOM.activeFiltersContainer.appendChild(badge);
    }
}

export function renderWidgetOrderList() {
    if (!DOM.widgetOrderList) return;
    DOM.widgetOrderList.innerHTML = '';

    const labels = {
        'widget-timer': 'Timer & Controls',
        'widget-breaks': 'Breaks',
        'widget-money-counter': 'Live Money Counter',
        'widget-stats': 'Statistics',
        'widget-work-pattern': 'Work Pattern',
        'widget-cut-stats': 'After Percentage Cuts',
        'widget-cuts': 'Percentage Cuts',
        'widget-gantt': "Timeline",
        'widget-calendar': 'Calendar',
        'widget-chart': 'Weekly Breakdown',
        'widget-history': 'History List'
    };

    state.widgetOrder.forEach(id => {
        if (!labels[id]) return;

        const li = document.createElement('li');
        li.className = 'sortable-item';
        li.draggable = true;
        li.dataset.id = id;

        li.innerHTML = `
            <div class="drag-handle">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
            </div>
            <span class="widget-order-label">${labels[id]}</span>
            <label class="widget-visibility-toggle" title="Show on dashboard">
                <input type="checkbox" class="widget-visibility-checkbox" data-widget-id="${id}" ${state.disabledWidgets.includes(id) ? '' : 'checked'}>
                <span>Show</span>
            </label>
        `;

        const visibilityCheckbox = li.querySelector('.widget-visibility-checkbox');
        if (visibilityCheckbox) {
            visibilityCheckbox.addEventListener('mousedown', (event) => event.stopPropagation());
            visibilityCheckbox.addEventListener('click', (event) => event.stopPropagation());
        }

        li.addEventListener('dragstart', handleDragStart);
        li.addEventListener('dragenter', handleDragEnter);
        li.addEventListener('dragover', handleDragOver);
        li.addEventListener('dragleave', handleDragLeave);
        li.addEventListener('drop', handleDrop);
        li.addEventListener('dragend', handleDragEnd);

        DOM.widgetOrderList.appendChild(li);
    });
}

export function renderPercentageCutList() {
    if (!DOM.percentageCutList) return;
    DOM.percentageCutList.innerHTML = '';

    state.percentageCuts.forEach(cut => {
        DOM.percentageCutList.appendChild(createPercentageCutListItem(cut));
    });

    updatePercentageCutMoveButtons();
}

export function addPercentageCutListItem() {
    if (!DOM.percentageCutList) return;
    DOM.percentageCutList.appendChild(createPercentageCutListItem(createPercentageCut('', 0)));
    updatePercentageCutMoveButtons();
}

export function getPercentageCutsFromWidget() {
    if (!DOM.percentageCutList) return [];

    const items = DOM.percentageCutList.querySelectorAll('.percentage-cut-item');
    return Array.from(items)
        .map((item, index) => {
            const nameInput = item.querySelector('.cut-name-input');
            const percentageInput = item.querySelector('.cut-percentage-input');
            const basisButton = item.querySelector('.cut-basis-toggle');
            const name = nameInput ? nameInput.value.trim() : '';
            const percentage = percentageInput ? parseFloat(percentageInput.value) : 0;
            const basis = basisButton && basisButton.dataset.basis === 'original' ? 'original' : 'accumulative';

            return {
                id: item.dataset.id,
                name,
                percentage: Number.isFinite(percentage) ? percentage : 0,
                basis
            };
        })
        .filter(cut => cut.name || cut.percentage > 0)
        .map((cut, index) => ({
            ...cut,
            name: cut.name || `Cut ${index + 1}`
        }));
}

function createPercentageCutListItem(cut) {
    const li = document.createElement('li');
    li.className = 'sortable-item percentage-cut-item';
    li.draggable = true;
    li.dataset.id = cut.id;

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
    `;

    const fields = document.createElement('div');
    fields.className = 'percentage-cut-fields';

    const nameInput = document.createElement('input');
    nameInput.className = 'cut-name-input';
    nameInput.type = 'text';
    nameInput.placeholder = 'Name';
    nameInput.value = cut.name || '';

    const percentField = document.createElement('div');
    percentField.className = 'cut-percent-field';

    const percentageInput = document.createElement('input');
    percentageInput.className = 'cut-percentage-input';
    percentageInput.type = 'number';
    percentageInput.min = '0';
    percentageInput.max = '100';
    percentageInput.step = '0.1';
    percentageInput.placeholder = '0';
    percentageInput.value = Number(cut.percentage) || '';

    const percentSymbol = document.createElement('span');
    percentSymbol.className = 'cut-percent-symbol';
    percentSymbol.textContent = '%';

    percentField.appendChild(percentageInput);
    percentField.appendChild(percentSymbol);

    fields.appendChild(nameInput);
    fields.appendChild(percentField);

    const basisButton = document.createElement('button');
    basisButton.className = 'cut-basis-toggle';
    basisButton.type = 'button';
    setCutBasisButtonState(basisButton, cut.basis);

    basisButton.addEventListener('click', () => {
        const nextBasis = basisButton.dataset.basis === 'original' ? 'accumulative' : 'original';
        setCutBasisButtonState(basisButton, nextBasis);
    });

    fields.appendChild(basisButton);

    const actions = document.createElement('div');
    actions.className = 'percentage-cut-actions';

    actions.appendChild(createCutActionButton('up', 'Move cut up', `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
    `));
    actions.appendChild(createCutActionButton('down', 'Move cut down', `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    `));
    actions.appendChild(createCutActionButton('remove', 'Remove cut', `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    `));

    actions.addEventListener('click', handlePercentageCutAction);

    li.appendChild(handle);
    li.appendChild(fields);
    li.appendChild(actions);

    li.addEventListener('dragstart', handlePercentageCutDragStart);
    li.addEventListener('dragenter', handlePercentageCutDragEnter);
    li.addEventListener('dragover', handlePercentageCutDragOver);
    li.addEventListener('dragleave', handlePercentageCutDragLeave);
    li.addEventListener('drop', handlePercentageCutDrop);
    li.addEventListener('dragend', handlePercentageCutDragEnd);

    return li;
}

function setCutBasisButtonState(button, basis = 'accumulative') {
    const normalizedBasis = basis === 'original' ? 'original' : 'accumulative';
    button.dataset.basis = normalizedBasis;
    button.textContent = normalizedBasis === 'original' ? 'From Original' : 'From Accumulated';
    button.title = normalizedBasis === 'original'
        ? 'Calculated from the original earnings, then subtracted from the accumulated amount'
        : 'Calculated from the accumulated amount, then subtracted from the accumulated amount';
}

function createCutActionButton(action, title, svg) {
    const button = document.createElement('button');
    button.className = `cut-icon-btn ${action === 'remove' ? 'cut-remove-btn' : ''}`;
    button.type = 'button';
    button.dataset.action = action;
    button.title = title;
    button.innerHTML = svg;
    return button;
}

async function handlePercentageCutAction(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const item = button.closest('.percentage-cut-item');
    if (!item) return;

    if (button.dataset.action === 'remove') {
        // Prevent default click propagation so schedulePercentageCutsAutosave does not run synchronously
        e.preventDefault();
        e.stopPropagation();

        const nameInput = item.querySelector('.cut-name-input');
        const cutName = nameInput ? nameInput.value.trim() : "";
        const displayName = cutName ? `"${cutName}"` : "this percentage cut";

        const confirmed = await showConfirm(
            "Remove Percentage Cut",
            `Are you sure you want to remove ${displayName}?`
        );
        if (confirmed) {
            item.remove();
            updatePercentageCutMoveButtons();
            
            // Dispatch input event to trigger auto-save in main.js
            if (DOM.percentageCutList) {
                DOM.percentageCutList.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    } else if (button.dataset.action === 'up' && item.previousElementSibling) {
        DOM.percentageCutList.insertBefore(item, item.previousElementSibling);
        updatePercentageCutMoveButtons();
    } else if (button.dataset.action === 'down' && item.nextElementSibling) {
        DOM.percentageCutList.insertBefore(item.nextElementSibling, item);
        updatePercentageCutMoveButtons();
    }
}

function updatePercentageCutMoveButtons() {
    if (!DOM.percentageCutList) return;

    const items = Array.from(DOM.percentageCutList.querySelectorAll('.percentage-cut-item'));
    items.forEach((item, index) => {
        const upButton = item.querySelector('button[data-action="up"]');
        const downButton = item.querySelector('button[data-action="down"]');
        if (upButton) upButton.disabled = index === 0;
        if (downButton) downButton.disabled = index === items.length - 1;
    });
}

let draggedCutItem = null;

function handlePercentageCutDragStart(e) {
    draggedCutItem = this;
    setTimeout(() => this.classList.add('dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.id);
}

function handlePercentageCutDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handlePercentageCutDragEnter() {
    if (this !== draggedCutItem) {
        this.style.borderStyle = 'dashed';
        this.style.borderColor = 'var(--accent-blue)';
    }
}

function handlePercentageCutDragLeave() {
    this.style.borderStyle = 'solid';
    this.style.borderColor = 'rgba(255, 255, 255, 0.15)';
}

function handlePercentageCutDrop(e) {
    if (e.stopPropagation) e.stopPropagation();

    this.style.borderStyle = 'solid';
    this.style.borderColor = 'rgba(255, 255, 255, 0.15)';

    if (draggedCutItem && draggedCutItem !== this) {
        const items = Array.from(DOM.percentageCutList.children);
        const draggedIndex = items.indexOf(draggedCutItem);
        const targetIndex = items.indexOf(this);

        if (draggedIndex < targetIndex) {
            this.after(draggedCutItem);
        } else {
            this.before(draggedCutItem);
        }
    }

    updatePercentageCutMoveButtons();
    return false;
}

function handlePercentageCutDragEnd() {
    this.classList.remove('dragging');
    draggedCutItem = null;

    const items = DOM.percentageCutList.querySelectorAll('.percentage-cut-item');
    items.forEach(item => {
        item.style.borderStyle = 'solid';
        item.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    });

    updatePercentageCutMoveButtons();
}

let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    setTimeout(() => this.classList.add('dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    if (this !== draggedItem) {
        this.style.borderStyle = 'dashed';
        this.style.borderColor = 'var(--accent-blue)';
    }
}

function handleDragLeave(e) {
    this.style.borderStyle = 'solid';
    this.style.borderColor = 'rgba(255, 255, 255, 0.15)';
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();

    this.style.borderStyle = 'solid';
    this.style.borderColor = 'rgba(255, 255, 255, 0.15)';

    if (draggedItem !== this) {
        // Swap IDs and HTML
        const draggedHtml = draggedItem.innerHTML;
        const draggedId = draggedItem.dataset.id;

        draggedItem.innerHTML = this.innerHTML;
        draggedItem.dataset.id = this.dataset.id;

        this.innerHTML = draggedHtml;
        this.dataset.id = draggedId;
    }
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    const items = DOM.widgetOrderList.querySelectorAll('.sortable-item');
    items.forEach(item => {
        item.style.borderStyle = 'solid';
        item.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    });
}

function getTimeCostSettings() {
    const hourlyRateInput = DOM.tcHourlyRate ? parseFloat(DOM.tcHourlyRate.value) : NaN;
    const dailyHoursInput = DOM.tcDailyHours ? parseFloat(DOM.tcDailyHours.value) : NaN;
    const workingDaysInput = DOM.tcWorkingDays ? parseFloat(DOM.tcWorkingDays.value) : NaN;

    return {
        baseRate: Number.isFinite(hourlyRateInput) ? hourlyRateInput : (state.tcHourlyRate || 20),
        dailyHours: Number.isFinite(dailyHoursInput) && dailyHoursInput > 0 ? dailyHoursInput : (state.tcDailyHours || 8),
        workingDaysPerWeek: Number.isFinite(workingDaysInput) && workingDaysInput > 0
            ? Math.min(Math.max(workingDaysInput, 1), 7)
            : (state.tcWorkingDaysPerWeek || 5)
    };
}

export function getAmountAfterPercentageCuts(baseAmount) {
    const originalAmount = Math.max(Number(baseAmount) || 0, 0);
    let accumulatedAmount = originalAmount;

    state.percentageCuts.forEach(cut => {
        const sourcePool = cut.basis === 'original' ? originalAmount : accumulatedAmount;
        const deduction = sourcePool * (cut.percentage / 100);
        accumulatedAmount = Math.max(accumulatedAmount - deduction, 0);
    });

    return accumulatedAmount;
}

function getEffectiveHourlyRate(baseRate) {
    const effectiveRate = getAmountAfterPercentageCuts(baseRate);

    const totalCutPercentage = baseRate > 0 ? ((baseRate - effectiveRate) / baseRate) * 100 : 0;

    return { effectiveRate, totalCutPercentage };
}

function formatMoneyAmount(amount) {
    return `${state.currentCurrency}${amount.toFixed(2)}`;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function formatTargetMoney(amount) {
    return `${state.currentCurrency}${amount.toLocaleString('en-GB')}`;
}

function formatEarningTime(hours, settings) {
    if (!Number.isFinite(hours)) return '∞';
    if (hours <= 0) return '0m';

    const totalMinutes = Math.ceil(hours * 60);
    if (totalMinutes < 1) return '<1m';

    const workDayMinutes = Math.max(settings.dailyHours, 1) * 60;
    if (totalMinutes < workDayMinutes) {
        return formatDuration(totalMinutes * 60 * 1000);
    }

    const units = [
        { label: 'yr', minutes: workDayMinutes * settings.workingDaysPerWeek * 4.345 * 12 },
        { label: 'mo', minutes: workDayMinutes * settings.workingDaysPerWeek * 4.345 },
        { label: 'wk', minutes: workDayMinutes * settings.workingDaysPerWeek },
        { label: 'd', minutes: workDayMinutes },
        { label: 'h', minutes: 60 },
        { label: 'm', minutes: 1 }
    ];
    let remainingMinutes = totalMinutes;
    const parts = [];

    units.forEach(unit => {
        const amount = Math.floor(remainingMinutes / unit.minutes);
        if (amount > 0) {
            parts.push(`${amount}${unit.label}`);
            remainingMinutes -= amount * unit.minutes;
        }
    });

    return parts.slice(0, 4).join(' ');
}

function formatScaleAmount(amount) {
    return Number.isInteger(amount) ? amount.toString() : amount.toFixed(2).replace(/\.?0+$/, '');
}

function getTimeScaleUnitLabel(unit, amount) {
    const singularUnits = {
        minutes: 'minute',
        hours: 'hour',
        days: 'day',
        weeks: 'week',
        months: 'month',
        years: 'year'
    };

    return amount === 1 ? singularUnits[unit] : unit;
}

function renderSavedItemsComparisonChart(items, baseRate, effectiveRate) {
    if (!DOM.tcSavedItemsChart) return;

    if (!items || items.length === 0) {
        DOM.tcSavedItemsChart.innerHTML = '<p class="loading-text">No saved items match these filters.</p>';
        return;
    }

    const chartItems = items.map(item => {
        const cost = Number(item.cost) || 0;
        const baseHours = baseRate > 0 ? cost / baseRate : Infinity;
        const effectiveHours = effectiveRate > 0 ? cost / effectiveRate : Infinity;

        return {
            name: item.name || 'Unnamed Item',
            cost,
            baseHours,
            effectiveHours
        };
    });

    const finiteHours = chartItems
        .flatMap(item => [item.baseHours, item.effectiveHours])
        .filter(Number.isFinite);

    if (finiteHours.length === 0) {
        DOM.tcSavedItemsChart.innerHTML = '<p class="loading-text">Set an hourly rate above 0 to compare saved items.</p>';
        return;
    }

    const maxHours = Math.max(...finiteHours, 1);
    const formatChartHours = hours => Number.isFinite(hours) ? `${hours.toFixed(hours >= 10 ? 1 : 2)}h` : '∞';
    const getWidth = hours => Number.isFinite(hours) && hours > 0 ? Math.max((hours / maxHours) * 100, 2) : 0;

    DOM.tcSavedItemsChart.innerHTML = `
        <div class="tc-comparison-chart" role="img" aria-label="Saved item time comparison chart">
            ${chartItems.map(item => `
                <div class="tc-comparison-row">
                    <div class="tc-comparison-item">
                        <strong>${escapeHtml(item.name)}</strong>
                        <span>${state.currentCurrency}${item.cost.toFixed(2)}</span>
                    </div>
                    <div class="tc-comparison-bars">
                        <div class="tc-comparison-bar-line">
                            <span class="tc-comparison-bar-label">Base</span>
                            <div class="tc-comparison-track">
                                <span class="tc-comparison-bar tc-comparison-bar-base" style="width: ${getWidth(item.baseHours)}%;"></span>
                            </div>
                            <span class="tc-comparison-value">${formatChartHours(item.baseHours)}</span>
                        </div>
                        <div class="tc-comparison-bar-line">
                            <span class="tc-comparison-bar-label">After</span>
                            <div class="tc-comparison-track">
                                <span class="tc-comparison-bar tc-comparison-bar-after" style="width: ${getWidth(item.effectiveHours)}%;"></span>
                            </div>
                            <span class="tc-comparison-value">${formatChartHours(item.effectiveHours)}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderSavedItemsComparisonMatrix(items) {
    if (!DOM.tcSavedItemsMatrix) return;

    if (!items || items.length === 0) {
        DOM.tcSavedItemsMatrix.innerHTML = '<p class="loading-text">No saved items match these filters.</p>';
        return;
    }

    const selectableItems = items.map(item => ({
        id: String(item.id),
        name: item.name || 'Unnamed Item',
        cost: Number(item.cost) || 0
    }));
    const visibleIds = selectableItems.map(item => item.id);
    let selectedIds = (state.tcMatrixSelectedItemIds || []).filter(id => visibleIds.includes(id)).slice(0, 10);

    if (!state.tcMatrixSelectionInitialized && selectedIds.length === 0) {
        selectedIds = selectableItems.slice(0, 10).map(item => item.id);
        updateTcMatrixSelectedItemIds(selectedIds);
    }

    const selectedIdSet = new Set(selectedIds);
    const matrixItems = selectableItems.filter(item => selectedIdSet.has(item.id));
    const selectedCount = matrixItems.length;
    const capMessage = items.length > 10
        ? `<span class="tc-matrix-limit-note">Matrix limited to 10 selected items.</span>`
        : '';

    const formatMultiplier = (rowCost, columnCost) => {
        if (rowCost <= 0 || columnCost <= 0) return 'N/A';

        const multiplier = rowCost / columnCost;
        if (multiplier < 0.01) return '<0.01x';
        if (multiplier >= 1000) return `${Math.round(multiplier).toLocaleString('en-GB')}x`;
        if (multiplier >= 100) return `${multiplier.toFixed(0)}x`;
        if (multiplier >= 10) return `${multiplier.toFixed(1)}x`;
        return `${multiplier.toFixed(2).replace(/\.?0+$/, '')}x`;
    };

    const formatCellTitle = (rowItem, columnItem) => {
        if (rowItem.cost <= 0 || columnItem.cost <= 0) {
            return `${rowItem.name} cannot be compared with ${columnItem.name} because one item has no cost.`;
        }

        return `1 ${rowItem.name} equals ${formatMultiplier(rowItem.cost, columnItem.cost)} ${columnItem.name}`;
    };

    const matrixTableHtml = selectedCount < 2
        ? '<p class="loading-text">Select at least two items to compare them.</p>'
        : `
            <div class="tc-matrix-scroll" role="region" aria-label="Saved item multiplier comparison matrix" tabindex="0">
                <table class="tc-matrix-table">
                    <thead>
                        <tr>
                            <th class="tc-matrix-corner">
                                <span>1 item equals</span>
                                <strong>Compared with</strong>
                            </th>
                            ${matrixItems.map(item => `
                                <th scope="col" title="${escapeHtml(item.name)}">
                                    <span>${escapeHtml(item.name)}</span>
                                    <em>${state.currentCurrency}${item.cost.toFixed(2)}</em>
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${matrixItems.map(rowItem => `
                            <tr>
                                <th scope="row" title="${escapeHtml(rowItem.name)}">
                                    <span>${escapeHtml(rowItem.name)}</span>
                                    <em>${state.currentCurrency}${rowItem.cost.toFixed(2)}</em>
                                </th>
                                ${matrixItems.map(columnItem => {
                                    const isSameItem = rowItem === columnItem;
                                    const cellTitle = formatCellTitle(rowItem, columnItem);
                                    return `
                                        <td class="${isSameItem ? 'tc-matrix-self' : ''}" title="${escapeHtml(cellTitle)}">
                                            <strong>${formatMultiplier(rowItem.cost, columnItem.cost)}</strong>
                                        </td>
                                    `;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

    DOM.tcSavedItemsMatrix.innerHTML = `
        <div class="tc-matrix-selector">
            <div class="tc-matrix-selector-header">
                <strong>${selectedCount}/10 selected</strong>
                ${capMessage}
            </div>
            <div class="tc-matrix-option-grid" aria-label="Choose saved items for the comparison matrix">
                ${selectableItems.map(item => {
                    const isSelected = selectedIdSet.has(item.id);
                    const isDisabled = !isSelected && selectedCount >= 10;
                    return `
                        <label class="tc-matrix-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}">
                            <input type="checkbox" data-matrix-item-id="${escapeHtml(item.id)}" ${isSelected ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                            <span>
                                <strong>${escapeHtml(item.name)}</strong>
                                <em>${state.currentCurrency}${item.cost.toFixed(2)}</em>
                            </span>
                        </label>
                    `;
                }).join('')}
            </div>
        </div>
        ${matrixTableHtml}
    `;

    DOM.tcSavedItemsMatrix.querySelectorAll('[data-matrix-item-id]').forEach(input => {
        input.addEventListener('change', () => {
            const itemId = input.dataset.matrixItemId;
            const nextSelectedIds = new Set(selectedIds);

            if (input.checked) {
                if (nextSelectedIds.size >= 10) {
                    input.checked = false;
                    return;
                }
                nextSelectedIds.add(itemId);
            } else {
                nextSelectedIds.delete(itemId);
            }

            const nextIds = selectableItems
                .map(item => item.id)
                .filter(id => nextSelectedIds.has(id))
                .slice(0, 10);
            updateTcMatrixSelectedItemIds(nextIds);
            renderSavedTimeCostItems();
        });
    });
}

function getTimeScaleHours(scale, settings) {
    const daysInWeek = settings.workingDaysPerWeek;
    const daysInMonth = settings.workingDaysPerWeek * 4.345;

    switch (scale.unit) {
        case 'minutes':
            return scale.amount / 60;
        case 'hours':
            return scale.amount;
        case 'days':
            return scale.amount * settings.dailyHours;
        case 'weeks':
            return scale.amount * daysInWeek * settings.dailyHours;
        case 'months':
            return scale.amount * daysInMonth * settings.dailyHours;
        case 'years':
            return scale.amount * daysInMonth * 12 * settings.dailyHours;
        default:
            return scale.amount;
    }
}

function getTimeScaleWorkLabel(scale, settings) {
    const daysInWeek = settings.workingDaysPerWeek;
    const daysInMonth = settings.workingDaysPerWeek * 4.345;
    const amount = formatScaleAmount(scale.amount);
    const unit = getTimeScaleUnitLabel(scale.unit, scale.amount);

    if (scale.unit === 'days') {
        return `${amount} ${unit} (${formatScaleAmount(scale.amount * settings.dailyHours)}h)`;
    }
    if (scale.unit === 'weeks') {
        return `${amount} ${unit} (${formatScaleAmount(scale.amount * daysInWeek)}d)`;
    }
    if (scale.unit === 'months') {
        return `${amount} ${unit} (${formatScaleAmount(scale.amount * daysInMonth)}d)`;
    }
    if (scale.unit === 'years') {
        return `${amount} ${unit} (${formatScaleAmount(scale.amount * 12)}mo)`;
    }

    return `${amount} ${unit}`;
}

export function renderTcCutsSummary() {
    if (!DOM.tcCutsSummary) return;

    const { baseRate } = getTimeCostSettings();
    const { effectiveRate, totalCutPercentage } = getEffectiveHourlyRate(baseRate);

    DOM.tcCutsSummary.innerHTML = `Percentage Cuts: <span style="color: var(--accent-blue); font-weight: 700;">-${totalCutPercentage.toFixed(1)}%</span> (Effective Rate: <span style="color: var(--accent-green); font-weight: 700;">${state.currentCurrency}${effectiveRate.toFixed(2)}/h</span>)`;
}

export function renderTimeCostRateBreakdown() {
    if (!DOM.tcRateBreakdown) return;

    const settings = getTimeCostSettings();
    const { baseRate, dailyHours, workingDaysPerWeek } = settings;
    const { effectiveRate, totalCutPercentage } = getEffectiveHourlyRate(baseRate);
    const workingDaysPerMonth = workingDaysPerWeek * 4.345;
    const defaultScales = [
        { label: 'Per Minute', amount: 1, unit: 'minutes' },
        { label: 'Per Hour', amount: 1, unit: 'hours' },
        { label: `Per Day (${dailyHours.toFixed(1)}h)`, amount: 1, unit: 'days' },
        { label: `Per Week (${formatScaleAmount(workingDaysPerWeek)}d)`, amount: 1, unit: 'weeks' },
        { label: `Per Month (${formatScaleAmount(workingDaysPerMonth)}d)`, amount: 1, unit: 'months' },
        { label: 'Per Year (12mo)', amount: 1, unit: 'years' }
    ];
    const customScales = state.tcCustomTimeScales.map(scale => ({
        ...scale,
        label: `Custom: ${formatScaleAmount(scale.amount)} ${getTimeScaleUnitLabel(scale.unit, scale.amount)}`,
        custom: true
    }));

    const bodyRows = [...defaultScales, ...customScales].map(scale => {
        const hours = getTimeScaleHours(scale, settings);
        const beforeCuts = hours * baseRate;
        const afterCuts = hours * effectiveRate;
        const cutAmount = beforeCuts - afterCuts;

        return `
            <tr${scale.custom ? ' class="tc-custom-scale-row"' : ''}>
                <td>${scale.label}</td>
                <td class="tc-time">${getTimeScaleWorkLabel(scale, settings)}</td>
                <td class="tc-amount">${formatMoneyAmount(beforeCuts)}</td>
                <td class="tc-amount">${formatMoneyAmount(afterCuts)}</td>
                <td class="tc-time">-${totalCutPercentage.toFixed(1)}% (${formatMoneyAmount(cutAmount)})</td>
                <td class="tc-scale-actions">
                    ${scale.custom ? `<button class="cut-icon-btn cut-remove-btn tc-remove-scale-btn" type="button" data-scale-id="${scale.id}" title="Remove custom time amount">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>` : '<span class="tc-muted-action">Default</span>'}
                </td>
            </tr>
        `;
    }).join('');
    const earningTargets = [1, 10, 100, 1000, 10000];
    const targetRows = earningTargets.map(target => {
        const baseHours = baseRate > 0 ? target / baseRate : Infinity;
        const effectiveHours = effectiveRate > 0 ? target / effectiveRate : Infinity;
        const extraHours = effectiveHours - baseHours;
        const extraTimeLabel = !Number.isFinite(effectiveHours) && Number.isFinite(baseHours)
            ? '∞'
            : Number.isFinite(extraHours) && extraHours > 0
                ? `+${formatEarningTime(extraHours, settings)}`
                : 'No change';

        return `
            <tr>
                <td class="tc-amount">${formatTargetMoney(target)}</td>
                <td class="tc-time">${formatEarningTime(baseHours, settings)}</td>
                <td class="tc-time">${formatEarningTime(effectiveHours, settings)}</td>
                <td class="tc-time">${extraTimeLabel}</td>
            </tr>
        `;
    }).join('');

    DOM.tcRateBreakdown.innerHTML = `
        <h3 class="tc-section-title">Time Cost Breakdown</h3>
        <form class="tc-custom-scale-form" id="tc-custom-scale-form">
            <div class="tc-custom-scale-field">
                <label for="tc-custom-scale-amount">Custom Amount</label>
                <input type="number" id="tc-custom-scale-amount" min="0.01" step="0.01" placeholder="e.g. 90" required>
            </div>
            <div class="tc-custom-scale-field">
                <label for="tc-custom-scale-unit">Time Scale</label>
                <select id="tc-custom-scale-unit" class="currency-dropdown">
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                </select>
            </div>
            <button class="btn-outline btn-small" type="submit">Add</button>
        </form>
        <div class="tc-table-scroll">
            <table class="tc-breakdown-table">
                <thead>
                    <tr>
                        <th>Time Scale</th>
                        <th>Work Time</th>
                        <th>Before Cuts</th>
                        <th>After Cuts</th>
                        <th>Cut</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${bodyRows}
                </tbody>
            </table>
        </div>
        <div class="tc-target-breakdown">
            <h4 class="tc-subsection-title">Time to Make</h4>
            <div class="tc-table-scroll">
                <table class="tc-breakdown-table tc-target-table">
                    <thead>
                        <tr>
                            <th>Target</th>
                            <th>Before Cuts</th>
                            <th>After Cuts (-${totalCutPercentage.toFixed(1)}%)</th>
                            <th>Extra Time From Cuts</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${targetRows}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const customScaleForm = DOM.tcRateBreakdown.querySelector('#tc-custom-scale-form');
    const amountInput = DOM.tcRateBreakdown.querySelector('#tc-custom-scale-amount');
    const unitSelect = DOM.tcRateBreakdown.querySelector('#tc-custom-scale-unit');

    if (customScaleForm && amountInput && unitSelect) {
        customScaleForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const amount = parseFloat(amountInput.value);

            if (!Number.isFinite(amount) || amount <= 0) {
                amountInput.reportValidity();
                return;
            }

            updateTcCustomTimeScales([
                ...state.tcCustomTimeScales,
                createTcCustomTimeScale(amount, unitSelect.value)
            ]);
            renderTimeCostRateBreakdown();
        });
    }

    DOM.tcRateBreakdown.querySelectorAll('.tc-remove-scale-btn').forEach(button => {
        button.addEventListener('click', () => {
            const scaleId = button.dataset.scaleId;
            updateTcCustomTimeScales(state.tcCustomTimeScales.filter(scale => scale.id !== scaleId));
            renderTimeCostRateBreakdown();
        });
    });
}

export function renderTimeCostBreakdown() {
    renderTcCutsSummary();
    renderTimeCostRateBreakdown();
    if (!DOM.tcBreakdownContainer) return;

    const cost = parseFloat(DOM.tcItemCost ? DOM.tcItemCost.value : '') || 0;
    const { baseRate, dailyHours, workingDaysPerWeek } = getTimeCostSettings();
    const daysInWeek = workingDaysPerWeek;
    const daysInMonth = workingDaysPerWeek * 4.345;

    if (cost <= 0) {
        DOM.tcBreakdownContainer.innerHTML = '<p class="loading-text" style="margin-top: 20px;">Enter an item cost to see the breakdown.</p>';
        return;
    }

    const baseHours = baseRate > 0 ? cost / baseRate : Infinity;
    const { effectiveRate, totalCutPercentage } = getEffectiveHourlyRate(baseRate);
    const effectiveHours = effectiveRate > 0 ? cost / effectiveRate : Infinity;

    function formatDaysWeeksMonths(totalHours) {
        if (totalHours === Infinity) return { days: '∞', weeks: '∞', months: '∞' };
        
        const days = totalHours / dailyHours;
        const weeks = days / daysInWeek;
        const months = days / daysInMonth;

        return {
            days: days.toFixed(1),
            weeks: weeks.toFixed(1),
            months: months.toFixed(1)
        };
    }

    const baseTimeFormatted = formatDaysWeeksMonths(baseHours);
    const effectiveTimeFormatted = formatDaysWeeksMonths(effectiveHours);

    let html = `
        <table class="tc-breakdown-table">
            <thead>
                <tr>
                    <th>Scenario</th>
                    <th>Hourly Rate</th>
                    <th>Hours</th>
                    <th>Days</th>
                    <th>Weeks</th>
                    <th>Months</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Base Rate</td>
                    <td class="tc-amount"><span class="currency-symbol">${state.currentCurrency}</span>${baseRate.toFixed(2)}</td>
                    <td class="tc-time">${formatDuration(baseHours * 60 * 60 * 1000)}</td>
                    <td class="tc-time">${baseTimeFormatted.days}</td>
                    <td class="tc-time">${baseTimeFormatted.weeks} wks</td>
                    <td class="tc-time">${baseTimeFormatted.months} mos</td>
                </tr>
    `;

    if (state.percentageCuts.length > 0) {
        html += `
                <tr class="tc-total-row">
                    <td>After All Cuts (-${totalCutPercentage.toFixed(1)}%)</td>
                    <td class="tc-amount"><span class="currency-symbol">${state.currentCurrency}</span>${effectiveRate.toFixed(2)}</td>
                    <td class="tc-time">${effectiveHours === Infinity ? '∞' : formatDuration(effectiveHours * 60 * 60 * 1000)}</td>
                    <td class="tc-time">${effectiveTimeFormatted.days}</td>
                    <td class="tc-time">${effectiveTimeFormatted.weeks} wks</td>
                    <td class="tc-time">${effectiveTimeFormatted.months} mos</td>
                </tr>
        `;
    }

    html += `
            </tbody>
        </table>
    `;

    DOM.tcBreakdownContainer.innerHTML = html;
}

export function renderSavedTimeCostItems() {
    renderTcCutsSummary();
    renderTimeCostRateBreakdown();
    if (!DOM.tcSavedItemsContainer) return;

    if (!state.timeCostItems || state.timeCostItems.length === 0) {
        DOM.tcSavedItemsContainer.innerHTML = '<p class="loading-text">No saved items.</p>';
        renderSavedItemsComparisonChart([], 0, 0);
        renderSavedItemsComparisonMatrix([]);
        return;
    }

    const { baseRate, dailyHours, workingDaysPerWeek } = getTimeCostSettings();
    const daysInWeek = workingDaysPerWeek;
    const daysInMonth = workingDaysPerWeek * 4.345;
    const { effectiveRate, totalCutPercentage } = getEffectiveHourlyRate(baseRate);
    const filters = state.tcSavedItemFilters || {};
    const searchTerm = String(filters.search || '').trim().toLowerCase();
    const fromDate = filters.fromDate || '';
    const toDate = filters.toDate || '';
    const dateStatus = filters.dateStatus || 'all';
    const filteredItems = state.timeCostItems.filter(item => {
        const itemName = String(item.name || '').toLowerCase();
        const dateBought = item.dateBought || '';

        if (searchTerm && !itemName.includes(searchTerm)) return false;
        if (dateStatus === 'with-date' && !dateBought) return false;
        if (dateStatus === 'without-date' && dateBought) return false;
        if (fromDate && (!dateBought || dateBought < fromDate)) return false;
        if (toDate && (!dateBought || dateBought > toDate)) return false;

        return true;
    });

    if (filteredItems.length === 0) {
        DOM.tcSavedItemsContainer.innerHTML = '<p class="loading-text">No saved items match these filters.</p>';
        renderSavedItemsComparisonChart([], baseRate, effectiveRate);
        renderSavedItemsComparisonMatrix([]);
        return;
    }

    renderSavedItemsComparisonChart(filteredItems, baseRate, effectiveRate);
    renderSavedItemsComparisonMatrix(filteredItems);

    let html = `
        <div style="overflow-x: auto; width: 100%;">
            <table class="tc-breakdown-table" style="min-width: 1060px;">
                <thead>
                    <tr>
                        <th rowspan="2" class="tc-sticky-col" style="vertical-align: middle;">Item Name</th>
                        <th rowspan="2" style="vertical-align: middle;">Cost</th>
                        <th rowspan="2" style="vertical-align: middle;">Date Bought</th>
                        <th colspan="4" style="text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 6px;">Base Time</th>
                        <th colspan="4" style="text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 6px;">After Cuts Time (-${totalCutPercentage.toFixed(1)}%)</th>
                        <th rowspan="2" style="vertical-align: middle; text-align: center;">Actions</th>
                    </tr>
                    <tr>
                        <th style="font-size: 0.8rem; padding: 6px 10px;">Hours</th>
                        <th style="font-size: 0.8rem; padding: 6px 10px;">Days</th>
                        <th style="font-size: 0.8rem; padding: 6px 10px;">Weeks</th>
                        <th style="font-size: 0.8rem; padding: 6px 10px;">Months</th>
                        <th style="font-size: 0.8rem; padding: 6px 10px;">Hours</th>
                        <th style="font-size: 0.8rem; padding: 6px 10px;">Days</th>
                        <th style="font-size: 0.8rem; padding: 6px 10px;">Weeks</th>
                        <th style="font-size: 0.8rem; padding: 6px 10px;">Months</th>
                    </tr>
                </thead>
                <tbody>
    `;

    filteredItems.forEach(item => {
        const cost = Number(item.cost) || 0;
        const itemName = item.name || 'Unnamed Item';
        const escapedItemName = escapeHtml(itemName);
        const dateBought = item.dateBought || '';
        const baseHours = baseRate > 0 ? cost / baseRate : Infinity;
        const effectiveHours = effectiveRate > 0 ? cost / effectiveRate : Infinity;

        // Base time components
        const baseDays = baseHours / dailyHours;
        const baseWeeks = baseDays / daysInWeek;
        const baseMonths = baseDays / daysInMonth;

        // Effective time components
        const effectiveDays = effectiveHours / dailyHours;
        const effectiveWeeks = effectiveDays / daysInWeek;
        const effectiveMonths = effectiveDays / daysInMonth;

        const baseHoursStr = baseHours === Infinity ? '∞' : `${baseHours.toFixed(1)}h`;
        const baseDaysStr = baseHours === Infinity ? '∞' : `${baseDays.toFixed(1)}d`;
        const baseWeeksStr = baseHours === Infinity ? '∞' : `${baseWeeks.toFixed(1)}w`;
        const baseMonthsStr = baseHours === Infinity ? '∞' : `${baseMonths.toFixed(1)}m`;

        const effectiveHoursStr = effectiveHours === Infinity ? '∞' : `${effectiveHours.toFixed(1)}h`;
        const effectiveDaysStr = effectiveHours === Infinity ? '∞' : `${effectiveDays.toFixed(1)}d`;
        const effectiveWeeksStr = effectiveHours === Infinity ? '∞' : `${effectiveWeeks.toFixed(1)}w`;
        const effectiveMonthsStr = effectiveHours === Infinity ? '∞' : `${effectiveMonths.toFixed(1)}m`;

        html += `
                <tr>
                    <td class="tc-sticky-col" style="font-weight: 600; white-space: nowrap;">${escapedItemName}</td>
                    <td class="tc-amount">
                        ${state.currentCurrency}${cost.toFixed(2)}
                    </td>
                    <td class="tc-date-bought-display">${dateBought ? escapeHtml(new Date(`${dateBought}T00:00:00`).toLocaleDateString()) : '<span class="tc-muted-action">Not set</span>'}</td>
                    <td class="tc-time" style="color: var(--text-primary); font-size: 0.95rem;">${baseHoursStr}</td>
                    <td class="tc-time" style="color: var(--text-primary); font-size: 0.95rem;">${baseDaysStr}</td>
                    <td class="tc-time" style="color: var(--text-primary); font-size: 0.95rem;">${baseWeeksStr}</td>
                    <td class="tc-time" style="color: var(--text-primary); font-size: 0.95rem;">${baseMonthsStr}</td>
                    <td class="tc-time" style="font-size: 0.95rem;">${effectiveHoursStr}</td>
                    <td class="tc-time" style="font-size: 0.95rem;">${effectiveDaysStr}</td>
                    <td class="tc-time" style="font-size: 0.95rem;">${effectiveWeeksStr}</td>
                    <td class="tc-time" style="font-size: 0.95rem;">${effectiveMonthsStr}</td>
                    <td style="text-align: center;">
                        <button class="btn-edit tc-edit-btn" data-id="${escapeHtml(item.id)}" title="Edit Item" style="background: transparent; border: none; cursor: pointer; color: var(--text-secondary);">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="btn-delete tc-delete-btn" data-id="${item.id}" title="Delete Item" style="background: transparent; border: none; cursor: pointer; color: var(--text-secondary);">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                    </td>
                </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    DOM.tcSavedItemsContainer.innerHTML = html;

    const editBtns = DOM.tcSavedItemsContainer.querySelectorAll('.tc-edit-btn');
    editBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const item = state.timeCostItems.find(x => x.id === btn.dataset.id);
            if (!item || !DOM.tcItemModal) return;

            DOM.editTcItemId.value = item.id;
            DOM.editTcItemName.value = item.name || '';
            DOM.editTcItemCost.value = Number(item.cost || 0).toFixed(2);
            DOM.editTcItemDateBought.value = item.dateBought || '';
            DOM.tcItemModal.classList.remove('hidden');
        });
    });

    const deleteBtns = DOM.tcSavedItemsContainer.querySelectorAll('.tc-delete-btn');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const itemId = btn.dataset.id;
            const itemObj = state.timeCostItems.find(x => x.id === itemId);
            const itemName = itemObj ? itemObj.name || 'Unnamed Item' : 'this item';
            const displayName = itemName ? `"${itemName}"` : 'this item';

            const confirmed = await showConfirm(
                "Delete Saved Item",
                `Are you sure you want to delete ${displayName}?`
            );
            if (confirmed) {
                import('./api.js').then(module => module.deleteTimeCostItem(itemId));
            }
        });
    });
}
