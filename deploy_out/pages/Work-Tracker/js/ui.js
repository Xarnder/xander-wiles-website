import { createPercentageCut, state } from './state.js';
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
    tcIncludeWeekends: document.getElementById('tc-include-weekends'),
    tcCutsSummary: document.getElementById('tc-cuts-summary'),
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
    } else {
        DOM.liveEarningsDisplay.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>0.00`;
    }
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
        DOM.hourlyRateInput.disabled = true;
    } else {
        DOM.startBtn.classList.remove('hidden');
        DOM.stopBtn.classList.add('hidden');
        DOM.hourlyRateInput.disabled = false;
    }
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

export function renderTcCutsSummary() {
    if (!DOM.tcCutsSummary) return;

    const baseRate = DOM.tcHourlyRate ? (parseFloat(DOM.tcHourlyRate.value) || state.tcHourlyRate || 20) : (state.tcHourlyRate || 20);
    
    let accumulatedRate = baseRate;
    state.percentageCuts.forEach(cut => {
        const sourcePool = cut.basis === 'original' ? baseRate : accumulatedRate;
        const deduction = sourcePool * (cut.percentage / 100);
        accumulatedRate = Math.max(accumulatedRate - deduction, 0);
    });
    const effectiveRate = accumulatedRate;
    const totalCutPercentage = baseRate > 0 ? ((baseRate - effectiveRate) / baseRate) * 100 : 0;

    DOM.tcCutsSummary.innerHTML = `Percentage Cuts: <span style="color: var(--accent-blue); font-weight: 700;">-${totalCutPercentage.toFixed(1)}%</span> (Effective Rate: <span style="color: var(--accent-green); font-weight: 700;">${state.currentCurrency}${effectiveRate.toFixed(2)}/h</span>)`;
}

export function renderTimeCostBreakdown() {
    renderTcCutsSummary();
    if (!DOM.tcBreakdownContainer) return;

    const cost = parseFloat(DOM.tcItemCost ? DOM.tcItemCost.value : '') || 0;
    const baseRate = DOM.tcHourlyRate ? (parseFloat(DOM.tcHourlyRate.value) || state.tcHourlyRate || 20) : (state.tcHourlyRate || 20);
    const dailyHours = DOM.tcDailyHours ? (parseFloat(DOM.tcDailyHours.value) || state.tcDailyHours || 8) : (state.tcDailyHours || 8);
    const includeWeekends = DOM.tcIncludeWeekends ? DOM.tcIncludeWeekends.checked : state.tcIncludeWeekends;
    const daysInWeek = includeWeekends ? 7 : 5;
    const daysInMonth = includeWeekends ? 30.4 : 21.6;

    if (cost <= 0) {
        DOM.tcBreakdownContainer.innerHTML = '<p class="loading-text" style="margin-top: 20px;">Enter an item cost to see the breakdown.</p>';
        return;
    }

    const baseHours = cost / baseRate;

    let accumulatedRate = baseRate;
    
    state.percentageCuts.forEach(cut => {
        const sourcePool = cut.basis === 'original' ? baseRate : accumulatedRate;
        const deduction = sourcePool * (cut.percentage / 100);
        accumulatedRate = Math.max(accumulatedRate - deduction, 0);
    });

    const effectiveRate = accumulatedRate;
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
    const totalCutPercentage = baseRate > 0 ? ((baseRate - effectiveRate) / baseRate) * 100 : 0;

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
    if (!DOM.tcSavedItemsContainer) return;

    if (!state.timeCostItems || state.timeCostItems.length === 0) {
        DOM.tcSavedItemsContainer.innerHTML = '<p class="loading-text">No saved items.</p>';
        return;
    }

    const baseRate = DOM.tcHourlyRate ? (parseFloat(DOM.tcHourlyRate.value) || state.tcHourlyRate || 20) : (state.tcHourlyRate || 20);
    const dailyHours = DOM.tcDailyHours ? (parseFloat(DOM.tcDailyHours.value) || state.tcDailyHours || 8) : (state.tcDailyHours || 8);
    const includeWeekends = DOM.tcIncludeWeekends ? DOM.tcIncludeWeekends.checked : state.tcIncludeWeekends;
    const daysInWeek = includeWeekends ? 7 : 5;
    const daysInMonth = includeWeekends ? 30.4 : 21.6;

    let accumulatedRate = baseRate;
    state.percentageCuts.forEach(cut => {
        const sourcePool = cut.basis === 'original' ? baseRate : accumulatedRate;
        const deduction = sourcePool * (cut.percentage / 100);
        accumulatedRate = Math.max(accumulatedRate - deduction, 0);
    });
    const effectiveRate = accumulatedRate;
    const totalCutPercentage = baseRate > 0 ? ((baseRate - effectiveRate) / baseRate) * 100 : 0;

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
        const baseHours = cost / baseRate;
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
