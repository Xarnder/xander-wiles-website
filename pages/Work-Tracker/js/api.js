import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { db } from './config.js';
import { state, updatePercentageCuts, updateTimeCostItems, updateTcHourlyRate, updateTcDailyHours, updateTcIncludeWeekends } from './state.js';
import { renderCalendar, renderChart, DOM, showConfirm, showAlert, updateDatalists, renderPercentageCutStats, renderPercentageCutList } from './ui.js';
import { getStartOfWeekDate, formatDuration } from './utils.js';

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

export async function saveTimeCostSettings(hourlyRate, dailyHours, includeWeekends) {
    if (!state.currentUser) return;
    try {
        await setDoc(doc(db, "users", state.currentUser.uid, "settings", "timeCost"), {
            hourlyRate,
            dailyHours,
            includeWeekends,
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

            if (data.includeWeekends !== undefined && (DOM.tcIncludeWeekends ? DOM.tcIncludeWeekends.checked : false) !== data.includeWeekends) {
                updateTcIncludeWeekends(data.includeWeekends);
                if (DOM.tcIncludeWeekends) {
                    DOM.tcIncludeWeekends.checked = data.includeWeekends;
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
            saveTimeCostSettings(state.tcHourlyRate, state.tcDailyHours, state.tcIncludeWeekends);
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

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = getStartOfWeekDate(now, state.startOfWeek);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    state.allSessions.forEach((data) => {
        const dateObj = new Date(data.startTime);

        if (dateObj >= startOfDay) {
            totalDailyMs += data.durationMs;
            totalDailyEarnings += data.earnings;
        }

        if (dateObj >= startOfWeek) {
            totalWeeklyMs += data.durationMs;
            totalWeeklyEarnings += data.earnings;
        }

        if (dateObj >= startOfMonth) {
            totalMonthlyMs += data.durationMs;
            totalMonthlyEarnings += data.earnings;
        }

        const item = document.createElement('div');
        item.className = 'history-item';
        const formattedTime = formatDuration(data.durationMs);
        const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
                    <span class="history-date">${dateStr}</span>
                    <strong>${formattedTime}</strong>
                    <div class="history-badges">
                        ${companyHtml}
                        ${projectHtml}
                        ${focusHtml}
                    </div>
                </div>
                <div class="history-details">
                    <div>${state.currentCurrency}${data.earnings.toFixed(2)}</div>
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
                DOM.sessionModal.classList.remove('hidden');
            });
        });

        DOM.historyList.appendChild(item);
    });

    DOM.dailyHoursDisplay.textContent = formatDuration(totalDailyMs);
    DOM.dailyEarningsDisplay.textContent = `${state.currentCurrency}${totalDailyEarnings.toFixed(2)}`;

    DOM.weeklyHoursDisplay.textContent = formatDuration(totalWeeklyMs);
    DOM.weeklyEarningsDisplay.textContent = `${state.currentCurrency}${totalWeeklyEarnings.toFixed(2)}`;

    DOM.monthlyHoursDisplay.textContent = formatDuration(totalMonthlyMs);
    DOM.monthlyEarningsDisplay.textContent = `${state.currentCurrency}${totalMonthlyEarnings.toFixed(2)}`;
    state.lastStatsTotals = {
        daily: totalDailyEarnings,
        weekly: totalWeeklyEarnings,
        monthly: totalMonthlyEarnings
    };
    renderPercentageCutStats(state.lastStatsTotals);

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

    renderDashboardData();
    import('./ui.js').then(module => module.updateActiveFilterDisplay());
}
