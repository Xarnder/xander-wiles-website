export const state = {
    currentUser: null,
    timerInterval: null,
    startTime: null,
    currentSessionRate: 0,
    currentCompany: '',
    currentProject: '',
    currentCalendarDate: new Date(),
    allSessions: [],
    currentCurrency: localStorage.getItem('work_tracker_currency') || '£',
    widgetOrder: JSON.parse(localStorage.getItem('work_tracker_widget_order')) || ['widget-timer', 'widget-stats', 'widget-calendar', 'widget-chart', 'widget-history'],
    showWidgetTitles: localStorage.getItem('work_tracker_show_titles') !== 'false'
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
