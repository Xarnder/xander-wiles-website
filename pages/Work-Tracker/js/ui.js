import { createPercentageCut, createTcCustomTimeScale, state, updateTcCustomTimeScales, updateTcMatrixSelectedItemIds, updateCsvExportCompany, updateWorkSchedule } from './state.js';
import { formatDuration, getStartOfWeekDate, getSessionTimeRange, getMonthlyStatsConfig, getCustomStatsPeriodConfig, calculateRollingPeriodTotals, formatStatsPeriodUnit, computeWorkPatternAnalytics, formatAverageClockTime, formatClockTimeFromMs, formatWorkPatternDay, getEffectiveSessionMetrics, getEffectiveSessionOverlapMs, getBreakOverlapMs, getCalendarDateKey, formatRelativeSessionAge, CSV_UNASSIGNED_COMPANY, accumulateDailySessionHours, accumulateDailyBreakHours, forEachSessionDaySegment, formatClockDuration, isSameDateTimeLocalMinute } from './utils.js';
import {
    accumulateDailyPayEarnings,
    collectAssumedWorkSegments,
    combinePayAndSessionEarnings,
    formatDateKey,
    formatPayRate,
    getAssumedLivePaySession,
    getCombinedEquivalentHourlyRate,
    getCurrentPayUnitProgress,
    getEquivalentHourlyRate,
    getPayPeriodDateLabel,
    getPayPeriodDisplayName,
    getWorkSettingsFromState,
    isPayPeriodActive,
    isSessionCoveredByPay,
    PAY_SCALES,
    payPeriodCoversDay,
    parseDateKey,
    sanitizePayPeriod,
    sumCurrentUnitAccrued,
    summarizePaySessionOverlaps
} from './payPeriods.js';
import { computeSavingPotStateFromAppState, getItemSavedAmount, roundMoney, MONEY_EPSILON } from './savingPots.js';
import {
    BATCH_DELETE_CONFIRM_PHRASE,
    BATCH_DELETE_RANGE_MODES,
    currentYearMonthValue,
    describeBatchDeleteSelection,
    monthBoundsFromValue,
    resolveBatchDeleteRange,
    selectEntriesForBatchDelete
} from './batchDelete.js';
import {
    BUDGET_MAX_DIVISIONS,
    BUDGET_MIN_PERCENT,
    canAddDivision,
    computeAmounts,
    describeBoundary,
    describeSlicePath,
    getBoundaryPercents,
    getDivisionColor,
    getSliceMidAngle,
    percentsToAngles,
    percentToAngle,
    angleToPoint,
    sanitizeBudgetSnapMode
} from './budgeting.js';
import {
    WEEKDAY_LABELS,
    formatScheduleSummary,
    getScheduleDayHours,
    orderedWeekdayIndexes,
    sanitizeWorkSchedule
} from './workSchedule.js';

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
    timerStartDurationPreview: document.getElementById('timer-start-duration-preview'),
    timerPreviewBanner: document.getElementById('timer-preview-banner'),
    timerPreviewIndicator: document.getElementById('timer-preview-indicator'),
    timerWidget: document.getElementById('widget-timer'),
    timerInputContainer: document.getElementById('timer-input-container'),
    timerLiveMeta: document.getElementById('timer-live-meta'),
    moneyCounterWidget: document.getElementById('widget-money-counter'),
    moneyCounterStatus: document.getElementById('money-counter-status'),
    moneyCounterTotal: document.getElementById('money-counter-total'),
    moneyCounterTime: document.getElementById('money-counter-time'),
    moneyCounterModeLabel: document.getElementById('money-counter-mode-label'),
    moneyCounterPayHint: document.getElementById('money-counter-pay-hint'),
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
    chartPayHint: document.getElementById('chart-pay-hint'),
    chartPayLegend: document.getElementById('chart-pay-legend'),
    prevTimelineWeekBtn: document.getElementById('prev-timeline-week'),
    nextTimelineWeekBtn: document.getElementById('next-timeline-week'),
    timelineWeekRange: document.getElementById('timeline-week-range'),
    timelinePayHint: document.getElementById('timeline-pay-hint'),
    timelinePayLegend: document.getElementById('timeline-pay-legend'),
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
    settingsTabButtons: document.querySelectorAll('.settings-tab-btn'),
    settingsTabPreferences: document.getElementById('settings-tab-preferences'),
    settingsTabBatchEdit: document.getElementById('settings-tab-batch-edit'),
    settingsPanelPreferences: document.getElementById('settings-panel-preferences'),
    settingsPanelBatchEdit: document.getElementById('settings-panel-batch-edit'),
    settingsSaveFooter: document.getElementById('settings-save-footer'),
    batchDeleteRangeModeButtons: document.querySelectorAll('[data-batch-delete-range-mode]'),
    batchDeleteMonthFields: document.getElementById('batch-delete-month-fields'),
    batchDeleteMonth: document.getElementById('batch-delete-month'),
    batchDeleteCustomFields: document.getElementById('batch-delete-custom-fields'),
    batchDeleteFrom: document.getElementById('batch-delete-from'),
    batchDeleteTo: document.getElementById('batch-delete-to'),
    batchDeleteSessions: document.getElementById('batch-delete-sessions'),
    batchDeleteBreaks: document.getElementById('batch-delete-breaks'),
    batchDeletePreview: document.getElementById('batch-delete-preview'),
    batchDeleteOpenBtn: document.getElementById('batch-delete-open-btn'),
    batchDeleteModal: document.getElementById('batch-delete-modal'),
    batchDeleteModalMessage: document.getElementById('batch-delete-modal-message'),
    batchDeleteConfirmInput: document.getElementById('batch-delete-confirm-input'),
    batchDeleteConfirmBtn: document.getElementById('batch-delete-confirm-btn'),
    batchDeleteCancelBtn: document.getElementById('batch-delete-cancel-btn'),
    closeBatchDeleteModalBtn: document.getElementById('close-batch-delete-modal'),
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
    addPayPeriodBtn: document.getElementById('add-pay-period-btn'),
    payWidgetSummary: document.getElementById('pay-widget-summary'),
    payPeriodList: document.getElementById('pay-period-list'),
    workScheduleWidget: document.getElementById('widget-work-schedule'),
    workScheduleList: document.getElementById('work-schedule-list'),
    workScheduleSummary: document.getElementById('work-schedule-summary'),
    payOverlapWidget: document.getElementById('widget-pay-overlap'),
    payOverlapCountBadge: document.getElementById('pay-overlap-count-badge'),
    payOverlapHeadline: document.getElementById('pay-overlap-headline'),
    payOverlapCopy: document.getElementById('pay-overlap-copy'),
    payOverlapBatchBtn: document.getElementById('pay-overlap-batch-btn'),
    payPeriodModal: document.getElementById('pay-period-modal'),
    payPeriodModalTitle: document.getElementById('pay-period-modal-title'),
    closePayPeriodModalBtn: document.getElementById('close-pay-period-modal'),
    editPayPeriodId: document.getElementById('edit-pay-period-id'),
    payPeriodAmount: document.getElementById('pay-period-amount'),
    payPeriodScale: document.getElementById('pay-period-scale'),
    payPeriodName: document.getElementById('pay-period-name'),
    payPeriodStart: document.getElementById('pay-period-start'),
    payPeriodEnd: document.getElementById('pay-period-end'),
    payPeriodCompany: document.getElementById('pay-period-company'),
    payPeriodCompanySelect: document.getElementById('pay-period-company-select'),
    payPeriodPreview: document.getElementById('pay-period-preview'),
    payPeriodSyncTc: document.getElementById('pay-period-sync-tc'),
    savePayPeriodBtn: document.getElementById('save-pay-period-btn'),
    deletePayPeriodBtn: document.getElementById('delete-pay-period-btn'),
    sessionModal: document.getElementById('session-modal'),
    sessionModalTitle: document.getElementById('session-modal-title'),
    closeSessionModalBtn: document.getElementById('close-session-modal'),
    editSessionId: document.getElementById('edit-session-id'),
    sessionStart: document.getElementById('session-start'),
    sessionEnd: document.getElementById('session-end'),
    sessionDurationPreview: document.getElementById('session-duration-preview'),
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
    breakElapsedPreview: document.getElementById('break-elapsed-preview'),
    breakDurationPreview: document.getElementById('break-duration-preview'),
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
    tcPayDerivedHint: document.getElementById('tc-pay-derived-hint'),
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
    saveTcItemBtn: document.getElementById('save-tc-item-btn'),
    tcSavingPotsSummary: document.getElementById('tc-saving-pots-summary'),
    spActionModal: document.getElementById('sp-action-modal'),
    spActionModalTitle: document.getElementById('sp-action-modal-title'),
    closeSpActionModalBtn: document.getElementById('close-sp-action-modal'),
    spActionItemId: document.getElementById('sp-action-item-id'),
    spActionMax: document.getElementById('sp-action-max'),
    spActionItemLabel: document.getElementById('sp-action-item-label'),
    spActionHint: document.getElementById('sp-action-hint'),
    spPartialControls: document.getElementById('sp-partial-controls'),
    spActionSlider: document.getElementById('sp-action-slider'),
    spPartialAmountDisplay: document.getElementById('sp-partial-amount-display'),
    spPartialMaxLabel: document.getElementById('sp-partial-max-label'),
    spActionAmount: document.getElementById('sp-action-amount'),
    saveSpActionBtn: document.getElementById('save-sp-action-btn'),
    savingPotsWidget: document.getElementById('widget-saving-pots'),
    spWidgetContent: document.getElementById('sp-widget-content'),
    spWidgetScopeLabel: document.getElementById('sp-widget-scope-label'),

    viewBudgetingBtn: document.getElementById('view-budgeting-btn'),
    budgetingView: document.getElementById('budgeting-view'),
    budgetTotalInput: document.getElementById('budget-total-input'),
    budgetPieHost: document.getElementById('budget-pie-host'),
    budgetPieHint: document.getElementById('budget-pie-hint'),
    budgetSnapModes: document.querySelector('.budget-snap-modes'),
    budgetSnapModeButtons: document.querySelectorAll('.budget-snap-mode-btn'),
    budgetBarChart: document.getElementById('budget-bar-chart'),
    budgetDivisionList: document.getElementById('budget-division-list'),
    budgetAddDivisionBtn: document.getElementById('budget-add-division-btn'),
    budgetEqualizeBtn: document.getElementById('budget-equalize-btn'),
    budgetExportFormats: document.querySelector('.budget-export-formats'),
    budgetExportFormatButtons: document.querySelectorAll('.budget-export-format-btn'),
    budgetExportBtn: document.getElementById('budget-export-btn'),
    budgetSumNote: document.getElementById('budget-sum-note')
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

export function getBatchDeleteFormState() {
    const activeModeBtn = [...(DOM.batchDeleteRangeModeButtons || [])]
        .find((button) => button.classList.contains('active'));
    const mode = activeModeBtn?.dataset.batchDeleteRangeMode === BATCH_DELETE_RANGE_MODES.CUSTOM
        ? BATCH_DELETE_RANGE_MODES.CUSTOM
        : BATCH_DELETE_RANGE_MODES.MONTH;

    return {
        mode,
        monthValue: DOM.batchDeleteMonth?.value || '',
        fromDate: DOM.batchDeleteFrom?.value || '',
        toDate: DOM.batchDeleteTo?.value || '',
        includeSessions: Boolean(DOM.batchDeleteSessions?.checked),
        includeBreaks: Boolean(DOM.batchDeleteBreaks?.checked)
    };
}

export function setSettingsTab(tab = 'preferences') {
    const isBatchEdit = tab === 'batch-edit';

    DOM.settingsTabButtons?.forEach((button) => {
        const active = button.dataset.settingsTab === tab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    DOM.settingsPanelPreferences?.classList.toggle('hidden', isBatchEdit);
    DOM.settingsPanelBatchEdit?.classList.toggle('hidden', !isBatchEdit);
    DOM.settingsView?.classList.toggle('settings-tab-batch-edit', isBatchEdit);
}

export function setBatchDeleteRangeMode(mode = BATCH_DELETE_RANGE_MODES.MONTH) {
    const isCustom = mode === BATCH_DELETE_RANGE_MODES.CUSTOM;

    DOM.batchDeleteRangeModeButtons?.forEach((button) => {
        button.classList.toggle('active', button.dataset.batchDeleteRangeMode === mode);
    });
    DOM.batchDeleteMonthFields?.classList.toggle('hidden', isCustom);
    DOM.batchDeleteCustomFields?.classList.toggle('hidden', !isCustom);

    if (isCustom && DOM.batchDeleteFrom && DOM.batchDeleteTo && !DOM.batchDeleteFrom.value && !DOM.batchDeleteTo.value) {
        const bounds = monthBoundsFromValue(DOM.batchDeleteMonth?.value || currentYearMonthValue());
        if (bounds) {
            DOM.batchDeleteFrom.value = bounds.fromDate;
            DOM.batchDeleteTo.value = bounds.toDate;
        }
    }

    updateBatchDeletePreview();
}

export function initBatchDeleteForm() {
    if (DOM.batchDeleteMonth && !DOM.batchDeleteMonth.value) {
        DOM.batchDeleteMonth.value = currentYearMonthValue();
    }
    setBatchDeleteRangeMode(getBatchDeleteFormState().mode);
}

export function updateBatchDeletePreview() {
    const form = getBatchDeleteFormState();
    const range = resolveBatchDeleteRange(form);
    const selection = selectEntriesForBatchDelete({
        sessions: state.rawSessions,
        breaks: state.rawBreaks,
        includeSessions: form.includeSessions,
        includeBreaks: form.includeBreaks,
        range
    });
    const description = describeBatchDeleteSelection(selection, range, {
        includeSessions: form.includeSessions,
        includeBreaks: form.includeBreaks
    });

    if (DOM.batchDeletePreview) {
        DOM.batchDeletePreview.textContent = description.text;
    }
    if (DOM.batchDeleteOpenBtn) {
        DOM.batchDeleteOpenBtn.disabled = !description.canDelete;
    }

    return { form, range, selection, description };
}

export function syncBatchDeleteConfirmInput() {
    const matches = String(DOM.batchDeleteConfirmInput?.value || '').trim() === BATCH_DELETE_CONFIRM_PHRASE;
    if (DOM.batchDeleteConfirmBtn) {
        DOM.batchDeleteConfirmBtn.disabled = !matches;
    }
    return matches;
}

export function openBatchDeleteConfirmModal(message) {
    if (!DOM.batchDeleteModal) return;

    if (DOM.batchDeleteModalMessage) {
        DOM.batchDeleteModalMessage.textContent = message || '';
    }
    if (DOM.batchDeleteConfirmInput) {
        DOM.batchDeleteConfirmInput.value = '';
    }
    if (DOM.batchDeleteConfirmBtn) {
        DOM.batchDeleteConfirmBtn.textContent = 'Delete entries';
        DOM.batchDeleteConfirmBtn.disabled = true;
    }
    DOM.batchDeleteModal.classList.remove('hidden');
    DOM.batchDeleteConfirmInput?.focus();
}

export function closeBatchDeleteConfirmModal() {
    DOM.batchDeleteModal?.classList.add('hidden');
    if (DOM.batchDeleteConfirmInput) {
        DOM.batchDeleteConfirmInput.value = '';
    }
    if (DOM.batchDeleteConfirmBtn) {
        DOM.batchDeleteConfirmBtn.textContent = 'Delete entries';
        DOM.batchDeleteConfirmBtn.disabled = true;
    }
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
        renderLiveMoneyCounter(0, hasActivePayAccrual());
    }

    if (DOM.budgetingView && !DOM.budgetingView.classList.contains('hidden')) {
        renderBudgetingView();
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

function getPayWorkOptions() {
    return getWorkSettingsFromState(state);
}

function getVisiblePayPeriods() {
    return Array.isArray(state.allPayPeriods) ? state.allPayPeriods : [];
}

function getPayAwareLiveSession() {
    if (!state.startTime) return null;
    const elapsedMs = Date.now() - state.startTime;
    return {
        startTime: state.startTime,
        endTime: Date.now(),
        durationMs: elapsedMs,
        company: state.currentCompany,
        project: state.currentProject,
        earnings: (elapsedMs / (1000 * 60 * 60)) * (state.currentSessionRate || 0)
    };
}

function getAssumedWorkForRange(rangeStart, rangeEnd, extra = {}) {
    const live = getPayAwareLiveSession();
    const sessions = live ? [...state.allSessions, live] : state.allSessions;
    return collectAssumedWorkSegments(getVisiblePayPeriods(), rangeStart, rangeEnd, {
        sessions,
        breaks: state.allBreaks,
        ...getPayWorkOptions(),
        includeFuture: Boolean(extra.includeFuture),
        now: extra.now instanceof Date ? extra.now : new Date()
    });
}

function getPayScheduleHint() {
    const periods = getVisiblePayPeriods();
    if (!periods.length) return '';
    return `Green is accrued pay already in totals. Purple is scheduled future pay and is not counted yet. Blocks follow Work Schedule (${formatScheduleSummary(state.workSchedule)}). Logged sessions replace that day's pay block.`;
}

function getPayAccrualSnapshot(now = new Date()) {
    const periods = getVisiblePayPeriods();
    const activePeriods = periods.filter((period) => isPayPeriodActive(period, now));
    const accrued = sumCurrentUnitAccrued(periods, now, getPayWorkOptions());
    const contracted = activePeriods.reduce((sum, period) => (
        sum + getCurrentPayUnitProgress(period, now, getPayWorkOptions()).contracted
    ), 0);
    const remaining = Math.max(0, contracted - accrued);
    const hourly = getCombinedEquivalentHourlyRate(periods, now, getPayWorkOptions());
    const afterCuts = getAmountAfterPercentageCuts(accrued);
    const label = activePeriods[0]
        ? getCurrentPayUnitProgress(activePeriods[0], now, getPayWorkOptions()).label
        : 'Pay';
    const accruedPct = contracted > 0 ? Math.min(100, (accrued / contracted) * 100) : 0;
    const remainingPct = contracted > 0 ? Math.max(0, 100 - accruedPct) : 0;
    return {
        periods,
        activePeriods,
        accrued,
        contracted,
        remaining,
        hourly,
        afterCuts,
        label,
        accruedPct,
        remainingPct
    };
}

function renderPayStatusLegend(el, options = {}) {
    if (!el) return;
    const hasPay = getVisiblePayPeriods().length > 0;
    const includeLogged = options.includeLogged !== false;
    const items = [];
    if (includeLogged) {
        items.push(`
        <li class="pay-status-legend-item">
            <span class="pay-status-swatch pay-status-swatch-logged" aria-hidden="true"></span>
            <span class="pay-status-legend-copy"><strong>Logged</strong><small>Completed hours in totals</small></span>
        </li>`);
    }
    if (hasPay) {
        items.push(`
        <li class="pay-status-legend-item">
            <span class="pay-status-swatch pay-status-swatch-accrued" aria-hidden="true"></span>
            <span class="pay-status-legend-copy"><strong>Accrued pay</strong><small>Already in money totals</small></span>
        </li>
        <li class="pay-status-legend-item">
            <span class="pay-status-swatch pay-status-swatch-scheduled" aria-hidden="true"></span>
            <span class="pay-status-legend-copy"><strong>Scheduled pay</strong><small>Future, not counted yet</small></span>
        </li>`);
    }
    el.innerHTML = items.join('');
    el.classList.toggle('pay-status-legend-pay', hasPay);
    el.hidden = items.length === 0;
}

function hasActivePayAccrual(now = new Date()) {
    return getVisiblePayPeriods().some((period) => isPayPeriodActive(period, now));
}

function getSessionLiveEarnings() {
    if (!state.startTime) return 0;
    return ((Date.now() - state.startTime) / (1000 * 60 * 60)) * (state.currentSessionRate || 0);
}

function formatClockTime(dateMs) {
    if (!Number.isFinite(dateMs)) return '';
    return new Date(dateMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getLiveMoneyCounterState(sessionEarned = 0, now = new Date()) {
    const periods = getVisiblePayPeriods();
    const assumed = getAssumedLivePaySession(periods, now, getPayWorkOptions());
    const live = getPayAwareLiveSession();
    const extraSession = live && isSessionCoveredByPay(live, periods)
        ? 0
        : Math.max(Number(sessionEarned) || 0, 0);
    const timerRunning = Boolean(live);
    const useTimerClock = timerRunning && extraSession > 0;
    return {
        assumed,
        earnings: extraSession + (assumed ? assumed.earnings : 0),
        elapsedMs: useTimerClock
            ? live.durationMs
            : (assumed ? assumed.elapsedMs : (timerRunning ? live.durationMs : 0)),
        isLive: timerRunning || Boolean(assumed?.isLive)
    };
}

export function renderLiveMoneyCounter(earned = 0, isRunning = Boolean(state.startTime)) {
    if (!DOM.moneyCounterWidget) return;

    const now = new Date();
    const timerRunning = Boolean(isRunning && state.startTime);
    const counter = getLiveMoneyCounterState(timerRunning ? earned : 0, now);
    const isLive = counter.isLive;
    const beforeCutsEarned = counter.earnings;
    const displayEarned = state.moneyCounterMode === 'after'
        ? getAmountAfterPercentageCuts(beforeCutsEarned)
        : beforeCutsEarned;
    const pennies = Math.floor(displayEarned * 100);
    const noteCount = Math.floor(pennies / 1000);
    const remainingAfterNotes = pennies % 1000;
    const poundCount = Math.floor(remainingAfterNotes / 100);
    const twentyPCount = Math.floor((remainingAfterNotes % 100) / 20);

    DOM.moneyCounterWidget.classList.toggle('money-counter-active', isLive);

    if (DOM.moneyCounterStatus) {
        DOM.moneyCounterStatus.textContent = isLive ? 'Live' : 'Idle';
    }

    if (DOM.moneyCounterTotal) {
        DOM.moneyCounterTotal.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>${displayEarned.toFixed(2)}`;
    }

    if (DOM.moneyCounterTime) {
        DOM.moneyCounterTime.textContent = formatClockDuration(counter.elapsedMs);
    }

    if (DOM.moneyCounterModeLabel) {
        DOM.moneyCounterModeLabel.textContent = state.moneyCounterMode === 'after'
            ? 'After percentage cuts'
            : 'Before percentage cuts';
    }

    if (DOM.moneyCounterPayHint) {
        const assumed = counter.assumed;
        const hasPay = getVisiblePayPeriods().length > 0;
        if (assumed) {
            const windowLabel = `${formatClockTime(assumed.startTime)}–${formatClockTime(assumed.endTime)}`;
            DOM.moneyCounterPayHint.textContent = assumed.isLive
                ? `Counting today's scheduled ${windowLabel} session, not the whole month. Uncovered live sessions add on top.`
                : (assumed.isComplete
                    ? `Today's scheduled ${windowLabel} session has finished. Uncovered live sessions still add on top.`
                    : `Today's scheduled session is ${windowLabel}. The counter starts at the start time.`);
            DOM.moneyCounterPayHint.classList.remove('hidden');
        } else if (hasPay) {
            DOM.moneyCounterPayHint.textContent = 'No scheduled session today. Uncovered live sessions still count here.';
            DOM.moneyCounterPayHint.classList.remove('hidden');
        } else {
            DOM.moneyCounterPayHint.textContent = '';
            DOM.moneyCounterPayHint.classList.add('hidden');
        }
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

    renderLiveMoneyCounter(getSessionLiveEarnings(), Boolean(state.startTime) || hasActivePayAccrual());
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
        const { totalMs, totalGrossMs, totalBreakMs } = calculateRollingPeriodTotals(
            state.allSessions,
            config.start,
            config.end,
            state.allBreaks
        );
        const combinedEarnings = combinePayAndSessionEarnings(
            state.allSessions,
            state.allBreaks,
            getVisiblePayPeriods(),
            config.start,
            config.end,
            now,
            getPayWorkOptions()
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
        renderStatEarningsDisplay(earningsValue, combinedEarnings);

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
            company: state.currentCompany,
            project: state.currentProject,
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
    (state.rawPayPeriods || []).forEach((period) => {
        const company = String(period.company || '').trim();
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
    const payPeriods = getVisiblePayPeriods();
    const sessions = getAnalyticsSessions().map((session) => (
        isSessionCoveredByPay(session, payPeriods) ? { ...session, earnings: 0 } : session
    ));
    const assumed = getAssumedWorkForRange(monthlyConfig.start, monthlyConfig.end);
    const analytics = computeWorkPatternAnalytics(
        [...sessions, ...assumed],
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

    const combinedEarnings = combinePayAndSessionEarnings(
        getAnalyticsSessions(),
        state.allBreaks,
        payPeriods,
        monthlyConfig.start,
        monthlyConfig.end,
        new Date(),
        getPayWorkOptions()
    );
    const windowDays = Math.max(
        ((monthlyConfig.end?.getTime?.() || Date.now()) - (monthlyConfig.start?.getTime?.() || Date.now())) / 86400000,
        1
    );
    const avgBefore = combinedEarnings > 0
        ? combinedEarnings / (analytics.daysWorked > 0 ? analytics.daysWorked : windowDays)
        : analytics.avgEarningsBefore;
    const avgAfter = Number.isFinite(avgBefore) ? getAmountAfterPercentageCuts(avgBefore) : null;

    if (DOM.workPatternAvgEarningsBefore) {
        DOM.workPatternAvgEarningsBefore.textContent = formatAverageEarnings(avgBefore);
    }

    if (DOM.workPatternAvgEarningsAfter) {
        DOM.workPatternAvgEarningsAfter.textContent = formatAverageEarnings(avgAfter);
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
    const payAwareLive = hasActivePayAccrual();
    const moneyCounterLive = Boolean(getAssumedLivePaySession(getVisiblePayPeriods(), new Date(), getPayWorkOptions())?.isLive);
    document.querySelectorAll('.live-indicator').forEach((indicator) => {
        if (indicator.closest('#widget-money-counter')) {
            indicator.classList.toggle('hidden', !(isLive || moneyCounterLive));
            return;
        }
        const keepForPay = indicator.classList.contains('pay-aware-live') && payAwareLive;
        indicator.classList.toggle('hidden', !(isLive || keepForPay));
    });
}

function hideTimeRangePreview(element) {
    if (!element) return;
    element.textContent = '';
    element.classList.add('hidden');
}

function getDateTimeRangeDurationMs(startValue, endValue) {
    if (!startValue || !endValue) return null;

    const startMs = new Date(startValue).getTime();
    const endMs = new Date(endValue).getTime();

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return null;
    }

    return endMs - startMs;
}

let timerStartPreviewInterval = null;
let breakElapsedPreviewInterval = null;

function clearTimerStartPreviewInterval() {
    if (timerStartPreviewInterval) {
        clearInterval(timerStartPreviewInterval);
        timerStartPreviewInterval = null;
    }
}

function clearBreakElapsedPreviewInterval() {
    if (breakElapsedPreviewInterval) {
        clearInterval(breakElapsedPreviewInterval);
        breakElapsedPreviewInterval = null;
    }
}

function setTimerPendingPreviewState(isActive) {
    DOM.timerWidget?.classList.toggle('timer-widget-pending', isActive);
    DOM.timerPreviewBanner?.classList.toggle('hidden', !isActive);
    DOM.timerPreviewIndicator?.classList.toggle('hidden', !isActive);
    DOM.liveEarningsDisplay?.classList.toggle('is-preview', isActive);
}

function resetTimerWidgetIdleState() {
    if (!DOM.timerDisplay || state.startTime) return;

    setTimerPendingPreviewState(false);
    DOM.timerDisplay.textContent = '00:00:00';
    DOM.liveEarningsDisplay.innerHTML = `
        <span class="before-cut">Before: <span class="currency-symbol">${state.currentCurrency}</span>0.00</span>
        <span class="cut-divider">|</span>
        <span class="after-cut">After: <span class="currency-symbol">${state.currentCurrency}</span>0.00</span>
    `;
    updateShiftRemainingDisplay(0);
    document.title = 'Work Tracker';
}

function renderTimerWidgetPendingPreview(elapsedMs) {
    if (!DOM.timerDisplay || state.startTime) return;

    setTimerPendingPreviewState(true);
    DOM.timerDisplay.textContent = formatClockDuration(elapsedMs);

    const rate = parseFloat(DOM.hourlyRateInput?.value);
    const hourlyRate = Number.isFinite(rate) ? rate : 0;
    const hoursFloat = elapsedMs / (1000 * 60 * 60);
    const earned = hoursFloat * hourlyRate;
    const afterCuts = getAmountAfterPercentageCuts(earned);

    DOM.liveEarningsDisplay.innerHTML = `
        <span class="timer-preview-earnings-note">Preview if started now</span>
        <span class="before-cut">Before: <span class="currency-symbol">${state.currentCurrency}</span>${earned.toFixed(2)}</span>
        <span class="cut-divider">|</span>
        <span class="after-cut">After: <span class="currency-symbol">${state.currentCurrency}</span>${afterCuts.toFixed(2)}</span>
    `;
}

export function updateTimerStartDurationPreview() {
    clearTimerStartPreviewInterval();

    const preview = DOM.timerStartDurationPreview;
    if (!preview || !DOM.timerStartTimeInput || state.startTime) {
        hideTimeRangePreview(preview);
        if (!state.startTime) {
            resetTimerWidgetIdleState();
        }
        return;
    }

    const startValue = DOM.timerStartTimeInput.value;
    if (!startValue || isSameDateTimeLocalMinute(startValue)) {
        hideTimeRangePreview(preview);
        resetTimerWidgetIdleState();
        return;
    }

    const renderPreview = () => {
        const startMs = new Date(startValue).getTime();
        const now = Date.now();

        if (!Number.isFinite(startMs) || startMs > now || isSameDateTimeLocalMinute(startValue)) {
            hideTimeRangePreview(preview);
            resetTimerWidgetIdleState();
            clearTimerStartPreviewInterval();
            return;
        }

        const elapsedMs = now - startMs;
        preview.textContent = `Preview session duration: ${formatDuration(elapsedMs)} (${formatClockDuration(elapsedMs)})`;
        preview.classList.remove('hidden');
        renderTimerWidgetPendingPreview(elapsedMs);
    };

    renderPreview();
    timerStartPreviewInterval = setInterval(renderPreview, 1000);
}

export function updateSessionModalDurationPreview() {
    const preview = DOM.sessionDurationPreview;
    if (!preview) return;

    const durationMs = getDateTimeRangeDurationMs(
        DOM.sessionStart?.value,
        DOM.sessionEnd?.value
    );

    if (durationMs == null) {
        hideTimeRangePreview(preview);
        return;
    }

    preview.textContent = `Session duration: ${formatDuration(durationMs)}`;
    preview.classList.remove('hidden');
}

export function updateBreakModalDurationPreviews() {
    clearBreakElapsedPreviewInterval();

    const elapsedPreview = DOM.breakElapsedPreview;
    const durationPreview = DOM.breakDurationPreview;
    const startValue = DOM.breakStart?.value || '';
    const endValue = DOM.breakEnd?.value || '';
    const isAddMode = DOM.breakModal?.classList.contains('modal-mode-add');
    const durationMs = getDateTimeRangeDurationMs(startValue, endValue);

    if (durationMs == null) {
        hideTimeRangePreview(durationPreview);
    } else {
        durationPreview.textContent = `Break duration: ${formatDuration(durationMs)}`;
        durationPreview.classList.remove('hidden');
    }

    if (!isAddMode || !startValue || isSameDateTimeLocalMinute(startValue)) {
        hideTimeRangePreview(elapsedPreview);
        return;
    }

    const renderElapsedPreview = () => {
        const startMs = new Date(startValue).getTime();
        const now = Date.now();

        if (!Number.isFinite(startMs) || startMs > now || isSameDateTimeLocalMinute(startValue)) {
            hideTimeRangePreview(elapsedPreview);
            clearBreakElapsedPreviewInterval();
            return;
        }

        elapsedPreview.textContent = `Time since start: ${formatClockDuration(now - startMs)}`;
        elapsedPreview.classList.remove('hidden');
    };

    renderElapsedPreview();
    breakElapsedPreviewInterval = setInterval(renderElapsedPreview, 1000);
}

export function clearBreakModalDurationPreviews() {
    clearBreakElapsedPreviewInterval();
    hideTimeRangePreview(DOM.breakElapsedPreview);
    hideTimeRangePreview(DOM.breakDurationPreview);
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
        updateTimerStartDurationPreview();
    } else {
        clearTimerStartPreviewInterval();
        setTimerPendingPreviewState(false);
        hideTimeRangePreview(DOM.timerStartDurationPreview);
    }
}

export function renderCalendar() {
    if (!DOM.calendarGrid || !DOM.calendarMonthYear) return;

    renderCalendarEditModeControls();
    DOM.calendarGrid.innerHTML = '';

    const isBreakMode = state.calendarEditMode === 'break';

    if (DOM.calendarLegend) {
        DOM.calendarLegend.classList.toggle('is-hidden', isBreakMode);
        if (!isBreakMode) renderPayStatusLegend(DOM.calendarLegend);
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
    const gridEndDate = new Date(gridStartDate);
    gridEndDate.setDate(gridEndDate.getDate() + (totalWeeks * 7));
    const dailyPay = accumulateDailyPayEarnings(
        getVisiblePayPeriods(),
        gridStartDate,
        gridEndDate,
        todayDate,
        getPayWorkOptions()
    );
    const assumedSegments = getAssumedWorkForRange(gridStartDate, gridEndDate, { includeFuture: true });
    const assumedByDate = new Map(assumedSegments.map((segment) => [segment.dateKey, segment]));
    const todayKey = getCalendarDateKey(todayDate);

    for (let week = 0; week < totalWeeks; week++) {
        let weekNetHours = 0;
        let weekGrossHours = 0;
        let weekBreakHours = 0;
        let weekPay = 0;
        let weekAssumedHours = 0;
        let weekScheduledHours = 0;

        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            const cellDate = new Date(gridStartDate);
            cellDate.setDate(gridStartDate.getDate() + (week * 7) + dayOfWeek);

            const dateKey = getCalendarDateKey(cellDate);
            const dayNum = cellDate.getDate();
            const isCurrentMonth = cellDate.getMonth() === month && cellDate.getFullYear() === year;
            const netHours = dailyHours[dateKey] || 0;
            const grossHours = dailyGrossHours[dateKey] || 0;
            const breakHours = dailyBreakHours[dateKey] || 0;
            const payAmount = dailyPay[dateKey] || 0;
            const assumed = assumedByDate.get(dateKey);
            const assumedHours = assumed?.hours || 0;
            const isScheduledDay = dateKey > todayKey;
            const isScheduledAssumed = Boolean(assumed?.scheduled);
            const hasPayCoverage = isCurrentMonth && getVisiblePayPeriods().some((period) => payPeriodCoversDay(period, cellDate));

            weekNetHours += netHours;
            weekGrossHours += grossHours;
            weekBreakHours += breakHours;
            weekPay += payAmount;
            if (isScheduledAssumed) {
                weekScheduledHours += assumedHours;
            } else {
                weekAssumedHours += assumedHours;
            }

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
                if (hasPayCoverage) dayDiv.classList.add('has-pay');
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
                if (hasPayCoverage) {
                    const payMark = document.createElement('div');
                    const scheduledCover = isScheduledDay;
                    payMark.className = `calendar-pay-mark${scheduledCover ? ' calendar-pay-mark-scheduled' : ''}`;
                    payMark.textContent = scheduledCover ? 'Due' : 'Pay';
                    payMark.title = scheduledCover
                        ? 'Scheduled salary day. Not in totals yet.'
                        : 'Salary covers this day. Logged hours replace the assumed block and are already in totals.';
                    dayDiv.appendChild(payMark);
                }
            } else if (assumedHours > 0) {
                const scheduled = isScheduledAssumed;
                dayDiv.classList.add(scheduled ? 'has-scheduled-pay' : 'has-pay', scheduled ? 'has-scheduled-assumed' : 'has-assumed-pay');
                const hourLabel = document.createElement('div');
                hourLabel.className = scheduled ? 'scheduled-hours-indicator' : 'assumed-hours-indicator';
                hourLabel.textContent = `${assumedHours.toFixed(1)}h`;
                hourLabel.title = scheduled
                    ? 'Scheduled pay hours — not in totals yet'
                    : 'Accrued pay hours already included in money totals';
                dayDiv.appendChild(hourLabel);
                const payMark = document.createElement('div');
                payMark.className = `calendar-pay-mark${scheduled ? ' calendar-pay-mark-scheduled' : ''}`;
                payMark.textContent = scheduled ? 'Due' : 'Pay';
                dayDiv.appendChild(payMark);
            } else if (hasPayCoverage) {
                const scheduled = isScheduledDay;
                dayDiv.classList.add(scheduled ? 'has-scheduled-pay' : 'has-pay');
                const payMark = document.createElement('div');
                payMark.className = `calendar-pay-mark${scheduled ? ' calendar-pay-mark-scheduled' : ''}`;
                payMark.textContent = scheduled ? 'Due' : 'Pay';
                payMark.title = scheduled
                    ? 'Scheduled salary day. Not in totals yet.'
                    : (payAmount > 0
                        ? `Accrued salary for this day (${formatCalendarPayAmount(payAmount)})`
                        : 'Salary covers this day and is already in totals');
                dayDiv.appendChild(payMark);
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
        } else if (weekNetHours > 0 || weekAssumedHours > 0) {
            if (weekNetHours > 0) weekTotalDiv.classList.add('has-work-total');
            if (weekAssumedHours > 0) weekTotalDiv.classList.add('has-pay-total');
            const countedHours = weekNetHours + weekAssumedHours;
            const titles = [];
            if (weekNetHours > 0) titles.push(`${weekNetHours.toFixed(1)}h logged`);
            if (weekAssumedHours > 0) titles.push(`${weekAssumedHours.toFixed(1)}h accrued pay`);
            if (weekScheduledHours > 0) titles.push(`${weekScheduledHours.toFixed(1)}h scheduled`);
            if (Math.abs(weekGrossHours - weekNetHours) > 0.05) {
                titles.push(`${weekGrossHours.toFixed(1)}h gross`);
            }
            if (weekScheduledHours > 0) {
                weekTotalDiv.classList.add('has-mixed-schedule');
                weekTotalDiv.innerHTML = `<span class="calendar-week-counted">${countedHours.toFixed(1)}h</span><span class="calendar-week-due">${weekScheduledHours.toFixed(1)}h due</span>`;
            } else {
                weekTotalDiv.textContent = `${countedHours.toFixed(1)}h`;
            }
            if (titles.length) weekTotalDiv.title = titles.join(' · ');
        } else if (weekScheduledHours > 0) {
            weekTotalDiv.classList.add('has-scheduled-total');
            weekTotalDiv.innerHTML = `<span class="calendar-week-due">${weekScheduledHours.toFixed(1)}h due</span>`;
            weekTotalDiv.title = `${weekScheduledHours.toFixed(1)}h scheduled pay — not in totals yet`;
        } else if (weekPay > 0) {
            weekTotalDiv.classList.add('has-pay-total');
            weekTotalDiv.textContent = formatCalendarPayAmount(weekPay);
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

    const assumedSegments = getAssumedWorkForRange(startOfWeek, endOfWeek, { includeFuture: true });
    assumedSegments.forEach((segment) => {
        const segmentDate = new Date(segment.startTime);
        const dayIndex = (segmentDate.getDay() - state.startOfWeek + 7) % 7;
        weekData[dayIndex].push({
            hours: segment.hours,
            durationMs: segment.durationMs,
            company: segment.company || segment.name,
            project: '',
            isPayAssumed: true,
            isPayScheduled: Boolean(segment.scheduled)
        });
        const dailyTotal = weekData[dayIndex].reduce((sum, sessionObj) => sum + sessionObj.hours, 0);
        if (dailyTotal > maxDailyHours) maxDailyHours = dailyTotal;
    });

    const weeklyAssumedMs = assumedSegments
        .filter((segment) => !segment.scheduled)
        .reduce((sum, segment) => sum + (segment.durationMs || 0), 0);
    const weeklyScheduledMs = assumedSegments
        .filter((segment) => segment.scheduled)
        .reduce((sum, segment) => sum + (segment.durationMs || 0), 0);
    const weeklyLoggedMs = weekData.reduce(
        (sum, daySessions) => sum + daySessions.reduce((daySum, sessionObj) => {
            if (sessionObj.isPayAssumed) return daySum;
            return daySum + sessionObj.durationMs;
        }, 0),
        0
    );
    const weeklyCountedMs = weeklyLoggedMs + weeklyAssumedMs;

    if (DOM.chartWeekTotal) {
        const parts = [];
        if (weeklyCountedMs > 0) {
            parts.push(`<span class="chart-week-counted">${formatDuration(weeklyCountedMs)} counted</span>`);
        }
        if (weeklyScheduledMs > 0) {
            parts.push(`<span class="chart-week-scheduled">${formatDuration(weeklyScheduledMs)} scheduled</span>`);
        }
        DOM.chartWeekTotal.innerHTML = parts.length
            ? parts.join('<span class="chart-week-total-sep"> · </span>')
            : '<span class="chart-week-counted">0h counted</span>';
    }

    renderPayStatusLegend(DOM.chartPayLegend);
    if (DOM.chartPayLegend) {
        DOM.chartPayLegend.classList.toggle('hidden', !getVisiblePayPeriods().length);
    }
    if (DOM.chartPayHint) {
        const hint = getPayScheduleHint();
        DOM.chartPayHint.textContent = hint;
        DOM.chartPayHint.classList.toggle('hidden', !hint);
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

    assumedSegments.forEach((segment) => {
        if (segment.scheduled || segment.durationMs <= 0) return;
        totalSessionMs += segment.durationMs;
        sessionCount += 1;
    });

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
            bar.className = `chart-sub-session${sessionObj.isLive ? ' chart-sub-session-live' : ''}${sessionObj.isPayAssumed && !sessionObj.isPayScheduled ? ' chart-sub-session-pay' : ''}${sessionObj.isPayScheduled ? ' chart-sub-session-scheduled' : ''}`;
            bar.style.height = `${(hrs / scaleMax) * 100}%`;

            // Determine color based on project or company
            const identifier = sessionObj.project || sessionObj.company || 'default';
            const color = getColorForIdentifier(identifier);
            if (!sessionObj.isLive && !sessionObj.isPayAssumed) {
                bar.style.background = `linear-gradient(180deg, ${color} 0%, ${adjustColorOpacity(color, 0.8)} 100%)`;
            }

            let titlePrefix = sessionObj.isPayScheduled
                ? 'Scheduled pay hours — not counted yet · '
                : sessionObj.isPayAssumed
                    ? 'Accrued pay hours · '
                    : (sessionObj.project ? `[${sessionObj.project}] ` : (sessionObj.company ? `[${sessionObj.company}] ` : ''));
            const livePrefix = sessionObj.isLive ? 'Live · ' : '';
            bar.title = `${livePrefix}${titlePrefix}Session ${sIndex + 1}: ${formatDuration(sessionObj.durationMs)}`;

            // Add persistent label if an identifier exists
            if (sessionObj.isPayScheduled) {
                const labelSpan = document.createElement('span');
                labelSpan.className = 'chart-bar-label';
                labelSpan.textContent = 'Due';
                bar.appendChild(labelSpan);
            } else if (sessionObj.isPayAssumed) {
                const labelSpan = document.createElement('span');
                labelSpan.className = 'chart-bar-label';
                labelSpan.textContent = 'Pay';
                bar.appendChild(labelSpan);
            } else if (identifier !== 'default' && !sessionObj.isLive) {
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
    renderPayStatusLegend(DOM.timelinePayLegend);
    if (DOM.timelinePayLegend) {
        DOM.timelinePayLegend.classList.toggle('hidden', !getVisiblePayPeriods().length);
    }
    if (DOM.timelinePayHint) {
        const hint = getPayScheduleHint();
        DOM.timelinePayHint.textContent = hint;
        DOM.timelinePayHint.classList.toggle('hidden', !hint);
    }

    const timelineEnd = new Date(startOfWeek);
    timelineEnd.setDate(startOfWeek.getDate() + 7);
    const assumedByDay = new Map(
        getAssumedWorkForRange(startOfWeek, timelineEnd, { includeFuture: true }).map((segment) => [segment.dateKey, segment])
    );

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
            block.className = `gantt-block ${isLive ? 'gantt-live' : ''} ${blockType === 'break' ? 'gantt-break' : ''} ${blockType === 'pay' ? 'gantt-pay' : ''} ${blockType === 'scheduled' ? 'gantt-scheduled' : ''}`;
            block.style.left = `${leftPercent}%`;
            block.style.width = widthPercent > 0.5 ? `${widthPercent}%` : '0.5%';

            let color;
            if (blockType === 'break') {
                color = 'rgba(255, 152, 0, 0.85)';
            } else if (blockType === 'scheduled') {
                color = 'rgba(199, 125, 255, 0.72)';
            } else if (blockType === 'pay') {
                color = 'rgba(0, 230, 118, 0.78)';
            } else {
                const identifier = project || company || 'default';
                color = isLive ? 'rgba(255, 60, 60, 0.8)' : getColorForIdentifier(identifier);
            }

            block.style.backgroundColor = color;
            block.style.boxShadow = `0 0 8px ${color}`;

            let titlePrefix = blockType === 'break'
                ? 'Break: '
                : blockType === 'scheduled'
                    ? 'Scheduled pay hours — not counted yet: '
                    : blockType === 'pay'
                        ? 'Accrued pay hours: '
                        : (project ? `[${project}] ` : (company ? `[${company}] ` : ''));
            block.title = `${titlePrefix}${formatDuration(durationMs)}${isLive ? ' (Live)' : ''}`;

            if (widthPercent > 4) {
                const label = document.createElement('span');
                label.className = 'gantt-block-label';
                const durationText = formatDuration(durationMs);
                if (blockType === 'break') {
                    label.textContent = durationText;
                } else if (blockType === 'scheduled') {
                    label.textContent = `Due (${durationText})`;
                } else if (blockType === 'pay') {
                    label.textContent = `Pay (${durationText})`;
                } else if ((project || company) && (project || company) !== 'default') {
                    label.textContent = `${project || company} (${durationText})`;
                } else {
                    label.textContent = durationText;
                }
                block.appendChild(label);
            }

            rowContainer.appendChild(block);
        };

        const dateKey = getCalendarDateKey(dayDate);
        const assumed = assumedByDay.get(dateKey);
        if (assumed) {
            addGanttBlock(
                new Date(assumed.startTime),
                assumed.durationMs,
                assumed.name,
                assumed.company,
                false,
                assumed.scheduled ? 'scheduled' : 'pay'
            );
        }

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
    (state.rawPayPeriods || []).forEach((period) => {
        if (period.company) companies.add(String(period.company).trim());
    });

    DOM.companySelect.innerHTML = '<option value="">Or pick saved...</option>';
    if (DOM.sessionCompanySelect) DOM.sessionCompanySelect.innerHTML = '<option value="">Or pick saved...</option>';
    if (DOM.batchCompanySelect) DOM.batchCompanySelect.innerHTML = '<option value="">Or pick saved...</option>';
    if (DOM.payPeriodCompanySelect) DOM.payPeriodCompanySelect.innerHTML = '<option value="">Or pick saved...</option>';

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
        if (DOM.payPeriodCompanySelect) {
            const optCopy = option.cloneNode(true);
            DOM.payPeriodCompanySelect.appendChild(optCopy);
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

function formatCalendarPayAmount(amount) {
    const value = Number(amount) || 0;
    const rounded = value >= 10 ? Math.round(value) : value;
    return `${state.currentCurrency}${value >= 10 ? rounded : rounded.toFixed(2)}`;
}

function firstOfMonthDateKey(date = new Date()) {
    return formatDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

function readPayPeriodForm() {
    const workSettings = getWorkSettingsFromState(state);
    return sanitizePayPeriod({
        id: DOM.editPayPeriodId?.value || undefined,
        amount: DOM.payPeriodAmount?.value,
        scale: DOM.payPeriodScale?.value || PAY_SCALES.MONTH,
        name: DOM.payPeriodName?.value,
        startDate: DOM.payPeriodStart?.value,
        endDate: DOM.payPeriodEnd?.value || null,
        company: DOM.payPeriodCompany?.value,
        dailyHours: workSettings.dailyHours,
        workingDaysPerWeek: workSettings.workingDaysPerWeek
    });
}

export function updatePayPeriodPreview() {
    if (!DOM.payPeriodPreview) return;

    const period = readPayPeriodForm();
    if (period.amount <= 0) {
        DOM.payPeriodPreview.textContent = 'Enter an amount to see how this pay accrues.';
        DOM.payPeriodPreview.classList.remove('hidden');
        return;
    }

    const now = new Date();
    const hourly = getEquivalentHourlyRate(period, now, getPayWorkOptions());
    const progress = getCurrentPayUnitProgress(period, now, getPayWorkOptions());
    const afterCuts = getAmountAfterPercentageCuts(progress.accrued);
    const hourNote = ` Calendar, weekly breakdown, and timeline show accrued pay in green (already in totals) and scheduled future pay in purple (not counted yet). Blocks follow Work Schedule (${formatScheduleSummary(state.workSchedule)}). Logged sessions replace that day's pay block.`;

    DOM.payPeriodPreview.textContent = `${formatPayRate(period.amount, period.scale, state.currentCurrency)} · ≈ ${state.currentCurrency}${hourly.toFixed(2)}/h. ${progress.label}: ${state.currentCurrency}${progress.accrued.toFixed(2)} of ${state.currentCurrency}${progress.contracted.toFixed(2)} accrued${state.percentageCuts.length ? ` (${state.currentCurrency}${afterCuts.toFixed(2)} after cuts)` : ''}.${hourNote}`;
    DOM.payPeriodPreview.classList.remove('hidden');
}

export function openPayPeriodModal(period = null) {
    if (!DOM.payPeriodModal) return;

    const isEdit = Boolean(period?.id);
    const workSettings = getWorkSettingsFromState(state);
    const draft = sanitizePayPeriod(period || {
        amount: 2000,
        scale: PAY_SCALES.MONTH,
        startDate: firstOfMonthDateKey(),
        dailyHours: workSettings.dailyHours,
        workingDaysPerWeek: workSettings.workingDaysPerWeek
    }, {
        startDate: firstOfMonthDateKey(),
        dailyHours: workSettings.dailyHours,
        workingDaysPerWeek: workSettings.workingDaysPerWeek
    });

    if (DOM.payPeriodModalTitle) {
        DOM.payPeriodModalTitle.textContent = isEdit ? 'Edit Pay' : 'Add Pay';
    }
    if (DOM.editPayPeriodId) DOM.editPayPeriodId.value = isEdit ? period.id : '';
    if (DOM.payPeriodAmount) DOM.payPeriodAmount.value = draft.amount || '';
    if (DOM.payPeriodScale) DOM.payPeriodScale.value = draft.scale;
    if (DOM.payPeriodName) DOM.payPeriodName.value = draft.name;
    if (DOM.payPeriodStart) DOM.payPeriodStart.value = draft.startDate;
    if (DOM.payPeriodEnd) DOM.payPeriodEnd.value = draft.endDate || '';
    if (DOM.payPeriodCompany) DOM.payPeriodCompany.value = draft.company;
    if (DOM.payPeriodSyncTc) DOM.payPeriodSyncTc.checked = true;
    if (DOM.deletePayPeriodBtn) {
        DOM.deletePayPeriodBtn.style.display = isEdit ? 'block' : 'none';
    }

    DOM.payPeriodModal.classList.toggle('modal-mode-edit', isEdit);
    DOM.payPeriodModal.classList.toggle('modal-mode-add', !isEdit);
    DOM.payPeriodModal.classList.remove('hidden');
    updatePayPeriodPreview();
}

export function closePayPeriodModal() {
    DOM.payPeriodModal?.classList.add('hidden');
}

export function getPayPeriodFormData() {
    return {
        period: readPayPeriodForm(),
        syncTimeCost: Boolean(DOM.payPeriodSyncTc?.checked)
    };
}

function applyPayWidgetSummaryValues(snap) {
    const accruedEl = DOM.payWidgetSummary.querySelector('.pay-summary-accrued-value');
    const scheduledEl = DOM.payWidgetSummary.querySelector('.pay-summary-scheduled-value');
    const accruedBar = DOM.payWidgetSummary.querySelector('.pay-progress-accrued');
    const scheduledBar = DOM.payWidgetSummary.querySelector('.pay-progress-scheduled');
    const metaEl = DOM.payWidgetSummary.querySelector('.pay-summary-meta');
    if (accruedEl) {
        accruedEl.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>${snap.accrued.toFixed(2)}`;
    }
    if (scheduledEl) {
        scheduledEl.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>${snap.remaining.toFixed(2)}`;
    }
    if (accruedBar) accruedBar.style.width = `${snap.accruedPct}%`;
    if (scheduledBar) scheduledBar.style.width = `${snap.remainingPct}%`;
    if (metaEl) {
        metaEl.textContent = `${snap.contracted > 0 ? `${state.currentCurrency}${snap.contracted.toFixed(2)} contracted` : 'No active pay in the current period'}${snap.hourly > 0 ? ` · ≈ ${state.currentCurrency}${snap.hourly.toFixed(2)}/h` : ''}${state.percentageCuts.length ? ` · After cuts ${state.currentCurrency}${snap.afterCuts.toFixed(2)}` : ''}`;
    }
}

export function renderPayWidget() {
    if (!DOM.payWidgetSummary || !DOM.payPeriodList) return;

    const now = new Date();
    const snap = getPayAccrualSnapshot(now);
    const periods = snap.periods;

    if (!periods.length) {
        DOM.payWidgetSummary.classList.add('is-empty');
        DOM.payWidgetSummary.innerHTML = '<p class="loading-text" style="margin: 0;">Add a monthly salary or other pay scale. Calendar, weekly breakdown, timeline, and the live money counter follow the Work Schedule widget for assumed sessions. Stats and saving pots use accrued salary plus any sessions not already covered by that pay. Scheduled future pay is not counted yet.</p>';
    } else {
        DOM.payWidgetSummary.classList.remove('is-empty');
        DOM.payWidgetSummary.innerHTML = `
            <div class="pay-summary-split">
                <div class="pay-summary-col pay-summary-col-accrued">
                    <span class="pay-summary-label">${snap.label} accrued</span>
                    <span class="pay-summary-value pay-summary-accrued-value"><span class="currency-symbol">${state.currentCurrency}</span>${snap.accrued.toFixed(2)}</span>
                    <span class="pay-summary-caption">Already in money totals</span>
                </div>
                <div class="pay-summary-col pay-summary-col-scheduled">
                    <span class="pay-summary-label">Still scheduled</span>
                    <span class="pay-summary-value pay-summary-scheduled-value"><span class="currency-symbol">${state.currentCurrency}</span>${snap.remaining.toFixed(2)}</span>
                    <span class="pay-summary-caption">Not counted yet</span>
                </div>
            </div>
            <div class="pay-progress" role="img" aria-label="${snap.label} ${state.currentCurrency}${snap.accrued.toFixed(2)} accrued, ${state.currentCurrency}${snap.remaining.toFixed(2)} still scheduled">
                <span class="pay-progress-accrued" style="width: ${snap.accruedPct}%"></span>
                <span class="pay-progress-scheduled" style="width: ${snap.remainingPct}%"></span>
            </div>
            <span class="pay-summary-meta"></span>
            <ul class="pay-status-legend" aria-label="Pay colour key"></ul>
        `;
        applyPayWidgetSummaryValues(snap);
        renderPayStatusLegend(DOM.payWidgetSummary.querySelector('.pay-status-legend'), { includeLogged: false });
    }

    DOM.payPeriodList.innerHTML = '';

    periods.forEach((period) => {
        const sanitized = sanitizePayPeriod(period);
        const active = isPayPeriodActive(sanitized, now);
        const progress = getCurrentPayUnitProgress(sanitized, now, getPayWorkOptions());
        const remaining = Math.max(0, progress.contracted - progress.accrued);
        const item = document.createElement('article');
        item.className = `pay-period-item${active ? '' : ' is-ended'}`;

        const companyHtml = sanitized.company
            ? `<span class="history-badge history-badge-company">${escapeHtml(sanitized.company)}</span>`
            : '';

        item.innerHTML = `
            <div class="pay-period-copy">
                <span class="pay-period-name">${escapeHtml(getPayPeriodDisplayName(sanitized))}</span>
                <span class="pay-period-rate">${formatPayRate(sanitized.amount, sanitized.scale, state.currentCurrency)}</span>
                <span class="pay-period-meta">
                    ${getPayPeriodDateLabel(sanitized)}
                    ${active
                        ? ` · <span class="pay-accrued-text">${state.currentCurrency}${progress.accrued.toFixed(2)}</span> accrued of ${state.currentCurrency}${progress.contracted.toFixed(2)} · <span class="pay-scheduled-text">${state.currentCurrency}${remaining.toFixed(2)}</span> scheduled`
                        : ' · Ended'}
                    · ≈ ${state.currentCurrency}${getEquivalentHourlyRate(sanitized, now, getPayWorkOptions()).toFixed(2)}/h
                </span>
                ${companyHtml ? `<div class="history-badges" style="margin-top: 8px;">${companyHtml}</div>` : ''}
            </div>
            <div class="pay-period-actions">
                <button class="btn-edit" type="button" data-pay-id="${sanitized.id}" title="Edit Pay">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
            </div>
        `;

        item.querySelector('.btn-edit')?.addEventListener('click', () => {
            openPayPeriodModal(period);
        });

        DOM.payPeriodList.appendChild(item);
    });

    toggleLiveIndicators(Boolean(state.startTime));
    renderPayDerivedTimeCostHint();
    renderPayOverlapWarning();
}

let lastPayOverlapSummary = summarizePaySessionOverlaps();

function formatOverlapDateLabel(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) return dateKey || '';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function pluralCount(count, singular, pluralWord = `${singular}s`) {
    return `${count} ${count === 1 ? singular : pluralWord}`;
}

export function renderPayOverlapWarning() {
    if (!DOM.payOverlapWidget) return;

    const sessions = state.rawSessions.length ? state.rawSessions : state.allSessions;
    const periods = state.rawPayPeriods.length ? state.rawPayPeriods : state.allPayPeriods;
    const breaks = state.rawBreaks.length ? state.rawBreaks : state.allBreaks;
    const summary = summarizePaySessionOverlaps(sessions, periods, breaks);
    lastPayOverlapSummary = summary;

    const disabled = state.disabledWidgets.includes('widget-pay-overlap');
    const show = !disabled && summary.dayCount > 0;
    DOM.payOverlapWidget.classList.toggle('hidden', !show);
    DOM.payOverlapWidget.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (!show) return;

    if (DOM.payOverlapCountBadge) {
        DOM.payOverlapCountBadge.textContent = pluralCount(summary.dayCount, 'day');
    }

    if (DOM.payOverlapHeadline) {
        const rangeLabel = summary.fromDate === summary.toDate
            ? formatOverlapDateLabel(summary.fromDate)
            : `${formatOverlapDateLabel(summary.fromDate)} – ${formatOverlapDateLabel(summary.toDate)}`;
        DOM.payOverlapHeadline.textContent = `You have ${pluralCount(summary.dayCount, 'overlapping day')} (${rangeLabel}) where monthly pay and a logged session are both active.`;
    }

    if (DOM.payOverlapCopy) {
        const sessionBit = `${pluralCount(summary.sessionCount, 'logged session')} on those days`;
        if (summary.extraEarningSessionCount > 0) {
            DOM.payOverlapCopy.textContent = `${sessionBit}. ${pluralCount(summary.extraEarningSessionCount, 'session')} still add extra money because their company does not match your pay — that is double-counted. Covered sessions add hours only. Remove the leftover daily sessions if they were stand-ins for salary.`;
        } else {
            DOM.payOverlapCopy.textContent = `${sessionBit}. Those sessions are already treated as hours-only, so their hourly rate is not added on top of salary. Remove them if you no longer want the extra hours on the calendar, weekly breakdown, and timeline.`;
        }
    }

    if (DOM.payOverlapBatchBtn && !DOM.payOverlapBatchBtn.dataset.bound) {
        DOM.payOverlapBatchBtn.dataset.bound = '1';
        DOM.payOverlapBatchBtn.addEventListener('click', () => {
            openPayOverlapBatchEdit();
        });
    }
}

export function openPayOverlapBatchEdit() {
    const summary = lastPayOverlapSummary?.dayCount
        ? lastPayOverlapSummary
        : summarizePaySessionOverlaps(
            state.rawSessions.length ? state.rawSessions : state.allSessions,
            state.rawPayPeriods.length ? state.rawPayPeriods : state.allPayPeriods,
            state.rawBreaks.length ? state.rawBreaks : state.allBreaks
        );

    DOM.viewSettingsBtn?.click();
    setSettingsTab('batch-edit');

    if (DOM.batchDeleteSessions) DOM.batchDeleteSessions.checked = true;
    if (DOM.batchDeleteBreaks) DOM.batchDeleteBreaks.checked = false;

    if (summary.sameMonth && summary.monthValue && DOM.batchDeleteMonth) {
        DOM.batchDeleteMonth.value = summary.monthValue;
        setBatchDeleteRangeMode(BATCH_DELETE_RANGE_MODES.MONTH);
    } else if (summary.fromDate && summary.toDate) {
        if (DOM.batchDeleteFrom) DOM.batchDeleteFrom.value = summary.fromDate;
        if (DOM.batchDeleteTo) DOM.batchDeleteTo.value = summary.toDate;
        setBatchDeleteRangeMode(BATCH_DELETE_RANGE_MODES.CUSTOM);
    } else {
        setBatchDeleteRangeMode(BATCH_DELETE_RANGE_MODES.MONTH);
    }

    updateBatchDeletePreview();
    DOM.settingsPanelBatchEdit?.scrollIntoView({ block: 'start' });
}

function updatePayWidgetSummaryOnly() {
    if (!DOM.payWidgetSummary || !getVisiblePayPeriods().length) return;
    applyPayWidgetSummaryValues(getPayAccrualSnapshot());
}

let payAccrualTimer = null;

export function refreshPayAccrualDisplays() {
    updatePayWidgetSummaryOnly();
    renderLiveMoneyCounter(getSessionLiveEarnings(), Boolean(state.startTime) || hasActivePayAccrual());
    toggleLiveIndicators(Boolean(state.startTime));
}

export function syncPayAccrualTimer() {
    const shouldRun = hasActivePayAccrual();
    if (shouldRun && !payAccrualTimer) {
        payAccrualTimer = setInterval(refreshPayAccrualDisplays, 1000);
    } else if (!shouldRun && payAccrualTimer) {
        clearInterval(payAccrualTimer);
        payAccrualTimer = null;
    }
    renderPayWidget();
    refreshPayAccrualDisplays();
}

export function renderPayDerivedTimeCostHint() {
    if (!DOM.tcPayDerivedHint) return;

    const hourly = getCombinedEquivalentHourlyRate(getVisiblePayPeriods(), new Date(), getPayWorkOptions());
    if (hourly <= 0) {
        DOM.tcPayDerivedHint.classList.add('hidden');
        DOM.tcPayDerivedHint.innerHTML = '';
        return;
    }

    DOM.tcPayDerivedHint.classList.remove('hidden');
    DOM.tcPayDerivedHint.innerHTML = `From Pay: <strong>${state.currentCurrency}${hourly.toFixed(2)}/h</strong> <button type="button" id="tc-use-pay-rate-btn" class="btn-outline btn-small">Use this rate</button>`;
}

function formatScheduleHoursShort(hours) {
    if (!(hours > 0)) return 'Off';
    return `${parseFloat(Number(hours).toFixed(2))}h`;
}

function readWorkScheduleFromForm() {
    const days = [0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
        const row = DOM.workScheduleList?.querySelector(`.work-schedule-row[data-day="${dayIndex}"]`);
        const existing = state.workSchedule?.days?.[dayIndex] || {};
        if (!row) {
            return {
                day: dayIndex,
                enabled: Boolean(existing.enabled),
                start: existing.start || '09:00',
                end: existing.end || '17:00'
            };
        }
        return {
            day: dayIndex,
            enabled: Boolean(row.querySelector('.work-schedule-enabled')?.checked),
            start: row.querySelector('.work-schedule-start')?.value || existing.start || '09:00',
            end: row.querySelector('.work-schedule-end')?.value || existing.end || '17:00'
        };
    });
    return { days };
}

function syncWorkScheduleRow(row, day) {
    if (!row || !day) return;
    const enabledInput = row.querySelector('.work-schedule-enabled');
    const startInput = row.querySelector('.work-schedule-start');
    const endInput = row.querySelector('.work-schedule-end');
    const hoursEl = row.querySelector('.work-schedule-hours');
    const active = document.activeElement;

    if (enabledInput && active !== enabledInput) {
        enabledInput.checked = Boolean(day.enabled);
    }
    if (startInput && active !== startInput) {
        startInput.value = day.start;
    }
    if (endInput && active !== endInput) {
        endInput.value = day.end;
    }
    if (startInput) startInput.disabled = !day.enabled;
    if (endInput) endInput.disabled = !day.enabled;
    if (hoursEl) hoursEl.textContent = formatScheduleHoursShort(getScheduleDayHours(day));
    row.classList.toggle('is-disabled', !day.enabled);
}

function previewWorkScheduleRow(row) {
    if (!row) return;
    const dayIndex = Number(row.dataset.day);
    const enabled = Boolean(row.querySelector('.work-schedule-enabled')?.checked);
    const start = row.querySelector('.work-schedule-start')?.value || '09:00';
    const end = row.querySelector('.work-schedule-end')?.value || '17:00';
    syncWorkScheduleRow(row, { day: dayIndex, enabled, start, end });
    if (DOM.workScheduleSummary) {
        DOM.workScheduleSummary.textContent = formatScheduleSummary(readWorkScheduleFromForm());
    }
}

function refreshAssumedWorkDisplays() {
    renderCalendar();
    renderChart();
    renderGanttChart();
    renderPayWidget();
    renderWorkPatternBreakdown();
    renderMoneyCounterModeControls();
    updatePayPeriodPreview();
}

let workScheduleApplyTimeout = null;

function persistWorkSchedule() {
    import('./api.js').then((module) => {
        module.saveWorkSchedule?.(state.workSchedule);
    }).catch((error) => {
        console.error('Debug: Could not save work schedule', error);
    });
}

function applyWorkScheduleFromForm() {
    clearTimeout(workScheduleApplyTimeout);
    workScheduleApplyTimeout = null;
    updateWorkSchedule(readWorkScheduleFromForm());
    const schedule = sanitizeWorkSchedule(state.workSchedule);
    DOM.workScheduleList?.querySelectorAll('.work-schedule-row').forEach((row) => {
        syncWorkScheduleRow(row, schedule.days[Number(row.dataset.day)]);
    });
    if (DOM.workScheduleSummary) {
        DOM.workScheduleSummary.textContent = formatScheduleSummary(schedule);
    }
    persistWorkSchedule();
    refreshAssumedWorkDisplays();
}

function scheduleWorkScheduleApply() {
    clearTimeout(workScheduleApplyTimeout);
    workScheduleApplyTimeout = setTimeout(applyWorkScheduleFromForm, 400);
}

function bindWorkScheduleEvents() {
    if (!DOM.workScheduleList || DOM.workScheduleList.dataset.bound === 'true') return;
    DOM.workScheduleList.dataset.bound = 'true';
    DOM.workScheduleList.addEventListener('input', (event) => {
        const row = event.target.closest('.work-schedule-row');
        if (!row) return;
        previewWorkScheduleRow(row);
        scheduleWorkScheduleApply();
    });
    DOM.workScheduleList.addEventListener('change', (event) => {
        const row = event.target.closest('.work-schedule-row');
        if (row) previewWorkScheduleRow(row);
        applyWorkScheduleFromForm();
    });
}

export function renderWorkSchedule() {
    if (!DOM.workScheduleList) return;

    const schedule = sanitizeWorkSchedule(state.workSchedule);
    const order = orderedWeekdayIndexes(state.startOfWeek);
    const existingRows = [...DOM.workScheduleList.querySelectorAll('.work-schedule-row')];
    const existingOrder = existingRows.map((row) => Number(row.dataset.day));
    const needsRebuild = existingRows.length !== 7 || order.some((dayIndex, index) => existingOrder[index] !== dayIndex);

    if (needsRebuild) {
        DOM.workScheduleList.innerHTML = '';
        order.forEach((dayIndex) => {
            const day = schedule.days[dayIndex];
            const row = document.createElement('li');
            row.className = 'work-schedule-row';
            row.dataset.day = String(dayIndex);
            const label = WEEKDAY_LABELS[dayIndex];
            row.innerHTML = `
                <label class="work-schedule-day">
                    <input type="checkbox" class="work-schedule-enabled" ${day.enabled ? 'checked' : ''} aria-label="Work on ${label}">
                    <span>${label}</span>
                </label>
                <div class="work-schedule-times">
                    <input type="time" class="work-schedule-start" value="${day.start}" ${day.enabled ? '' : 'disabled'} aria-label="${label} start">
                    <span>to</span>
                    <input type="time" class="work-schedule-end" value="${day.end}" ${day.enabled ? '' : 'disabled'} aria-label="${label} end">
                </div>
                <span class="work-schedule-hours">${formatScheduleHoursShort(getScheduleDayHours(day))}</span>
            `;
            row.classList.toggle('is-disabled', !day.enabled);
            DOM.workScheduleList.appendChild(row);
        });
    } else {
        existingRows.forEach((row) => {
            syncWorkScheduleRow(row, schedule.days[Number(row.dataset.day)]);
        });
    }

    if (DOM.workScheduleSummary) {
        DOM.workScheduleSummary.textContent = formatScheduleSummary(schedule);
    }

    bindWorkScheduleEvents();
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
        'widget-timer', 'widget-pay', 'widget-work-schedule', 'widget-pay-overlap', 'widget-breaks', 'widget-money-counter', 'widget-saving-pots', 'widget-stats',
        'widget-work-pattern', 'widget-cut-stats', 'widget-cuts', 'widget-gantt',
        'widget-calendar', 'widget-chart', 'widget-history'
    ];

    DEFAULT_WIDGET_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === 'widget-pay-overlap') {
            renderPayOverlapWarning();
            return;
        }
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
        if (widget.id === 'widget-pay-overlap') return;
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
        'widget-pay': 'Pay',
        'widget-work-schedule': 'Work Schedule',
        'widget-pay-overlap': 'Overlapping Pay',
        'widget-breaks': 'Breaks',
        'widget-money-counter': 'Live Money Counter',
        'widget-saving-pots': 'Saving Pots',
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
    renderPayDerivedTimeCostHint();
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

function renderSavingPotProgressCell(progressItem, itemName, options = {}) {
    const { showBadge = false } = options;
    const cost = progressItem?.cost ?? 0;
    const percent = progressItem?.percent ?? 0;
    const isFullyFunded = progressItem?.isFullyFunded === true;
    const accessibleName = `${itemName}: ${percent.toFixed(0)}% saved`;

    if (cost <= 0) {
        return '<span class="tc-muted-action">N/A</span>';
    }

    const fundedBadge = showBadge && isFullyFunded
        ? '<span class="sp-funded-badge">Fully funded</span>'
        : '';

    return `
        <div class="sp-progress-wrap">
            ${fundedBadge}
            <div
                class="sp-progress"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${Math.round(percent)}"
                aria-label="${escapeHtml(accessibleName)}"
            >
                <span class="sp-progress-fill${isFullyFunded ? ' sp-progress-fill-complete' : ''}" style="width: ${Math.min(100, percent)}%;"></span>
            </div>
            <span class="sp-progress-label">${percent.toFixed(0)}% saved</span>
        </div>
    `;
}

function renderSavingPotItemPanel(progressItem, itemName, savedAmount, remaining, cost) {
    const currency = state.currentCurrency;
    const fundedBadge = progressItem?.isFullyFunded
        ? '<span class="sp-funded-badge sp-funded-badge-inline">Fully funded</span>'
        : '';

    return `
        <div class="sp-item-pot-panel">
            <div class="sp-item-pot-panel-header">
                <span class="sp-item-pot-panel-title">Saving Pot</span>
                ${fundedBadge}
            </div>
            <div class="sp-item-pot-stats">
                <div class="sp-item-pot-stat">
                    <span class="sp-item-pot-stat-label">Saved</span>
                    <span class="sp-item-pot-stat-value">${currency}${savedAmount.toFixed(2)}</span>
                </div>
                <div class="sp-item-pot-stat">
                    <span class="sp-item-pot-stat-label">Remaining</span>
                    <span class="sp-item-pot-stat-value">${cost > 0 ? `${currency}${remaining.toFixed(2)}` : 'N/A'}</span>
                </div>
            </div>
            ${renderSavingPotProgressCell(progressItem, itemName)}
        </div>
    `;
}

function renderSavingPotActionButtons({ itemId, canFullyFund, canPartialFund, canWithdraw, fullFundAmount }) {
    const escapedId = escapeHtml(itemId);
    return `
        <div class="sp-item-actions">
            <button class="btn-primary btn-small sp-full-fund-btn" data-id="${escapedId}" title="Assign ${state.currentCurrency}${fullFundAmount.toFixed(2)} to fully fund" ${canFullyFund ? '' : 'disabled'}>Fully fund</button>
            <button class="btn-outline btn-small sp-partial-fund-btn" data-id="${escapedId}" title="Choose a partial amount to assign" ${canPartialFund ? '' : 'disabled'}>Partial fund</button>
            <button class="btn-outline btn-small sp-withdraw-btn" data-id="${escapedId}" title="Withdraw all assigned savings from this item" ${canWithdraw ? '' : 'disabled'}>Withdraw all</button>
        </div>
    `;
}

function renderSavedItemIconActions(itemId) {
    const escapedId = escapeHtml(itemId);
    return `
        <div class="sp-row-icon-actions">
            <button class="btn-edit tc-edit-btn" data-id="${escapedId}" title="Edit Item" type="button" aria-label="Edit item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </button>
            <button class="btn-delete tc-delete-btn" data-id="${escapedId}" title="Delete Item" type="button" aria-label="Delete item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        </div>
    `;
}

function formatSavedItemDateBought(dateBought) {
    if (!dateBought) return '<span class="tc-muted-action">Not set</span>';
    return escapeHtml(new Date(`${dateBought}T00:00:00`).toLocaleDateString());
}

let lastSavedItemsLayoutMode = null;

function ensureSavedItemsLayoutListener() {
    if (ensureSavedItemsLayoutListener.bound) return;
    ensureSavedItemsLayoutListener.bound = true;

    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const onChange = () => {
        if (!DOM.tcSavedItemsContainer) return;
        const nextMode = mediaQuery.matches ? 'mobile' : 'desktop';
        if (nextMode === lastSavedItemsLayoutMode) return;
        renderSavedTimeCostItems();
    };

    if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', onChange);
    } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(onChange);
    }
}

function renderSavedItemMobileCard(itemView) {
    const {
        itemId,
        itemName,
        cost,
        dateBought,
        progressItem,
        savedAmount,
        remaining,
        canFullyFund,
        canPartialFund,
        canWithdraw,
        fullFundAmount,
        baseHoursStr,
        baseDaysStr,
        baseWeeksStr,
        baseMonthsStr,
        effectiveHoursStr,
        effectiveDaysStr,
        effectiveWeeksStr,
        effectiveMonthsStr,
        totalCutPercentage
    } = itemView;

    return `
        <article class="tc-saved-item-card">
            <div class="tc-saved-item-card-top">
                <strong class="sp-item-name">${escapeHtml(itemName)}</strong>
                ${renderSavedItemIconActions(itemId)}
            </div>
            <div class="tc-saved-item-card-meta">
                <div class="tc-saved-item-meta-stat">
                    <span class="tc-saved-item-meta-label">Cost</span>
                    <span class="tc-saved-item-meta-value tc-amount">${state.currentCurrency}${cost.toFixed(2)}</span>
                </div>
                <div class="tc-saved-item-meta-stat">
                    <span class="tc-saved-item-meta-label">Date bought</span>
                    <span class="tc-saved-item-meta-value">${formatSavedItemDateBought(dateBought)}</span>
                </div>
            </div>
            ${renderSavingPotItemPanel(progressItem, itemName, savedAmount, remaining, cost)}
            ${renderSavingPotActionButtons({
                itemId,
                canFullyFund,
                canPartialFund,
                canWithdraw,
                fullFundAmount
            })}
            <details class="tc-saved-item-time-details">
                <summary>Time cost details</summary>
                <div class="tc-saved-item-time-grid">
                    <div class="tc-saved-item-time-group">
                        <span class="tc-saved-item-time-group-title">Base time</span>
                        <div class="tc-saved-item-time-values">
                            <span>${baseHoursStr}</span>
                            <span>${baseDaysStr}</span>
                            <span>${baseWeeksStr}</span>
                            <span>${baseMonthsStr}</span>
                        </div>
                    </div>
                    <div class="tc-saved-item-time-group">
                        <span class="tc-saved-item-time-group-title">After cuts (-${totalCutPercentage.toFixed(1)}%)</span>
                        <div class="tc-saved-item-time-values">
                            <span>${effectiveHoursStr}</span>
                            <span>${effectiveDaysStr}</span>
                            <span>${effectiveWeeksStr}</span>
                            <span>${effectiveMonthsStr}</span>
                        </div>
                    </div>
                </div>
            </details>
        </article>
    `;
}

function buildSavingPotWarningHtml(potState, currency) {
    if (!potState.isOverAssigned) return '';

    return `<div class="sp-summary-warning" role="alert">
        Over-assigned by <strong>${currency}${potState.overAssignedBy.toFixed(2)}</strong>.
        Withdraw from items before assigning more.
    </div>`;
}

function buildSavingPotBalanceGridHtml(potState, currency) {
    return `
        <div class="sp-summary-grid">
            <div class="sp-summary-item">
                <span class="sp-summary-label">Earnings pool</span>
                <span class="sp-summary-value">${currency}${potState.earningsPool.toFixed(2)}</span>
                <span class="sp-summary-meta">${escapeHtml(potState.poolScopeLabel)}</span>
            </div>
            <div class="sp-summary-item">
                <span class="sp-summary-label">Assigned</span>
                <span class="sp-summary-value">${currency}${potState.totalAssigned.toFixed(2)}</span>
            </div>
            <div class="sp-summary-item sp-summary-item-highlight">
                <span class="sp-summary-label">Unassigned</span>
                <span class="sp-summary-value">${currency}${potState.unassignedBalance.toFixed(2)}</span>
            </div>
        </div>
    `;
}

function buildSavingPotGoalCardHtml(closestGoal, currency) {
    if (!closestGoal) return '';

    const itemName = closestGoal.item?.name || 'Unnamed Item';
    const percent = closestGoal.percent ?? 0;

    return `
        <div class="sp-widget-goal-card">
            <div class="sp-widget-goal-header">
                <span class="sp-widget-goal-label">Closest goal</span>
                <span class="sp-widget-goal-percent">${percent.toFixed(0)}%</span>
            </div>
            <strong class="sp-widget-goal-name">${escapeHtml(itemName)}</strong>
            <div
                class="sp-progress sp-progress-widget"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${Math.round(percent)}"
                aria-label="${escapeHtml(`${itemName}: ${percent.toFixed(0)}% saved`)}"
            >
                <span class="sp-progress-fill" style="width: ${Math.min(100, percent)}%;"></span>
            </div>
            <div class="sp-widget-goal-meta">
                <span>Saved ${currency}${closestGoal.savedAmount.toFixed(2)}</span>
                <span>${currency}${closestGoal.remaining.toFixed(2)} to go</span>
            </div>
        </div>
    `;
}

export function renderSavingPotsSummary() {
    if (!DOM.tcSavingPotsSummary) return;

    const potState = computeSavingPotStateFromAppState(state);
    DOM.tcSavingPotsSummary.innerHTML = `
        ${buildSavingPotWarningHtml(potState, state.currentCurrency)}
        ${buildSavingPotBalanceGridHtml(potState, state.currentCurrency)}
    `;
}

export function renderSavingPotsWidget() {
    if (!DOM.spWidgetContent) return;

    const potState = computeSavingPotStateFromAppState(state);
    const currency = state.currentCurrency;
    const items = potState.itemsWithProgress || [];
    const fundedCount = items.filter(item => item.isFullyFunded).length;
    const activeGoals = items.filter(item => (item.cost || 0) > 0 && !item.isFullyFunded);

    if (DOM.spWidgetScopeLabel) {
        DOM.spWidgetScopeLabel.textContent = potState.poolScopeLabel;
    }

    if (DOM.savingPotsWidget) {
        DOM.savingPotsWidget.classList.toggle('sp-widget-over-assigned', potState.isOverAssigned);
    }

    let bodyHtml = '';

    if (!items.length) {
        bodyHtml = `
            <div class="sp-widget-empty">
                <p class="sp-widget-empty-title">No saved items yet</p>
                <p class="sp-widget-empty-copy">Add goals in Time Cost, then assign tracked earnings toward them.</p>
            </div>
        `;
    } else if (potState.earningsPool <= 0 && potState.totalAssigned <= 0) {
        bodyHtml = `
            ${buildSavingPotBalanceGridHtml(potState, currency)}
            <div class="sp-widget-empty sp-widget-empty-compact">
                <p class="sp-widget-empty-copy">Add monthly pay or track work sessions to build your earnings pool, then assign savings to your goals.</p>
            </div>
        `;
    } else {
        const goalSection = activeGoals.length
            ? buildSavingPotGoalCardHtml(potState.closestGoal, currency)
            : `<div class="sp-widget-all-funded">
                    <span class="sp-funded-badge">Fully funded</span>
                    <p>All ${fundedCount} saved item${fundedCount === 1 ? '' : 's'} reached their target.</p>
               </div>`;

        const assignedShare = potState.earningsPool > 0
            ? Math.min(100, (potState.totalAssigned / potState.earningsPool) * 100)
            : 0;

        bodyHtml = `
            ${buildSavingPotWarningHtml(potState, currency)}
            <div class="sp-widget-hero">
                <span class="sp-widget-hero-label">Available to assign</span>
                <span class="sp-widget-hero-value">${currency}${potState.unassignedBalance.toFixed(2)}</span>
                <span class="sp-widget-hero-meta">${escapeHtml(potState.poolScopeLabel)} · Pool ${currency}${potState.earningsPool.toFixed(2)}</span>
            </div>
            <div class="sp-widget-allocation">
                <div class="sp-widget-allocation-labels">
                    <span>Assigned ${currency}${potState.totalAssigned.toFixed(2)}</span>
                    <span>${assignedShare.toFixed(0)}% of pool</span>
                </div>
                <div class="sp-progress sp-progress-widget sp-progress-allocation" aria-hidden="true">
                    <span class="sp-progress-fill sp-progress-fill-assigned" style="width: ${assignedShare.toFixed(1)}%;"></span>
                </div>
            </div>
            ${goalSection}
        `;
    }

    DOM.spWidgetContent.innerHTML = `
        ${bodyHtml}
        <button type="button" class="btn-outline sp-widget-manage-btn">Manage in Time Cost</button>
    `;
}

export function refreshSavingPotDisplays() {
    renderSavingPotsSummary();
    renderSavingPotsWidget();
}

export function getSavingPotFundLimits(itemId) {
    const item = state.timeCostItems.find(entry => entry.id === itemId);
    if (!item) {
        return {
            item: null,
            maxAmount: 0,
            remaining: 0,
            savedAmount: 0,
            canFund: false,
            canFullyFund: false,
            canPartialFund: false,
            canWithdraw: false
        };
    }

    const potState = computeSavingPotStateFromAppState(state);
    const progressItem = potState.itemsWithProgress.find(entry => entry.id === itemId) || item;
    const savedAmount = getItemSavedAmount(progressItem);
    const cost = roundMoney(Math.max(Number(progressItem.cost) || 0, 0));
    const remaining = roundMoney(Math.max(0, cost - savedAmount));
    const maxAmount = roundMoney(Math.max(0, Math.min(potState.unassignedBalance, remaining)));
    const canFund = cost > 0
        && remaining > MONEY_EPSILON
        && !potState.isOverAssigned
        && maxAmount > MONEY_EPSILON;

    return {
        item,
        progressItem,
        potState,
        maxAmount,
        remaining,
        savedAmount,
        canFund,
        canFullyFund: canFund,
        canPartialFund: canFund && maxAmount >= 0.01,
        canWithdraw: savedAmount > MONEY_EPSILON
    };
}

function formatPartialFundAmount(amount) {
    return `${state.currentCurrency}${roundMoney(amount).toFixed(2)}`;
}

function clampPartialFundAmount(amount, maxAmount) {
    const max = roundMoney(Math.max(Number(maxAmount) || 0, 0));
    if (max <= 0) return 0;
    const min = Math.min(0.01, max);
    const parsed = roundMoney(Number(amount));
    if (!Number.isFinite(parsed)) return min;
    return roundMoney(Math.min(Math.max(parsed, min), max));
}

export function updatePartialFundControls(maxAmount, amount = null) {
    if (!DOM.spActionSlider || !DOM.spActionAmount) return 0;

    const max = roundMoney(Math.max(Number(maxAmount) || 0, 0));
    const min = max > 0 ? Math.min(0.01, max) : 0;
    const nextAmount = amount === null
        ? clampPartialFundAmount(max / 2, max)
        : clampPartialFundAmount(amount, max);

    DOM.spActionMax.value = String(max);
    DOM.spActionSlider.min = String(min);
    DOM.spActionSlider.max = String(max);
    DOM.spActionSlider.step = max >= 10 ? '0.5' : '0.01';
    DOM.spActionSlider.value = String(nextAmount);
    DOM.spActionSlider.setAttribute('aria-valuemin', String(min));
    DOM.spActionSlider.setAttribute('aria-valuemax', String(max));
    DOM.spActionSlider.setAttribute('aria-valuenow', String(nextAmount));

    DOM.spActionAmount.min = String(min);
    DOM.spActionAmount.max = String(max);
    DOM.spActionAmount.step = max >= 10 ? '0.5' : '0.01';
    DOM.spActionAmount.value = nextAmount.toFixed(2);

    if (DOM.spPartialAmountDisplay) {
        DOM.spPartialAmountDisplay.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>${nextAmount.toFixed(2)}`;
    }

    if (DOM.spPartialMaxLabel) {
        DOM.spPartialMaxLabel.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>${max.toFixed(2)}`;
    }

    if (DOM.saveSpActionBtn) {
        DOM.saveSpActionBtn.disabled = max <= 0 || nextAmount <= 0;
    }

    return nextAmount;
}

export function syncPartialFundFromSlider() {
    const max = roundMoney(Number(DOM.spActionMax?.value) || 0);
    const amount = clampPartialFundAmount(DOM.spActionSlider?.value, max);
    updatePartialFundControls(max, amount);
    return amount;
}

export function syncPartialFundFromInput() {
    const max = roundMoney(Number(DOM.spActionMax?.value) || 0);
    const amount = clampPartialFundAmount(DOM.spActionAmount?.value, max);
    updatePartialFundControls(max, amount);
    return amount;
}

export async function fullyFundSavingPot(itemId) {
    const limits = getSavingPotFundLimits(itemId);

    if (limits.potState?.isOverAssigned) {
        showAlert('Cannot Assign', 'You are over-assigned. Withdraw from items before assigning more.');
        return false;
    }

    if (!limits.canFullyFund) {
        showAlert('Cannot Fully Fund', 'There is no available balance to assign to this item.');
        return false;
    }

    const { assignToSavingPot } = await import('./api.js');
    return assignToSavingPot(itemId, limits.maxAmount);
}

export async function withdrawAllFromSavingPot(itemId) {
    const limits = getSavingPotFundLimits(itemId);

    if (!limits.canWithdraw) {
        showAlert('Nothing to Withdraw', 'This item has no assigned savings yet.');
        return false;
    }

    const { withdrawFromSavingPot } = await import('./api.js');
    return withdrawFromSavingPot(itemId, limits.savedAmount);
}

export function openPartialFundModal(itemId) {
    if (!DOM.spActionModal) return;

    const limits = getSavingPotFundLimits(itemId);
    const item = limits.item;
    if (!item) return;

    const itemName = item.name || 'Unnamed Item';

    if (limits.potState?.isOverAssigned) {
        showAlert('Cannot Assign', 'You are over-assigned. Withdraw from items before assigning more.');
        return;
    }

    if (!limits.canPartialFund) {
        showAlert('Cannot Partially Fund', 'There is no available balance to assign to this item.');
        return;
    }

    DOM.spActionItemId.value = itemId;
    if (DOM.spActionModalTitle) {
        DOM.spActionModalTitle.textContent = 'Partial Fund';
    }
    DOM.spActionItemLabel.textContent = itemName;
    DOM.spActionHint.textContent = `Choose how much to assign — up to ${formatPartialFundAmount(limits.maxAmount)} (${formatPartialFundAmount(limits.remaining)} remaining for this item).`;
    updatePartialFundControls(limits.maxAmount);
    if (DOM.saveSpActionBtn) {
        DOM.saveSpActionBtn.textContent = 'Assign';
    }

    DOM.spActionModal.classList.remove('hidden');
    DOM.spActionSlider?.focus();
}

export function closeSavingPotModal() {
    if (!DOM.spActionModal) return;
    DOM.spActionModal.classList.add('hidden');
    DOM.spActionItemId.value = '';
    DOM.spActionMax.value = '';
    if (DOM.spActionAmount) DOM.spActionAmount.value = '';
}

export function renderSavedTimeCostItems() {
    refreshSavingPotDisplays();
    renderTcCutsSummary();
    renderTimeCostRateBreakdown();
    if (!DOM.tcSavedItemsContainer) return;

    if (!state.timeCostItems || state.timeCostItems.length === 0) {
        DOM.tcSavedItemsContainer.innerHTML = '<p class="loading-text">No saved items.</p>';
        renderSavedItemsComparisonChart([], 0, 0);
        renderSavedItemsComparisonMatrix([]);
        return;
    }

    const potState = computeSavingPotStateFromAppState(state);
    const progressById = new Map(potState.itemsWithProgress.map(item => [item.id, item]));

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

    const itemViews = filteredItems.map(item => {
        const cost = Number(item.cost) || 0;
        const progressItem = progressById.get(item.id);
        const savedAmount = progressItem?.savedAmount ?? getItemSavedAmount(item);
        const remaining = progressItem?.remaining ?? Math.max(0, cost - savedAmount);
        const itemName = item.name || 'Unnamed Item';
        const dateBought = item.dateBought || '';
        const canFullyFund = cost > 0 && remaining > 0 && !potState.isOverAssigned && potState.unassignedBalance > 0;
        const canPartialFund = canFullyFund;
        const canWithdraw = savedAmount > 0;
        const fullFundAmount = roundMoney(Math.max(0, Math.min(potState.unassignedBalance, remaining)));
        const baseHours = baseRate > 0 ? cost / baseRate : Infinity;
        const effectiveHours = effectiveRate > 0 ? cost / effectiveRate : Infinity;

        const baseDays = baseHours / dailyHours;
        const baseWeeks = baseDays / daysInWeek;
        const baseMonths = baseDays / daysInMonth;

        const effectiveDays = effectiveHours / dailyHours;
        const effectiveWeeks = effectiveDays / daysInWeek;
        const effectiveMonths = effectiveDays / daysInMonth;

        return {
            itemId: item.id,
            itemName,
            cost,
            dateBought,
            progressItem,
            savedAmount,
            remaining,
            canFullyFund,
            canPartialFund,
            canWithdraw,
            fullFundAmount,
            totalCutPercentage,
            baseHoursStr: baseHours === Infinity ? '∞' : `${baseHours.toFixed(1)}h`,
            baseDaysStr: baseHours === Infinity ? '∞' : `${baseDays.toFixed(1)}d`,
            baseWeeksStr: baseHours === Infinity ? '∞' : `${baseWeeks.toFixed(1)}w`,
            baseMonthsStr: baseHours === Infinity ? '∞' : `${baseMonths.toFixed(1)}m`,
            effectiveHoursStr: effectiveHours === Infinity ? '∞' : `${effectiveHours.toFixed(1)}h`,
            effectiveDaysStr: effectiveHours === Infinity ? '∞' : `${effectiveDays.toFixed(1)}d`,
            effectiveWeeksStr: effectiveHours === Infinity ? '∞' : `${effectiveWeeks.toFixed(1)}w`,
            effectiveMonthsStr: effectiveHours === Infinity ? '∞' : `${effectiveMonths.toFixed(1)}m`
        };
    });

    let desktopRowsHtml = '';
    itemViews.forEach(view => {
        desktopRowsHtml += `
                <tr>
                    <td class="tc-sticky-col sp-item-cell">
                        <div class="sp-item-header">
                            <strong class="sp-item-name">${escapeHtml(view.itemName)}</strong>
                            ${renderSavingPotActionButtons(view)}
                        </div>
                        ${renderSavingPotItemPanel(view.progressItem, view.itemName, view.savedAmount, view.remaining, view.cost)}
                    </td>
                    <td class="tc-amount">
                        ${state.currentCurrency}${view.cost.toFixed(2)}
                    </td>
                    <td class="tc-date-bought-display">${formatSavedItemDateBought(view.dateBought)}</td>
                    <td class="tc-time" style="color: var(--text-primary); font-size: 0.95rem;">${view.baseHoursStr}</td>
                    <td class="tc-time" style="color: var(--text-primary); font-size: 0.95rem;">${view.baseDaysStr}</td>
                    <td class="tc-time" style="color: var(--text-primary); font-size: 0.95rem;">${view.baseWeeksStr}</td>
                    <td class="tc-time" style="color: var(--text-primary); font-size: 0.95rem;">${view.baseMonthsStr}</td>
                    <td class="tc-time" style="font-size: 0.95rem;">${view.effectiveHoursStr}</td>
                    <td class="tc-time" style="font-size: 0.95rem;">${view.effectiveDaysStr}</td>
                    <td class="tc-time" style="font-size: 0.95rem;">${view.effectiveWeeksStr}</td>
                    <td class="tc-time" style="font-size: 0.95rem;">${view.effectiveMonthsStr}</td>
                    <td style="text-align: center;">
                        ${renderSavedItemIconActions(view.itemId)}
                    </td>
                </tr>
        `;
    });

    const layoutMode = window.matchMedia('(max-width: 900px)').matches ? 'mobile' : 'desktop';
    lastSavedItemsLayoutMode = layoutMode;
    ensureSavedItemsLayoutListener();

    const html = layoutMode === 'mobile'
        ? `
            <div class="tc-saved-items-layout tc-saved-items-layout-mobile">
                <div class="tc-saved-items-mobile" aria-label="Saved items with Saving Pots">
                    ${itemViews.map(renderSavedItemMobileCard).join('')}
                </div>
            </div>
        `
        : `
            <div class="tc-saved-items-layout tc-saved-items-layout-desktop">
                <div class="tc-saved-items-desktop">
                    <div class="tc-table-scroll">
                        <table class="tc-breakdown-table tc-saved-items-table">
                            <thead>
                                <tr>
                                    <th rowspan="2" class="tc-sticky-col sp-item-col-header" style="vertical-align: middle;">Item</th>
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
                                ${desktopRowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
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

    DOM.tcSavedItemsContainer.querySelectorAll('.sp-full-fund-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (btn.disabled) return;
            await fullyFundSavingPot(btn.dataset.id);
        });
    });

    DOM.tcSavedItemsContainer.querySelectorAll('.sp-partial-fund-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            openPartialFundModal(btn.dataset.id);
        });
    });

    DOM.tcSavedItemsContainer.querySelectorAll('.sp-withdraw-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (btn.disabled) return;
            await withdrawAllFromSavingPot(btn.dataset.id);
        });
    });

    const deleteBtns = DOM.tcSavedItemsContainer.querySelectorAll('.tc-delete-btn');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const itemId = btn.dataset.id;
            const itemObj = state.timeCostItems.find(x => x.id === itemId);
            const itemName = itemObj ? itemObj.name || 'Unnamed Item' : 'this item';
            const displayName = itemName ? `"${itemName}"` : 'this item';
            const savedAmount = getItemSavedAmount(itemObj || {});
            const savedNote = savedAmount > 0
                ? ` ${state.currentCurrency}${savedAmount.toFixed(2)} assigned to this item will return to your unassigned balance.`
                : '';

            const confirmed = await showConfirm(
                "Delete Saved Item",
                `Are you sure you want to delete ${displayName}?${savedNote}`
            );
            if (confirmed) {
                import('./api.js').then(module => module.deleteTimeCostItem(itemId));
            }
        });
    });
}

const BUDGET_PIE_VIEWBOX = 320;
const BUDGET_PIE_RADIUS = 130;
let budgetPieResizeObserver = null;

function formatBudgetMoney(amount) {
    return `${state.currentCurrency}${roundMoney(amount).toFixed(2)}`;
}

function syncBudgetTotalInput() {
    if (!DOM.budgetTotalInput) return;
    if (document.activeElement === DOM.budgetTotalInput) return;
    const total = Number(state.budgetPlan?.totalAmount) || 0;
    DOM.budgetTotalInput.value = total > 0 || state.budgetPlanHydrated ? String(total) : '';
}

export function renderBudgetPie(options = {}) {
    if (!DOM.budgetPieHost) return;

    const divisions = state.budgetPlan?.divisions || [];
    const skipFocus = options.skipFocus === true;
    const focusedBoundary = skipFocus ? null : options.focusedBoundaryIndex;
    const size = BUDGET_PIE_VIEWBOX;
    const cx = size / 2;
    const cy = size / 2;
    const radius = BUDGET_PIE_RADIUS;

    if (divisions.length === 0) {
        DOM.budgetPieHost.innerHTML = `<p class="loading-text">Add a division to see the pie chart.</p>`;
        if (DOM.budgetPieHint) {
            DOM.budgetPieHint.textContent = 'Add divisions to start budgeting.';
        }
        return;
    }

    const existingSvg = DOM.budgetPieHost.querySelector('.budget-pie-svg');
    const canPatch = options.patch === true
        && existingSvg
        && existingSvg.querySelectorAll('.budget-pie-slice').length === divisions.length
        && existingSvg.querySelectorAll('.budget-pie-handle').length === (divisions.length >= 2 ? divisions.length : 0);

    if (canPatch) {
        patchBudgetPieGeometry(existingSvg, divisions, cx, cy, radius);
        return;
    }

    const slices = percentsToAngles(divisions);
    const slicePaths = slices.map((slice, index) => {
        const color = getDivisionColor(index);
        const path = describeSlicePath(cx, cy, radius, slice.startAngle, slice.endAngle);
        const label = escapeHtml(divisions[index]?.name || `Division ${index + 1}`);
        return `<path class="budget-pie-slice" data-division-id="${escapeHtml(divisions[index].id)}" d="${path}" fill="${color}" stroke="rgba(7, 9, 19, 0.55)" stroke-width="2"><title>${label}</title></path>`;
    }).join('');

    let handles = '';
    if (divisions.length >= 2) {
        const boundaries = getBoundaryPercents(divisions);
        handles = boundaries.map((boundary) => {
            const percent = boundary.boundaryIndex === divisions.length - 1 && Math.abs(boundary.percent - 100) < 0.0001
                ? 0
                : boundary.percent;
            const angle = percentToAngle(percent % 100);
            const point = angleToPoint(cx, cy, radius, angle);
            const label = escapeHtml(describeBoundary(divisions, boundary.boundaryIndex));
            const leftPct = divisions[boundary.leftIndex]?.percentage ?? 0;
            const handleColor = getDivisionColor(boundary.leftIndex);
            return `
                <circle
                    class="budget-pie-handle"
                    tabindex="0"
                    role="slider"
                    aria-label="${label}"
                    aria-valuemin="${BUDGET_MIN_PERCENT}"
                    aria-valuemax="${100 - BUDGET_MIN_PERCENT}"
                    aria-valuenow="${Math.round(leftPct)}"
                    data-boundary-index="${boundary.boundaryIndex}"
                    cx="${point.x}"
                    cy="${point.y}"
                    r="13"
                    fill="${handleColor}"
                    stroke="rgba(255, 255, 255, 0.92)"
                ></circle>
            `;
        }).join('');
    }

    DOM.budgetPieHost.innerHTML = `
        <svg class="budget-pie-svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%" role="img" aria-label="Budget allocation pie chart">
            <g class="budget-pie-slices">${slicePaths}</g>
            <g class="budget-pie-handles">${handles}</g>
        </svg>
    `;

    if (DOM.budgetPieHint) {
        DOM.budgetPieHint.textContent = divisions.length < 2
            ? 'Add another division to unlock drag handles on the pie.'
            : 'Drag the handles on the pie edge to adjust shares.';
    }

    if (focusedBoundary != null && Number.isFinite(focusedBoundary)) {
        const handle = DOM.budgetPieHost.querySelector(`.budget-pie-handle[data-boundary-index="${focusedBoundary}"]`);
        handle?.focus({ preventScroll: true });
    }
}

function patchBudgetPieGeometry(svg, divisions, cx, cy, radius) {
    const slices = percentsToAngles(divisions);
    const sliceNodes = svg.querySelectorAll('.budget-pie-slice');
    slices.forEach((slice, index) => {
        const node = sliceNodes[index];
        if (!node) return;
        node.setAttribute('d', describeSlicePath(cx, cy, radius, slice.startAngle, slice.endAngle));
        node.setAttribute('fill', getDivisionColor(index));
    });

    if (divisions.length < 2) return;

    const boundaries = getBoundaryPercents(divisions);
    boundaries.forEach((boundary) => {
        const handle = svg.querySelector(`.budget-pie-handle[data-boundary-index="${boundary.boundaryIndex}"]`);
        if (!handle) return;
        const percent = boundary.boundaryIndex === divisions.length - 1 && Math.abs(boundary.percent - 100) < 0.0001
            ? 0
            : boundary.percent;
        const angle = percentToAngle(percent % 100);
        const point = angleToPoint(cx, cy, radius, angle);
        handle.setAttribute('cx', String(point.x));
        handle.setAttribute('cy', String(point.y));
        handle.setAttribute('fill', getDivisionColor(boundary.leftIndex));
        const leftPct = divisions[boundary.leftIndex]?.percentage ?? 0;
        handle.setAttribute('aria-valuenow', String(Math.round(leftPct)));
        handle.setAttribute('aria-label', describeBoundary(divisions, boundary.boundaryIndex));
    });
}

export function renderBudgetDivisionListAmountsOnly() {
    if (!DOM.budgetDivisionList) return;
    const divisions = state.budgetPlan?.divisions || [];
    const amounts = computeAmounts(state.budgetPlan?.totalAmount, divisions);

    divisions.forEach((division, index) => {
        const row = DOM.budgetDivisionList.querySelector(`[data-division-id="${division.id}"]`);
        if (!row) return;
        const pctInput = row.querySelector('.budget-pct-input');
        const amountEl = row.querySelector('.budget-division-amount');
        if (pctInput && document.activeElement !== pctInput) {
            pctInput.value = String(Math.round(division.percentage * 100) / 100);
        }
        if (amountEl) {
            amountEl.textContent = formatBudgetMoney(amounts[index] ?? 0);
        }
    });

    if (DOM.budgetSumNote) {
        const sum = divisions.reduce((total, division) => total + (Number(division.percentage) || 0), 0);
        DOM.budgetSumNote.textContent = `${divisions.length} division${divisions.length === 1 ? '' : 's'} · ${sum.toFixed(2)}% total · min ${BUDGET_MIN_PERCENT}% each · max ${BUDGET_MAX_DIVISIONS}`;
    }

    renderBudgetBarChart({ patch: true });
}

export function renderBudgetBarChart(options = {}) {
    if (!DOM.budgetBarChart) return;

    const divisions = state.budgetPlan?.divisions || [];
    const amounts = computeAmounts(state.budgetPlan?.totalAmount, divisions);

    if (!divisions.length) {
        DOM.budgetBarChart.innerHTML = `<p class="loading-text">Add a division to see the bar chart.</p>`;
        return;
    }

    const maxPercent = Math.max(...divisions.map((d) => Number(d.percentage) || 0), BUDGET_MIN_PERCENT);
    const existingBars = DOM.budgetBarChart.querySelectorAll('.budget-bar-col');
    const canPatch = options.patch === true && existingBars.length === divisions.length;

    if (canPatch) {
        divisions.forEach((division, index) => {
            const col = existingBars[index];
            if (!col) return;
            const pct = Number(division.percentage) || 0;
            const heightPct = Math.max((pct / maxPercent) * 100, 2);
            const fill = col.querySelector('.budget-bar-fill');
            const value = col.querySelector('.budget-bar-value');
            const label = col.querySelector('.budget-bar-label');
            const amount = col.querySelector('.budget-bar-amount');
            if (fill) {
                fill.style.height = `${heightPct}%`;
                fill.style.background = getDivisionColor(index);
            }
            if (value) value.textContent = `${(Math.round(pct * 100) / 100)}%`;
            if (label) label.textContent = division.name || `Division ${index + 1}`;
            if (amount) amount.textContent = formatBudgetMoney(amounts[index] ?? 0);
            col.setAttribute('title', `${division.name}: ${pct}% · ${formatBudgetMoney(amounts[index] ?? 0)}`);
        });
        return;
    }

    DOM.budgetBarChart.innerHTML = `
        <div class="budget-bar-chart-inner">
            ${divisions.map((division, index) => {
                const pct = Number(division.percentage) || 0;
                const heightPct = Math.max((pct / maxPercent) * 100, 2);
                const color = getDivisionColor(index);
                const name = escapeHtml(division.name || `Division ${index + 1}`);
                const pctLabel = Math.round(pct * 100) / 100;
                const money = formatBudgetMoney(amounts[index] ?? 0);
                return `
                    <div class="budget-bar-col" data-division-id="${escapeHtml(division.id)}" title="${name}: ${pctLabel}% · ${escapeHtml(money)}">
                        <div class="budget-bar-track">
                            <div class="budget-bar-fill" style="height:${heightPct}%; background:${color};"></div>
                        </div>
                        <span class="budget-bar-value">${pctLabel}%</span>
                        <span class="budget-bar-amount">${escapeHtml(money)}</span>
                        <span class="budget-bar-label">${name}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

export function renderBudgetDivisionList() {
    if (!DOM.budgetDivisionList) return;

    const divisions = state.budgetPlan?.divisions || [];
    const amounts = computeAmounts(state.budgetPlan?.totalAmount, divisions);
    const canAdd = canAddDivision(divisions);
    const canRemove = divisions.length > 1;

    if (DOM.budgetAddDivisionBtn) {
        DOM.budgetAddDivisionBtn.disabled = !canAdd;
        DOM.budgetAddDivisionBtn.title = canAdd
            ? 'Add a division'
            : `Maximum ${BUDGET_MAX_DIVISIONS} divisions, or not enough room above ${BUDGET_MIN_PERCENT}%`;
    }

    if (!divisions.length) {
        DOM.budgetDivisionList.innerHTML = `<p class="loading-text">No divisions yet.</p>`;
    } else {
        DOM.budgetDivisionList.innerHTML = divisions.map((division, index) => {
            const color = getDivisionColor(index);
            const amount = amounts[index] ?? 0;
            const safeId = escapeHtml(division.id);
            const safeName = escapeHtml(division.name);
            const pctDisplay = Number.isFinite(division.percentage)
                ? (Math.round(division.percentage * 100) / 100)
                : BUDGET_MIN_PERCENT;
            return `
                <div class="budget-division-row" data-division-id="${safeId}">
                    <span class="budget-division-swatch" style="background:${color}" aria-hidden="true"></span>
                    <div class="budget-division-fields">
                        <div class="budget-name-field">
                            <label class="budget-field-label" for="budget-name-${safeId}">Name</label>
                            <input type="text" id="budget-name-${safeId}" class="budget-name-input" data-id="${safeId}" value="${safeName}" maxlength="60" placeholder="Division name">
                        </div>
                        <div class="budget-pct-field">
                            <label class="budget-field-label" for="budget-pct-${safeId}">Share</label>
                            <div class="budget-pct-row">
                                <input type="number" id="budget-pct-${safeId}" class="budget-pct-input" data-id="${safeId}" min="${BUDGET_MIN_PERCENT}" max="${100 - BUDGET_MIN_PERCENT}" step="1" value="${pctDisplay}">
                                <span class="budget-pct-suffix">%</span>
                            </div>
                        </div>
                        <p class="budget-division-amount">${formatBudgetMoney(amount)}</p>
                    </div>
                    <button type="button" class="btn-text budget-delete-btn" data-id="${safeId}" ${canRemove ? '' : 'disabled'} title="Remove division" aria-label="Remove ${safeName}">×</button>
                </div>
            `;
        }).join('');
    }

    if (DOM.budgetSumNote) {
        const sum = divisions.reduce((total, division) => total + (Number(division.percentage) || 0), 0);
        DOM.budgetSumNote.textContent = `${divisions.length} division${divisions.length === 1 ? '' : 's'} · ${sum.toFixed(2)}% total · min ${BUDGET_MIN_PERCENT}% each · max ${BUDGET_MAX_DIVISIONS}`;
    }
}

function syncBudgetSnapModeButtons() {
    if (!DOM.budgetSnapModeButtons?.length) return;
    const mode = sanitizeBudgetSnapMode(state.budgetSnapMode);
    DOM.budgetSnapModeButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.snap === mode);
        btn.setAttribute('aria-pressed', btn.dataset.snap === mode ? 'true' : 'false');
    });
}

export function renderBudgetingView(options = {}) {
    if (!DOM.budgetingView) return;
    syncBudgetTotalInput();
    syncBudgetSnapModeButtons();
    renderBudgetDivisionList();
    renderBudgetPie(options);
    renderBudgetBarChart(options.patch ? { patch: true } : {});

    if (!budgetPieResizeObserver && typeof ResizeObserver !== 'undefined' && DOM.budgetPieHost) {
        let frame = null;
        budgetPieResizeObserver = new ResizeObserver(() => {
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                if (DOM.budgetingView && !DOM.budgetingView.classList.contains('hidden')) {
                    renderBudgetPie({ skipFocus: true });
                }
            });
        });
        budgetPieResizeObserver.observe(DOM.budgetPieHost);
    }
}

export function getBudgetPieGeometry() {
    if (!DOM.budgetPieHost) return null;
    const svg = DOM.budgetPieHost.querySelector('.budget-pie-svg');
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
        svg,
        rect,
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        scaleX: BUDGET_PIE_VIEWBOX / rect.width,
        scaleY: BUDGET_PIE_VIEWBOX / rect.height
    };
}

export function clientPointToBudgetAngle(clientX, clientY) {
    const geometry = getBudgetPieGeometry();
    if (!geometry) return null;
    return Math.atan2(clientY - geometry.cy, clientX - geometry.cx);
}

function formatBudgetExportMoney(amount) {
    return `${state.currentCurrency}${roundMoney(amount).toFixed(2)}`;
}

function formatBudgetExportPercent(pct) {
    const value = Number(pct) || 0;
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function getBudgetPieExportFilename(format) {
    const date = new Date().toISOString().slice(0, 10);
    const extension = format === 'jpeg' ? 'jpg' : 'png';
    return `work-tracker-budget-pie-${date}.${extension}`;
}

function downloadBudgetExportCanvas(canvas, format) {
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpeg' ? 0.95 : undefined;
    const filename = getBudgetPieExportFilename(format);

    // Prefer data URL download so no blob: fetch goes through a service worker.
    try {
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        return Promise.resolve();
    } catch (error) {
        // Fallback for rare toDataURL size limits
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(error || new Error('Could not create image file.'));
                    return;
                }

                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                resolve();
            }, mimeType, quality);
        });
    }
}

/**
 * Render a labeled budget pie + legend to an offscreen canvas (no network / html2canvas).
 */
export function createBudgetPieExportCanvas(plan = state.budgetPlan) {
    const divisions = plan?.divisions || [];
    if (!divisions.length) {
        throw new Error('Add at least one division before exporting.');
    }

    const totalAmount = Math.max(Number(plan?.totalAmount) || 0, 0);
    const amounts = computeAmounts(totalAmount, divisions);
    const slices = percentsToAngles(divisions);

    const width = 1600;
    const height = 1100;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');

    // Background
    ctx.fillStyle = '#070913';
    ctx.fillRect(0, 0, width, height);

    // Soft accent glow
    const glow = ctx.createRadialGradient(420, 520, 40, 420, 520, 420);
    glow.addColorStop(0, 'rgba(0, 212, 255, 0.16)');
    glow.addColorStop(1, 'rgba(0, 212, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 900, height);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 44px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Budget Allocation', 64, 48);

    ctx.fillStyle = '#aab4be';
    ctx.font = '500 22px Outfit, sans-serif';
    ctx.fillText(`Total  ${formatBudgetExportMoney(totalAmount)}`, 64, 108);

    // Pie
    const cx = 420;
    const cy = 560;
    const radius = 270;

    slices.forEach((slice, index) => {
        const color = getDivisionColor(index);
        let delta = slice.endAngle - slice.startAngle;
        if (delta < 0) delta += 2 * Math.PI;
        if (delta <= 0) return;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, slice.startAngle, slice.endAngle, false);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(7, 9, 19, 0.65)';
        ctx.lineWidth = 3;
        ctx.stroke();
    });

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Callout labels for larger slices
    const minCalloutPercent = 8;
    slices.forEach((slice, index) => {
        const pct = Number(divisions[index]?.percentage) || 0;
        if (pct < minCalloutPercent) return;

        const mid = getSliceMidAngle(slice.startAngle, slice.endAngle);
        const inner = angleToPoint(cx, cy, radius * 0.82, mid);
        const elbow = angleToPoint(cx, cy, radius + 28, mid);
        const onRight = Math.cos(mid) >= 0;
        const labelX = elbow.x + (onRight ? 18 : -18);

        ctx.beginPath();
        ctx.moveTo(inner.x, inner.y);
        ctx.lineTo(elbow.x, elbow.y);
        ctx.lineTo(labelX, elbow.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const name = divisions[index]?.name || `Division ${index + 1}`;
        const line1 = name.length > 22 ? `${name.slice(0, 21)}…` : name;
        const line2 = `${formatBudgetExportPercent(pct)}  ·  ${formatBudgetExportMoney(amounts[index] ?? 0)}`;

        ctx.textAlign = onRight ? 'left' : 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 18px Outfit, sans-serif';
        ctx.fillText(line1, labelX, elbow.y - 2);

        ctx.textBaseline = 'top';
        ctx.fillStyle = '#aab4be';
        ctx.font = '500 16px Outfit, sans-serif';
        ctx.fillText(line2, labelX, elbow.y + 4);
    });

    // Legend panel
    const legendX = 860;
    let legendY = 180;
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 26px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Divisions', legendX, legendY);
    legendY += 44;

    const rowHeight = Math.min(56, Math.max(36, Math.floor(720 / Math.max(divisions.length, 1))));

    divisions.forEach((division, index) => {
        const color = getDivisionColor(index);
        const pct = Number(division.percentage) || 0;
        const amount = amounts[index] ?? 0;
        const name = division.name || `Division ${index + 1}`;

        // Row card
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        roundRectPath(ctx, legendX, legendY, 660, rowHeight - 8, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Swatch
        ctx.beginPath();
        ctx.arc(legendX + 24, legendY + (rowHeight - 8) / 2, 9, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const textY = legendY + (rowHeight - 8) / 2;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 20px Outfit, sans-serif';
        const nameMax = 280;
        let displayName = name;
        while (displayName.length > 3 && ctx.measureText(displayName).width > nameMax) {
            displayName = `${displayName.slice(0, -2)}…`;
        }
        ctx.fillText(displayName, legendX + 48, textY);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#00d4ff';
        ctx.font = '700 20px Outfit, sans-serif';
        ctx.fillText(formatBudgetExportPercent(pct), legendX + 430, textY);

        ctx.fillStyle = '#00e676';
        ctx.font = '600 20px Outfit, sans-serif';
        ctx.fillText(formatBudgetExportMoney(amount), legendX + 630, textY);

        legendY += rowHeight;
    });

    // Footer
    const exportedAt = new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(170, 180, 190, 0.85)';
    ctx.font = '500 16px Outfit, sans-serif';
    ctx.fillText(`Work Tracker  ·  Exported ${exportedAt}`, 64, height - 36);

    ctx.textAlign = 'right';
    ctx.fillText(`${divisions.length} division${divisions.length === 1 ? '' : 's'}  ·  100%`, width - 64, height - 36);

    return canvas;
}

function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

export async function exportBudgetPieChart(format = 'png', button = null) {
    const originalText = button?.textContent;
    if (button) {
        button.disabled = true;
        button.textContent = 'Exporting...';
    }

    try {
        if (document.fonts?.ready) {
            await Promise.race([
                document.fonts.ready,
                new Promise((resolve) => setTimeout(resolve, 800))
            ]);
        }
        const canvas = createBudgetPieExportCanvas(state.budgetPlan);
        await downloadBudgetExportCanvas(canvas, format === 'jpeg' ? 'jpeg' : 'png');
    } catch (error) {
        console.error('Debug: Budget pie export failed', error);
        await showAlert('Export Error', error?.message || 'Could not export the pie chart. Please try again.');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText || 'Export pie chart';
        }
    }
}
