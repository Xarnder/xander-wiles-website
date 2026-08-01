(function () {
    'use strict';

    // Change profile display values here only.
    const CAMERA_MODEL = 'Canon R6 Mark II';

    // Used only to derive age for display — never rendered on the page.
    const BIRTH_YEAR = 2002;
    const BIRTH_MONTH = 7; // 1-based
    const BIRTH_DAY = 16;

    // One journal entry per day. Update the anchor when the known count drifts.
    const JOURNAL_ANCHOR_YEAR = 2026;
    const JOURNAL_ANCHOR_MONTH = 8; // 1-based
    const JOURNAL_ANCHOR_DAY = 1;
    const JOURNAL_ANCHOR_COUNT = 1231;

    function currentAge(now) {
        const date = now instanceof Date ? now : new Date();
        let age = date.getFullYear() - BIRTH_YEAR;
        const month = date.getMonth() + 1;
        const day = date.getDate();
        if (month < BIRTH_MONTH || (month === BIRTH_MONTH && day < BIRTH_DAY)) {
            age -= 1;
        }
        return Math.max(0, age);
    }

    function calendarDayUtc(year, month, day) {
        return Date.UTC(year, month - 1, day);
    }

    function currentJournalCount(now) {
        const date = now instanceof Date ? now : new Date();
        const todayUtc = calendarDayUtc(date.getFullYear(), date.getMonth() + 1, date.getDate());
        const anchorUtc = calendarDayUtc(
            JOURNAL_ANCHOR_YEAR,
            JOURNAL_ANCHOR_MONTH,
            JOURNAL_ANCHOR_DAY
        );
        const daysSinceAnchor = Math.floor((todayUtc - anchorUtc) / 86400000);
        return Math.max(JOURNAL_ANCHOR_COUNT, JOURNAL_ANCHOR_COUNT + daysSinceAnchor);
    }

    function formatJournalCount(count) {
        return Number(count).toLocaleString('en-GB');
    }

    function applyProfile() {
        const age = String(currentAge());
        const journalCount = formatJournalCount(currentJournalCount());
        document.querySelectorAll('[data-xw-age]').forEach((element) => {
            element.textContent = age;
        });
        document.querySelectorAll('[data-xw-camera]').forEach((element) => {
            element.textContent = CAMERA_MODEL;
        });
        document.querySelectorAll('[data-xw-journal-count]').forEach((element) => {
            element.textContent = journalCount;
        });
    }

    window.XWAge = { current: currentAge, apply: applyProfile };
    window.XWProfile = {
        camera: CAMERA_MODEL,
        age: currentAge,
        journalCount: currentJournalCount,
        apply: applyProfile
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyProfile, { once: true });
    } else {
        applyProfile();
    }
})();
