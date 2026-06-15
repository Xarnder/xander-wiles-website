import { createPercentageCut, createTcCustomTimeScale, state, updateTcCustomTimeScales } from './state.js';
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
    timerStartTimeInput: document.getElementById('timer-start-time'),
    moneyCounterWidget: document.getElementById('widget-money-counter'),
    moneyCounterStatus: document.getElementById('money-counter-status'),
    moneyCounterTotal: document.getElementById('money-counter-total'),
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
    dailyHoursDisplay: document.getElementById('daily-hours'),
    dailyEarningsDisplay: document.getElementById('daily-earnings'),
    weeklyHoursDisplay: document.getElementById('weekly-hours'),
    weeklyEarningsDisplay: document.getElementById('weekly-earnings'),
    monthlyHoursDisplay: document.getElementById('monthly-hours'),
    monthlyEarningsDisplay: document.getElementById('monthly-earnings'),
    percentageCutStatsWidget: document.getElementById('widget-cut-stats'),
    percentageCutStats: document.getElementById('percentage-cut-stats'),
    cutStatsTotalPercentage: document.getElementById('cut-stats-total-percentage'),
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
    addPercentageCutBtn: document.getElementById('add-percentage-cut-btn'),
    percentageCutList: document.getElementById('percentage-cut-list'),
    showTitlesToggle: document.getElementById('show-titles-toggle'),
    continueSessionToggle: document.getElementById('continue-session-toggle'),
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
    saveSessionBtn: document.getElementById('save-session-btn'),
    
    viewDashboardBtn: document.getElementById('view-dashboard-btn'),
    viewTimeCostBtn: document.getElementById('view-time-cost-btn'),
    dashboardView: document.getElementById('dashboard-view'),
    timeCostView: document.getElementById('time-cost-view'),
    tcItemName: document.getElementById('tc-item-name'),
    tcItemCost: document.getElementById('tc-item-cost'),
    tcHourlyRate: document.getElementById('tc-hourly-rate'),
    tcDailyHours: document.getElementById('tc-daily-hours'),
    tcWorkingDays: document.getElementById('tc-working-days'),
    tcCutsSummary: document.getElementById('tc-cuts-summary'),
    tcRateBreakdown: document.getElementById('tc-rate-breakdown'),
    tcBreakdownContainer: document.getElementById('tc-breakdown-container'),
    tcSaveBtn: document.getElementById('tc-save-btn'),
    tcSavedItemsContainer: document.getElementById('tc-saved-items-container')
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
        renderLiveMoneyCounter(earned, true);
    } else {
        DOM.liveEarningsDisplay.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>0.00`;
        renderLiveMoneyCounter(0, false);
    }
}

const moneyCounterStackCounts = {
    twentyP: null,
    pound: null,
    note: null
};

function createMoneyPieces(count, type) {
    const visibleCount = Math.min(count, type === 'note' ? 18 : 24);
    const overflow = Math.max(count - visibleCount, 0);
    const label = type.includes('note') ? '£10' : type.includes('coin-large') ? '£1' : '20p';
    let html = '';

    for (let i = 0; i < visibleCount; i++) {
        html += `<span class="money-piece ${type}" style="--i:${i};"><em>${label}</em></span>`;
    }

    if (overflow > 0) {
        html += `<span class="money-stack-more">+${overflow}</span>`;
    }

    return html;
}

function renderMoneyStack(container, count, type, key) {
    if (!container || moneyCounterStackCounts[key] === count) return;

    moneyCounterStackCounts[key] = count;
    container.innerHTML = createMoneyPieces(count, type);
}

export function renderLiveMoneyCounter(earned = 0, isRunning = Boolean(state.startTime)) {
    if (!DOM.moneyCounterWidget) return;

    const safeEarned = Math.max(Number(earned) || 0, 0);
    const pennies = Math.floor(safeEarned * 100);
    const noteCount = Math.floor(pennies / 1000);
    const remainingAfterNotes = pennies % 1000;
    const poundCount = Math.floor(remainingAfterNotes / 100);
    const twentyPCount = Math.floor((remainingAfterNotes % 100) / 20);

    DOM.moneyCounterWidget.classList.toggle('money-counter-active', isRunning);

    if (DOM.moneyCounterStatus) {
        DOM.moneyCounterStatus.textContent = isRunning ? 'Live' : 'Idle';
    }

    if (DOM.moneyCounterTotal) {
        DOM.moneyCounterTotal.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>${safeEarned.toFixed(2)}`;
    }

    renderMoneyStack(DOM.moneyStack20p, twentyPCount, 'coin coin-small', 'twentyP');
    renderMoneyStack(DOM.moneyStack1, poundCount, 'coin coin-large', 'pound');
    renderMoneyStack(DOM.moneyStack10, noteCount, 'note', 'note');

    if (DOM.moneyCount20p) DOM.moneyCount20p.textContent = twentyPCount;
    if (DOM.moneyCount1) DOM.moneyCount1.textContent = poundCount;
    if (DOM.moneyCount10) DOM.moneyCount10.textContent = noteCount;
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

        [
            { label: 'Today', key: 'daily' },
            { label: 'This Week', key: 'weekly' },
            { label: 'This Month', key: 'monthly' }
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

export function toggleTimerUI(isRunning) {
    if (isRunning) {
        DOM.startBtn.classList.add('hidden');
        DOM.stopBtn.classList.remove('hidden');
    } else {
        DOM.startBtn.classList.remove('hidden');
        DOM.stopBtn.classList.add('hidden');
    }

    DOM.hourlyRateInput.disabled = isRunning;
    if (DOM.timerStartTimeInput) DOM.timerStartTimeInput.disabled = isRunning;
    if (DOM.companyInput) DOM.companyInput.disabled = isRunning;
    if (DOM.companySelect) DOM.companySelect.disabled = isRunning;
    if (DOM.projectInput) DOM.projectInput.disabled = isRunning;
    if (DOM.projectSelect) DOM.projectSelect.disabled = isRunning;
}

export function renderCalendar() {
    if (!DOM.calendarGrid || !DOM.calendarMonthYear) return;

    DOM.calendarGrid.innerHTML = '';

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
        const liveStartMs = Math.max(state.startTime, startOfToday.getTime());
        const activeDuration = Date.now() - liveStartMs;
        if (activeDuration > 0) {
            createGanttBlock(new Date(liveStartMs), activeDuration, state.currentProject, state.currentCompany, true);
        }
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
        'widget-money-counter': 'Live Money Counter',
        'widget-stats': 'Statistics',
        'widget-cut-stats': 'After Percentage Cuts',
        'widget-cuts': 'Percentage Cuts',
        'widget-gantt': "Today's Timeline",
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
        return;
    }

    const { baseRate, dailyHours, workingDaysPerWeek } = getTimeCostSettings();
    const daysInWeek = workingDaysPerWeek;
    const daysInMonth = workingDaysPerWeek * 4.345;
    const { effectiveRate, totalCutPercentage } = getEffectiveHourlyRate(baseRate);

    let html = `
        <div style="overflow-x: auto; width: 100%;">
            <table class="tc-breakdown-table" style="min-width: 900px;">
                <thead>
                    <tr>
                        <th rowspan="2" class="tc-sticky-col" style="vertical-align: middle;">Item Name</th>
                        <th rowspan="2" style="vertical-align: middle;">Cost</th>
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

    state.timeCostItems.forEach(item => {
        const cost = item.cost;
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
                    <td class="tc-sticky-col" style="font-weight: 600; white-space: nowrap;">${item.name || 'Unnamed Item'}</td>
                    <td class="tc-amount">${state.currentCurrency}${cost.toFixed(2)}</td>
                    <td class="tc-time" style="color: var(--text-primary); font-size: 0.95rem;">${baseHoursStr}</td>
                    <td class="tc-time" style="color: var(--text-primary); font-size: 0.95rem;">${baseDaysStr}</td>
                    <td class="tc-time" style="color: var(--text-primary); font-size: 0.95rem;">${baseWeeksStr}</td>
                    <td class="tc-time" style="color: var(--text-primary); font-size: 0.95rem;">${baseMonthsStr}</td>
                    <td class="tc-time" style="font-size: 0.95rem;">${effectiveHoursStr}</td>
                    <td class="tc-time" style="font-size: 0.95rem;">${effectiveDaysStr}</td>
                    <td class="tc-time" style="font-size: 0.95rem;">${effectiveWeeksStr}</td>
                    <td class="tc-time" style="font-size: 0.95rem;">${effectiveMonthsStr}</td>
                    <td style="text-align: center;">
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
