import { DOM, updateCurrencyDisplays, renderCalendar, applyWidgetOrder, applyWidgetTitles } from './ui.js';
import { setupAuth } from './auth.js';
import { startTimer, stopTimer } from './timer.js';
import { state, updateCurrency } from './state.js';
import { loadHistory, renderDashboardData } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI
    updateCurrencyDisplays();
    DOM.currencySelect.value = state.currentCurrency;
    applyWidgetOrder();
    applyWidgetTitles();

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
        DOM.showTitlesToggle.checked = state.showWidgetTitles;
        // Import dynamically here to avoid circular dep if needed, but it's imported at top anyway
        import('./ui.js').then(module => module.renderWidgetOrderList());
        DOM.settingsModal.classList.remove('hidden');
    });

    DOM.closeSettingsBtn.addEventListener('click', () => {
        DOM.settingsModal.classList.add('hidden');
    });

    DOM.saveSettingsBtn.addEventListener('click', () => {
        updateCurrency(DOM.currencySelect.value);

        // Harvest new widget order
        const newOrder = [];
        const items = DOM.widgetOrderList.querySelectorAll('.sortable-item');
        items.forEach(item => newOrder.push(item.dataset.id));

        import('./state.js').then(module => {
            module.updateWidgetOrder(newOrder);
            module.updateWidgetTitles(DOM.showTitlesToggle.checked);
        });

        applyWidgetOrder();
        applyWidgetTitles();
        updateCurrencyDisplays();

        if (state.currentUser) {
            loadHistory();
        }
        DOM.settingsModal.classList.add('hidden');

        // Alert to reload for widget order
        import('./ui.js').then(module => {
            module.showAlert("Settings Saved", "Your settings have been saved! Please reload the page to cleanly view any changes to your widget order.");
        });
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

    // Global Filter Events
    if (DOM.filterBtn) {
        DOM.filterBtn.addEventListener('click', () => {
            // Populate filter dropdowns based on all raw data
            const companies = new Set();
            const projects = new Set();

            state.rawSessions.forEach(session => {
                if (session.company) companies.add(session.company.trim());
                if (session.project) projects.add(session.project.trim());
            });

            DOM.filterCompanySelect.innerHTML = '<option value="">All Companies</option>';
            Array.from(companies).sort().forEach(company => {
                const opt = document.createElement('option');
                opt.value = company;
                opt.textContent = company;
                if (state.globalFilterCompany === company) opt.selected = true;
                DOM.filterCompanySelect.appendChild(opt);
            });

            DOM.filterProjectSelect.innerHTML = '<option value="">All Projects</option>';
            Array.from(projects).sort().forEach(project => {
                const opt = document.createElement('option');
                opt.value = project;
                opt.textContent = project;
                if (state.globalFilterProject === project) opt.selected = true;
                DOM.filterProjectSelect.appendChild(opt);
            });

            DOM.filterModal.classList.remove('hidden');
        });
    }

    if (DOM.closeFilterBtn) {
        DOM.closeFilterBtn.addEventListener('click', () => {
            DOM.filterModal.classList.add('hidden');
        });
    }

    if (DOM.applyFilterBtn) {
        DOM.applyFilterBtn.addEventListener('click', () => {
            state.globalFilterCompany = DOM.filterCompanySelect.value;
            state.globalFilterProject = DOM.filterProjectSelect.value;

            import('./api.js').then(module => {
                module.applyGlobalFilters();
                DOM.filterModal.classList.add('hidden');
            });
        });
    }

    if (DOM.clearFilterBtn) {
        DOM.clearFilterBtn.addEventListener('click', () => {
            state.globalFilterCompany = '';
            state.globalFilterProject = '';

            import('./api.js').then(module => {
                module.applyGlobalFilters();
                DOM.filterModal.classList.add('hidden');
            });
        });
    }

    // Export PDF Event - Prints the currently filtered dashboard
    if (DOM.exportBtn) {
        DOM.exportBtn.addEventListener('click', () => {
            if (!state.allSessions || state.allSessions.length === 0) {
                import('./ui.js').then(module => module.showAlert("No Data", "There are no sessions to export."));
                return;
            }
            window.print();
        });
    }
});
