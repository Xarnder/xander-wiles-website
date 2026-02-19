// =======================================================
// FIREBASE CONFIGURATION & IMPORTS
// =======================================================

// Importing from the specific version you requested (12.9.0)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
    initializeFirestore,
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    doc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

console.log("Debug: JS Script Loaded - Firebase v12.9.0");

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCjNeg92N-4vHQAVLNMMNyPTBcGEsPcMBc",
    authDomain: "work-tracker-xander.firebaseapp.com",
    projectId: "work-tracker-xander",
    storageBucket: "work-tracker-xander.firebasestorage.app",
    messagingSenderId: "885496985060",
    appId: "1:885496985060:web:4cb7f5e8463471348743f1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
    experimentalForceLongPolling: true
});
const provider = new GoogleAuthProvider();

// =======================================================
// APP LOGIC
// =======================================================

// DOM Elements
const authSection = document.getElementById('auth-section');
const dashboard = document.getElementById('dashboard');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userNameDisplay = document.getElementById('user-name');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const timerDisplay = document.getElementById('timer');
const hourlyRateInput = document.getElementById('hourly-rate');
const liveEarningsDisplay = document.getElementById('live-earnings');
const historyList = document.getElementById('history-list');
const weeklyHoursDisplay = document.getElementById('weekly-hours');
const weeklyEarningsDisplay = document.getElementById('weekly-earnings');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const calendarMonthYear = document.getElementById('calendar-month-year');
const calendarGrid = document.querySelector('.calendar-grid');
const weeklyChart = document.getElementById('weekly-chart');

// Settings Elements
const settingsBtn = document.getElementById('settings-btn');
const closeSettingsBtn = document.getElementById('close-settings');
const settingsModal = document.getElementById('settings-modal');
const currencySelect = document.getElementById('currency-select');
const saveSettingsBtn = document.getElementById('save-settings');

// Custom Popup Modals
const alertModal = document.getElementById('alert-modal');
const alertTitle = document.getElementById('alert-title');
const alertMessage = document.getElementById('alert-message');
const alertOkBtn = document.getElementById('alert-ok-btn');

const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmOkBtn = document.getElementById('confirm-ok-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

// State Variables
let currentUser = null;
let timerInterval = null;
let startTime = null;
let currentSessionRate = 0;
let currentCalendarDate = new Date();
let allSessions = [];
let currentCurrency = localStorage.getItem('work_tracker_currency') || '£';

// Initialize UI
updateCurrencyDisplays();
currencySelect.value = currentCurrency;

// ==========================================
// Authentication Logic
// ==========================================

loginBtn.addEventListener('click', () => {
    console.log("Debug: Login clicked");
    signInWithPopup(auth, provider)
        .then((result) => {
            console.log("Debug: Logged in as", result.user.email);
        }).catch((error) => {
            console.error("Debug: Login Error", error);
            showAlert("Login Failed", error.message);
        });
});

logoutBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
        console.log("Debug: Signed out");
        location.reload();
    });
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authSection.classList.add('hidden');
        dashboard.classList.remove('hidden');
        userNameDisplay.textContent = user.displayName || user.email;

        loadHistory();
        checkRestorableSession();

        console.log("Debug: Auth state active for user:", user.uid);
    } else {
        currentUser = null;
        authSection.classList.remove('hidden');
        dashboard.classList.add('hidden');
    }
});

// ==========================================
// Settings Logic
// ==========================================

settingsBtn.addEventListener('click', () => {
    currencySelect.value = currentCurrency;
    settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

saveSettingsBtn.addEventListener('click', () => {
    currentCurrency = currencySelect.value;
    localStorage.setItem('work_tracker_currency', currentCurrency);
    updateCurrencyDisplays();
    if (currentUser) {
        // Re-render history text since it incorporates the currency symbols
        loadHistory();
    }
    settingsModal.classList.add('hidden');
});

function updateCurrencyDisplays() {
    const symbolSpans = document.querySelectorAll('.currency-symbol');
    symbolSpans.forEach(span => {
        span.textContent = currentCurrency;
    });

    // Specifically update the live earnings display
    if (startTime) {
        const now = Date.now();
        const elapsedMs = now - startTime;
        const hoursFloat = elapsedMs / (1000 * 60 * 60);
        const earned = hoursFloat * currentSessionRate;
        liveEarningsDisplay.innerHTML = `<span class="currency-symbol">${currentCurrency}</span>${earned.toFixed(2)}`;
    } else {
        liveEarningsDisplay.innerHTML = `<span class="currency-symbol">${currentCurrency}</span>0.00`;
    }
}

// ==========================================
// Timer Logic
// ==========================================

function updateTimerDisplay(elapsedMs) {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const formattedTime =
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    timerDisplay.textContent = formattedTime;

    const hoursFloat = elapsedMs / (1000 * 60 * 60);
    const earned = hoursFloat * currentSessionRate;
    liveEarningsDisplay.innerHTML = `<span class="currency-symbol">${currentCurrency}</span>${earned.toFixed(2)}`;

    document.title = `${formattedTime} - Work Tracker`;
}

startBtn.addEventListener('click', () => {
    if (!currentUser) return;

    const rate = parseFloat(hourlyRateInput.value);
    if (isNaN(rate)) {
        showAlert("Invalid Input", "Please enter a valid hourly rate.");
        return;
    }

    startTime = Date.now();
    currentSessionRate = rate;

    localStorage.setItem('work_tracker_start', startTime);
    localStorage.setItem('work_tracker_rate', currentSessionRate);

    toggleTimerUI(true);

    timerInterval = setInterval(() => {
        const now = Date.now();
        updateTimerDisplay(now - startTime);
    }, 1000);

    console.log("Debug: Timer started at", startTime);
});

stopBtn.addEventListener('click', async () => {
    if (!startTime) return;

    clearInterval(timerInterval);
    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const hoursFloat = durationMs / (1000 * 60 * 60);
    const totalEarned = hoursFloat * currentSessionRate;

    console.log("Debug: Timer stopped. Duration (ms):", durationMs);

    try {
        await addDoc(collection(db, "users", currentUser.uid, "sessions"), {
            startTime: startTime,
            endTime: endTime,
            durationMs: durationMs,
            rate: currentSessionRate,
            earnings: totalEarned,
            createdAt: serverTimestamp()
        });
        console.log("Debug: Session saved to Firebase");
    } catch (e) {
        console.error("Debug: Error adding document: ", e);
        showAlert("Save Error", "Error saving tracking data! Please check your internet connection.");
    }

    localStorage.removeItem('work_tracker_start');
    localStorage.removeItem('work_tracker_rate');

    toggleTimerUI(false);
    timerDisplay.textContent = "00:00:00";
    liveEarningsDisplay.innerHTML = `<span class="currency-symbol">${currentCurrency}</span>0.00`;
    document.title = "Work Tracker";
});

function toggleTimerUI(isRunning) {
    if (isRunning) {
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        hourlyRateInput.disabled = true;
    } else {
        startBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        hourlyRateInput.disabled = false;
    }
}

function checkRestorableSession() {
    const savedStart = localStorage.getItem('work_tracker_start');
    const savedRate = localStorage.getItem('work_tracker_rate');

    if (savedStart && savedRate) {
        console.log("Debug: Found active session in storage");
        startTime = parseInt(savedStart);
        currentSessionRate = parseFloat(savedRate);
        hourlyRateInput.value = currentSessionRate;

        toggleTimerUI(true);

        updateTimerDisplay(Date.now() - startTime);
        timerInterval = setInterval(() => {
            const now = Date.now();
            updateTimerDisplay(now - startTime);
        }, 1000);
    }
}

// ==========================================
// Data & Stats Logic
// ==========================================

function loadHistory() {
    const q = query(
        collection(db, "users", currentUser.uid, "sessions"),
        orderBy("startTime", "desc")
    );

    onSnapshot(q, (querySnapshot) => {
        historyList.innerHTML = "";
        allSessions = [];
        let totalWeeklyMs = 0;
        let totalWeeklyEarnings = 0;

        const now = new Date();
        const startOfWeek = getMonday(now);

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const dateObj = new Date(data.startTime);
            allSessions.push({ id: docSnap.id, ...data });

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
                        <div>${currentCurrency}${data.earnings.toFixed(2)}</div>
                        <small>@ ${currentCurrency}${data.rate}/hr</small>
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
                    try {
                        await deleteDoc(doc(db, "users", currentUser.uid, "sessions", docSnap.id));
                        console.log("Debug: Session deleted", docSnap.id);
                    } catch (e) {
                        console.error("Debug: Error deleting document: ", e);
                        showAlert("Error", "There was an error deleting this session.");
                    }
                }
            });

            historyList.appendChild(item);
        });

        const totalWeeklyHours = (totalWeeklyMs / (1000 * 60 * 60)).toFixed(2);
        weeklyHoursDisplay.textContent = `${totalWeeklyHours}h`;
        weeklyEarningsDisplay.textContent = `$${totalWeeklyEarnings.toFixed(2)}`;

        renderCalendar();
        renderChart();
        console.log("Debug: History updated from Firebase");
    }, (error) => {
        console.error("Debug: Snapshot error", error);
    });
}

function getMonday(d) {
    d = new Date(d);
    var day = d.getDay(),
        diff = d.getDate() - day + (day == 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

// ==========================================
// Calendar Logic
// ==========================================

function renderCalendar() {
    if (!calendarGrid || !calendarMonthYear) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    calendarMonthYear.textContent = `${monthNames[month]} ${year}`;

    // Clear existing days but keep headers
    const existingDays = calendarGrid.querySelectorAll('.calendar-day');
    existingDays.forEach(day => day.remove());

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const todayDate = new Date();

    // Aggregate hours per day for the current month view
    const dailyHours = {};
    allSessions.forEach(session => {
        const sessionDate = new Date(session.startTime);
        if (sessionDate.getFullYear() === year && sessionDate.getMonth() === month) {
            const dayNum = sessionDate.getDate();
            const hours = session.durationMs / (1000 * 60 * 60);
            if (!dailyHours[dayNum]) {
                dailyHours[dayNum] = 0;
            }
            dailyHours[dayNum] += hours;
        }
    });

    // Padding for first day
    for (let x = 0; x < firstDayIndex; x++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'calendar-day empty';
        calendarGrid.appendChild(emptyDiv);
    }

    // Days setup
    for (let i = 1; i <= daysInMonth; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.textContent = i;

        if (todayDate.getDate() === i &&
            todayDate.getMonth() === month &&
            todayDate.getFullYear() === year) {
            dayDiv.classList.add('today');
        }

        if (dailyHours[i] && dailyHours[i] > 0) {
            dayDiv.classList.add('has-work');
            const hourLabel = document.createElement('div');
            hourLabel.className = 'work-hours-indicator';
            hourLabel.textContent = `${dailyHours[i].toFixed(1)}h`;
            dayDiv.appendChild(hourLabel);
        }

        calendarGrid.appendChild(dayDiv);
    }
}

if (prevMonthBtn && nextMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderCalendar();
    });
}

// ==========================================
// Custom Popup Modals
// ==========================================

function showAlert(title, message) {
    return new Promise((resolve) => {
        alertTitle.textContent = title || "Notice";
        alertMessage.textContent = message;
        alertModal.classList.remove('hidden');

        const handleOk = () => {
            alertModal.classList.add('hidden');
            alertOkBtn.removeEventListener('click', handleOk);
            resolve();
        };

        alertOkBtn.addEventListener('click', handleOk);
    });
}

function showConfirm(title, message) {
    return new Promise((resolve) => {
        confirmTitle.textContent = title || "Confirm Action";
        confirmMessage.textContent = message;
        confirmModal.classList.remove('hidden');

        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            confirmModal.classList.add('hidden');
            confirmOkBtn.removeEventListener('click', handleConfirm);
            confirmCancelBtn.removeEventListener('click', handleCancel);
        };

        confirmOkBtn.addEventListener('click', handleConfirm);
        confirmCancelBtn.addEventListener('click', handleCancel);
    });
}

// ==========================================
// Weekly Chart Logic
// ==========================================

function renderChart() {
    if (!weeklyChart) return;

    weeklyChart.innerHTML = '';

    // Days of week: Mon, Tue, Wed, Thu, Fri, Sat, Sun
    const daysArr = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const now = new Date();
    const startOfWeek = getMonday(now);

    // Initialize day map (sub-session durations)
    const weekData = Array(7).fill().map(() => []);

    let maxDailyHours = 0;

    // Filter current week sessions
    const currentWeekSessions = allSessions.filter(session => {
        const sessionDate = new Date(session.startTime);
        return sessionDate >= startOfWeek;
    });

    currentWeekSessions.forEach(session => {
        const sessionDate = new Date(session.startTime);
        let dayIndex = sessionDate.getDay() - 1; // 0=Mon, 6=Sun
        if (dayIndex === -1) dayIndex = 6; // Sunday is 0 locally, map to 6

        const hours = session.durationMs / (1000 * 60 * 60);
        weekData[dayIndex].push(hours);
    });

    weekData.forEach(daySessions => {
        const dailyTotal = daySessions.reduce((sum, hrs) => sum + hrs, 0);
        if (dailyTotal > maxDailyHours) {
            maxDailyHours = dailyTotal;
        }
    });

    // Normalize scale strictly to this week's highest logged duration
    const scaleMax = maxDailyHours > 0 ? maxDailyHours : 1;

    // Build DOM
    daysArr.forEach((label, index) => {
        const colDiv = document.createElement('div');
        colDiv.className = 'chart-day-column';

        const areaDiv = document.createElement('div');
        areaDiv.className = 'chart-bar-area';

        weekData[index].forEach((hrs, sIndex) => {
            const pct = (hrs / scaleMax) * 100;
            const bar = document.createElement('div');
            bar.className = 'chart-sub-session';
            bar.style.height = `${pct}%`;
            bar.title = `Session ${sIndex + 1}: ${hrs.toFixed(2)}h`;
            areaDiv.appendChild(bar);
        });

        const lblDiv = document.createElement('div');
        lblDiv.className = 'chart-day-label';
        lblDiv.textContent = label;

        colDiv.appendChild(areaDiv);
        colDiv.appendChild(lblDiv);

        weeklyChart.appendChild(colDiv);
    });
}