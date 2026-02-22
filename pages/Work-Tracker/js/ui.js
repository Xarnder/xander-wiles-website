import { state } from './state.js';
import { formatDuration } from './utils.js';

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
    startOfWeekSelect: document.getElementById('start-of-week-select'),
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
    showTitlesToggle: document.getElementById('show-titles-toggle'),
    ganttChart: document.getElementById('gantt-chart'),
    exportBtn: document.getElementById('export-btn'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
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
    saveSessionBtn: document.getElementById('save-session-btn')
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

    // Inject Days of Week Header
    const daysArrBase = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daysArrLabel = [...daysArrBase.slice(state.startOfWeek), ...daysArrBase.slice(0, state.startOfWeek)];

    daysArrLabel.forEach(dayName => {
        const headerLabel = document.createElement('div');
        headerLabel.className = 'day-label';
        headerLabel.textContent = dayName;
        DOM.calendarGrid.appendChild(headerLabel);
    });

    const year = state.currentCalendarDate.getFullYear();
    const month = state.currentCalendarDate.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    DOM.calendarMonthYear.textContent = `${monthNames[month]} ${year}`;

    const existingDays = DOM.calendarGrid.querySelectorAll('.calendar-day');
    existingDays.forEach(day => day.remove());

    const rawFirstDayIndex = new Date(year, month, 1).getDay();
    const firstDayIndex = (rawFirstDayIndex - state.startOfWeek + 7) % 7;
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

    import('./utils.js').then(({ getStartOfWeekDate }) => {
        const daysArrBase = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const daysArr = [...daysArrBase.slice(state.startOfWeek), ...daysArrBase.slice(0, state.startOfWeek)];

        const now = new Date();
        const startOfWeek = getStartOfWeekDate(now, state.startOfWeek);
        const weekData = Array(7).fill().map(() => []);
        let maxDailyHours = 0;

        const currentWeekSessions = state.allSessions.filter(session => new Date(session.startTime) >= startOfWeek);

        currentWeekSessions.forEach(session => {
            let actualDay = new Date(session.startTime).getDay();
            let dayIndex = (actualDay - state.startOfWeek + 7) % 7;
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

        const scaleMax = Math.ceil(maxDailyHours > 0 ? maxDailyHours : 1);

        // Y Axis Labels
        const yAxisDiv = document.createElement('div');
        yAxisDiv.className = 'chart-y-axis';

        const maxLabel = document.createElement('div');
        maxLabel.textContent = scaleMax + 'h';

        const midLabel = document.createElement('div');
        midLabel.textContent = (scaleMax / 2).toFixed(1) + 'h';

        const zeroLabel = document.createElement('div');
        zeroLabel.textContent = '0h';

        yAxisDiv.appendChild(maxLabel);
        yAxisDiv.appendChild(midLabel);
        yAxisDiv.appendChild(zeroLabel);
        DOM.weeklyChart.appendChild(yAxisDiv);

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

    // We cover a 24-hour period (0 to 24)
    // Create the background grid (hour lines)
    for (let i = 0; i <= 24; i += 4) {
        const marker = document.createElement('div');
        marker.className = 'gantt-hour-marker';
        marker.style.left = `${(i / 24) * 100}%`;

        const label = document.createElement('span');
        label.textContent = `${i}:00`;
        marker.appendChild(label);

        DOM.ganttChart.appendChild(marker);
    }

    // Calculate today's boundaries
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    // Render completed sessions for today
    const todaysSessions = state.allSessions.filter(session => {
        const sessionTime = new Date(session.startTime);
        return sessionTime >= startOfToday && sessionTime < endOfToday;
    });

    todaysSessions.forEach(session => {
        const sTime = new Date(session.startTime);
        createGanttBlock(sTime, session.durationMs, session.project, session.company, false);
    });

    // Render live active session if one is currently ticking
    if (state.timerInterval && state.startTime) {
        const activeDuration = Date.now() - state.startTime;
        createGanttBlock(new Date(state.startTime), activeDuration, state.currentProject, state.currentCompany, true);
    }
}

function createGanttBlock(startTimeObj, durationMs, project, company, isLive) {
    const startOfToday = new Date(startTimeObj.getFullYear(), startTimeObj.getMonth(), startTimeObj.getDate(), 0, 0, 0, 0);
    const msSinceMidnight = startTimeObj.getTime() - startOfToday.getTime();

    const msInDay = 24 * 60 * 60 * 1000;

    let leftPercent = (msSinceMidnight / msInDay) * 100;
    let widthPercent = (durationMs / msInDay) * 100;

    // Clamp if it goes over midnight
    if (leftPercent + widthPercent > 100) {
        widthPercent = 100 - leftPercent;
    }

    const block = document.createElement('div');
    block.className = `gantt-block ${isLive ? 'gantt-live' : ''}`;
    block.style.left = `${leftPercent}%`;
    block.style.width = widthPercent > 0.5 ? `${widthPercent}%` : '0.5%'; // Minimum width for visibility

    const identifier = project || company || 'default';
    const color = isLive ? 'rgba(255, 60, 60, 0.8)' : getColorForIdentifier(identifier);

    block.style.backgroundColor = color;
    block.style.boxShadow = `0 0 8px ${color}`;

    let titlePrefix = project ? `[${project}] ` : (company ? `[${company}] ` : '');
    block.title = `${titlePrefix}${formatDuration(durationMs)}${isLive ? ' (Live)' : ''}`;

    if (identifier !== 'default' && widthPercent > 4) { // Only show label if block is wide enough
        const label = document.createElement('span');
        label.className = 'gantt-block-label';
        label.textContent = project || company;
        block.appendChild(label);
    }

    DOM.ganttChart.appendChild(block);
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

export function applyWidgetOrder() {
    state.widgetOrder.forEach((id, index) => {
        const el = document.getElementById(id);
        if (el) {
            el.style.order = index;
        }
    });
}

export function applyWidgetTitles() {
    if (!state.showWidgetTitles) {
        document.body.classList.add('hide-widget-titles');
    } else {
        document.body.classList.remove('hide-widget-titles');
    }
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
        'widget-stats': 'Statistics',
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
            <span>${labels[id]}</span>
        `;

        li.addEventListener('dragstart', handleDragStart);
        li.addEventListener('dragenter', handleDragEnter);
        li.addEventListener('dragover', handleDragOver);
        li.addEventListener('dragleave', handleDragLeave);
        li.addEventListener('drop', handleDrop);
        li.addEventListener('dragend', handleDragEnd);

        DOM.widgetOrderList.appendChild(li);
    });
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
