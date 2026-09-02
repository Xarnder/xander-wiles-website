import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc, setDoc, runTransaction, writeBatch } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { db } from './config.js';
import { state, updatePercentageCuts, updatePersonalCuts, updateTimeCostItems, updateTcHourlyRate, updateTcDailyHours, updateTcWorkingDaysPerWeek, getBreaksViewDate, updateSavingPotPoolScope, updateBudgetPlan, updatePayPeriods, updateWorkSchedule } from './state.js';
import { renderCalendar, renderChart, DOM, showConfirm, showAlert, updateDatalists, renderPercentageCutStats, renderPercentageCutList, renderPersonalCutList, getAmountAfterPercentageCuts, getAmountAfterPersonalCuts, renderCustomStatsPeriods, renderWorkPatternBreakdown, renderPayOverlapWarning, renderWorkSchedule, renderStatEarningsDisplay } from './ui.js';
import { getStartOfWeekDate, formatDuration, getMonthlyStatsConfig, STATS_PERIOD_MODES, getEffectiveSessionMetrics, calculateRollingPeriodTotals, calculateCalendarPeriodTotals, getBreakOverlapMs, getStartOfDay, isSameCalendarDay, getBreaksForDay, formatRelativeSessionAge, getCalendarDateKey, formatClockTime } from './utils.js';
import { combinePayAndSessionEarnings, filterPayPeriods, serializePayPeriod, isSessionCoveredByPay, getWorkSettingsFromState } from './payPeriods.js';
import { serializeWorkSchedule } from './workSchedule.js';
import {
    sanitizePoolScope,
    computeSavingPotStateFromAppState,
    validateAssign,
    validateWithdraw,
    clampSavedAmountForCost,
    getItemSavedAmount,
    roundMoney
} from './savingPots.js';
import { createSeedBudgetPlan, sanitizeBudgetPlan, validateBudgetPlan } from './budgeting.js';
import { chunkItems, FIRESTORE_BATCH_LIMIT } from './batchDelete.js';

function firestoreWriteErrorMessage(error, fallback) {
    const code = error?.code || '';
    if (code === 'permission-denied') {
        return 'Firestore blocked this save. The live security rules may not allow this yet.';
    }
    if (code === 'unavailable' || code === 'deadline-exceeded') {
        return 'Could not reach Firestore. Please check your internet connection and try again.';
    }
    return error?.message || fallback;
}

function getPercentageCutsRef() {
    return doc(db, "users", state.currentUser.uid, "settings", "percentageCuts");
}

function getPersonalCutsRef() {
    return doc(db, "users", state.currentUser.uid, "settings", "personalCuts");
}

function getSavingPotSettingsRef() {
    return doc(db, "users", state.currentUser.uid, "settings", "savingPots");
}

function getBudgetingSettingsRef() {
    return doc(db, "users", state.currentUser.uid, "settings", "budgeting");
}

function getWorkScheduleSettingsRef() {
    return doc(db, "users", state.currentUser.uid, "settings", "workSchedule");
}

function serializeBudgetPlan(plan) {
    const sanitized = sanitizeBudgetPlan(plan);
    return {
        totalAmount: sanitized.totalAmount,
        divisions: sanitized.divisions.map((division) => ({
            id: division.id,
            name: division.name,
            percentage: division.percentage
        }))
    };
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

function renderStatsHoursDisplay(displayEl, effectiveMs, grossMs, breakMs) {
    if (!displayEl) return;

    const effectiveText = formatDuration(effectiveMs);
    if (!breakMs || breakMs <= 0 || effectiveMs === grossMs) {
        displayEl.innerHTML = effectiveText;
        return;
    }

    displayEl.innerHTML = `
        <span class="stats-hours-effective">${effectiveText}</span>
        <span class="stats-hours-gross">${formatDuration(grossMs)} gross · ${formatDuration(breakMs)} breaks</span>
    `;
}

function renderStatsEarnings(displayEl, beforeAmount) {
    renderStatEarningsDisplay(displayEl, beforeAmount);
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

function getPayPeriodsRef() {
    return collection(db, "users", state.currentUser.uid, "payPeriods");
}

export async function addPayPeriod(periodData) {
    if (!state.currentUser) {
        showAlert("Not Signed In", "Please sign in before saving pay.");
        return false;
    }

    try {
        await addDoc(getPayPeriodsRef(), {
            ...serializePayPeriod(periodData),
            createdAt: serverTimestamp()
        });
        console.log("Debug: Pay period saved to Firebase");
        return true;
    } catch (e) {
        console.error("Debug: Error adding pay period: ", e);
        showAlert("Save Error", firestoreWriteErrorMessage(e, "Error saving pay."));
        return false;
    }
}

export async function updatePayPeriod(periodId, periodData) {
    if (!state.currentUser || !periodId) return false;

    try {
        await updateDoc(doc(db, "users", state.currentUser.uid, "payPeriods", periodId), {
            ...serializePayPeriod(periodData),
            updatedAt: serverTimestamp()
        });
        console.log("Debug: Pay period updated", periodId);
        return true;
    } catch (e) {
        console.error("Debug: Error updating pay period: ", e);
        showAlert("Update Error", firestoreWriteErrorMessage(e, "Error updating pay."));
        return false;
    }
}

export async function deletePayPeriod(periodId) {
    if (!state.currentUser || !periodId) return false;

    try {
        await deleteDoc(doc(db, "users", state.currentUser.uid, "payPeriods", periodId));
        console.log("Debug: Pay period deleted", periodId);
        return true;
    } catch (e) {
        console.error("Debug: Error deleting pay period: ", e);
        showAlert("Error", firestoreWriteErrorMessage(e, "There was an error deleting this pay arrangement."));
        return false;
    }
}

export function loadPayPeriods() {
    if (!state.currentUser) return;

    const q = query(getPayPeriodsRef(), orderBy("startDate", "desc"));

    onSnapshot(q, (querySnapshot) => {
        const periods = [];
        querySnapshot.forEach((docSnap) => {
            periods.push({ id: docSnap.id, ...docSnap.data() });
        });

        updatePayPeriods(periods);
        applyGlobalFilters();
        import('./ui.js').then((module) => {
            module.renderPayWidget?.();
            module.renderPayOverlapWarning?.();
            module.syncPayAccrualTimer?.();
        });
        console.log("Debug: Pay periods updated from Firebase");
    }, (error) => {
        console.error("Debug: Pay periods snapshot error", error);
    });
}

export async function addCustomBreak(breakData) {
    try {
        await addDoc(collection(db, "users", state.currentUser.uid, "breaks"), {
            ...breakData,
            createdAt: serverTimestamp()
        });
        console.log("Debug: Break saved to Firebase");
    } catch (e) {
        console.error("Debug: Error adding break document: ", e);
        showAlert("Save Error", "Error saving break! Please check your internet connection.");
    }
}

export async function updateBreak(breakId, breakData) {
    try {
        await updateDoc(doc(db, "users", state.currentUser.uid, "breaks", breakId), breakData);
        console.log("Debug: Break updated in Firebase");
    } catch (e) {
        console.error("Debug: Error updating break document: ", e);
        showAlert("Update Error", "Error updating break! Please check your internet connection.");
    }
}

export async function deleteBreak(breakId) {
    try {
        await deleteDoc(doc(db, "users", state.currentUser.uid, "breaks", breakId));
        console.log("Debug: Break deleted", breakId);
    } catch (e) {
        console.error("Debug: Error deleting break document: ", e);
        showAlert("Error", "There was an error deleting this break.");
    }
}

export async function deleteBatchEntries(sessionIds = [], breakIds = []) {
    if (!state.currentUser) {
        showAlert("Not Signed In", "Please sign in before deleting entries.");
        return { ok: false, deleted: 0 };
    }

    const operations = [
        ...sessionIds.filter(Boolean).map((id) => ({ collectionName: 'sessions', id })),
        ...breakIds.filter(Boolean).map((id) => ({ collectionName: 'breaks', id }))
    ];

    if (!operations.length) {
        return { ok: false, deleted: 0 };
    }

    try {
        const uid = state.currentUser.uid;
        for (const chunk of chunkItems(operations, FIRESTORE_BATCH_LIMIT)) {
            const batch = writeBatch(db);
            chunk.forEach((operation) => {
                batch.delete(doc(db, "users", uid, operation.collectionName, operation.id));
            });
            await batch.commit();
        }

        const sessionCount = sessionIds.filter(Boolean).length;
        const breakCount = breakIds.filter(Boolean).length;
        const parts = [];
        if (sessionCount) parts.push(`${sessionCount} paid session${sessionCount === 1 ? '' : 's'}`);
        if (breakCount) parts.push(`${breakCount} break${breakCount === 1 ? '' : 's'}`);
        return {
            ok: true,
            deleted: operations.length,
            message: `Deleted ${parts.join(' and ')}.`
        };
    } catch (e) {
        console.error("Debug: Error batch deleting entries: ", e);
        showAlert("Delete Error", firestoreWriteErrorMessage(e, "There was an error deleting those entries."));
        return { ok: false, deleted: 0 };
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

export async function savePersonalCuts(cuts, options = {}) {
    const silent = options.silent === true;

    if (!state.currentUser) {
        if (!silent) {
            showAlert("Not Signed In", "Please sign in before saving personal cuts.");
        }
        return false;
    }

    const previousCuts = [...state.personalCuts];
    const sanitizedCuts = updatePersonalCuts(cuts);

    try {
        await setDoc(getPersonalCutsRef(), {
            cuts: serializePercentageCuts(sanitizedCuts),
            updatedAt: serverTimestamp()
        }, { merge: true });

        renderDashboardData();
        console.log("Debug: Personal cuts saved to Firebase");
        return true;
    } catch (e) {
        console.error("Debug: Error saving personal cuts: ", e);
        updatePersonalCuts(previousCuts);
        renderPersonalCutList();
        renderDashboardData();
        if (!silent) {
            showAlert("Save Error", "Error saving personal cuts! Please check your internet connection.");
        }
        return false;
    }
}

export function loadPersonalCuts() {
    if (!state.currentUser) return;

    const settingsRef = getPersonalCutsRef();

    onSnapshot(settingsRef, async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            updatePersonalCuts(data.cuts || []);

            renderPersonalCutList();
            renderDashboardData();
            console.log("Debug: Personal cuts updated from Firebase");
            return;
        }

        if (state.personalCuts.length > 0) {
            try {
                await setDoc(settingsRef, {
                    cuts: serializePercentageCuts(state.personalCuts),
                    updatedAt: serverTimestamp()
                }, { merge: true });
                console.log("Debug: Local personal cuts migrated to Firebase");
            } catch (e) {
                console.error("Debug: Error migrating personal cuts: ", e);
            }
        } else {
            renderDashboardData();
        }
    }, (error) => {
        console.error("Debug: Personal cuts snapshot error", error);
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
            savedAmount: 0,
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

    const existingItem = state.timeCostItems.find(item => item.id === itemId);
    const nextCost = itemData.cost !== undefined ? itemData.cost : existingItem?.cost;
    const nextSavedAmount = itemData.savedAmount !== undefined
        ? itemData.savedAmount
        : getItemSavedAmount(existingItem || {});

    if (nextCost !== undefined) {
        itemData.savedAmount = clampSavedAmountForCost(nextSavedAmount, nextCost);
    }

    try {
        await updateDoc(doc(db, "users", state.currentUser.uid, "timeCostItems", itemId), {
            ...itemData,
            updatedAt: serverTimestamp()
        });
        console.log("Debug: Time cost item updated", itemId);
    } catch (e) {
        console.error("Debug: Error updating time cost item: ", e);
        showAlert("Update Error", "Error updating saved item! Please check your internet connection.");
    }
}

export async function assignToSavingPot(itemId, amount) {
    if (!state.currentUser) {
        showAlert("Not Signed In", "Please sign in before assigning savings.");
        return false;
    }

    const item = state.timeCostItems.find(entry => entry.id === itemId);
    const potState = computeSavingPotStateFromAppState(state);
    const validation = validateAssign(amount, item, potState);

    if (!validation.ok) {
        showAlert("Cannot Assign", validation.error);
        return false;
    }

    const itemRef = doc(db, "users", state.currentUser.uid, "timeCostItems", itemId);

    try {
        await runTransaction(db, async (transaction) => {
            const itemSnap = await transaction.get(itemRef);
            if (!itemSnap.exists()) {
                throw new Error('Saved item not found.');
            }

            const data = itemSnap.data();
            const cost = roundMoney(Math.max(Number(data.cost) || 0, 0));
            const currentSaved = getItemSavedAmount(data);
            const nextSaved = roundMoney(currentSaved + validation.amount);

            if (nextSaved > cost + 0.005) {
                throw new Error('Assignment would exceed the item cost.');
            }

            transaction.update(itemRef, {
                savedAmount: nextSaved,
                updatedAt: serverTimestamp()
            });
        });

        console.log("Debug: Saving pot assignment saved", itemId, validation.amount);
        return true;
    } catch (e) {
        console.error("Debug: Error assigning to saving pot: ", e);
        showAlert("Assign Error", e.message || "Error assigning savings! Please check your internet connection.");
        return false;
    }
}

export async function withdrawFromSavingPot(itemId, amount) {
    if (!state.currentUser) {
        showAlert("Not Signed In", "Please sign in before withdrawing savings.");
        return false;
    }

    const item = state.timeCostItems.find(entry => entry.id === itemId);
    const validation = validateWithdraw(amount, item);

    if (!validation.ok) {
        showAlert("Cannot Withdraw", validation.error);
        return false;
    }

    const itemRef = doc(db, "users", state.currentUser.uid, "timeCostItems", itemId);

    try {
        await runTransaction(db, async (transaction) => {
            const itemSnap = await transaction.get(itemRef);
            if (!itemSnap.exists()) {
                throw new Error('Saved item not found.');
            }

            const data = itemSnap.data();
            const currentSaved = getItemSavedAmount(data);
            const nextSaved = roundMoney(Math.max(0, currentSaved - validation.amount));

            transaction.update(itemRef, {
                savedAmount: nextSaved,
                updatedAt: serverTimestamp()
            });
        });

        console.log("Debug: Saving pot withdrawal saved", itemId, validation.amount);
        return true;
    } catch (e) {
        console.error("Debug: Error withdrawing from saving pot: ", e);
        showAlert("Withdraw Error", e.message || "Error withdrawing savings! Please check your internet connection.");
        return false;
    }
}

export async function saveSavingPotSettings(poolScope) {
    if (!state.currentUser) {
        showAlert("Not Signed In", "Please sign in before saving Saving Pot settings.");
        return false;
    }

    const sanitizedScope = sanitizePoolScope(poolScope);
    updateSavingPotPoolScope(sanitizedScope);

    try {
        await setDoc(getSavingPotSettingsRef(), {
            poolScope: sanitizedScope,
            updatedAt: serverTimestamp()
        }, { merge: true });
        console.log("Debug: Saving pot settings saved to Firebase");
        return true;
    } catch (e) {
        console.error("Debug: Error saving saving pot settings: ", e);
        showAlert("Save Error", "Error saving Saving Pot settings! Please check your internet connection.");
        return false;
    }
}

export function loadSavingPotSettings() {
    if (!state.currentUser) return;

    const settingsRef = getSavingPotSettingsRef();

    onSnapshot(settingsRef, async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            updateSavingPotPoolScope(sanitizePoolScope(data.poolScope));
            console.log("Debug: Saving pot settings updated from Firebase");
            return;
        }

        try {
            await setDoc(settingsRef, {
                poolScope: sanitizePoolScope(state.savingPotPoolScope),
                updatedAt: serverTimestamp()
            }, { merge: true });
            console.log("Debug: Local saving pot settings migrated to Firebase");
        } catch (e) {
            console.error("Debug: Error migrating saving pot settings: ", e);
        }
    }, (error) => {
        console.error("Debug: Saving pot settings snapshot error", error);
    });
}

export async function saveBudgetingSettings(plan, options = {}) {
    const silent = options.silent === true;

    if (!state.currentUser) {
        if (!silent) {
            showAlert("Not Signed In", "Please sign in before saving your budget.");
        }
        return false;
    }

    const previous = { ...state.budgetPlan, divisions: [...(state.budgetPlan.divisions || [])] };
    const sanitized = updateBudgetPlan(plan);
    const validation = validateBudgetPlan(sanitized);
    if (!validation.ok) {
        updateBudgetPlan(previous);
        if (!silent) {
            showAlert("Invalid Budget", validation.error || "Could not save budget.");
        }
        return false;
    }

    try {
        await setDoc(getBudgetingSettingsRef(), {
            ...serializeBudgetPlan(sanitized),
            updatedAt: serverTimestamp()
        }, { merge: true });
        console.log("Debug: Budgeting settings saved to Firebase");
        return true;
    } catch (e) {
        console.error("Debug: Error saving budgeting settings: ", e);
        updateBudgetPlan(previous);
        import('./ui.js').then((module) => module.renderBudgetingView?.());
        if (!silent) {
            showAlert("Save Error", "Error saving budget! Please check your internet connection.");
        }
        return false;
    }
}

export function loadBudgetingSettings() {
    if (!state.currentUser) return;

    const settingsRef = getBudgetingSettingsRef();

    onSnapshot(settingsRef, async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            updateBudgetPlan({
                totalAmount: data.totalAmount,
                divisions: data.divisions
            });
            import('./ui.js').then((module) => {
                if (typeof module.renderBudgetingView === 'function') {
                    module.renderBudgetingView();
                }
            });
            console.log("Debug: Budgeting settings updated from Firebase");
            return;
        }

        const seed = createSeedBudgetPlan();
        updateBudgetPlan(seed);
        try {
            await setDoc(settingsRef, {
                ...serializeBudgetPlan(seed),
                updatedAt: serverTimestamp()
            }, { merge: true });
            console.log("Debug: Seed budgeting settings written to Firebase");
        } catch (e) {
            console.error("Debug: Error seeding budgeting settings: ", e);
        }
        import('./ui.js').then((module) => {
            if (typeof module.renderBudgetingView === 'function') {
                module.renderBudgetingView();
            }
        });
    }, (error) => {
        console.error("Debug: Budgeting settings snapshot error", error);
    });
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

export async function saveWorkSchedule(schedule) {
    if (!state.currentUser) return;
    try {
        const serialized = serializeWorkSchedule(schedule || state.workSchedule);
        await setDoc(getWorkScheduleSettingsRef(), {
            ...serialized,
            updatedAt: serverTimestamp()
        }, { merge: true });
        console.log("Debug: Work schedule saved to Firebase");
    } catch (e) {
        console.error("Debug: Error saving work schedule: ", e);
    }
}

export function loadWorkSchedule() {
    if (!state.currentUser) return;

    const settingsRef = getWorkScheduleSettingsRef();

    onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            const incoming = serializeWorkSchedule(docSnap.data());
            const current = serializeWorkSchedule(state.workSchedule);
            if (JSON.stringify(incoming) === JSON.stringify(current)) return;

            updateWorkSchedule(incoming);
            renderWorkSchedule();
            renderDashboardData();
            console.log("Debug: Work schedule updated from Firebase");
            return;
        }

        saveWorkSchedule(state.workSchedule);
    }, (error) => {
        console.error("Debug: Work schedule snapshot error", error);
    });
}

export function renderDashboardData() {
    DOM.historyList.innerHTML = "";
    if (DOM.breakHistoryList) {
        DOM.breakHistoryList.innerHTML = "";
    }

    let totalDailyMs = 0;
    let totalDailyGrossMs = 0;
    let totalDailyBreakMs = 0;
    let totalDailyEarnings = 0;
    let totalWeeklyMs = 0;
    let totalWeeklyGrossMs = 0;
    let totalWeeklyBreakMs = 0;
    let totalWeeklyEarnings = 0;
    let totalMonthlyMs = 0;
    let totalMonthlyGrossMs = 0;
    let totalMonthlyBreakMs = 0;
    let totalMonthlyEarnings = 0;
    let totalSixMonthsMs = 0;
    let totalSixMonthsGrossMs = 0;
    let totalSixMonthsBreakMs = 0;
    let totalSixMonthsEarnings = 0;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(startOfDay.getDate() + 1);
    const startOfWeek = getStartOfWeekDate(now, state.startOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    const monthlyStatsConfig = getMonthlyStatsConfig(state.statsPeriodMode, now);
    const startOfSixMonths = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const breaks = state.allBreaks;

    const payOptions = getWorkSettingsFromState(state);

    const dailyTotals = calculateCalendarPeriodTotals(state.allSessions, startOfDay, breaks, endOfDay);
    totalDailyMs = dailyTotals.totalMs;
    totalDailyGrossMs = dailyTotals.totalGrossMs;
    totalDailyBreakMs = dailyTotals.totalBreakMs;
    totalDailyEarnings = combinePayAndSessionEarnings(
        state.allSessions, breaks, state.allPayPeriods, startOfDay, endOfDay, now, payOptions
    );

    const weeklyTotals = calculateRollingPeriodTotals(state.allSessions, startOfWeek, endOfWeek, breaks);
    totalWeeklyMs = weeklyTotals.totalMs;
    totalWeeklyGrossMs = weeklyTotals.totalGrossMs;
    totalWeeklyBreakMs = weeklyTotals.totalBreakMs;
    totalWeeklyEarnings = combinePayAndSessionEarnings(
        state.allSessions, breaks, state.allPayPeriods, startOfWeek, endOfWeek, now, payOptions
    );

    if (state.statsPeriodMode === STATS_PERIOD_MODES.ROLLING) {
        const monthlyTotals = calculateRollingPeriodTotals(
            state.allSessions,
            monthlyStatsConfig.start,
            monthlyStatsConfig.end,
            breaks
        );
        totalMonthlyMs = monthlyTotals.totalMs;
        totalMonthlyGrossMs = monthlyTotals.totalGrossMs;
        totalMonthlyBreakMs = monthlyTotals.totalBreakMs;
        totalMonthlyEarnings = combinePayAndSessionEarnings(
            state.allSessions,
            breaks,
            state.allPayPeriods,
            monthlyStatsConfig.start,
            monthlyStatsConfig.end,
            now,
            payOptions
        );
    } else {
        const monthlyTotals = calculateCalendarPeriodTotals(
            state.allSessions,
            monthlyStatsConfig.start,
            breaks,
            monthlyStatsConfig.end
        );
        totalMonthlyMs = monthlyTotals.totalMs;
        totalMonthlyGrossMs = monthlyTotals.totalGrossMs;
        totalMonthlyBreakMs = monthlyTotals.totalBreakMs;
        totalMonthlyEarnings = combinePayAndSessionEarnings(
            state.allSessions,
            breaks,
            state.allPayPeriods,
            monthlyStatsConfig.start,
            monthlyStatsConfig.end,
            now,
            payOptions
        );
    }

    const sixMonthTotals = calculateCalendarPeriodTotals(state.allSessions, startOfSixMonths, breaks, now);
    totalSixMonthsMs = sixMonthTotals.totalMs;
    totalSixMonthsGrossMs = sixMonthTotals.totalGrossMs;
    totalSixMonthsBreakMs = sixMonthTotals.totalBreakMs;
    totalSixMonthsEarnings = combinePayAndSessionEarnings(
        state.allSessions, breaks, state.allPayPeriods, startOfSixMonths, now, now, payOptions
    );

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
        const sessionMetrics = getEffectiveSessionMetrics(data, state.allBreaks);
        const displayDuration = sessionMetrics.breakMs > 0
            ? formatDuration(sessionMetrics.effectiveDurationMs)
            : formattedTime;
        const grossDurationHtml = sessionMetrics.breakMs > 0
            ? `<small class="history-gross-duration">${formatDuration(sessionMetrics.grossDurationMs)} gross · ${formatDuration(sessionMetrics.breakMs)} breaks</small>`
            : '';
        const endDateObj = data.endTime ? new Date(data.endTime) : new Date(data.startTime + data.durationMs);
        const startTimeStr = formatClockTime(dateObj, state.clockTimeFormat);
        const endTimeStr = formatClockTime(endDateObj, state.clockTimeFormat);
        const startDateStr = dateObj.toLocaleDateString();
        const endDateStr = endDateObj.toLocaleDateString();
        const startDateTimeStr = `${startDateStr} ${startTimeStr}`;
        const endDateTimeStr = startDateStr === endDateStr ? endTimeStr : `${endDateStr} ${endTimeStr}`;
        const sessionEarnings = sessionMetrics.breakMs > 0
            ? sessionMetrics.effectiveEarnings
            : (Number(data.earnings) || 0);
        const coveredByPay = isSessionCoveredByPay(data, state.allPayPeriods);
        const sessionDateKey = getCalendarDateKey(dateObj);
        const scheduledPayCover = coveredByPay && sessionDateKey > getCalendarDateKey(new Date());
        const afterCutsEarnings = getAmountAfterPercentageCuts(sessionEarnings);
        const afterPersonalEarnings = getAmountAfterPersonalCuts(sessionEarnings);
        const afterCutsHtml = !coveredByPay && (state.percentageCuts.length || state.personalCuts.length)
            ? `${state.percentageCuts.length ? `<small class="history-after-cuts">After external ${state.currentCurrency}${afterCutsEarnings.toFixed(2)}</small>` : ''}${state.personalCuts.length ? `<small class="history-after-personal">After personal ${state.currentCurrency}${afterPersonalEarnings.toFixed(2)}</small>` : ''}`
            : '';
        const payCoveredNoteHtml = scheduledPayCover
            ? `<small class="history-pay-scheduled-note">Scheduled salary day — not in totals yet</small>`
            : (coveredByPay
                ? `<small class="history-pay-covered-note">Hours only — already in pay totals</small>`
                : '');

        const companyHtml = data.company ? `<span class="history-badge history-badge-company">${data.company}</span>` : '';
        const projectHtml = data.project ? `<span class="history-badge history-badge-project">${data.project}</span>` : '';
        const payCoveredHtml = scheduledPayCover
            ? `<span class="history-badge history-badge-scheduled">Scheduled pay</span>`
            : (coveredByPay
                ? `<span class="history-badge history-badge-pay">Covered by pay</span>`
                : '');
        let focusHtml = '';
        if (data.focused === true) {
            focusHtml = `<span class="history-badge history-badge-focus">Focused</span>`;
        } else if (data.focused === false) {
            focusHtml = `<span class="history-badge history-badge-multitasking">Multitasking</span>`;
        }

        const relativeAge = formatRelativeSessionAge(data.startTime);
        const relativeAgeHtml = relativeAge
            ? `<span class="history-relative-age">${relativeAge}</span>`
            : '';

        item.innerHTML = `
            <div class="history-item-content">
                <div>
                    <span class="history-date">
                        <span>Started ${startDateTimeStr}</span>
                        <span>Ended ${endDateTimeStr}</span>
                        ${relativeAgeHtml}
                    </span>
                    <strong>${displayDuration}</strong>
                    ${grossDurationHtml}
                    <div class="history-badges">
                        ${companyHtml}
                        ${projectHtml}
                        ${focusHtml}
                        ${payCoveredHtml}
                    </div>
                </div>
                <div class="history-details">
                    <div>${state.currentCurrency}${sessionEarnings.toFixed(2)}</div>
                    ${payCoveredNoteHtml}
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
                import('./ui.js').then(module => module.updateSessionModalDurationPreview());
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

    DOM.dailyHoursDisplay && renderStatsHoursDisplay(DOM.dailyHoursDisplay, totalDailyMs, totalDailyGrossMs, totalDailyBreakMs);
    renderStatsEarnings(DOM.dailyEarningsDisplay, totalDailyEarnings);

    DOM.weeklyHoursDisplay && renderStatsHoursDisplay(DOM.weeklyHoursDisplay, totalWeeklyMs, totalWeeklyGrossMs, totalWeeklyBreakMs);
    renderStatsEarnings(DOM.weeklyEarningsDisplay, totalWeeklyEarnings);

    DOM.monthlyHoursDisplay && renderStatsHoursDisplay(DOM.monthlyHoursDisplay, totalMonthlyMs, totalMonthlyGrossMs, totalMonthlyBreakMs);
    renderStatsEarnings(DOM.monthlyEarningsDisplay, totalMonthlyEarnings);

    if (DOM.sixMonthsHoursDisplay) {
        renderStatsHoursDisplay(DOM.sixMonthsHoursDisplay, totalSixMonthsMs, totalSixMonthsGrossMs, totalSixMonthsBreakMs);
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

    renderBreakHistory();

    renderPayOverlapWarning();

    renderCalendar();
    renderChart();
    import('./ui.js').then(module => {
        module.renderGanttChart();
        module.renderSavingPotsWidget();
        module.syncPayAccrualTimer?.();
        module.updateBatchDeletePreview?.();
        if (DOM.timeCostView && !DOM.timeCostView.classList.contains('hidden')) {
            module.renderSavingPotsSummary();
        }
    });
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

export function loadBreaks() {
    const q = query(
        collection(db, "users", state.currentUser.uid, "breaks"),
        orderBy("startTime", "desc")
    );

    onSnapshot(q, (querySnapshot) => {
        state.rawBreaks = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            state.rawBreaks.push({ id: docSnap.id, ...data });
        });

        state.allBreaks = [...state.rawBreaks];
        renderDashboardData();
        console.log("Debug: Breaks updated from Firebase");
    }, (error) => {
        console.error("Debug: Breaks snapshot error", error);
    });
}

function formatBreaksDayHeading(viewDate) {
    const today = getStartOfDay();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (isSameCalendarDay(viewDate, today)) return 'Today';
    if (isSameCalendarDay(viewDate, yesterday)) return 'Yesterday';
    if (isSameCalendarDay(viewDate, tomorrow)) return 'Tomorrow';

    return viewDate.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: viewDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
}

function formatBreaksDaySummaryLabel(viewDate) {
    const today = getStartOfDay();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (isSameCalendarDay(viewDate, today)) return "Today's Breaks";
    if (isSameCalendarDay(viewDate, yesterday)) return "Yesterday's Breaks";

    return `${viewDate.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    })} Breaks`;
}

export function renderBreakHistory() {
    if (!DOM.breakHistoryList) return;

    const viewDate = getBreaksViewDate();
    const today = getStartOfDay();
    const dayStart = getStartOfDay(viewDate);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dayBreaks = getBreaksForDay(state.allBreaks, viewDate);

    DOM.breakHistoryList.innerHTML = '';

    if (DOM.breaksViewDateLabel) {
        DOM.breaksViewDateLabel.textContent = formatBreaksDayHeading(viewDate);
    }

    if (DOM.breakDayTotalLabel) {
        DOM.breakDayTotalLabel.textContent = formatBreaksDaySummaryLabel(viewDate);
    }

    if (DOM.breaksTodayBtn) {
        DOM.breaksTodayBtn.classList.toggle('hidden', isSameCalendarDay(viewDate, today));
    }

    if (DOM.breaksNextDayBtn) {
        DOM.breaksNextDayBtn.disabled = isSameCalendarDay(viewDate, today);
    }

    if (!dayBreaks.length) {
        const emptyMessage = isSameCalendarDay(viewDate, today)
            ? 'No breaks recorded for today.'
            : `No breaks recorded for ${formatBreaksDayHeading(viewDate).toLowerCase()}.`;
        DOM.breakHistoryList.innerHTML = `<p class="loading-text">${emptyMessage}</p>`;
    }

    dayBreaks.forEach((data) => {
        const dateObj = new Date(data.startTime);
        const item = document.createElement('div');
        item.className = 'history-item break-history-item';

        const endDateObj = data.endTime ? new Date(data.endTime) : new Date(data.startTime + data.durationMs);
        const startTimeStr = formatClockTime(dateObj, state.clockTimeFormat);
        const endTimeStr = formatClockTime(endDateObj, state.clockTimeFormat);
        const startDateStr = dateObj.toLocaleDateString();
        const endDateStr = endDateObj.toLocaleDateString();
        const startDateTimeStr = isSameCalendarDay(dateObj, viewDate)
            ? startTimeStr
            : `${startDateStr} ${startTimeStr}`;
        const endDateTimeStr = startDateStr === endDateStr
            ? (isSameCalendarDay(endDateObj, viewDate) ? endTimeStr : `${endDateStr} ${endTimeStr}`)
            : `${endDateStr} ${endTimeStr}`;
        const labelHtml = data.label
            ? `<span class="history-badge history-badge-break">${data.label}</span>`
            : `<span class="history-badge history-badge-break">Break</span>`;

        item.innerHTML = `
            <div class="history-item-content">
                <div>
                    <span class="history-date">
                        <span>Started ${startDateTimeStr}</span>
                        <span>Ended ${endDateTimeStr}</span>
                    </span>
                    <strong>${formatDuration(data.durationMs)}</strong>
                    <div class="history-badges">
                        ${labelHtml}
                    </div>
                </div>
            </div>
            <div class="history-item-actions" style="display: flex; gap: 8px;">
                <button class="btn-edit btn-edit-break" data-id="${data.id}" title="Edit Break">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="btn-delete btn-delete-break" data-id="${data.id}" title="Delete Break">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </div>
        `;

        item.querySelector('.btn-delete-break').addEventListener('click', async () => {
            const isConfirmed = await showConfirm("Delete Break", "Are you sure you want to permanently delete this break?");
            if (isConfirmed) {
                await deleteBreak(data.id);
            }
        });

        item.querySelector('.btn-edit-break').addEventListener('click', () => {
            import('./utils.js').then(({ formatDateTimeLocal }) => {
                DOM.breakModalTitle.textContent = "Edit Break";
                DOM.editBreakId.value = data.id;
                DOM.breakStart.value = formatDateTimeLocal(data.startTime);
                DOM.breakEnd.value = formatDateTimeLocal(data.endTime);
                DOM.breakLabel.value = data.label || "";
                DOM.breakModal.classList.remove('modal-mode-add');
                DOM.breakModal.classList.add('modal-mode-edit');
                if (DOM.deleteBreakBtn) {
                    DOM.deleteBreakBtn.style.display = 'block';
                }
                DOM.breakModal.classList.remove('hidden');
                import('./ui.js').then(module => module.updateBreakModalDurationPreviews());
            });
        });

        DOM.breakHistoryList.appendChild(item);
    });

    if (DOM.breakTodayTotal) {
        let dayBreakMs = 0;
        dayBreaks.forEach((breakItem) => {
            dayBreakMs += getBreakOverlapMs([breakItem], dayStart, dayEnd);
        });

        DOM.breakTodayTotal.textContent = dayBreakMs > 0 ? formatDuration(dayBreakMs) : '0m';
    }
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

    state.allPayPeriods = filterPayPeriods(state.rawPayPeriods, {
        company: state.globalFilterCompany,
        project: state.globalFilterProject
    });

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
