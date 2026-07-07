import { state } from './state.js';
import { DOM, toggleTimerUI, updateCurrencyDisplays, showAlert, renderGanttChart, renderLiveMoneyCounter, getAmountAfterPercentageCuts, renderWorkPatternBreakdown } from './ui.js';
import { saveSession } from './api.js';

export function updateTimerDisplay(elapsedMs) {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    DOM.timerDisplay.textContent = formattedTime;

    const hoursFloat = elapsedMs / (1000 * 60 * 60);
    const earned = hoursFloat * state.currentSessionRate;
    const afterCuts = getAmountAfterPercentageCuts(earned);
    DOM.liveEarningsDisplay.innerHTML = `
        <span class="before-cut">Before: <span class="currency-symbol">${state.currentCurrency}</span>${earned.toFixed(2)}</span>
        <span class="cut-divider">|</span>
        <span class="after-cut">After: <span class="currency-symbol">${state.currentCurrency}</span>${afterCuts.toFixed(2)}</span>
    `;
    renderLiveMoneyCounter(earned, Boolean(state.startTime));

    document.title = `${formattedTime} - Work Tracker`;
}

export function startTimer() {
    if (!state.currentUser) return;

    const rate = parseFloat(DOM.hourlyRateInput.value);
    if (isNaN(rate)) {
        showAlert("Invalid Input", "Please enter a valid hourly rate.");
        return;
    }

    const now = Date.now();
    let selectedStartTime = now;

    if (DOM.timerStartTimeInput && DOM.timerStartTimeInput.value) {
        selectedStartTime = new Date(DOM.timerStartTimeInput.value).getTime();

        if (!Number.isFinite(selectedStartTime)) {
            showAlert("Invalid Input", "Please enter a valid start time.");
            return;
        }

        if (selectedStartTime > now) {
            showAlert("Invalid Input", "Start time cannot be in the future.");
            return;
        }
    }

    state.startTime = selectedStartTime;
    state.currentSessionRate = rate;
    state.currentCompany = DOM.companyInput.value.trim();
    state.currentProject = DOM.projectInput.value.trim();

    localStorage.setItem('work_tracker_start', state.startTime);
    localStorage.setItem('work_tracker_rate', state.currentSessionRate);
    localStorage.setItem('work_tracker_company', state.currentCompany);
    localStorage.setItem('work_tracker_project', state.currentProject);

    toggleTimerUI(true);
    updateTimerDisplay(Date.now() - state.startTime);
    renderGanttChart();
    renderWorkPatternBreakdown();

    state.timerInterval = setInterval(() => {
        updateTimerDisplay(Date.now() - state.startTime);
        renderGanttChart();
    }, 1000);
}

export async function stopTimer() {
    if (!state.startTime) return;

    clearInterval(state.timerInterval);
    const durationMs = Date.now() - state.startTime;
    const totalEarned = (durationMs / (1000 * 60 * 60)) * state.currentSessionRate;

    await saveSession(durationMs, totalEarned);

    localStorage.removeItem('work_tracker_start');
    localStorage.removeItem('work_tracker_rate');
    localStorage.removeItem('work_tracker_company');
    localStorage.removeItem('work_tracker_project');

    state.startTime = null;
    state.currentCompany = '';
    state.currentProject = '';

    toggleTimerUI(false);
    DOM.timerDisplay.textContent = "00:00:00";
    DOM.liveEarningsDisplay.innerHTML = `
        <span class="before-cut">Before: <span class="currency-symbol">${state.currentCurrency}</span>0.00</span>
        <span class="cut-divider">|</span>
        <span class="after-cut">After: <span class="currency-symbol">${state.currentCurrency}</span>0.00</span>
    `;
    renderLiveMoneyCounter(0, false);
    if (DOM.timerStartTimeInput) {
        DOM.timerStartTimeInput.value = '';
    }
    document.title = "Work Tracker";
}

export function checkRestorableSession() {
    const savedStart = localStorage.getItem('work_tracker_start');
    const savedRate = localStorage.getItem('work_tracker_rate');

    if (savedStart && savedRate) {
        state.startTime = parseInt(savedStart);
        state.currentSessionRate = parseFloat(savedRate);
        state.currentCompany = localStorage.getItem('work_tracker_company') || '';
        state.currentProject = localStorage.getItem('work_tracker_project') || '';

        DOM.hourlyRateInput.value = state.currentSessionRate;
        DOM.companyInput.value = state.currentCompany;
        DOM.projectInput.value = state.currentProject;
        if (DOM.timerStartTimeInput) {
            DOM.timerStartTimeInput.value = '';
        }

        toggleTimerUI(true);
        updateTimerDisplay(Date.now() - state.startTime);

        state.timerInterval = setInterval(() => {
            updateTimerDisplay(Date.now() - state.startTime);
            renderGanttChart();
        }, 1000);
    }
}
