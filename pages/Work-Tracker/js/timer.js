import { state } from './state.js';
import { DOM, toggleTimerUI, updateCurrencyDisplays, showAlert } from './ui.js';
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
    DOM.liveEarningsDisplay.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>${earned.toFixed(2)}`;

    document.title = `${formattedTime} - Work Tracker`;
}

export function startTimer() {
    if (!state.currentUser) return;

    const rate = parseFloat(DOM.hourlyRateInput.value);
    if (isNaN(rate)) {
        showAlert("Invalid Input", "Please enter a valid hourly rate.");
        return;
    }

    state.startTime = Date.now();
    state.currentSessionRate = rate;
    localStorage.setItem('work_tracker_start', state.startTime);
    localStorage.setItem('work_tracker_rate', state.currentSessionRate);

    toggleTimerUI(true);

    state.timerInterval = setInterval(() => {
        updateTimerDisplay(Date.now() - state.startTime);
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
    state.startTime = null;

    toggleTimerUI(false);
    DOM.timerDisplay.textContent = "00:00:00";
    DOM.liveEarningsDisplay.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>0.00`;
    document.title = "Work Tracker";
}

export function checkRestorableSession() {
    const savedStart = localStorage.getItem('work_tracker_start');
    const savedRate = localStorage.getItem('work_tracker_rate');

    if (savedStart && savedRate) {
        state.startTime = parseInt(savedStart);
        state.currentSessionRate = parseFloat(savedRate);
        DOM.hourlyRateInput.value = state.currentSessionRate;

        toggleTimerUI(true);
        updateTimerDisplay(Date.now() - state.startTime);

        state.timerInterval = setInterval(() => {
            updateTimerDisplay(Date.now() - state.startTime);
        }, 1000);
    }
}
