import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { db } from './config.js';
import { state, updatePercentageCuts, updateTimeCostItems, updateTcHourlyRate, updateTcDailyHours, updateTcWorkingDaysPerWeek } from './state.js';
import { renderCalendar, renderChart, DOM, showConfirm, showAlert, updateDatalists, renderPercentageCutStats, renderPercentageCutList, getAmountAfterPercentageCuts, renderCustomStatsPeriods, renderWorkPatternBreakdown } from './ui.js';
import { getStartOfWeekDate, formatDuration, getSessionOverlapMs, getMonthlyStatsConfig, STATS_PERIOD_MODES } from './utils.js';

function getPercentageCutsRef() {
    return doc(db, "users", state.currentUser.uid, "settings", "percentageCuts");
}

function serializePercentageCuts(cuts) {
    return cuts.map((cut, index) => ({
        id: cut.id,
        name: cut.name,
        percentage: cut.percentage,
        basis: cut.basis,
        order: index
    }));
}

function renderStatsEarnings(displayEl, beforeAmount) {
    if (!displayEl) return;

    const before = Number(beforeAmount) || 0;
    const after = getAmountAfterPercentageCuts(before);

    if (!state.percentageCuts.length) {
        displayEl.innerHTML = `<span class="currency-symbol">${state.currentCurrency}</span>${before.toFixed(2)}`;
        return;
    }

    displayEl.innerHTML = `
        <span class="stats-earnings-after"><span class="currency-symbol">${state.currentCurrency}</span>${after.toFixed(2)}</span>
        <span class="stats-earnings-before">Before cuts <span class="currency-symbol">${state.currentCurrency}</span>${before.toFixed(2)}</span>
    `;
}

export async function saveSession(durationMs, totalEarned) {
    try {
        await addDoc(collection(db, "users", state.currentUser.uid, "sessions"), {
            startTime: state.startTime,
            endTime: Date.now(),
            durationMs: durationMs,
            rate: state.currentSessionRate,
            earnings: totalEarned,
            company: state.currentCompany,
            project: state.currentProject,
            createdAt: serverTimestamp()
        });
        console.log("Debug: Session saved to Firebase");
    } catch (e) {
        console.error("Debug: Error adding document: ", e);
        showAlert("Save Error", "Error saving tracking data! Please check your internet connection.");
    }
}

export async function addCustomSession(sessionData) {
    try {
        await addDoc(collection(db, "users", state.currentUser.uid, "sessions"), {
            ...sessionData,
            createdAt: serverTimestamp()
        });
        console.log("Debug: Custom session saved to Firebase");
    } catch (e) {
        console.error("Debug: Error adding custom document: ", e);
        showAlert("Save Error", "Error saving past session! Please check your internet connection.");
    }
}

export async function updateSession(sessionId, sessionData) {
    try {
        await updateDoc(doc(db, "users", state.currentUser.uid, "sessions", sessionId), sessionData);
        console.log("Debug: Session updated in Firebase");
    } catch (e) {
        console.error("Debug: Error updating document: ", e);
        showAlert("Update Error", "Error updating session! Please check your internet connection.");
    }
}

export async function deleteSession(sessionId) {
    try {
        await deleteDoc(doc(db, "users", state.currentUser.uid, "sessions", sessionId));
        console.log("Debug: Session deleted", sessionId);
    } catch (e) {
        console.error("Debug: Error deleting document: ", e);
        showAlert("Error", "There was an error deleting this session.");
    }
}

export async function savePercentageCuts(cuts, options = {}) {
    const silent = options.silent === true;

    if (!state.currentUser) {
        if (!silent) {
            showAlert("Not Signed In", "Please sign in before saving percentage cuts.");
        }
        return false;
    }

    const previousCuts = [...state.percentageCuts];
    const sanitizedCuts = updatePercentageCuts(cuts);

    try {
        await setDoc(getPercentageCutsRef(), {
            cuts: serializePercentageCuts(sanitizedCuts),
            updatedAt: serverTimestamp()
        }, { merge: true });

        renderDashboardData();
        console.log("Debug: Percentage cuts saved to Firebase");
        return true;
    } catch (e) {
        console.error("Debug: Error saving percentage cuts: ", e);
        updatePercentageCuts(previousCuts);
        renderPercentageCutList();
        renderDashboardData();
        if (!silent) {
            showAlert("Save Error", "Error saving percentage cuts! Please check your internet connection.");
        }
        return false;
    }
}

export function loadPercentageCuts() {
    if (!state.currentUser) return;

    const settingsRef = getPercentageCutsRef();

    onSnapshot(settingsRef, async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            updatePercentageCuts(data.cuts || []);

            renderPercentageCutList();
            renderDashboardData();
            console.log("Debug: Percentage cuts updated from Firebase");
            return;
        }

        if (state.percentageCuts.length > 0) {
            try {
                await setDoc(settingsRef, {
                    cuts: serializePercentageCuts(state.percentageCuts),
                    updatedAt: serverTimestamp()
                }, { merge: true });
                console.log("Debug: Local percentage cuts migrated to Firebase");
            } catch (e) {
                console.error("Debug: Error migrating percentage cuts: ", e);
            }
        } else {
            renderDashboardData();
        }
    }, (error) => {
        console.error("Debug: Percentage cuts snapshot error", error);
    });
}

export async function saveTimeCostItem(itemData) {
    if (!state.currentUser) {
        showAlert("Not Signed In", "Please sign in before saving items.");
        return;
    }
    try {
        await addDoc(collection(db, "users", state.currentUser.uid, "timeCostItems"), {
            ...itemData,
            createdAt: serverTimestamp()
        });
        console.log("Debug: Time cost item saved to Firebase");
    } catch (e) {
        console.error("Debug: Error adding time cost item: ", e);
        showAlert("Save Error", "Error saving item! Please check your internet connection.");
    }
}

export async function deleteTimeCostItem(itemId) {
    if (!state.currentUser) return;
    try {
        await deleteDoc(doc(db, "users", state.currentUser.uid, "timeCostItems", itemId));
        console.log("Debug: Time cost item deleted", itemId);
    } catch (e) {
        console.error("Debug: Error deleting time cost item: ", e);
        showAlert("Error", "There was an error deleting this item.");
    }
}

export async function updateTimeCostItem(itemId, itemData) {
    if (!state.currentUser || !itemId) return;
    try {
        await updateDoc(doc(db, "users", state.currentUser.uid, "timeCostItems", itemId), itemData);
        console.log("Debug: Time cost item updated", itemId);
    } catch (e) {
        console.error("Debug: Error updating time cost item: ", e);
        showAlert("Update Error", "Error updating saved item! Please check your internet connection.");
    }
}

export function loadTimeCostItems() {
    if (!state.currentUser) return;

    const q = query(
        collection(db, "users", state.currentUser.uid, "timeCostItems"),
        orderBy("createdAt", "desc")
    );

    onSnapshot(q, (querySnapshot) => {
        const items = [];
        querySnapshot.forEach((docSnap) => {
            items.push({ id: docSnap.id, ...docSnap.data() });
        });

        updateTimeCostItems(items);
        import('./ui.js').then(module => module.renderSavedTimeCostItems());
        console.log("Debug: Time cost items updated from Firebase");
    }, (error) => {
        console.error("Debug: Time cost items snapshot error", error);
    });
}

export async function saveTimeCostSettings(hourlyRate, dailyHours, workingDaysPerWeek) {
    if (!state.currentUser) return;
    try {
        await setDoc(doc(db, "users", state.currentUser.uid, "settings", "timeCost"), {
            hourlyRate,
            dailyHours,
            workingDaysPerWeek,
            updatedAt: serverTimestamp()
        }, { merge: true });
        console.log("Debug: Time cost settings saved to Firebase");
    } catch (e) {
        console.error("Debug: Error saving time cost settings: ", e);
    }
}

export function loadTimeCostSettings() {
    if (!state.currentUser) return;

    const settingsRef = doc(db, "users", state.currentUser.uid, "settings", "timeCost");

    onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            let changed = false;

            if (data.hourlyRate !== undefined && parseFloat(DOM.tcHourlyRate ? DOM.tcHourlyRate.value : 0) !== data.hourlyRate) {
                updateTcHourlyRate(data.hourlyRate);
                if (DOM.tcHourlyRate) {
                    DOM.tcHourlyRate.value = data.hourlyRate;
                }
                changed = true;
            }

            if (data.dailyHours !== undefined && parseFloat(DOM.tcDailyHours ? DOM.tcDailyHours.value : 0) !== data.dailyHours) {
                updateTcDailyHours(data.dailyHours);
                if (DOM.tcDailyHours) {
                    DOM.tcDailyHours.value = data.dailyHours;
                }
                changed = true;
            }

            const loadedWorkingDays = data.workingDaysPerWeek !== undefined
                ? data.workingDaysPerWeek
                : data.includeWeekends === true
                    ? 7
                    : data.includeWeekends === false
                        ? 5
                        : undefined;

            if (loadedWorkingDays !== undefined && parseFloat(DOM.tcWorkingDays ? DOM.tcWorkingDays.value : 0) !== loadedWorkingDays) {
                updateTcWorkingDaysPerWeek(loadedWorkingDays);
                if (DOM.tcWorkingDays) {
                    DOM.tcWorkingDays.value = state.tcWorkingDaysPerWeek;
                }
                changed = true;
            }

            if (changed) {
                import('./ui.js').then(module => {
                    module.renderTimeCostBreakdown();
                    module.renderSavedTimeCostItems();
                });
            }
            console.log("Debug: Time cost settings updated from Firebase");
        } else {
            // Document doesn't exist, we can migrate local values to Firebase
            saveTimeCostSettings(state.tcHourlyRate, state.tcDailyHours, state.tcWorkingDaysPerWeek);
        }
    }, (error) => {
        console.error("Debug: Time cost settings snapshot error", error);
    });
}

export function renderDashboardData() {
    DOM.historyList.innerHTML = "";

    let totalDailyMs = 0;
    let totalDailyEarnings = 0;
    let totalWeeklyMs = 0;
    let totalWeeklyEarnings = 0;
    let totalMonthlyMs = 0;
    let totalMonthlyEarnings = 0;
    let totalSixMonthsMs = 0;
    let totalSixMonthsEarnings = 0;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = getStartOfWeekDate(now, state.startOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    const monthlyStatsConfig = getMonthlyStatsConfig(state.statsPeriodMode, now);
    const startOfSixMonths = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    // Calculate totals across all sessions
    state.allSessions.forEach((data) => {
        const dateObj = new Date(data.startTime);

        if (dateObj >= startOfDay) {
            totalDailyMs += data.durationMs;
            totalDailyEarnings += data.earnings;
        }

        const weeklyOverlapMs = getSessionOverlapMs(data, startOfWeek, endOfWeek);
        if (weeklyOverlapMs > 0) {
            const sessionDurationMs = Number(data.durationMs) || weeklyOverlapMs;
            const overlapRatio = sessionDurationMs > 0 ? weeklyOverlapMs / sessionDurationMs : 1;
            totalWeeklyMs += weeklyOverlapMs;
            totalWeeklyEarnings += (Number(data.earnings) || 0) * overlapRatio;
        }

        if (state.statsPeriodMode === STATS_PERIOD_MODES.ROLLING) {
            const monthlyOverlapMs = getSessionOverlapMs(data, monthlyStatsConfig.start, monthlyStatsConfig.end);
            if (monthlyOverlapMs > 0) {
                const sessionDurationMs = Number(data.durationMs) || monthlyOverlapMs;
                const overlapRatio = sessionDurationMs > 0 ? monthlyOverlapMs / sessionDurationMs : 1;
                totalMonthlyMs += monthlyOverlapMs;
                totalMonthlyEarnings += (Number(data.earnings) || 0) * overlapRatio;
            }
        } else if (dateObj >= monthlyStatsConfig.start) {
            totalMonthlyMs += data.durationMs;
            totalMonthlyEarnings += data.earnings;
        }

        if (dateObj >= startOfSixMonths) {
            totalSixMonthsMs += data.durationMs;
            totalSixMonthsEarnings += data.earnings;
        }
    });

    // Pagination bounds check
    const pageSize = 5;
    const maxPages = Math.ceil(state.allSessions.length / pageSize);
    if (state.historyPage >= maxPages && maxPages > 0) {
        state.historyPage = maxPages - 1;
    }
    if (state.historyPage < 0) {
        state.historyPage = 0;
    }

    // Slice to the current page of sessions
    const paginatedSessions = state.allSessions.slice(state.historyPage * pageSize, (state.historyPage + 1) * pageSize);

    // Render the active page sessions
    paginatedSessions.forEach((data) => {
        const dateObj = new Date(data.startTime);
        const item = document.createElement('div');
        item.className = 'history-item';
        const formattedTime = formatDuration(data.durationMs);
        const endDateObj = data.endTime ? new Date(data.endTime) : new Date(data.startTime + data.durationMs);
        const timeFormat = { hour: '2-digit', minute: '2-digit' };
        const startTimeStr = dateObj.toLocaleTimeString([], timeFormat);
        const endTimeStr = endDateObj.toLocaleTimeString([], timeFormat);
        const startDateStr = dateObj.toLocaleDateString();
        const endDateStr = endDateObj.toLocaleDateString();
        const startDateTimeStr = `${startDateStr} ${startTimeStr}`;
        const endDateTimeStr = startDateStr === endDateStr ? endTimeStr : `${endDateStr} ${endTimeStr}`;
        const sessionEarnings = Number(data.earnings) || 0;
        const afterCutsEarnings = getAmountAfterPercentageCuts(sessionEarnings);
        const afterCutsHtml = state.percentageCuts.length
            ? `<small class="history-after-cuts">After cuts ${state.currentCurrency}${afterCutsEarnings.toFixed(2)}</small>`
            : '';

        const companyHtml = data.company ? `<span class="history-badge history-badge-company">${data.company}</span>` : '';
        const projectHtml = data.project ? `<span class="history-badge history-badge-project">${data.project}</span>` : '';
        let focusHtml = '';
        if (data.focused === true) {
            focusHtml = `<span class="history-badge history-badge-focus">Focused</span>`;
        } else if (data.focused === false) {
            focusHtml = `<span class="history-badge history-badge-multitasking">Multitasking</span>`;
        }

        item.innerHTML = `
            <div class="history-item-content">
                <div>
                    <span class="history-date">
                        <span>Started ${startDateTimeStr}</span>
                        <span>Ended ${endDateTimeStr}</span>
                    </span>
                    <strong>${formattedTime}</strong>
                    <div class="history-badges">
                        ${companyHtml}
                        ${projectHtml}
                        ${focusHtml}
                    </div>
                </div>
                <div class="history-details">
                    <div>${state.currentCurrency}${sessionEarnings.toFixed(2)}</div>
                    ${afterCutsHtml}
                    <small>@ ${state.currentCurrency}${data.rate}/hr</small>
                </div>
            </div>
            <div class="history-item-actions" style="display: flex; gap: 8px;">
                <button class="btn-edit" data-id="${data.id}" title="Edit Session">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="btn-delete" data-id="${data.id}" title="Delete Session">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </div>
        `;

        const deleteBtn = item.querySelector('.btn-delete');
        deleteBtn.addEventListener('click', async () => {
            const isConfirmed = await showConfirm("Delete Session", "Are you sure you want to permanently delete this work session?");
            if (isConfirmed) {
                await deleteSession(data.id);
            }
        });

        const editBtn = item.querySelector('.btn-edit');
        editBtn.addEventListener('click', () => {
            import('./utils.js').then(({ formatDateTimeLocal }) => {
                DOM.sessionModalTitle.textContent = "Edit Session";
                DOM.editSessionId.value = data.id;
                DOM.sessionStart.value = formatDateTimeLocal(data.startTime);
                DOM.sessionEnd.value = formatDateTimeLocal(data.endTime);
                DOM.sessionRate.value = data.rate || 0;
                DOM.sessionCompany.value = data.company || "";
                DOM.sessionProject.value = data.project || "";
                DOM.sessionFocused.checked = data.focused !== false;
                DOM.sessionModal.classList.remove('modal-mode-add');
                DOM.sessionModal.classList.add('modal-mode-edit');
                DOM.sessionModal.classList.remove('hidden');
            });
        });

        DOM.historyList.appendChild(item);
    });

    // Render pagination controls
    if (DOM.historyPagination) {
        DOM.historyPagination.innerHTML = "";
        if (state.allSessions.length > pageSize) {
            DOM.historyPagination.style.display = 'flex';

            const prevBtn = document.createElement('button');
            prevBtn.className = 'history-pagination-btn';
            prevBtn.textContent = '← Prev';
            prevBtn.disabled = state.historyPage === 0;
            prevBtn.addEventListener('click', () => {
                state.historyPage--;
                renderDashboardData();
            });

            const pageInfo = document.createElement('span');
            pageInfo.className = 'history-pagination-info';
            pageInfo.textContent = `Page ${state.historyPage + 1} of ${maxPages}`;

            const nextBtn = document.createElement('button');
            nextBtn.className = 'history-pagination-btn';
            nextBtn.textContent = 'Next →';
            nextBtn.disabled = state.historyPage >= maxPages - 1;
            nextBtn.addEventListener('click', () => {
                state.historyPage++;
                renderDashboardData();
            });

            DOM.historyPagination.appendChild(prevBtn);
            DOM.historyPagination.appendChild(pageInfo);
            DOM.historyPagination.appendChild(nextBtn);
        } else {
            DOM.historyPagination.style.display = 'none';
        }
    }

    DOM.dailyHoursDisplay.textContent = formatDuration(totalDailyMs);
    renderStatsEarnings(DOM.dailyEarningsDisplay, totalDailyEarnings);

    DOM.weeklyHoursDisplay.textContent = formatDuration(totalWeeklyMs);
    renderStatsEarnings(DOM.weeklyEarningsDisplay, totalWeeklyEarnings);

    DOM.monthlyHoursDisplay.textContent = formatDuration(totalMonthlyMs);
    renderStatsEarnings(DOM.monthlyEarningsDisplay, totalMonthlyEarnings);

    if (DOM.sixMonthsHoursDisplay) {
        DOM.sixMonthsHoursDisplay.textContent = formatDuration(totalSixMonthsMs);
    }
    if (DOM.sixMonthsEarningsDisplay) {
        renderStatsEarnings(DOM.sixMonthsEarningsDisplay, totalSixMonthsEarnings);
    }

    state.lastStatsTotals = {
        daily: totalDailyEarnings,
        weekly: totalWeeklyEarnings,
        monthly: totalMonthlyEarnings
    };
    renderPercentageCutStats(state.lastStatsTotals);

    renderCustomStatsPeriods();

    renderWorkPatternBreakdown();

    renderCalendar();
    renderChart();
    import('./ui.js').then(module => module.renderGanttChart());
    updateDatalists();
}

export function loadHistory() {
    const q = query(
        collection(db, "users", state.currentUser.uid, "sessions"),
        orderBy("startTime", "desc")
    );

    onSnapshot(q, (querySnapshot) => {
        state.rawSessions = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            state.rawSessions.push({ id: docSnap.id, ...data });
        });

        applyGlobalFilters();
        console.log("Debug: History updated from Firebase");
    }, (error) => {
        console.error("Debug: Snapshot error", error);
    });
}

export function applyGlobalFilters() {
    state.historyPage = 0;
    if (!state.globalFilterCompany && !state.globalFilterProject) {
        state.allSessions = [...state.rawSessions];
    } else {
        state.allSessions = state.rawSessions.filter(session => {
            let matchCompany = true;
            let matchProject = true;

            if (state.globalFilterCompany) {
                matchCompany = session.company === state.globalFilterCompany;
            }
            if (state.globalFilterProject) {
                matchProject = session.project === state.globalFilterProject;
            }

            return matchCompany && matchProject;
        });
    }

    // Auto-populate timer rate based on preference if not currently running
    const isRunning = localStorage.getItem('work_tracker_start') !== null;
    if (!isRunning) {
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

    renderDashboardData();
    import('./ui.js').then(module => module.updateActiveFilterDisplay());
}
