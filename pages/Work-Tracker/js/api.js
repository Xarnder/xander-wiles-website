import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { db } from './config.js';
import { state } from './state.js';
import { renderCalendar, renderChart, DOM, showConfirm, showAlert } from './ui.js';
import { getMonday } from './utils.js';

export async function saveSession(durationMs, totalEarned) {
    try {
        await addDoc(collection(db, "users", state.currentUser.uid, "sessions"), {
            startTime: state.startTime,
            endTime: Date.now(),
            durationMs: durationMs,
            rate: state.currentSessionRate,
            earnings: totalEarned,
            createdAt: serverTimestamp()
        });
        console.log("Debug: Session saved to Firebase");
    } catch (e) {
        console.error("Debug: Error adding document: ", e);
        showAlert("Save Error", "Error saving tracking data! Please check your internet connection.");
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

export function loadHistory() {
    const q = query(
        collection(db, "users", state.currentUser.uid, "sessions"),
        orderBy("startTime", "desc")
    );

    onSnapshot(q, (querySnapshot) => {
        DOM.historyList.innerHTML = "";
        state.allSessions = [];
        let totalWeeklyMs = 0;
        let totalWeeklyEarnings = 0;

        const startOfWeek = getMonday(new Date());

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const dateObj = new Date(data.startTime);
            state.allSessions.push({ id: docSnap.id, ...data });

            if (dateObj >= startOfWeek) {
                totalWeeklyMs += data.durationMs;
                totalWeeklyEarnings += data.earnings;
            }

            const item = document.createElement('div');
            item.className = 'history-item';
            const hours = (data.durationMs / (1000 * 60 * 60)).toFixed(2);
            const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            item.innerHTML = `
                <div class="history-item-content">
                    <div>
                        <span class="history-date">${dateStr}</span>
                        <strong>${hours} hrs</strong>
                    </div>
                    <div class="history-details">
                        <div>${state.currentCurrency}${data.earnings.toFixed(2)}</div>
                        <small>@ ${state.currentCurrency}${data.rate}/hr</small>
                    </div>
                </div>
                <button class="btn-delete" data-id="${docSnap.id}" title="Delete Session">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            `;

            const deleteBtn = item.querySelector('.btn-delete');
            deleteBtn.addEventListener('click', async () => {
                const isConfirmed = await showConfirm("Delete Session", "Are you sure you want to permanently delete this work session?");
                if (isConfirmed) {
                    await deleteSession(docSnap.id);
                }
            });

            DOM.historyList.appendChild(item);
        });

        const totalWeeklyHours = (totalWeeklyMs / (1000 * 60 * 60)).toFixed(2);
        DOM.weeklyHoursDisplay.textContent = `${totalWeeklyHours}h`;
        DOM.weeklyEarningsDisplay.textContent = `$${totalWeeklyEarnings.toFixed(2)}`;

        renderCalendar();
        renderChart();
        console.log("Debug: History updated from Firebase");
    }, (error) => {
        console.error("Debug: Snapshot error", error);
    });
}
