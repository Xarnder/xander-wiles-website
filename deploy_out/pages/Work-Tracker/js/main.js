import {
    DOM,
    updateCurrencyDisplays,
    renderCalendar,
    applyWidgetOrder,
    applyWidgetTitles,
    applyDashboardDensity,
    renderWidgetOrderList,
    renderPercentageCutList,
    addPercentageCutListItem,
    getPercentageCutsFromWidget,
    setupWidgetImageExports,
    renderTimeCostBreakdown,
    renderSavedTimeCostItems,
    renderTcCutsSummary,
    renderPercentageCutStats,
    renderMoneyCounterModeControls
} from './ui.js';
import { setupAuth } from './auth.js';
import { startTimer, stopTimer } from './timer.js';
import {
    state,
    updateCurrency,
    updateWidgetOrder,
    updateWidgetTitles,
    updateStartOfWeek,
    updateContinueSession,
    updateDashboardDensity,
    updateMoneyCounterMode,
    updatePercentageCuts,
    updateTcHourlyRate,
    updateTcDailyHours,
    updateTcWorkingDaysPerWeek,
    updateTcSavedItemFilters,
    updateActiveCutStatsPeriods
} from './state.js';
import { renderDashboardData, savePercentageCuts, saveTimeCostItem, saveTimeCostSettings } from './api.js';

let percentageCutsSaveTimeout = null;

function schedulePercentageCutsAutosave() {
    updatePercentageCuts(getPercentageCutsFromWidget());
    renderDashboardData();
    renderTimeCostBreakdown();
    renderSavedTimeCostItems();
    renderMoneyCounterModeControls();

    clearTimeout(percentageCutsSaveTimeout);
    percentageCutsSaveTimeout = setTimeout(() => {
        savePercentageCuts(state.percentageCuts, { silent: true });
    }, 1200);
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI
    updateCurrencyDisplays();
    DOM.currencySelect.value = state.currentCurrency;
    renderPercentageCutList();
    applyWidgetOrder();
    applyWidgetTitles();
    applyDashboardDensity();
    renderMoneyCounterModeControls();
    setupWidgetImageExports();

    // Initialize period toggle active classes and click handlers from state
    const toggleBtns = document.querySelectorAll('.period-toggle-btn');
    toggleBtns.forEach(btn => {
        const period = btn.dataset.period;
        if (state.activeCutStatsPeriods.includes(period)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
        
        btn.addEventListener('click', () => {
            const isActive = btn.classList.contains('active');
            const periodKey = btn.dataset.period;
            
            let nextActivePeriods = [...state.activeCutStatsPeriods];
            if (isActive) {
                if (nextActivePeriods.length <= 1) {
                    import('./ui.js').then(module => module.showAlert("Selection Blocked", "At least one statistics period must remain visible."));
                    return;
                }
                nextActivePeriods = nextActivePeriods.filter(p => p !== periodKey);
                btn.classList.remove('active');
            } else {
                nextActivePeriods.push(periodKey);
                btn.classList.add('active');
            }
            
            updateActiveCutStatsPeriods(nextActivePeriods);
            
            if (state.lastStatsTotals) {
                renderPercentageCutStats(state.lastStatsTotals);
            }
        });
    });

    if (DOM.tcHourlyRate) {
        DOM.tcHourlyRate.value = state.tcHourlyRate;
    }
    if (DOM.tcDailyHours) {
        DOM.tcDailyHours.value = state.tcDailyHours;
    }
    if (DOM.tcWorkingDays) {
        DOM.tcWorkingDays.value = state.tcWorkingDaysPerWeek;
    }

    renderTcCutsSummary();

    // Setup Auth
    setupAuth();

    // Timer Events
    DOM.startBtn.addEventListener('click', startTimer);
    DOM.stopBtn.addEventListener('click', stopTimer);

    // View Switcher Events
    if (DOM.viewDashboardBtn && DOM.viewTimeCostBtn) {
        DOM.viewDashboardBtn.addEventListener('click', () => {
            DOM.viewDashboardBtn.classList.add('active');
            DOM.viewTimeCostBtn.classList.remove('active');
            DOM.dashboardView.classList.remove('hidden');
            DOM.timeCostView.classList.add('hidden');
        });

        DOM.viewTimeCostBtn.addEventListener('click', () => {
            DOM.viewTimeCostBtn.classList.add('active');
            DOM.viewDashboardBtn.classList.remove('active');
            DOM.timeCostView.classList.remove('hidden');
            DOM.dashboardView.classList.add('hidden');
            renderTimeCostBreakdown(); // Initialize
            renderSavedTimeCostItems(); // Initialize
        });
    }

    // Time Cost Events
    let tcSettingsTimeout = null;

    const handleTcSettingsInput = () => {
        const hourlyRate = parseFloat(DOM.tcHourlyRate ? DOM.tcHourlyRate.value : 0) || 20;
        const dailyHours = parseFloat(DOM.tcDailyHours ? DOM.tcDailyHours.value : 0) || 8;
        const workingDaysPerWeek = parseFloat(DOM.tcWorkingDays ? DOM.tcWorkingDays.value : 0) || 5;

        updateTcHourlyRate(hourlyRate);
        updateTcDailyHours(dailyHours);
        updateTcWorkingDaysPerWeek(workingDaysPerWeek);

        renderTimeCostBreakdown();
        renderSavedTimeCostItems();

        clearTimeout(tcSettingsTimeout);
        tcSettingsTimeout = setTimeout(() => {
            saveTimeCostSettings(state.tcHourlyRate, state.tcDailyHours, state.tcWorkingDaysPerWeek);
        }, 1200);
    };

    if (DOM.tcItemCost) {
        DOM.tcItemCost.addEventListener('input', () => {
            renderTimeCostBreakdown();
            renderSavedTimeCostItems();
        });
    }
    if (DOM.tcHourlyRate) {
        DOM.tcHourlyRate.addEventListener('input', handleTcSettingsInput);
    }
    if (DOM.tcDailyHours) {
        DOM.tcDailyHours.addEventListener('input', handleTcSettingsInput);
    }
    if (DOM.tcWorkingDays) {
        DOM.tcWorkingDays.addEventListener('input', handleTcSettingsInput);
    }

    if (DOM.tcSaveBtn) {
        DOM.tcSaveBtn.addEventListener('click', () => {
            const name = DOM.tcItemName.value.trim();
            const cost = parseFloat(DOM.tcItemCost.value);
            
            if (!name) {
                import('./ui.js').then(module => module.showAlert("Invalid Input", "Please enter an item name."));
                return;
            }
            if (isNaN(cost) || cost <= 0) {
                import('./ui.js').then(module => module.showAlert("Invalid Input", "Please enter a valid item cost."));
                return;
            }

            saveTimeCostItem({
                name,
                cost,
                dateBought: DOM.tcItemDateBought && DOM.tcItemDateBought.value ? DOM.tcItemDateBought.value : null
            });
            
            // Clear inputs after save
            DOM.tcItemName.value = '';
            DOM.tcItemCost.value = '';
            if (DOM.tcItemDateBought) DOM.tcItemDateBought.value = '';
            renderTimeCostBreakdown();
        });
    }

    const handleSavedItemFilterInput = () => {
        updateTcSavedItemFilters({
            search: DOM.tcSavedFilterSearch ? DOM.tcSavedFilterSearch.value : '',
            dateStatus: DOM.tcSavedFilterDateStatus ? DOM.tcSavedFilterDateStatus.value : 'all',
            fromDate: DOM.tcSavedFilterFrom ? DOM.tcSavedFilterFrom.value : '',
            toDate: DOM.tcSavedFilterTo ? DOM.tcSavedFilterTo.value : ''
        });
        renderSavedTimeCostItems();
    };

    [DOM.tcSavedFilterSearch, DOM.tcSavedFilterDateStatus, DOM.tcSavedFilterFrom, DOM.tcSavedFilterTo].forEach(control => {
        if (!control) return;
        control.addEventListener('input', handleSavedItemFilterInput);
        control.addEventListener('change', handleSavedItemFilterInput);
    });

    if (DOM.tcSavedFilterClear) {
        DOM.tcSavedFilterClear.addEventListener('click', () => {
            if (DOM.tcSavedFilterSearch) DOM.tcSavedFilterSearch.value = '';
            if (DOM.tcSavedFilterDateStatus) DOM.tcSavedFilterDateStatus.value = 'all';
            if (DOM.tcSavedFilterFrom) DOM.tcSavedFilterFrom.value = '';
            if (DOM.tcSavedFilterTo) DOM.tcSavedFilterTo.value = '';
            handleSavedItemFilterInput();
        });
    }

    if (DOM.closeTcItemModalBtn) {
        DOM.closeTcItemModalBtn.addEventListener('click', () => {
            DOM.tcItemModal.classList.add('hidden');
        });
    }

    if (DOM.saveTcItemBtn) {
        DOM.saveTcItemBtn.addEventListener('click', () => {
            const itemId = DOM.editTcItemId.value;
            const name = DOM.editTcItemName.value.trim() || 'Unnamed Item';
            const cost = parseFloat(DOM.editTcItemCost.value);

            if (!itemId) return;

            if (!Number.isFinite(cost) || cost < 0) {
                import('./ui.js').then(module => module.showAlert("Invalid Cost", "Please enter a valid item cost."));
                return;
            }

            import('./api.js').then(module => {
                module.updateTimeCostItem(itemId, {
                    name,
                    cost,
                    dateBought: DOM.editTcItemDateBought.value || null
                });
            });

            DOM.tcItemModal.classList.add('hidden');
        });
    }

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
        DOM.continueSessionToggle.checked = state.continueSessionOnClose;
        if (DOM.widgetSpacingSelect) {
            DOM.widgetSpacingSelect.value = state.dashboardDensity;
        }
        if (DOM.startOfWeekSelect) {
            DOM.startOfWeekSelect.value = state.startOfWeek.toString();
        }
        renderWidgetOrderList();
        DOM.settingsModal.classList.remove('hidden');
    });

    DOM.closeSettingsBtn.addEventListener('click', () => {
        DOM.settingsModal.classList.add('hidden');
    });

    DOM.saveSettingsBtn.addEventListener('click', () => {
        updateCurrency(DOM.currencySelect.value);

        if (DOM.startOfWeekSelect) {
            updateStartOfWeek(parseInt(DOM.startOfWeekSelect.value));
        }

        // Harvest new widget order
        const newOrder = [];
        const items = DOM.widgetOrderList.querySelectorAll('.sortable-item');
        items.forEach(item => newOrder.push(item.dataset.id));

        updateWidgetOrder(newOrder);
        updateWidgetTitles(DOM.showTitlesToggle.checked);
        updateContinueSession(DOM.continueSessionToggle.checked);
        if (DOM.widgetSpacingSelect) {
            updateDashboardDensity(DOM.widgetSpacingSelect.value);
        }

        applyWidgetOrder();
        applyWidgetTitles();
        applyDashboardDensity();
        updateCurrencyDisplays();
        renderDashboardData();

        DOM.settingsModal.classList.add('hidden');

        import('./ui.js').then(module => {
            module.showAlert("Settings Saved", "Your settings have been saved.");
        });
    });

    if (DOM.addPercentageCutBtn) {
        DOM.addPercentageCutBtn.addEventListener('click', () => {
            addPercentageCutListItem();
            schedulePercentageCutsAutosave();
        });
    }

    if (DOM.percentageCutList) {
        DOM.percentageCutList.addEventListener('input', schedulePercentageCutsAutosave);
        DOM.percentageCutList.addEventListener('click', schedulePercentageCutsAutosave);
        DOM.percentageCutList.addEventListener('drop', schedulePercentageCutsAutosave);
        DOM.percentageCutList.addEventListener('dragend', schedulePercentageCutsAutosave);
    }

    DOM.moneyCounterModeButtons.forEach(button => {
        button.addEventListener('click', () => {
            updateMoneyCounterMode(button.dataset.moneyCounterMode);
            renderMoneyCounterModeControls();
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

    // Handle Tab Close Session Logic
    window.addEventListener('beforeunload', (e) => {
        if (!state.continueSessionOnClose && state.startTime) {
            // Calculate session data so far and save to local storage
            const durationMs = Date.now() - state.startTime;
            const rate = state.currentSessionRate || 0;
            const hours = durationMs / (1000 * 60 * 60);
            const earnings = hours * rate;

            const pendingSession = {
                startTime: state.startTime,
                endTime: Date.now(),
                durationMs: durationMs,
                rate: rate,
                earnings: earnings,
                company: state.currentCompany,
                project: state.currentProject,
                focused: true // assume true if tracked via main timer
            };

            // Save pending session
            localStorage.setItem('work_tracker_pending_session', JSON.stringify(pendingSession));

            // Clean up standard timer storage so it doesn't resume automatically
            localStorage.removeItem('work_tracker_start');
            localStorage.removeItem('work_tracker_rate');
            localStorage.removeItem('work_tracker_company');
            localStorage.removeItem('work_tracker_project');
        }
    });
});
