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
    getFirestore,
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp
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
const db = getFirestore(app);
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

// State Variables
let currentUser = null;
let timerInterval = null;
let startTime = null;
let currentSessionRate = 0;

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
            alert("Login failed: " + error.message);
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
    liveEarningsDisplay.textContent = `$${earned.toFixed(2)}`;

    document.title = `${formattedTime} - Work Tracker`;
}

startBtn.addEventListener('click', () => {
    if (!currentUser) return;

    const rate = parseFloat(hourlyRateInput.value);
    if (isNaN(rate)) {
        alert("Please enter a valid hourly rate");
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
        alert("Error saving data! Check console.");
    }

    localStorage.removeItem('work_tracker_start');
    localStorage.removeItem('work_tracker_rate');

    toggleTimerUI(false);
    timerDisplay.textContent = "00:00:00";
    liveEarningsDisplay.textContent = "$0.00";
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
        let totalWeeklyMs = 0;
        let totalWeeklyEarnings = 0;

        const now = new Date();
        const startOfWeek = getMonday(now);

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const dateObj = new Date(data.startTime);

            if (dateObj >= startOfWeek) {
                totalWeeklyMs += data.durationMs;
                totalWeeklyEarnings += data.earnings;
            }

            const item = document.createElement('div');
            item.className = 'history-item';

            const hours = (data.durationMs / (1000 * 60 * 60)).toFixed(2);
            const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            item.innerHTML = `
                <div>
                    <span class="history-date">${dateStr}</span>
                    <strong>${hours} hrs</strong>
                </div>
                <div class="history-details">
                    <div>$${data.earnings.toFixed(2)}</div>
                    <small>@ $${data.rate}/hr</small>
                </div>
            `;
            historyList.appendChild(item);
        });

        const totalWeeklyHours = (totalWeeklyMs / (1000 * 60 * 60)).toFixed(2);
        weeklyHoursDisplay.textContent = `${totalWeeklyHours}h`;
        weeklyEarningsDisplay.textContent = `$${totalWeeklyEarnings.toFixed(2)}`;

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