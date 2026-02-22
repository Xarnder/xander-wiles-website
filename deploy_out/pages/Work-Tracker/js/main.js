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

    // Session Modal Events
    if (DOM.addSessionBtn) {
        DOM.addSessionBtn.addEventListener('click', () => {
            DOM.sessionModalTitle.textContent = "Add Session";
            DOM.editSessionId.value = "";

            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));

            import('./utils.js').then(({ formatDateTimeLocal }) => {
                DOM.sessionStart.value = formatDateTimeLocal(oneHourAgo);
                DOM.sessionEnd.value = formatDateTimeLocal(now);
            });

            DOM.sessionRate.value = DOM.hourlyRateInput.value || 20;
            DOM.sessionCompany.value = "";
            DOM.sessionProject.value = "";
            DOM.sessionFocused.checked = true;
            DOM.sessionModal.classList.remove('hidden');
        });
    }

    if (DOM.closeSessionModalBtn) {
        DOM.closeSessionModalBtn.addEventListener('click', () => {
            DOM.sessionModal.classList.add('hidden');
        });
    }

    if (DOM.sessionCompanySelect) {
        DOM.sessionCompanySelect.addEventListener('change', (e) => {
            if (e.target.value) {
                DOM.sessionCompany.value = e.target.value;
                e.target.value = "";
            }
        });
    }

    if (DOM.sessionProjectSelect) {
        DOM.sessionProjectSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                DOM.sessionProject.value = e.target.value;
                e.target.value = "";
            }
        });
    }

    if (DOM.saveSessionBtn) {
        DOM.saveSessionBtn.addEventListener('click', () => {
            const startStr = DOM.sessionStart.value;
            const endStr = DOM.sessionEnd.value;

            if (!startStr || !endStr) {
                import('./ui.js').then(module => module.showAlert("Invalid Input", "Please provide both start and end times."));
                return;
            }

            const startTime = new Date(startStr).getTime();
            const endTime = new Date(endStr).getTime();

            if (endTime <= startTime) {
                import('./ui.js').then(module => module.showAlert("Invalid Input", "End time must be after start time."));
                return;
            }

            const durationMs = endTime - startTime;
            const rate = parseFloat(DOM.sessionRate.value) || 0;
            const hours = durationMs / (1000 * 60 * 60);
            const earnings = hours * rate;

            const sessionData = {
                startTime: startTime,
                endTime: endTime,
                durationMs: durationMs,
                rate: rate,
                earnings: earnings,
                company: DOM.sessionCompany.value.trim(),
                project: DOM.sessionProject.value.trim(),
                focused: DOM.sessionFocused.checked
            };

            const sessionId = DOM.editSessionId.value;

            import('./api.js').then(module => {
                if (sessionId) {
                    module.updateSession(sessionId, sessionData);
                } else {
                    module.addCustomSession(sessionData);
                }
                DOM.sessionModal.classList.add('hidden');
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

    // Export CSV Event - Downloads currently filtered sessions as a .csv file
    if (DOM.exportCsvBtn) {
        DOM.exportCsvBtn.addEventListener('click', () => {
            if (!state.allSessions || state.allSessions.length === 0) {
                import('./ui.js').then(module => module.showAlert("No Data", "There are no sessions to export."));
                return;
            }

            // Define CSV headers
            const headers = [
                "Date",
                "Start Time",
                "End Time",
                "Duration (Hours)",
                "Rate",
                "Earnings",
                "Company",
                "Project",
                "Focused"
            ];

            // Safely escape values containing commas or double-quotes
            function escapeCSV(val) {
                if (val === null || val === undefined) return "";
                const str = String(val);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            }

            // Build rows
            const rows = [headers.join(",")];

            state.allSessions.forEach(session => {
                const startDate = new Date(session.startTime);
                const endDate = new Date(session.endTime);

                const dateStr = startDate.toLocaleDateString();
                const startTimeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const endTimeStr = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const durationHrs = (session.durationMs / (1000 * 60 * 60)).toFixed(2);

                const isFocusedStr = session.focused === false ? "False" : "True";

                const rowData = [
                    dateStr,
                    startTimeStr,
                    endTimeStr,
                    durationHrs,
                    session.rate,
                    session.earnings.toFixed(2),
                    session.company || "",
                    session.project || "",
                    isFocusedStr
                ];

                rows.push(rowData.map(escapeCSV).join(","));
            });

            // Trigger download
            const csvData = rows.join("\n");
            const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");

            // Format fallback timestamp for the filename
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];

            a.href = url;
            a.download = `Work_Tracker_Export_${dateStr}.csv`;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }
});
