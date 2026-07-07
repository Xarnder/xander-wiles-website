import {
    DOM,
    updateCurrencyDisplays,
    renderCalendar,
    renderChart,
    renderGanttChart,
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
    renderMoneyCounterModeControls,
    renderStatsPeriodModeControls,
    renderCustomStatsPeriodsSettings,
    renderSettingsDefaultFields
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
    updateStartTimePreference
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
    renderStatsPeriodModeControls();
    renderSettingsDefaultFields();
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
        updateWidgetTitles(DOM.showTitlesToggle.checked);
        updateContinueSession(DOM.continueSessionToggle.checked);
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

        // Update timer rate, company, and project inputs on settings save if not currently running
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
        applyWidgetTitles();
        applyDashboardDensity();
        updateCurrencyDisplays();
        renderDashboardData();

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
                DOM.batchModeControls.style.display = "flex";
            } else {
                DOM.toggleBatchModeBtn.textContent = "Batch Edit";
                DOM.toggleBatchModeBtn.classList.remove('active');
                DOM.batchModeControls.style.display = "none";
                state.batchSelectedDates = [];
                updateBatchSelectionUI();
            }
            renderCalendar();
        });
    }

    if (DOM.batchClearBtn) {
        DOM.batchClearBtn.addEventListener('click', () => {
            state.batchSelectedDates = [];
            const cells = DOM.calendarGrid.querySelectorAll('.calendar-day.batch-selected');
            cells.forEach(cell => cell.classList.remove('batch-selected'));
            updateBatchSelectionUI();
        });
    }

    if (DOM.calendarGrid) {
        DOM.calendarGrid.addEventListener('click', (e) => {
            const dayDiv = e.target.closest('.calendar-day:not(.empty)');
            if (!dayDiv) return;

            const dayNum = parseInt(dayDiv.dataset.day, 10);
            if (isNaN(dayNum)) return;

            const year = state.currentCalendarDate.getFullYear();
            const month = state.currentCalendarDate.getMonth();

            if (state.batchModeEnabled) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                if (state.batchSelectedDates.includes(dateStr)) {
                    state.batchSelectedDates = state.batchSelectedDates.filter(d => d !== dateStr);
                    dayDiv.classList.remove('batch-selected');
                } else {
                    state.batchSelectedDates.push(dateStr);
                    dayDiv.classList.add('batch-selected');
                }
                updateBatchSelectionUI();
            } else {
                const daySessions = state.allSessions.filter(session => {
                    const sStart = new Date(session.startTime);
                    return sStart.getFullYear() === year &&
                           sStart.getMonth() === month &&
                           sStart.getDate() === dayNum;
                });

                if (daySessions.length > 0) {
                    daySessions.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
                    const latestSession = daySessions[daySessions.length - 1];
                    openEditSessionModal(latestSession);
                } else {
                    const selectedDate = new Date(year, month, dayNum);
                    openAddSessionModal(selectedDate, true);
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

            resetBatchSlider();

            if (DOM.batchModalSubtitle) {
                DOM.batchModalSubtitle.textContent = `Applying changes to ${state.batchSelectedDates.length} selected day${state.batchSelectedDates.length === 1 ? '' : 's'}.`;
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
            state.batchModeEnabled = false;
            DOM.toggleBatchModeBtn.textContent = "Batch Edit";
            DOM.toggleBatchModeBtn.classList.remove('active');
            DOM.batchModeControls.style.display = "none";
            state.batchSelectedDates = [];
            
            import('./ui.js').then(uiModule => {
                uiModule.showAlert("Batch Successful", `Successfully applied changes to all selected days!`);
                renderCalendar();
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
