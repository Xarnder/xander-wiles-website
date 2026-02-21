import { state } from './state.js';
import { getMonday } from './utils.js';

export const DOM = {
    authSection: document.getElementById('auth-section'),
    dashboard: document.getElementById('dashboard'),
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    userNameDisplay: document.getElementById('user-name'),
    startBtn: document.getElementById('start-btn'),
    stopBtn: document.getElementById('stop-btn'),
    timerDisplay: document.getElementById('timer'),
    hourlyRateInput: document.getElementById('hourly-rate'),
    liveEarningsDisplay: document.getElementById('live-earnings'),
    historyList: document.getElementById('history-list'),
    weeklyHoursDisplay: document.getElementById('weekly-hours'),
    weeklyEarningsDisplay: document.getElementById('weekly-earnings'),
    prevMonthBtn: document.getElementById('prev-month'),
    nextMonthBtn: document.getElementById('next-month'),
    calendarMonthYear: document.getElementById('calendar-month-year'),
    calendarGrid: document.querySelector('.calendar-grid'),
    weeklyChart: document.getElementById('weekly-chart'),
    settingsBtn: document.getElementById('settings-btn'),
    closeSettingsBtn: document.getElementById('close-settings'),
    settingsModal: document.getElementById('settings-modal'),
    currencySelect: document.getElementById('currency-select'),
    saveSettingsBtn: document.getElementById('save-settings'),
    alertModal: document.getElementById('alert-modal'),
    alertTitle: document.getElementById('alert-title'),
    alertMessage: document.getElementById('alert-message'),
    alertOkBtn: document.getElementById('alert-ok-btn'),
    confirmModal: document.getElementById('confirm-modal'),
    confirmTitle: document.getElementById('confirm-title'),
    confirmMessage: document.getElementById('confirm-message'),
    confirmOkBtn: document.getElementById('confirm-ok-btn'),
    confirmCancelBtn: document.getElementById('confirm-cancel-btn')
};

export function showAlert(title, message) {
    return new Promise((resolve) => {
        DOM.alertTitle.textContent = title || "Notice";
        DOM.alertMessage.textContent = message;
        DOM.alertModal.classList.remove('hidden');

        const handleOk = () => {
            DOM.alertModal.classList.add('hidden');
            DOM.alertOkBtn.removeEventListener('click', handleOk);
            resolve();
        };

        DOM.alertOkBtn.addEventListener('click', handleOk);
    });
}

export function showConfirm(title, message) {
    return new Promise((resolve) => {
        DOM.confirmTitle.textContent = title || "Confirm Action";
        DOM.confirmMessage.textContent = message;
        DOM.confirmModal.classList.remove('hidden');

        const handleConfirm = () => { cleanup(); resolve(true); };
        const handleCancel = () => { cleanup(); resolve(false); };

        const cleanup = () => {
            DOM.confirmModal.classList.add('hidden');
            DOM.confirmOkBtn.removeEventListener('click', handleConfirm);
            DOM.confirmCancelBtn.removeEventListener('click', handleCancel);
        };

        DOM.confirmOkBtn.addEventListener('click', handleConfirm);
        DOM.confirmCancelBtn.addEventListener('click', handleCancel);
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
        DOM.liveEarningsDisplay.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>${earned.toFixed(2)}`;
    } else {
        DOM.liveEarningsDisplay.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>0.00`;
    }
}

export function toggleTimerUI(isRunning) {
    if (isRunning) {
        DOM.startBtn.classList.add('hidden');
        DOM.stopBtn.classList.remove('hidden');
        DOM.hourlyRateInput.disabled = true;
    } else {
        DOM.startBtn.classList.remove('hidden');
        DOM.stopBtn.classList.add('hidden');
        DOM.hourlyRateInput.disabled = false;
    }
}

export function renderCalendar() {
    if (!DOM.calendarGrid || !DOM.calendarMonthYear) return;

    const year = state.currentCalendarDate.getFullYear();
    const month = state.currentCalendarDate.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    DOM.calendarMonthYear.textContent = `${monthNames[month]} ${year}`;

    const existingDays = DOM.calendarGrid.querySelectorAll('.calendar-day');
    existingDays.forEach(day => day.remove());

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayDate = new Date();

    const dailyHours = {};
    state.allSessions.forEach(session => {
        const sessionDate = new Date(session.startTime);
        if (sessionDate.getFullYear() === year && sessionDate.getMonth() === month) {
            const dayNum = sessionDate.getDate();
            const hours = session.durationMs / (1000 * 60 * 60);
            if (!dailyHours[dayNum]) dailyHours[dayNum] = 0;
            dailyHours[dayNum] += hours;
        }
    });

    for (let x = 0; x < firstDayIndex; x++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'calendar-day empty';
        DOM.calendarGrid.appendChild(emptyDiv);
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.textContent = i;

        if (todayDate.getDate() === i && todayDate.getMonth() === month && todayDate.getFullYear() === year) {
            dayDiv.classList.add('today');
        }

        if (dailyHours[i] && dailyHours[i] > 0) {
            dayDiv.classList.add('has-work');
            const hourLabel = document.createElement('div');
            hourLabel.className = 'work-hours-indicator';
            hourLabel.textContent = `${dailyHours[i].toFixed(1)}h`;
            dayDiv.appendChild(hourLabel);
        }

        DOM.calendarGrid.appendChild(dayDiv);
    }
}

export function renderChart() {
    if (!DOM.weeklyChart) return;
    DOM.weeklyChart.innerHTML = '';

    const daysArr = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const now = new Date();
    const startOfWeek = getMonday(now);
    const weekData = Array(7).fill().map(() => []);
    let maxDailyHours = 0;

    const currentWeekSessions = state.allSessions.filter(session => new Date(session.startTime) >= startOfWeek);

    currentWeekSessions.forEach(session => {
        let dayIndex = new Date(session.startTime).getDay() - 1;
        if (dayIndex === -1) dayIndex = 6;
        weekData[dayIndex].push(session.durationMs / (1000 * 60 * 60));
    });

    weekData.forEach(daySessions => {
        const dailyTotal = daySessions.reduce((sum, hrs) => sum + hrs, 0);
        if (dailyTotal > maxDailyHours) maxDailyHours = dailyTotal;
    });

    const scaleMax = maxDailyHours > 0 ? maxDailyHours : 1;

    daysArr.forEach((label, index) => {
        const colDiv = document.createElement('div');
        colDiv.className = 'chart-day-column';
        const areaDiv = document.createElement('div');
        areaDiv.className = 'chart-bar-area';

        weekData[index].forEach((hrs, sIndex) => {
            const bar = document.createElement('div');
            bar.className = 'chart-sub-session';
            bar.style.height = `${(hrs / scaleMax) * 100}%`;
            bar.title = `Session ${sIndex + 1}: ${hrs.toFixed(2)}h`;
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
