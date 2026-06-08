const DEFAULT_WIDGET_ORDER = ['widget-timer', 'widget-stats', 'widget-cut-stats', 'widget-cuts', 'widget-gantt', 'widget-calendar', 'widget-chart', 'widget-history'];

function createCutId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return `cut-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

export const state = {
    currentUser: null,
    timerInterval: null,
    startTime: null,
    currentSessionRate: 0,
    currentCompany: '',
    currentProject: '',
    currentCalendarDate: new Date(),
    rawSessions: [],
    allSessions: [],
    globalFilterCompany: '',
    globalFilterProject: '',
    currentCurrency: localStorage.getItem('work_tracker_currency') || '£',
    widgetOrder: loadWidgetOrder(),
    showWidgetTitles: localStorage.getItem('work_tracker_show_titles') !== 'false',
    startOfWeek: parseInt(localStorage.getItem('work_tracker_start_of_week')) || 0, // 0 = Sunday, 1 = Monday
    continueSessionOnClose: localStorage.getItem('work_tracker_continue_session') !== 'false', // default true
    percentageCuts: loadPercentageCuts()
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
