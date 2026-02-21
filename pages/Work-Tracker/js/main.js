import { DOM, updateCurrencyDisplays, renderCalendar } from './ui.js';
import { setupAuth } from './auth.js';
import { startTimer, stopTimer } from './timer.js';
import { state, updateCurrency } from './state.js';
import { loadHistory } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI
    updateCurrencyDisplays();
    DOM.currencySelect.value = state.currentCurrency;

    // Setup Auth
    setupAuth();

    // Timer Events
    DOM.startBtn.addEventListener('click', startTimer);
    DOM.stopBtn.addEventListener('click', stopTimer);

    // Dropdown Sync Events
    if (DOM.companySelect) {
        DOM.companySelect.addEventListener('change', (e) => {
            if (e.target.value) {
                DOM.companyInput.value = e.target.value;
                e.target.value = ""; // Reset selector
            }
        });
    }

    if (DOM.projectSelect) {
        DOM.projectSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                DOM.projectInput.value = e.target.value;
                e.target.value = ""; // Reset selector
            }
        });
    }

    // Settings Events
    DOM.settingsBtn.addEventListener('click', () => {
        DOM.currencySelect.value = state.currentCurrency;
        DOM.settingsModal.classList.remove('hidden');
    });

    DOM.closeSettingsBtn.addEventListener('click', () => {
        DOM.settingsModal.classList.add('hidden');
    });

    DOM.saveSettingsBtn.addEventListener('click', () => {
        updateCurrency(DOM.currencySelect.value);
        updateCurrencyDisplays();
        if (state.currentUser) {
            loadHistory();
        }
        DOM.settingsModal.classList.add('hidden');
    });

    // Calendar Events
    if (DOM.prevMonthBtn && DOM.nextMonthBtn) {
        DOM.prevMonthBtn.addEventListener('click', () => {
            state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() - 1);
            renderCalendar();
        });

        DOM.nextMonthBtn.addEventListener('click', () => {
            state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() + 1);
            renderCalendar();
        });
    }
});
