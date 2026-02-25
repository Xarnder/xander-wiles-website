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
    widgetOrder: JSON.parse(localStorage.getItem('work_tracker_widget_order')) || ['widget-timer', 'widget-stats', 'widget-gantt', 'widget-calendar', 'widget-chart', 'widget-history'],
    showWidgetTitles: localStorage.getItem('work_tracker_show_titles') !== 'false',
    startOfWeek: parseInt(localStorage.getItem('work_tracker_start_of_week')) || 0, // 0 = Sunday, 1 = Monday
    continueSessionOnClose: localStorage.getItem('work_tracker_continue_session') !== 'false' // default true
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
