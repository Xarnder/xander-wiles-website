import { state } from './state.js';
import { getMonday, formatDuration } from './utils.js';

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
    companyInput: document.getElementById('company-input'),
    projectInput: document.getElementById('project-input'),
    companySelect: document.getElementById('company-select'),
    projectSelect: document.getElementById('project-select'),
    liveEarningsDisplay: document.getElementById('live-earnings'),
    historyList: document.getElementById('history-list'),
    dailyHoursDisplay: document.getElementById('daily-hours'),
    dailyEarningsDisplay: document.getElementById('daily-earnings'),
    weeklyHoursDisplay: document.getElementById('weekly-hours'),
    weeklyEarningsDisplay: document.getElementById('weekly-earnings'),
    monthlyHoursDisplay: document.getElementById('monthly-hours'),
    monthlyEarningsDisplay: document.getElementById('monthly-earnings'),
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
        weekData[dayIndex].push({
            hours: session.durationMs / (1000 * 60 * 60),
            durationMs: session.durationMs,
            company: session.company,
            project: session.project
        });
    });

    weekData.forEach(daySessions => {
        const dailyTotal = daySessions.reduce((sum, sessionObj) => sum + sessionObj.hours, 0);
        if (dailyTotal > maxDailyHours) maxDailyHours = dailyTotal;
    });

    const scaleMax = maxDailyHours > 0 ? maxDailyHours : 1;

    daysArr.forEach((label, index) => {
        const colDiv = document.createElement('div');
        colDiv.className = 'chart-day-column';
        const areaDiv = document.createElement('div');
        areaDiv.className = 'chart-bar-area';

        weekData[index].forEach((sessionObj, sIndex) => {
            const hrs = sessionObj.hours;
            const bar = document.createElement('div');
            bar.className = 'chart-sub-session';
            bar.style.height = `${(hrs / scaleMax) * 100}%`;

            // Determine color based on project or company
            const identifier = sessionObj.project || sessionObj.company || 'default';
            const color = getColorForIdentifier(identifier);
            bar.style.background = `linear-gradient(180deg, ${color} 0%, ${adjustColorOpacity(color, 0.8)} 100%)`;

            let titlePrefix = sessionObj.project ? `[${sessionObj.project}] ` : (sessionObj.company ? `[${sessionObj.company}] ` : '');
            bar.title = `${titlePrefix}Session ${sIndex + 1}: ${formatDuration(sessionObj.durationMs)}`;

            // Add persistent label if an identifier exists
            if (identifier !== 'default') {
                const labelSpan = document.createElement('span');
                labelSpan.className = 'chart-bar-label';
                labelSpan.textContent = sessionObj.project || sessionObj.company;
                bar.appendChild(labelSpan);
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

export function updateDatalists() {
    if (!DOM.companySelect || !DOM.projectSelect) return;

    const companies = new Set();
    const projects = new Set();

    state.allSessions.forEach(session => {
        if (session.company) companies.add(session.company.trim());
        if (session.project) projects.add(session.project.trim());
    });

    DOM.companySelect.innerHTML = '<option value="">Or pick saved...</option>';
    Array.from(companies).sort().forEach(company => {
        const option = document.createElement('option');
        option.value = company;
        option.textContent = company;
        DOM.companySelect.appendChild(option);
    });

    DOM.projectSelect.innerHTML = '<option value="">Or pick saved...</option>';
    Array.from(projects).sort().forEach(project => {
        const option = document.createElement('option');
        option.value = project;
        option.textContent = project;
        DOM.projectSelect.appendChild(option);
    });
}
