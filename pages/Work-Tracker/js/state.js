export const state = {
    currentUser: null,
    timerInterval: null,
    startTime: null,
    currentSessionRate: 0,
    currentCalendarDate: new Date(),
    allSessions: [],
    currentCurrency: localStorage.getItem('work_tracker_currency') || '£'
};

export function updateCurrency(newCurrency) {
    state.currentCurrency = newCurrency;
    localStorage.setItem('work_tracker_currency', newCurrency);
}
