import {
    DOM,
    updateCurrencyDisplays,
    renderCalendar,
    renderChart,
    renderGanttChart,
    applyWidgetOrder,
    applyWidgetVisibility,
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
    renderMoneyCounterModeControls,
    renderStatsPeriodModeControls,
    renderCustomStatsPeriodsSettings,
    renderSettingsDefaultFields,
    renderCsvExportCompanySelect,
    renderCalendarEditModeControls,
    updateBatchModalForMode
} from './ui.js';
import { setupAuth } from './auth.js';
import { startTimer, stopTimer } from './timer.js';
import {
    state,
    updateCurrency,
    updateWidgetOrder,
    updateDisabledWidgets,
    updateTargetShiftHours,
    updateWidgetTitles,
    updateStartOfWeek,
    updateContinueSession,
    updateDashboardDensity,
    updateMoneyCounterMode,
    updateMoneyCounterGap,
    updatePercentageCuts,
    updateTcHourlyRate,
    updateTcDailyHours,
    updateTcWorkingDaysPerWeek,
    updateTcSavedItemFilters,
    updateActiveCutStatsPeriods,
    updateStatsPeriodMode,
    createCustomStatsPeriod,
    updateCustomStatsPeriods,
    updateDefaultHourlyRate,
    updateRatePreference,
    updateDefaultCompany,
    updateCompanyPreference,
    updateDefaultProject,
    updateProjectPreference,
    updateDefaultStartTime,
    updateStartTimePreference,
    updateCsvExportPeriod,
    updateCsvExportCompany,
    updateCalendarEditMode,
    getBreaksViewDate,
    setBreaksViewDate,
    shiftBreaksViewDate
} from './state.js';
import { renderDashboardData, savePercentageCuts, saveTimeCostItem, saveTimeCostSettings, renderBreakHistory } from './api.js';
import { getBreaksForDay, sessionOverlapsDay } from './utils.js';

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
    applyWidgetVisibility();
    applyWidgetTitles();
    applyDashboardDensity();
    renderMoneyCounterModeControls();
    renderStatsPeriodModeControls();
    renderSettingsDefaultFields();
    setupWidgetImageExports();
    renderCalendarEditModeControls();

    DOM.calendarModeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const mode = button.dataset.calendarMode;
            if (mode === state.calendarEditMode) return;
            updateCalendarEditMode(mode);
            renderCalendarEditModeControls();
            renderCalendar();
        });
    });

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

    DOM.statsPeriodModeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const nextMode = button.dataset.statsPeriodMode;
            if (!nextMode || nextMode === state.statsPeriodMode) return;

            updateStatsPeriodMode(nextMode);
            renderStatsPeriodModeControls();
            renderDashboardData();
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
    if (DOM.viewDashboardBtn && DOM.viewTimeCostBtn && DOM.viewSettingsBtn) {
        DOM.viewDashboardBtn.addEventListener('click', () => {
            DOM.viewDashboardBtn.classList.add('active');
            DOM.viewTimeCostBtn.classList.remove('active');
            DOM.viewSettingsBtn.classList.remove('active');
            DOM.dashboardView.classList.remove('hidden');
            DOM.timeCostView.classList.add('hidden');
            DOM.settingsView.classList.add('hidden');
        });

        DOM.viewTimeCostBtn.addEventListener('click', () => {
            DOM.viewTimeCostBtn.classList.add('active');
            DOM.viewDashboardBtn.classList.remove('active');
            DOM.viewSettingsBtn.classList.remove('active');
            DOM.timeCostView.classList.remove('hidden');
            DOM.dashboardView.classList.add('hidden');
            DOM.settingsView.classList.add('hidden');
            renderTimeCostBreakdown(); // Initialize
            renderSavedTimeCostItems(); // Initialize
        });

        DOM.viewSettingsBtn.addEventListener('click', () => {
            DOM.viewSettingsBtn.classList.add('active');
            DOM.viewDashboardBtn.classList.remove('active');
            DOM.viewTimeCostBtn.classList.remove('active');
            DOM.settingsView.classList.remove('hidden');
            DOM.dashboardView.classList.add('hidden');
            DOM.timeCostView.classList.add('hidden');
            initSettingsView(); // Initialize
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

    function initSettingsView() {
        DOM.currencySelect.value = state.currentCurrency;
        DOM.showTitlesToggle.checked = state.showWidgetTitles;
        DOM.continueSessionToggle.checked = state.continueSessionOnClose;
        if (DOM.widgetSpacingSelect) {
            DOM.widgetSpacingSelect.value = state.dashboardDensity;
        }
        if (DOM.startOfWeekSelect) {
            DOM.startOfWeekSelect.value = state.startOfWeek.toString();
        }
        if (DOM.defaultHourlyRateSettingInput) {
            DOM.defaultHourlyRateSettingInput.value = state.defaultHourlyRate;
        }
        if (DOM.ratePreferenceSelect) {
            DOM.ratePreferenceSelect.value = state.ratePreference;
        }
        if (DOM.defaultCompanySettingInput) {
            DOM.defaultCompanySettingInput.value = state.defaultCompany;
        }
        if (DOM.companyPreferenceSelect) {
            DOM.companyPreferenceSelect.value = state.companyPreference;
        }
        if (DOM.defaultProjectSettingInput) {
            DOM.defaultProjectSettingInput.value = state.defaultProject;
        }
        if (DOM.projectPreferenceSelect) {
            DOM.projectPreferenceSelect.value = state.projectPreference;
        }
        if (DOM.defaultStartTimeSettingInput) {
            DOM.defaultStartTimeSettingInput.value = state.defaultStartTime;
        }
        if (DOM.startTimePreferenceSelect) {
            DOM.startTimePreferenceSelect.value = state.startTimePreference;
        }
        if (DOM.moneyCounterGapSlider && DOM.moneyCounterGapValue) {
            DOM.moneyCounterGapSlider.value = state.moneyCounterGap;
            DOM.moneyCounterGapValue.textContent = state.moneyCounterGap.toFixed(1);
        }
        if (DOM.targetShiftHoursInput) {
            DOM.targetShiftHoursInput.value = state.targetShiftHours;
        }
        if (DOM.csvExportFrom) {
            DOM.csvExportFrom.value = state.csvExportPeriodFrom;
        }
        if (DOM.csvExportTo) {
            DOM.csvExportTo.value = state.csvExportPeriodTo;
        }
        renderCsvExportCompanySelect();
        renderWidgetOrderList();
        renderCustomStatsPeriodsSettings();
        renderSettingsDefaultFields();
    }

    [DOM.ratePreferenceSelect, DOM.companyPreferenceSelect, DOM.projectPreferenceSelect, DOM.startTimePreferenceSelect]
        .filter(Boolean)
        .forEach(select => {
            select.addEventListener('change', renderSettingsDefaultFields);
        });

    if (DOM.customStatsPeriodForm) {
        DOM.customStatsPeriodForm.addEventListener('submit', (event) => {
            event.preventDefault();

            const amount = parseFloat(DOM.customStatsPeriodAmount?.value || '');
            const unit = DOM.customStatsPeriodUnit?.value || 'days';

            if (!Number.isFinite(amount) || amount <= 0) {
                DOM.customStatsPeriodAmount?.reportValidity();
                return;
            }

            const alreadyExists = state.customStatsPeriods.some(
                period => period.amount === amount && period.unit === unit
            );

            if (alreadyExists) {
                import('./ui.js').then(module => {
                    module.showAlert('Duplicate Duration', 'That custom statistics duration already exists.');
                });
                return;
            }

            updateCustomStatsPeriods([
                ...state.customStatsPeriods,
                createCustomStatsPeriod(amount, unit)
            ]);
            renderCustomStatsPeriodsSettings();
            renderDashboardData();

            if (DOM.customStatsPeriodAmount) {
                DOM.customStatsPeriodAmount.value = '';
            }
        });
    }

    if (DOM.customStatsPeriodsList) {
        DOM.customStatsPeriodsList.addEventListener('click', (event) => {
            const removeBtn = event.target.closest('.custom-stats-period-remove');
            if (!removeBtn) return;

            const periodId = removeBtn.dataset.periodId;
            updateCustomStatsPeriods(state.customStatsPeriods.filter(period => period.id !== periodId));
            renderCustomStatsPeriodsSettings();
            renderDashboardData();
        });
    }

    // Settings Events
    DOM.settingsBtn.addEventListener('click', () => {
        if (DOM.viewSettingsBtn) {
            DOM.viewSettingsBtn.click();
        }
    });

    if (DOM.toggleWidgetOrderBtn) {
        DOM.toggleWidgetOrderBtn.addEventListener('click', () => {
            const container = document.getElementById('widget-order-container');
            const chevron = document.getElementById('widget-order-chevron');
            if (container && chevron) {
                const isHidden = container.classList.toggle('hidden');
                chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
            }
        });
    }

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

        const disabledWidgets = [];
        DOM.widgetOrderList.querySelectorAll('.widget-visibility-checkbox').forEach((checkbox) => {
            if (!checkbox.checked) {
                disabledWidgets.push(checkbox.dataset.widgetId);
            }
        });
        updateDisabledWidgets(disabledWidgets);

        updateWidgetTitles(DOM.showTitlesToggle.checked);
        updateContinueSession(DOM.continueSessionToggle.checked);
        if (DOM.targetShiftHoursInput) {
            updateTargetShiftHours(DOM.targetShiftHoursInput.value);
        }
        if (DOM.widgetSpacingSelect) {
            updateDashboardDensity(DOM.widgetSpacingSelect.value);
        }
        if (DOM.defaultHourlyRateSettingInput) {
            updateDefaultHourlyRate(DOM.defaultHourlyRateSettingInput.value);
        }
        if (DOM.ratePreferenceSelect) {
            updateRatePreference(DOM.ratePreferenceSelect.value);
        }
        if (DOM.defaultCompanySettingInput) {
            updateDefaultCompany(DOM.defaultCompanySettingInput.value);
        }
        if (DOM.companyPreferenceSelect) {
            updateCompanyPreference(DOM.companyPreferenceSelect.value);
        }
        if (DOM.defaultProjectSettingInput) {
            updateDefaultProject(DOM.defaultProjectSettingInput.value);
        }
        if (DOM.projectPreferenceSelect) {
            updateProjectPreference(DOM.projectPreferenceSelect.value);
        }
        if (DOM.defaultStartTimeSettingInput) {
            updateDefaultStartTime(DOM.defaultStartTimeSettingInput.value);
        }
        if (DOM.startTimePreferenceSelect) {
            updateStartTimePreference(DOM.startTimePreferenceSelect.value);
        }
        if (DOM.moneyCounterGapSlider) {
            updateMoneyCounterGap(parseFloat(DOM.moneyCounterGapSlider.value));
            if (DOM.moneyCounterStage) {
                DOM.moneyCounterStage.style.setProperty('--stack-gap-scale', state.moneyCounterGap);
            }
        }

        if (DOM.csvExportCompanySelect) {
            updateCsvExportCompany(DOM.csvExportCompanySelect.value);
        }

        const csvFrom = DOM.csvExportFrom?.value || '';
        const csvTo = DOM.csvExportTo?.value || '';
        if (csvFrom || csvTo) {
            if (!csvFrom || !csvTo) {
                import('./ui.js').then(module => {
                    module.showAlert('Invalid CSV Period', 'Please set both the custom period start and end dates, or clear both.');
                });
                return;
            }

            import('./utils.js').then(({ parseCsvExportDate }) => {
                const fromDate = parseCsvExportDate(csvFrom);
                const toDate = parseCsvExportDate(csvTo);

                if (!fromDate || !toDate) {
                    import('./ui.js').then(module => {
                        module.showAlert('Invalid CSV Period', 'Please enter valid custom period dates.');
                    });
                    return;
                }

                if (toDate < fromDate) {
                    import('./ui.js').then(module => {
                        module.showAlert('Invalid CSV Period', 'The custom period end date must be on or after the start date.');
                    });
                    return;
                }

                updateCsvExportPeriod(csvFrom, csvTo);
                finishSettingsSave();
            });
            return;
        }

        updateCsvExportPeriod('', '');
        finishSettingsSave();
    });

    function finishSettingsSave() {
        const timerIsRunning = localStorage.getItem('work_tracker_start') !== null;
        if (!timerIsRunning) {
            const lastSession = state.rawSessions && state.rawSessions[0];

            if (DOM.hourlyRateInput) {
                if (state.ratePreference === 'default_rate') {
                    DOM.hourlyRateInput.value = state.defaultHourlyRate;
                } else {
                    if (lastSession && lastSession.rate != null) {
                        DOM.hourlyRateInput.value = lastSession.rate;
                    } else {
                        DOM.hourlyRateInput.value = state.defaultHourlyRate;
                    }
                }
            }

            if (DOM.companyInput) {
                if (state.companyPreference === 'default_value') {
                    DOM.companyInput.value = state.defaultCompany;
                } else {
                    if (lastSession && lastSession.company != null) {
                        DOM.companyInput.value = lastSession.company;
                    } else {
                        DOM.companyInput.value = state.defaultCompany;
                    }
                }
            }

            if (DOM.projectInput) {
                if (state.projectPreference === 'default_value') {
                    DOM.projectInput.value = state.defaultProject;
                } else {
                    if (lastSession && lastSession.project != null) {
                        DOM.projectInput.value = lastSession.project;
                    } else {
                        DOM.projectInput.value = state.defaultProject;
                    }
                }
            }
        }

        applyWidgetOrder();
        applyWidgetVisibility();
        applyWidgetTitles();
        applyDashboardDensity();
        updateCurrencyDisplays();
        renderDashboardData();

        import('./ui.js').then(module => {
            module.showAlert("Settings Saved", "Your settings have been saved.");
        });
    }

    if (DOM.csvExportClearPeriodBtn) {
        DOM.csvExportClearPeriodBtn.addEventListener('click', () => {
            if (DOM.csvExportFrom) DOM.csvExportFrom.value = '';
            if (DOM.csvExportTo) DOM.csvExportTo.value = '';
            updateCsvExportPeriod('', '');
        });
    }

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

    if (DOM.moneyCounterGapSlider) {
        DOM.moneyCounterGapSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            updateMoneyCounterGap(val);
            if (DOM.moneyCounterGapValue) {
                DOM.moneyCounterGapValue.textContent = val.toFixed(1);
            }
            if (DOM.moneyCounterStage) {
                DOM.moneyCounterStage.style.setProperty('--stack-gap-scale', val);
            }
        });
    }

    // Helper function to open Session Modal for a specific date and populate default or previous time settings
    function openAddSessionModal(selectedDate, usePreviousTimes = true) {
        DOM.sessionModalTitle.textContent = "Add Session";
        DOM.editSessionId.value = "";

        const selectedMidnight = new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate()
        );

        let prevSession = null;
        if (usePreviousTimes) {
            let maxPrevMidnight = -1;
            state.allSessions.forEach(session => {
                const sessionStart = new Date(session.startTime);
                const sessionMidnight = new Date(
                    sessionStart.getFullYear(),
                    sessionStart.getMonth(),
                    sessionStart.getDate()
                );
                const time = sessionMidnight.getTime();
                if (time < selectedMidnight.getTime()) {
                    if (time > maxPrevMidnight) {
                        maxPrevMidnight = time;
                        prevSession = session;
                    } else if (time === maxPrevMidnight) {
                        if (!prevSession || new Date(session.startTime).getTime() > new Date(prevSession.startTime).getTime()) {
                            prevSession = session;
                        }
                    }
                }
            });
        }

        let newStart, newEnd;
        if (state.startTimePreference === 'default_value') {
            let defaultHours = 9;
            let defaultMinutes = 0;
            if (state.defaultStartTime) {
                const parts = state.defaultStartTime.split(':');
                if (parts.length === 2) {
                    defaultHours = parseInt(parts[0]) || 0;
                    defaultMinutes = parseInt(parts[1]) || 0;
                }
            }
            newStart = new Date(
                selectedMidnight.getFullYear(),
                selectedMidnight.getMonth(),
                selectedMidnight.getDate(),
                defaultHours,
                defaultMinutes,
                0, 0
            );
            const duration = (prevSession && prevSession.durationMs) ? prevSession.durationMs : (60 * 60 * 1000);
            newEnd = new Date(newStart.getTime() + duration);
        } else if (prevSession) {
            const sStart = new Date(prevSession.startTime);
            const sEnd = prevSession.endTime 
                ? new Date(prevSession.endTime) 
                : new Date(sStart.getTime() + (prevSession.durationMs || 0));

            newStart = new Date(
                selectedMidnight.getFullYear(),
                selectedMidnight.getMonth(),
                selectedMidnight.getDate(),
                sStart.getHours(),
                sStart.getMinutes(),
                sStart.getSeconds(),
                sStart.getMilliseconds()
            );

            const sStartMidnight = new Date(sStart.getFullYear(), sStart.getMonth(), sStart.getDate());
            const sEndMidnight = new Date(sEnd.getFullYear(), sEnd.getMonth(), sEnd.getDate());
            const dayDiff = Math.round((sEndMidnight.getTime() - sStartMidnight.getTime()) / (24 * 60 * 60 * 1000));

            newEnd = new Date(
                selectedMidnight.getFullYear(),
                selectedMidnight.getMonth(),
                selectedMidnight.getDate() + dayDiff,
                sEnd.getHours(),
                sEnd.getMinutes(),
                sEnd.getSeconds(),
                sEnd.getMilliseconds()
            );
        } else {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
            newStart = new Date(
                selectedMidnight.getFullYear(),
                selectedMidnight.getMonth(),
                selectedMidnight.getDate(),
                oneHourAgo.getHours(),
                oneHourAgo.getMinutes(),
                0, 0
            );
            newEnd = new Date(
                selectedMidnight.getFullYear(),
                selectedMidnight.getMonth(),
                selectedMidnight.getDate(),
                now.getHours(),
                now.getMinutes(),
                0, 0
            );
        }

        import('./utils.js').then(({ formatDateTimeLocal }) => {
            DOM.sessionStart.value = formatDateTimeLocal(newStart);
            DOM.sessionEnd.value = formatDateTimeLocal(newEnd);
        });

        if (state.ratePreference === 'default_rate') {
            DOM.sessionRate.value = state.defaultHourlyRate;
        } else {
            DOM.sessionRate.value = (prevSession && prevSession.rate != null) ? prevSession.rate : (DOM.hourlyRateInput.value || state.defaultHourlyRate);
        }

        if (state.companyPreference === 'default_value') {
            DOM.sessionCompany.value = state.defaultCompany;
        } else {
            DOM.sessionCompany.value = (prevSession && prevSession.company != null) ? prevSession.company : (DOM.companyInput.value || state.defaultCompany);
        }

        if (state.projectPreference === 'default_value') {
            DOM.sessionProject.value = state.defaultProject;
        } else {
            DOM.sessionProject.value = (prevSession && prevSession.project != null) ? prevSession.project : (DOM.projectInput.value || state.defaultProject);
        }
        DOM.sessionFocused.checked = true;
        DOM.sessionModal.classList.remove('modal-mode-edit');
        DOM.sessionModal.classList.add('modal-mode-add');
        DOM.sessionModal.classList.remove('hidden');
    }

    function openEditSessionModal(session) {
        DOM.sessionModalTitle.textContent = "Edit Session";
        DOM.editSessionId.value = session.id;

        import('./utils.js').then(({ formatDateTimeLocal }) => {
            DOM.sessionStart.value = formatDateTimeLocal(session.startTime);
            DOM.sessionEnd.value = formatDateTimeLocal(session.endTime || (new Date(session.startTime).getTime() + (session.durationMs || 0)));
            DOM.sessionRate.value = session.rate || 0;
            DOM.sessionCompany.value = session.company || "";
            DOM.sessionProject.value = session.project || "";
            DOM.sessionFocused.checked = session.focused !== false;
            DOM.sessionModal.classList.remove('modal-mode-add');
            DOM.sessionModal.classList.add('modal-mode-edit');
            DOM.sessionModal.classList.remove('hidden');
        });
    }

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

    // Chart Weekly Navigation Events
    if (DOM.prevWeekBtn && DOM.nextWeekBtn) {
        DOM.prevWeekBtn.addEventListener('click', () => {
            state.currentChartDate.setDate(state.currentChartDate.getDate() - 7);
            renderChart();
        });

        DOM.nextWeekBtn.addEventListener('click', () => {
            state.currentChartDate.setDate(state.currentChartDate.getDate() + 7);
            renderChart();
        });
    }

    // Timeline Weekly Navigation Events
    if (DOM.prevTimelineWeekBtn && DOM.nextTimelineWeekBtn) {
        DOM.prevTimelineWeekBtn.addEventListener('click', () => {
            state.currentTimelineDate.setDate(state.currentTimelineDate.getDate() - 7);
            renderGanttChart();
        });

        DOM.nextTimelineWeekBtn.addEventListener('click', () => {
            state.currentTimelineDate.setDate(state.currentTimelineDate.getDate() + 7);
            renderGanttChart();
        });
    }

    function updateBatchSelectionUI() {
        if (!DOM.batchSelectedLabel || !DOM.openBatchModalBtn) return;
        const count = state.batchSelectedDates.length;
        DOM.batchSelectedLabel.textContent = `${count} day${count === 1 ? '' : 's'} selected`;
        DOM.openBatchModalBtn.disabled = count === 0;
    }

    if (DOM.toggleBatchModeBtn) {
        DOM.toggleBatchModeBtn.addEventListener('click', () => {
            state.batchModeEnabled = !state.batchModeEnabled;
            if (state.batchModeEnabled) {
                DOM.toggleBatchModeBtn.textContent = "Exit Batch Mode";
                DOM.toggleBatchModeBtn.classList.add('active');
                DOM.batchModeControls?.classList.remove('hidden');
            } else {
                state.batchSelectedDates = [];
                renderCalendarEditModeControls();
                DOM.toggleBatchModeBtn.classList.remove('active');
                DOM.batchModeControls?.classList.add('hidden');
                updateBatchSelectionUI();
            }
            renderCalendar();
        });
    }

    if (DOM.batchClearBtn) {
        DOM.batchClearBtn.addEventListener('click', () => {
            state.batchSelectedDates = [];
            const cells = DOM.calendarGrid.querySelectorAll('.calendar-day.batch-selected');
            cells.forEach(cell => {
                cell.classList.remove('batch-selected');
                cell.classList.remove('batch-selected-break');
            });
            updateBatchSelectionUI();
        });
    }

    if (DOM.calendarGrid) {
        DOM.calendarGrid.addEventListener('click', (e) => {
            const dayDiv = e.target.closest('.calendar-day:not(.empty):not(.outside-month)');
            if (!dayDiv) return;

            const dateStr = dayDiv.dataset.date;
            if (!dateStr) return;

            const [selectedYear, selectedMonth, dayNum] = dateStr.split('-').map(Number);
            if (!selectedYear || !selectedMonth || !dayNum) return;

            const isBreakMode = state.calendarEditMode === 'break';

            if (state.batchModeEnabled) {
                if (state.batchSelectedDates.includes(dateStr)) {
                    state.batchSelectedDates = state.batchSelectedDates.filter(d => d !== dateStr);
                    dayDiv.classList.remove('batch-selected');
                    dayDiv.classList.remove('batch-selected-break');
                } else {
                    state.batchSelectedDates.push(dateStr);
                    dayDiv.classList.add('batch-selected');
                    if (isBreakMode) {
                        dayDiv.classList.add('batch-selected-break');
                    }
                }
                updateBatchSelectionUI();
            } else if (isBreakMode) {
                const selectedDate = new Date(selectedYear, selectedMonth - 1, dayNum);
                const dayBreaks = getBreaksForDay(state.allBreaks, selectedDate);

                if (dayBreaks.length > 0) {
                    openEditBreakModal(dayBreaks[dayBreaks.length - 1]);
                } else {
                    openAddBreakModal(selectedDate, true);
                }
            } else {
                const selectedDate = new Date(selectedYear, selectedMonth - 1, dayNum);
                const daySessions = state.allSessions.filter((session) => sessionOverlapsDay(session, selectedDate));

                if (daySessions.length > 0) {
                    daySessions.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
                    const latestSession = daySessions[daySessions.length - 1];
                    openEditSessionModal(latestSession);
                } else {
                    openAddSessionModal(new Date(selectedYear, selectedMonth - 1, dayNum), true);
                }
            }
        });
    }

    function setupCheckboxSync(checkbox, targetElement, secondTarget = null) {
        if (!checkbox || !targetElement) return;
        checkbox.addEventListener('change', () => {
            const active = checkbox.checked;
            targetElement.disabled = !active;
            targetElement.style.opacity = active ? "1" : "0.5";
            if (secondTarget) {
                secondTarget.disabled = !active;
                secondTarget.style.opacity = active ? "1" : "0.5";
            }
        });
    }

    setupCheckboxSync(DOM.batchUpdateStart, DOM.batchStart);
    setupCheckboxSync(DOM.batchUpdateEnd, DOM.batchEnd);
    setupCheckboxSync(DOM.batchUpdateRate, DOM.batchRate);
    setupCheckboxSync(DOM.batchUpdateCompany, DOM.batchCompany, DOM.batchCompanySelect);
    setupCheckboxSync(DOM.batchUpdateProject, DOM.batchProject, DOM.batchProjectSelect);
    setupCheckboxSync(DOM.batchUpdateLabel, DOM.batchLabel);

    if (DOM.batchCompanySelect) {
        DOM.batchCompanySelect.addEventListener('change', (e) => {
            if (e.target.value) {
                DOM.batchCompany.value = e.target.value;
                e.target.value = "";
            }
        });
    }
    if (DOM.batchProjectSelect) {
        DOM.batchProjectSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                DOM.batchProject.value = e.target.value;
                e.target.value = "";
            }
        });
    }

    if (DOM.openBatchModalBtn) {
        DOM.openBatchModalBtn.addEventListener('click', () => {
            DOM.batchUpdateStart.checked = false;
            DOM.batchStart.disabled = true;
            DOM.batchStart.style.opacity = "0.5";
            DOM.batchStart.value = "09:00";

            DOM.batchUpdateEnd.checked = false;
            DOM.batchEnd.disabled = true;
            DOM.batchEnd.style.opacity = "0.5";
            DOM.batchEnd.value = "17:00";

            DOM.batchUpdateRate.checked = false;
            DOM.batchRate.disabled = true;
            DOM.batchRate.style.opacity = "0.5";
            DOM.batchRate.value = DOM.hourlyRateInput.value || 20;

            DOM.batchUpdateCompany.checked = false;
            DOM.batchCompany.disabled = true;
            DOM.batchCompany.style.opacity = "0.5";
            DOM.batchCompany.value = "";
            DOM.batchCompanySelect.disabled = true;
            DOM.batchCompanySelect.style.opacity = "0.5";

            DOM.batchUpdateProject.checked = false;
            DOM.batchProject.disabled = true;
            DOM.batchProject.style.opacity = "0.5";
            DOM.batchProject.value = "";
            DOM.batchProjectSelect.disabled = true;
            DOM.batchProjectSelect.style.opacity = "0.5";

            DOM.batchUpdateLabel.checked = false;
            DOM.batchLabel.disabled = true;
            DOM.batchLabel.style.opacity = "0.5";
            DOM.batchLabel.value = "";

            resetBatchSlider();
            updateBatchModalForMode();

            if (DOM.batchModalSubtitle) {
                const itemLabel = state.calendarEditMode === 'break' ? 'breaks' : 'sessions';
                DOM.batchModalSubtitle.textContent = `Applying changes to ${state.batchSelectedDates.length} selected day${state.batchSelectedDates.length === 1 ? '' : 's'}. Days without existing ${itemLabel} will have new ones created.`;
            }

            DOM.batchModal.classList.remove('hidden');
        });
    }

    if (DOM.closeBatchModalBtn) {
        DOM.closeBatchModalBtn.addEventListener('click', () => {
            DOM.batchModal.classList.add('hidden');
        });
    }

    let isDragging = false;
    let startX = 0;

    function resetBatchSlider() {
        if (!DOM.batchSliderHandle || !DOM.batchSliderProgress || !DOM.batchSliderText) return;
        DOM.batchSliderHandle.style.left = "0px";
        DOM.batchSliderHandle.style.transform = "none";
        DOM.batchSliderProgress.style.width = "0px";
        DOM.batchSliderText.textContent = "Swipe to Confirm";
        DOM.batchSliderText.style.color = "var(--text-secondary)";
        DOM.batchSliderHandle.style.background = "linear-gradient(135deg, var(--accent-blue), var(--accent-green))";
        isDragging = false;
    }

    if (DOM.batchSliderHandle && DOM.batchSliderTrack) {
        const handle = DOM.batchSliderHandle;
        const track = DOM.batchSliderTrack;
        const progress = DOM.batchSliderProgress;
        const text = DOM.batchSliderText;

        const getDragLimit = () => track.clientWidth - handle.clientWidth;

        const startDrag = (e) => {
            isDragging = true;
            startX = (e.touches ? e.touches[0].clientX : e.clientX) - parseFloat(handle.style.left || 0);
            handle.style.transition = "none";
            progress.style.transition = "none";
        };

        const onDrag = (e) => {
            if (!isDragging) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const limit = getDragLimit();
            let x = clientX - startX;
            if (x < 0) x = 0;
            if (x > limit) x = limit;

            handle.style.left = `${x}px`;
            progress.style.width = `${x + handle.clientWidth / 2}px`;

            if (x >= limit * 0.95) {
                text.textContent = "Release to Confirm";
                text.style.color = "#fff";
            } else {
                text.textContent = "Swipe to Confirm";
                text.style.color = "var(--text-secondary)";
            }
        };

        const endDrag = async () => {
            if (!isDragging) return;
            isDragging = false;
            const limit = getDragLimit();
            const x = parseFloat(handle.style.left || 0);

            if (x >= limit * 0.95) {
                handle.style.left = `${limit}px`;
                progress.style.width = "100%";
                text.textContent = "Saving...";
                handle.style.background = "var(--accent-green)";
                await saveBatchChanges();
            } else {
                handle.style.transition = "left 0.2s ease-out";
                progress.style.transition = "width 0.2s ease-out";
                handle.style.left = "0px";
                progress.style.width = "0px";
                text.textContent = "Swipe to Confirm";
                text.style.color = "var(--text-secondary)";
            }
        };

        handle.addEventListener('mousedown', startDrag);
        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', endDrag);

        handle.addEventListener('touchstart', startDrag);
        window.addEventListener('touchmove', onDrag);
        window.addEventListener('touchend', endDrag);
    }

    async function saveBatchChanges() {
        if (state.calendarEditMode === 'break') {
            await saveBatchBreakChanges();
            return;
        }
        await saveBatchWorkChanges();
    }

    async function saveBatchBreakChanges() {
        const promises = [];
        const module = await import('./api.js');

        const updateStart = DOM.batchUpdateStart.checked;
        const updateEnd = DOM.batchUpdateEnd.checked;
        const updateLabel = DOM.batchUpdateLabel.checked;

        if (!updateStart && !updateEnd && !updateLabel) {
            import('./ui.js').then(uiModule => {
                uiModule.showAlert("Select Actions", "Please check at least one checkbox field to apply batch changes.");
                resetBatchSlider();
            });
            return;
        }

        const startVal = DOM.batchStart.value;
        const endVal = DOM.batchEnd.value;
        const labelVal = DOM.batchLabel.value.trim();

        if (updateStart && updateEnd) {
            const [sh, sm] = startVal.split(':').map(Number);
            const [eh, em] = endVal.split(':').map(Number);
            if (eh * 60 + em <= sh * 60 + sm) {
                import('./ui.js').then(uiModule => {
                    uiModule.showAlert("Invalid Time", "End time must be strictly after start time.");
                    resetBatchSlider();
                });
                return;
            }
        }

        state.batchSelectedDates.forEach(dateStr => {
            const [year, month, dayNum] = dateStr.split('-').map(Number);

            const existingBreaks = state.allBreaks.filter((breakItem) => {
                const bStart = new Date(breakItem.startTime);
                return bStart.getFullYear() === year &&
                       bStart.getMonth() === (month - 1) &&
                       bStart.getDate() === dayNum;
            });

            if (existingBreaks.length > 0) {
                existingBreaks.forEach((breakItem) => {
                    let bStart = new Date(breakItem.startTime);
                    let bEnd = breakItem.endTime
                        ? new Date(breakItem.endTime)
                        : new Date(bStart.getTime() + (breakItem.durationMs || 0));

                    if (updateStart) {
                        const [h, m] = startVal.split(':').map(Number);
                        bStart.setHours(h, m, 0, 0);
                    }
                    if (updateEnd) {
                        const [h, m] = endVal.split(':').map(Number);
                        bEnd.setHours(h, m, 0, 0);
                        if (bEnd.getTime() <= bStart.getTime()) {
                            bEnd.setDate(bEnd.getDate() + 1);
                        }
                    } else if (updateStart) {
                        if (bEnd.getTime() <= bStart.getTime()) {
                            bEnd.setTime(bStart.getTime() + (breakItem.durationMs || 30 * 60 * 1000));
                        }
                    }

                    const durationMs = bEnd.getTime() - bStart.getTime();
                    const updatedData = {
                        startTime: bStart.getTime(),
                        endTime: bEnd.getTime(),
                        durationMs
                    };
                    if (updateLabel) updatedData.label = labelVal;

                    promises.push(module.updateBreak(breakItem.id, updatedData));
                });
            } else {
                const sh = updateStart ? startVal.split(':').map(Number)[0] : 12;
                const sm = updateStart ? startVal.split(':').map(Number)[1] : 0;
                let eh = updateEnd ? endVal.split(':').map(Number)[0] : 12;
                let em = updateEnd ? endVal.split(':').map(Number)[1] : 30;

                if (updateStart && !updateEnd) {
                    eh = sh;
                    em = (sm + 30) % 60;
                    if (sm + 30 >= 60) {
                        eh = (sh + 1) % 24;
                    }
                }

                const bStart = new Date(year, month - 1, dayNum, sh, sm, 0, 0);
                const bEnd = new Date(year, month - 1, dayNum, eh, em, 0, 0);
                if (bEnd.getTime() <= bStart.getTime()) {
                    bEnd.setDate(bEnd.getDate() + 1);
                }

                const durationMs = bEnd.getTime() - bStart.getTime();
                const newBreak = {
                    startTime: bStart.getTime(),
                    endTime: bEnd.getTime(),
                    durationMs,
                    label: updateLabel ? labelVal : ""
                };

                promises.push(module.addCustomBreak(newBreak));
            }
        });

        try {
            await Promise.all(promises);
            DOM.batchModal.classList.add('hidden');
            exitBatchMode();
            import('./ui.js').then(uiModule => {
                uiModule.showAlert("Batch Successful", "Successfully applied break changes to all selected days!");
            });
        } catch (err) {
            console.error("Batch break update error:", err);
            resetBatchSlider();
        }
    }

    async function saveBatchWorkChanges() {
        const promises = [];
        const module = await import('./api.js');

        const updateStart = DOM.batchUpdateStart.checked;
        const updateEnd = DOM.batchUpdateEnd.checked;
        const updateRate = DOM.batchUpdateRate.checked;
        const updateCompany = DOM.batchUpdateCompany.checked;
        const updateProject = DOM.batchUpdateProject.checked;

        if (!updateStart && !updateEnd && !updateRate && !updateCompany && !updateProject) {
            import('./ui.js').then(uiModule => {
                uiModule.showAlert("Select Actions", "Please check at least one checkbox field to apply batch changes.");
                resetBatchSlider();
            });
            return;
        }

        const startVal = DOM.batchStart.value;
        const endVal = DOM.batchEnd.value;
        const rateVal = parseFloat(DOM.batchRate.value) || 0;
        const companyVal = DOM.batchCompany.value.trim();
        const projectVal = DOM.batchProject.value.trim();

        if (updateStart && updateEnd) {
            const [sh, sm] = startVal.split(':').map(Number);
            const [eh, em] = endVal.split(':').map(Number);
            if (eh * 60 + em <= sh * 60 + sm) {
                import('./ui.js').then(uiModule => {
                    uiModule.showAlert("Invalid Time", "End time must be strictly after start time.");
                    resetBatchSlider();
                });
                return;
            }
        }

        state.batchSelectedDates.forEach(dateStr => {
            const [year, month, dayNum] = dateStr.split('-').map(Number);

            const existingSessions = state.allSessions.filter(session => {
                const sStart = new Date(session.startTime);
                return sStart.getFullYear() === year &&
                       sStart.getMonth() === (month - 1) &&
                       sStart.getDate() === dayNum;
            });

            if (existingSessions.length > 0) {
                existingSessions.forEach(session => {
                    let sStart = new Date(session.startTime);
                    let sEnd = session.endTime 
                        ? new Date(session.endTime) 
                        : new Date(sStart.getTime() + (session.durationMs || 0));

                    if (updateStart) {
                        const [h, m] = startVal.split(':').map(Number);
                        sStart.setHours(h, m, 0, 0);
                    }
                    if (updateEnd) {
                        const [h, m] = endVal.split(':').map(Number);
                        sEnd.setHours(h, m, 0, 0);
                        if (sEnd.getTime() <= sStart.getTime()) {
                            sEnd.setDate(sEnd.getDate() + 1);
                        }
                    } else if (updateStart) {
                        if (sEnd.getTime() <= sStart.getTime()) {
                            sEnd.setTime(sStart.getTime() + (session.durationMs || 60 * 60 * 1000));
                        }
                    }

                    const durationMs = sEnd.getTime() - sStart.getTime();
                    const rate = updateRate ? rateVal : (session.rate != null ? session.rate : 20);
                    const earnings = (durationMs / (1000 * 60 * 60)) * rate;

                    const updatedData = {
                        startTime: sStart.getTime(),
                        endTime: sEnd.getTime(),
                        durationMs: durationMs,
                        rate: rate,
                        earnings: earnings
                    };
                    if (updateCompany) updatedData.company = companyVal;
                    if (updateProject) updatedData.project = projectVal;

                    promises.push(module.updateSession(session.id, updatedData));
                });
            } else {
                const sh = updateStart ? startVal.split(':').map(Number)[0] : 9;
                const sm = updateStart ? startVal.split(':').map(Number)[1] : 0;
                let eh = updateEnd ? endVal.split(':').map(Number)[0] : 17;
                let em = updateEnd ? endVal.split(':').map(Number)[1] : 0;

                if (updateStart && !updateEnd) {
                    if (sh >= 17) {
                        eh = (sh + 1) % 24;
                    }
                }

                const sStart = new Date(year, month - 1, dayNum, sh, sm, 0, 0);
                const sEnd = new Date(year, month - 1, dayNum, eh, em, 0, 0);
                if (sEnd.getTime() <= sStart.getTime()) {
                    sEnd.setDate(sEnd.getDate() + 1);
                }

                const durationMs = sEnd.getTime() - sStart.getTime();
                const rate = updateRate ? rateVal : (state.tcHourlyRate || 20);
                const earnings = (durationMs / (1000 * 60 * 60)) * rate;

                const newSession = {
                    startTime: sStart.getTime(),
                    endTime: sEnd.getTime(),
                    durationMs: durationMs,
                    rate: rate,
                    earnings: earnings,
                    company: updateCompany ? companyVal : "",
                    project: updateProject ? projectVal : "",
                    focused: true
                };

                promises.push(module.addCustomSession(newSession));
            }
        });

        try {
            await Promise.all(promises);
            DOM.batchModal.classList.add('hidden');
            exitBatchMode();
            import('./ui.js').then(uiModule => {
                uiModule.showAlert("Batch Successful", "Successfully applied changes to all selected days!");
            });
        } catch (err) {
            console.error("Batch update error:", err);
            resetBatchSlider();
        }
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
            openAddSessionModal(new Date(), false);
        });
    }

    if (DOM.closeSessionModalBtn) {
        DOM.closeSessionModalBtn.addEventListener('click', () => {
            DOM.sessionModal.classList.add('hidden');
        });
    }

    if (DOM.deleteSessionBtn) {
        DOM.deleteSessionBtn.addEventListener('click', async () => {
            const sessionId = DOM.editSessionId.value;
            if (!sessionId) return;

            import('./ui.js').then(async (uiModule) => {
                const isConfirmed = await uiModule.showConfirm(
                    "Delete Session",
                    "Are you sure you want to permanently delete this work session?"
                );
                if (isConfirmed) {
                    import('./api.js').then(async (apiModule) => {
                        await apiModule.deleteSession(sessionId);
                        DOM.sessionModal.classList.add('hidden');
                    });
                }
            });
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

    function openEditBreakModal(breakItem) {
        import('./utils.js').then(({ formatDateTimeLocal }) => {
            DOM.breakModalTitle.textContent = "Edit Break";
            DOM.editBreakId.value = breakItem.id;
            DOM.breakStart.value = formatDateTimeLocal(breakItem.startTime);
            DOM.breakEnd.value = formatDateTimeLocal(breakItem.endTime || (new Date(breakItem.startTime).getTime() + (breakItem.durationMs || 0)));
            DOM.breakLabel.value = breakItem.label || "";
            DOM.breakModal.classList.remove('modal-mode-add');
            DOM.breakModal.classList.add('modal-mode-edit');
            if (DOM.deleteBreakBtn) {
                DOM.deleteBreakBtn.style.display = 'block';
            }
            DOM.breakModal.classList.remove('hidden');
        });
    }

    function openAddBreakModal(selectedDate = new Date(), usePreviousTimes = true) {
        DOM.breakModalTitle.textContent = "Add Break";
        DOM.editBreakId.value = "";
        DOM.breakLabel.value = "";

        const selectedMidnight = new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate()
        );

        let prevBreak = null;
        if (usePreviousTimes) {
            let maxPrevMidnight = -1;
            state.allBreaks.forEach((breakItem) => {
                const breakStart = new Date(breakItem.startTime);
                const breakMidnight = new Date(
                    breakStart.getFullYear(),
                    breakStart.getMonth(),
                    breakStart.getDate()
                );
                const time = breakMidnight.getTime();
                if (time < selectedMidnight.getTime()) {
                    if (time > maxPrevMidnight) {
                        maxPrevMidnight = time;
                        prevBreak = breakItem;
                    } else if (time === maxPrevMidnight) {
                        if (!prevBreak || new Date(breakItem.startTime).getTime() > new Date(prevBreak.startTime).getTime()) {
                            prevBreak = breakItem;
                        }
                    }
                }
            });
        }

        let newStart;
        let newEnd;

        if (prevBreak) {
            const bStart = new Date(prevBreak.startTime);
            const bEnd = prevBreak.endTime
                ? new Date(prevBreak.endTime)
                : new Date(bStart.getTime() + (prevBreak.durationMs || 0));

            newStart = new Date(
                selectedMidnight.getFullYear(),
                selectedMidnight.getMonth(),
                selectedMidnight.getDate(),
                bStart.getHours(),
                bStart.getMinutes(),
                bStart.getSeconds(),
                bStart.getMilliseconds()
            );

            const bStartMidnight = new Date(bStart.getFullYear(), bStart.getMonth(), bStart.getDate());
            const bEndMidnight = new Date(bEnd.getFullYear(), bEnd.getMonth(), bEnd.getDate());
            const dayDiff = Math.round((bEndMidnight.getTime() - bStartMidnight.getTime()) / (24 * 60 * 60 * 1000));

            newEnd = new Date(
                selectedMidnight.getFullYear(),
                selectedMidnight.getMonth(),
                selectedMidnight.getDate() + dayDiff,
                bEnd.getHours(),
                bEnd.getMinutes(),
                bEnd.getSeconds(),
                bEnd.getMilliseconds()
            );
        } else {
            newStart = new Date(
                selectedMidnight.getFullYear(),
                selectedMidnight.getMonth(),
                selectedMidnight.getDate(),
                12, 0, 0, 0
            );
            newEnd = new Date(newStart.getTime() + (30 * 60 * 1000));
        }

        import('./utils.js').then(({ formatDateTimeLocal }) => {
            DOM.breakStart.value = formatDateTimeLocal(newStart);
            DOM.breakEnd.value = formatDateTimeLocal(newEnd);
            DOM.breakModal.classList.remove('modal-mode-edit');
            DOM.breakModal.classList.add('modal-mode-add');
            if (DOM.deleteBreakBtn) {
                DOM.deleteBreakBtn.style.display = 'none';
            }
            DOM.breakModal.classList.remove('hidden');
        });
    }

    function exitBatchMode() {
        state.batchModeEnabled = false;
        state.batchSelectedDates = [];
        DOM.batchModeControls?.classList.add('hidden');
        renderCalendarEditModeControls();
        updateBatchSelectionUI();
        renderCalendar();
    }

    if (DOM.addBreakBtn) {
        DOM.addBreakBtn.addEventListener('click', () => {
            openAddBreakModal(getBreaksViewDate());
        });
    }

    if (DOM.breaksPrevDayBtn) {
        DOM.breaksPrevDayBtn.addEventListener('click', () => {
            shiftBreaksViewDate(-1);
            renderBreakHistory();
        });
    }

    if (DOM.breaksNextDayBtn) {
        DOM.breaksNextDayBtn.addEventListener('click', () => {
            shiftBreaksViewDate(1);
            renderBreakHistory();
        });
    }

    if (DOM.breaksTodayBtn) {
        DOM.breaksTodayBtn.addEventListener('click', () => {
            setBreaksViewDate(new Date());
            renderBreakHistory();
        });
    }

    if (DOM.closeBreakModalBtn) {
        DOM.closeBreakModalBtn.addEventListener('click', () => {
            DOM.breakModal.classList.add('hidden');
        });
    }

    if (DOM.deleteBreakBtn) {
        DOM.deleteBreakBtn.addEventListener('click', async () => {
            const breakId = DOM.editBreakId.value;
            if (!breakId) return;

            import('./ui.js').then(async (uiModule) => {
                const isConfirmed = await uiModule.showConfirm(
                    "Delete Break",
                    "Are you sure you want to permanently delete this break?"
                );
                if (isConfirmed) {
                    import('./api.js').then(async (apiModule) => {
                        await apiModule.deleteBreak(breakId);
                        DOM.breakModal.classList.add('hidden');
                    });
                }
            });
        });
    }

    if (DOM.saveBreakBtn) {
        DOM.saveBreakBtn.addEventListener('click', () => {
            const startStr = DOM.breakStart.value;
            const endStr = DOM.breakEnd.value;

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
            const breakData = {
                startTime,
                endTime,
                durationMs,
                label: DOM.breakLabel.value.trim()
            };

            const breakId = DOM.editBreakId.value;

            import('./api.js').then(module => {
                if (breakId) {
                    module.updateBreak(breakId, breakData);
                } else {
                    module.addCustomBreak(breakData);
                }
                DOM.breakModal.classList.add('hidden');
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
            import('./utils.js').then(({ filterSessionsForCsvExport, CSV_UNASSIGNED_COMPANY }) => {
                const sessions = filterSessionsForCsvExport(
                    state.rawSessions.length ? state.rawSessions : state.allSessions,
                    state.csvExportCompany
                );

                if (!sessions.length) {
                    import('./ui.js').then(module => {
                        const companyLabel = state.csvExportCompany === CSV_UNASSIGNED_COMPANY
                            ? 'Unassigned'
                            : state.csvExportCompany || 'the selected filter';
                        module.showAlert(
                            "No Data",
                            state.csvExportCompany
                                ? `There are no sessions to export for ${companyLabel}.`
                                : "There are no sessions to export."
                        );
                    });
                    return;
                }

                runCsvExport(sessions);
            });
        });
    }

    function runCsvExport(sessions) {
        import('./utils.js').then(({
            getEffectiveSessionMetrics,
            getSessionBreakPeriods,
            computeMonthlyTotals,
            computeMonthlyTotalsByCompany,
            computeCustomPeriodTotals,
            computeCustomPeriodTotalsByCompany,
            computeCompanyTotalsAll,
            formatDurationDetailed,
            formatCsvDate,
            formatCsvTime,
            formatCsvDateTime,
            msToDecimalHours,
            escapeCsvValue,
            getSessionEndTime,
            toTimestampMs,
            CSV_UNASSIGNED_COMPANY
        }) => {
                const currency = state.currentCurrency;
                const breaks = state.allBreaks;

                const summaryMetricHeaders = [
                    "Total Net Duration",
                    "Total Net Duration (Hours)",
                    `Total Net Earnings (${currency})`
                ];

                function formatSummaryMetrics(totalNetMs, totalNetEarnings) {
                    return [
                        formatDurationDetailed(totalNetMs),
                        msToDecimalHours(totalNetMs),
                        totalNetEarnings.toFixed(2)
                    ];
                }

                function appendCsvSection(title, headers, dataRows) {
                    if (!dataRows.length) return;
                    rows.push("");
                    rows.push([title].map(escapeCsvValue).join(","));
                    rows.push(headers.map(escapeCsvValue).join(","));
                    dataRows.forEach((row) => {
                        rows.push(row.map(escapeCsvValue).join(","));
                    });
                }

                const sessionHeaders = [
                    "Date",
                    "Start Time",
                    "End Time",
                    `Net Earnings (${currency})`,
                    "Net Duration",
                    "Net Duration (Hours)",
                    `Hourly Rate (${currency})`,
                    "Company",
                    "Project",
                    "Focused",
                    "Break Count",
                    "Total Break Time",
                    "Original Session Duration Before Breaks",
                    `Original Session Earnings Before Breaks (${currency})`
                ];

                const rows = [sessionHeaders.map(escapeCsvValue).join(",")];

                const sortedSessions = [...sessions].sort(
                    (a, b) => toTimestampMs(b.startTime) - toTimestampMs(a.startTime)
                );

                const sessionBreakRows = [];

                sortedSessions.forEach(session => {
                    const metrics = getEffectiveSessionMetrics(session, breaks);
                    const breakPeriods = getSessionBreakPeriods(session, breaks);
                    const endMs = getSessionEndTime(session);
                    const focused = session.focused === false ? "No" : "Yes";
                    const sessionDate = formatCsvDate(session.startTime);
                    const sessionStart = formatCsvTime(session.startTime);
                    const sessionEnd = formatCsvTime(endMs);

                    const rowData = [
                        sessionDate,
                        sessionStart,
                        sessionEnd,
                        metrics.effectiveEarnings.toFixed(2),
                        formatDurationDetailed(metrics.effectiveDurationMs),
                        msToDecimalHours(metrics.effectiveDurationMs),
                        Number(session.rate || 0).toFixed(2),
                        session.company || "",
                        session.project || "",
                        focused,
                        breakPeriods.length,
                        breakPeriods.length > 0
                            ? formatDurationDetailed(metrics.breakMs)
                            : "",
                        formatDurationDetailed(metrics.grossDurationMs),
                        metrics.grossEarnings.toFixed(2)
                    ];

                    rows.push(rowData.map(escapeCsvValue).join(","));

                    breakPeriods.forEach((period, index) => {
                        sessionBreakRows.push([
                            sessionDate,
                            sessionStart,
                            sessionEnd,
                            index + 1,
                            formatCsvDateTime(period.startMs),
                            formatCsvDateTime(period.endMs),
                            period.label,
                            formatDurationDetailed(period.durationMs),
                            msToDecimalHours(period.durationMs)
                        ]);
                    });
                });

                if (sessionBreakRows.length > 0) {
                    rows.push("");
                    rows.push(["Session Breaks"].map(escapeCsvValue).join(","));

                    const sessionBreakHeaders = [
                        "Session Date",
                        "Session Start Time",
                        "Session End Time",
                        "Break #",
                        "Break Start",
                        "Break End",
                        "Break Label",
                        "Break Duration",
                        "Break Duration (Hours)"
                    ];
                    rows.push(sessionBreakHeaders.map(escapeCsvValue).join(","));
                    sessionBreakRows.forEach((breakRow) => {
                        rows.push(breakRow.map(escapeCsvValue).join(","));
                    });
                }

                appendCsvSection(
                    "Totals by Company",
                    ["Company", ...summaryMetricHeaders],
                    computeCompanyTotalsAll(sessions, breaks).map((entry) => [
                        entry.company,
                        ...formatSummaryMetrics(entry.totalNetMs, entry.totalNetEarnings)
                    ])
                );

                const monthlyTotals = computeMonthlyTotals(sessions, breaks);
                appendCsvSection(
                    "Monthly Totals",
                    ["Month", "Period Start", "Period End", ...summaryMetricHeaders],
                    monthlyTotals.map((month) => [
                        month.label,
                        month.periodStart,
                        month.periodEnd,
                        ...formatSummaryMetrics(month.totalNetMs, month.totalNetEarnings)
                    ])
                );

                appendCsvSection(
                    "Monthly Totals by Company",
                    ["Month", "Period Start", "Period End", "Company", ...summaryMetricHeaders],
                    computeMonthlyTotalsByCompany(sessions, breaks).map((entry) => [
                        entry.month,
                        entry.periodStart,
                        entry.periodEnd,
                        entry.company,
                        ...formatSummaryMetrics(entry.totalNetMs, entry.totalNetEarnings)
                    ])
                );

                const customPeriodTotals = computeCustomPeriodTotals(
                    sessions,
                    breaks,
                    state.csvExportPeriodFrom,
                    state.csvExportPeriodTo
                );
                if (customPeriodTotals) {
                    appendCsvSection(
                        "Custom Period Totals",
                        ["Period", "Period Start", "Period End", ...summaryMetricHeaders],
                        [[
                            customPeriodTotals.label,
                            customPeriodTotals.periodStart,
                            customPeriodTotals.periodEnd,
                            ...formatSummaryMetrics(customPeriodTotals.totalNetMs, customPeriodTotals.totalNetEarnings)
                        ]]
                    );

                    appendCsvSection(
                        "Custom Period Totals by Company",
                        ["Period", "Period Start", "Period End", "Company", ...summaryMetricHeaders],
                        computeCustomPeriodTotalsByCompany(
                            sessions,
                            breaks,
                            state.csvExportPeriodFrom,
                            state.csvExportPeriodTo
                        ).map((entry) => [
                            entry.label,
                            entry.periodStart,
                            entry.periodEnd,
                            entry.company,
                            ...formatSummaryMetrics(entry.totalNetMs, entry.totalNetEarnings)
                        ])
                    );
                }

                const csvData = `\uFEFF${rows.join("\n")}`;
                const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");

                const now = new Date();
                const fileDate = now.toISOString().split('T')[0];
                const companySuffix = state.csvExportCompany
                    ? `_${state.csvExportCompany === CSV_UNASSIGNED_COMPANY ? 'Unassigned' : state.csvExportCompany}`.replace(/[^\w.-]+/g, '_')
                    : '';

                a.href = url;
                a.download = `Work_Tracker_Export_${fileDate}${companySuffix}.csv`;
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
