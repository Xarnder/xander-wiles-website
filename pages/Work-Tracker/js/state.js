const DEFAULT_WIDGET_ORDER = ['widget-timer', 'widget-money-counter', 'widget-stats', 'widget-cut-stats', 'widget-cuts', 'widget-gantt', 'widget-calendar', 'widget-chart', 'widget-history'];

function createCutId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return `cut-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createTimeScaleId() {
    return `tc-scale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitizePercentageCuts(cuts) {
    if (!Array.isArray(cuts)) return [];

    return cuts
        .map((cut) => {
            const rawPercentage = Number(cut.percentage);
            const percentage = Number.isFinite(rawPercentage) ? Math.min(Math.max(rawPercentage, 0), 100) : 0;
            const name = String(cut.name || '').trim();
            const basis = cut.basis === 'original' ? 'original' : 'accumulative';

            return {
                id: cut.id || createCutId(),
                name,
                percentage,
                basis
            };
        })
        .filter(cut => cut.name || cut.percentage > 0)
        .map((cut, index) => ({
            ...cut,
            name: cut.name || `Cut ${index + 1}`
        }));
}

function sanitizeCustomTimeScales(scales) {
    if (!Array.isArray(scales)) return [];

    const allowedUnits = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'];

    return scales
        .map((scale) => {
            const amount = Number(scale.amount);
            const unit = allowedUnits.includes(scale.unit) ? scale.unit : 'hours';

            return {
                id: scale.id || createTimeScaleId(),
                amount: Number.isFinite(amount) ? Math.min(Math.max(amount, 0), 100000) : 0,
                unit
            };
        })
        .filter(scale => scale.amount > 0);
}

function loadWidgetOrder() {
    try {
        const savedOrder = JSON.parse(localStorage.getItem('work_tracker_widget_order')) || [];
        if (!Array.isArray(savedOrder)) return DEFAULT_WIDGET_ORDER;

        const knownSavedItems = savedOrder.filter(id => DEFAULT_WIDGET_ORDER.includes(id));
        const missingItems = DEFAULT_WIDGET_ORDER.filter(id => !knownSavedItems.includes(id));
        return [...knownSavedItems, ...missingItems];
    } catch (e) {
        console.warn('Debug: Could not parse widget order from storage', e);
        return DEFAULT_WIDGET_ORDER;
    }
}

function loadPercentageCuts() {
    try {
        return sanitizePercentageCuts(JSON.parse(localStorage.getItem('work_tracker_percentage_cuts')) || []);
    } catch (e) {
        console.warn('Debug: Could not parse percentage cuts from storage', e);
        return [];
    }
}

function loadActiveCutStatsPeriods() {
    try {
        const saved = JSON.parse(localStorage.getItem('work_tracker_active_periods'));
        if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch (e) {
        console.warn('Debug: Could not parse active periods from storage', e);
    }
    return ['daily', 'weekly', 'monthly'];
}

function loadTcCustomTimeScales() {
    try {
        return sanitizeCustomTimeScales(JSON.parse(localStorage.getItem('work_tracker_tc_custom_time_scales')) || []);
    } catch (e) {
        console.warn('Debug: Could not parse custom time scales from storage', e);
        return [];
    }
}

function loadTcWorkingDaysPerWeek() {
    const saved = parseFloat(localStorage.getItem('work_tracker_tc_working_days_per_week'));
    if (Number.isFinite(saved)) return Math.min(Math.max(saved, 1), 7);

    const legacyIncludeWeekends = localStorage.getItem('work_tracker_tc_include_weekends');
    if (legacyIncludeWeekends === 'true') return 7;

    return 5;
}

function loadDashboardDensity() {
    const saved = localStorage.getItem('work_tracker_dashboard_density');
    if (saved === 'compact' || saved === 'spacious') return saved;
    return 'comfortable';
}

function loadMoneyCounterMode() {
    return localStorage.getItem('work_tracker_money_counter_mode') === 'after' ? 'after' : 'before';
}

function loadTcMatrixSelectedItemIds() {
    try {
        const saved = JSON.parse(localStorage.getItem('work_tracker_tc_matrix_selected_items')) || [];
        if (!Array.isArray(saved)) return [];
        return saved.map(id => String(id)).filter(Boolean).slice(0, 10);
    } catch (e) {
        console.warn('Debug: Could not parse matrix item selection from storage', e);
        return [];
    }
}

function loadTcMatrixSelectionInitialized() {
    return localStorage.getItem('work_tracker_tc_matrix_selection_initialized') === 'true';
}

export const state = {
    currentUser: null,
    timerInterval: null,
    startTime: null,
    currentSessionRate: 0,
    currentCompany: '',
    currentProject: '',
    currentCalendarDate: new Date(),
    currentChartDate: new Date(),
    currentTimelineDate: new Date(),
    batchModeEnabled: false,
    batchSelectedDates: [],
    rawSessions: [],
    allSessions: [],
    globalFilterCompany: '',
    globalFilterProject: '',
    currentCurrency: localStorage.getItem('work_tracker_currency') || '£',
    widgetOrder: loadWidgetOrder(),
    showWidgetTitles: localStorage.getItem('work_tracker_show_titles') !== 'false',
    startOfWeek: parseInt(localStorage.getItem('work_tracker_start_of_week')) || 0, // 0 = Sunday, 1 = Monday
    continueSessionOnClose: localStorage.getItem('work_tracker_continue_session') !== 'false', // default true
    defaultHourlyRate: parseFloat(localStorage.getItem('work_tracker_default_rate')) || 20,
    ratePreference: localStorage.getItem('work_tracker_rate_pref') || 'last_session',
    defaultCompany: localStorage.getItem('work_tracker_default_company') || '',
    companyPreference: localStorage.getItem('work_tracker_company_pref') || 'last_session',
    defaultProject: localStorage.getItem('work_tracker_default_project') || '',
    projectPreference: localStorage.getItem('work_tracker_project_pref') || 'last_session',
    defaultStartTime: localStorage.getItem('work_tracker_default_start_time') || '09:00',
    startTimePreference: localStorage.getItem('work_tracker_start_time_pref') || 'last_session',
    percentageCuts: loadPercentageCuts(),
    timeCostItems: [],
    tcHourlyRate: parseFloat(localStorage.getItem('work_tracker_tc_hourly_rate')) || 20,
    tcDailyHours: parseFloat(localStorage.getItem('work_tracker_tc_daily_hours')) || 8,
    tcWorkingDaysPerWeek: loadTcWorkingDaysPerWeek(),
    dashboardDensity: loadDashboardDensity(),
    moneyCounterMode: loadMoneyCounterMode(),
    tcCustomTimeScales: loadTcCustomTimeScales(),
    tcSavedItemFilters: {
        search: '',
        dateStatus: 'all',
        fromDate: '',
        toDate: ''
    },
    tcMatrixSelectedItemIds: loadTcMatrixSelectedItemIds(),
    tcMatrixSelectionInitialized: loadTcMatrixSelectionInitialized(),
    activeCutStatsPeriods: loadActiveCutStatsPeriods(),
    lastStatsTotals: { daily: 0, weekly: 0, monthly: 0 }
};

export function updateCurrency(newCurrency) {
    state.currentCurrency = newCurrency;
    localStorage.setItem('work_tracker_currency', newCurrency);
}

export function updateWidgetOrder(newOrder) {
    state.widgetOrder = newOrder;
    localStorage.setItem('work_tracker_widget_order', JSON.stringify(newOrder));
}

export function updateWidgetTitles(showTitles) {
    state.showWidgetTitles = showTitles;
    localStorage.setItem('work_tracker_show_titles', showTitles);
}

export function updateStartOfWeek(newDay) {
    state.startOfWeek = newDay;
    localStorage.setItem('work_tracker_start_of_week', newDay);
}

export function updateContinueSession(continueSession) {
    state.continueSessionOnClose = continueSession;
    localStorage.setItem('work_tracker_continue_session', continueSession);
}

export function updateDashboardDensity(density) {
    state.dashboardDensity = density === 'compact' || density === 'spacious' ? density : 'comfortable';
    localStorage.setItem('work_tracker_dashboard_density', state.dashboardDensity);
}

export function updateMoneyCounterMode(mode) {
    state.moneyCounterMode = mode === 'after' ? 'after' : 'before';
    localStorage.setItem('work_tracker_money_counter_mode', state.moneyCounterMode);
}

export function createPercentageCut(name = '', percentage = 0) {
    return {
        id: createCutId(),
        name,
        percentage,
        basis: 'accumulative'
    };
}

export function updatePercentageCuts(newCuts) {
    state.percentageCuts = sanitizePercentageCuts(newCuts);
    localStorage.setItem('work_tracker_percentage_cuts', JSON.stringify(state.percentageCuts));
    return state.percentageCuts;
}

export function updateTimeCostItems(newItems) {
    state.timeCostItems = newItems;
    return state.timeCostItems;
}

export function updateTcSavedItemFilters(filters) {
    state.tcSavedItemFilters = {
        ...state.tcSavedItemFilters,
        ...filters
    };
    return state.tcSavedItemFilters;
}

export function updateTcMatrixSelectedItemIds(ids) {
    state.tcMatrixSelectedItemIds = Array.isArray(ids)
        ? ids.map(id => String(id)).filter(Boolean).slice(0, 10)
        : [];
    state.tcMatrixSelectionInitialized = true;
    localStorage.setItem('work_tracker_tc_matrix_selected_items', JSON.stringify(state.tcMatrixSelectedItemIds));
    localStorage.setItem('work_tracker_tc_matrix_selection_initialized', 'true');
    return state.tcMatrixSelectedItemIds;
}

export function updateTcHourlyRate(rate) {
    state.tcHourlyRate = rate;
    localStorage.setItem('work_tracker_tc_hourly_rate', rate);
}

export function updateTcDailyHours(hours) {
    state.tcDailyHours = hours;
    localStorage.setItem('work_tracker_tc_daily_hours', hours);
}

export function updateTcWorkingDaysPerWeek(days) {
    const parsedDays = Number(days);
    state.tcWorkingDaysPerWeek = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), 7) : 5;
    localStorage.setItem('work_tracker_tc_working_days_per_week', state.tcWorkingDaysPerWeek);
}

export function createTcCustomTimeScale(amount = 1, unit = 'hours') {
    return sanitizeCustomTimeScales([{ amount, unit }])[0] || {
        id: createTimeScaleId(),
        amount: 1,
        unit: 'hours'
    };
}

export function updateTcCustomTimeScales(scales) {
    state.tcCustomTimeScales = sanitizeCustomTimeScales(scales);
    localStorage.setItem('work_tracker_tc_custom_time_scales', JSON.stringify(state.tcCustomTimeScales));
    return state.tcCustomTimeScales;
}

export function updateActiveCutStatsPeriods(periods) {
    state.activeCutStatsPeriods = periods;
    localStorage.setItem('work_tracker_active_periods', JSON.stringify(periods));
}

export function updateDefaultHourlyRate(rate) {
    state.defaultHourlyRate = parseFloat(rate) || 20;
    localStorage.setItem('work_tracker_default_rate', state.defaultHourlyRate);
}

export function updateRatePreference(pref) {
    state.ratePreference = pref === 'default_rate' ? 'default_rate' : 'last_session';
    localStorage.setItem('work_tracker_rate_pref', state.ratePreference);
}

export function updateDefaultCompany(company) {
    state.defaultCompany = company || '';
    localStorage.setItem('work_tracker_default_company', state.defaultCompany);
}

export function updateCompanyPreference(pref) {
    state.companyPreference = pref === 'default_value' ? 'default_value' : 'last_session';
    localStorage.setItem('work_tracker_company_pref', state.companyPreference);
}

export function updateDefaultProject(project) {
    state.defaultProject = project || '';
    localStorage.setItem('work_tracker_default_project', state.defaultProject);
}

export function updateProjectPreference(pref) {
    state.projectPreference = pref === 'default_value' ? 'default_value' : 'last_session';
    localStorage.setItem('work_tracker_project_pref', state.projectPreference);
}

export function updateDefaultStartTime(timeStr) {
    state.defaultStartTime = timeStr || '09:00';
    localStorage.setItem('work_tracker_default_start_time', state.defaultStartTime);
}

export function updateStartTimePreference(pref) {
    state.startTimePreference = pref === 'default_value' ? 'default_value' : 'last_session';
    localStorage.setItem('work_tracker_start_time_pref', state.startTimePreference);
}
