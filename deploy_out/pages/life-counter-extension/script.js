document.addEventListener('DOMContentLoaded', function () {
    // DOM elements
    const lifeGrid = document.getElementById('life-grid');
    const ageLabels = document.getElementById('age-labels');
    const weekLabels = document.getElementById('week-labels');
    const currentWeekLine = document.getElementById('current-week-line');
    const saveButton = document.getElementById('save-button');
    const themeToggle = document.getElementById('theme-toggle');
    const dobInput = document.getElementById('dob');
    const lifespanInput = document.getElementById('lifespan');

    // Stats elements
    const weeksSinceEl = document.getElementById('weeks-since-birthday');
    const percentageThroughYearEl = document.getElementById('percentage-through-year');
    const percentageEl = document.getElementById('percentage-completed');
    const totalLivedEl = document.getElementById('total-lived');
    const totalLeftEl = document.getElementById('total-left');

    // State
    let dateOfBirth;
    let predictedLifespan;

    // Theme handling
    function setTheme(theme) {
        if (theme === 'light') {
            document.body.classList.add('light-mode');
            themeToggle.textContent = 'Switch to Dark Mode';
        } else {
            document.body.classList.remove('light-mode');
            themeToggle.textContent = 'Switch to Light Mode';
        }
        localStorage.setItem('theme', theme);
    }
    themeToggle.addEventListener('click', () => {
        setTheme(document.body.classList.contains('light-mode') ? 'dark' : 'light');
    });
    setTheme(localStorage.getItem('theme') || 'dark');

    // --- Calculation Helpers ---
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const MS_PER_WEEK = MS_PER_DAY * 7;

    function calculateStats(today, dob, lifespan) {
        const lastBirthday = new Date(dob);
        lastBirthday.setFullYear(today.getFullYear());
        if (today < lastBirthday) {
            lastBirthday.setFullYear(today.getFullYear() - 1);
        }

        const nextBirthday = new Date(lastBirthday);
        nextBirthday.setFullYear(lastBirthday.getFullYear() + 1);

        // --- NEW METRIC: Percentage through current year ---
        const totalMsInYear = nextBirthday - lastBirthday;
        const elapsedMsInYear = today - lastBirthday;
        const percentageThroughYear = (elapsedMsInYear / totalMsInYear) * 100;

        // --- LIVED STATS ---
        const totalMsLived = today - dob;
        const totalDaysLived = Math.floor(totalMsLived / MS_PER_DAY);
        const totalWeeksLived = Math.floor(totalMsLived / MS_PER_WEEK);
        const totalMonthsLived = (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth());

        // --- LEFT STATS ---
        const deathDate = new Date(dob);
        deathDate.setFullYear(dob.getFullYear() + lifespan);
        const totalMsLeft = deathDate - today;
        const totalDaysLeft = Math.floor(totalMsLeft / MS_PER_DAY);
        const totalWeeksLeft = Math.floor(totalMsLeft / MS_PER_WEEK);
        const totalMonthsLeft = (deathDate.getFullYear() - today.getFullYear()) * 12 + (deathDate.getMonth() - today.getMonth());

        // --- Original Grid Stats ---
        const age = Math.floor(totalDaysLived / 365.25);
        const weeksSinceBirthday = Math.floor(elapsedMsInYear / MS_PER_WEEK);
        const totalLifespanWeeks = lifespan * 52;
        
        return {
            weeksSinceBirthday,
            percentageThroughYear,
            totalWeeksLivedGrid: (age * 52) + weeksSinceBirthday, // For grid filling
            totalLifespanWeeks,
            lived: {
                days: totalDaysLived,
                weeks: totalWeeksLived,
                months: totalMonthsLived
            },
            left: {
                days: totalDaysLeft > 0 ? totalDaysLeft : 0,
                weeks: totalWeeksLeft > 0 ? totalWeeksLeft : 0,
                months: totalMonthsLeft > 0 ? totalMonthsLeft : 0
            }
        };
    }

    // --- Main Render Function ---
    function renderGrid(lifespan, today) {
        if (!dateOfBirth || !lifespan) return;

        lifeGrid.innerHTML = '';
        ageLabels.innerHTML = '';
        weekLabels.innerHTML = '';

        const BOX_SIZE = 8; 
        const GAP_SIZE = 3;
        
        lifeGrid.style.gridTemplateColumns = `repeat(${lifespan}, ${BOX_SIZE}px)`;
        ageLabels.style.gridTemplateColumns = `repeat(${lifespan}, ${BOX_SIZE}px)`;

        for (let i = 0; i < lifespan; i++) {
            if (i % 5 === 0 || i === lifespan - 1) {
                 const label = document.createElement('div');
                 label.className = 'age-label';
                 label.textContent = i;
                 label.style.gridColumnStart = i + 1; 
                 ageLabels.appendChild(label);
            }
        }

        for (let i = 1; i <= 52; i++) {
            const label = document.createElement('div');
            label.className = 'week-label';
            label.textContent = (i === 1 || i % 5 === 0 || i === 52) ? i : ''; 
            weekLabels.appendChild(label);
        }

        const stats = calculateStats(today, dateOfBirth, lifespan);

        for (let i = 0; i < stats.totalLifespanWeeks; i++) {
            const box = document.createElement('div');
            box.className = 'square';
            if (i < stats.totalWeeksLivedGrid) {
                box.classList.add('filled');
            }
            lifeGrid.appendChild(box);
        }

        const lineTop = stats.weeksSinceBirthday * (BOX_SIZE + GAP_SIZE);
        currentWeekLine.style.top = `${lineTop}px`;

        // --- UPDATE ALL STATS TEXT ---
        weeksSinceEl.innerHTML = `Weeks since last birthday: <strong>${stats.weeksSinceBirthday}</strong>`;
        percentageThroughYearEl.innerHTML = `Percentage through current year: <strong>${stats.percentageThroughYear.toFixed(2)}%</strong>`;
        percentageEl.innerHTML = `Total life completed: <strong>${((stats.lived.weeks / (stats.lived.weeks + stats.left.weeks)) * 100).toFixed(2)}%</strong>`;
        totalLivedEl.innerHTML = `You have lived for: <strong>${stats.lived.months.toLocaleString()}</strong> months, <strong>${stats.lived.weeks.toLocaleString()}</strong> weeks, or <strong>${stats.lived.days.toLocaleString()}</strong> days.`;
        totalLeftEl.innerHTML = `You have left (est.): <strong>${stats.left.months.toLocaleString()}</strong> months, <strong>${stats.left.weeks.toLocaleString()}</strong> weeks, or <strong>${stats.left.days.toLocaleString()}</strong> days.`;
    }

    // --- Event Handlers ---
    saveButton.addEventListener('click', () => {
        const dobVal = dobInput.value;
        const lifeVal = parseInt(lifespanInput.value);

        if (!dobVal || !lifeVal || lifeVal <= 0) {
            alert('Please enter a valid date and a positive lifespan.');
            return;
        }
        
        dateOfBirth = new Date(dobVal);
        predictedLifespan = lifeVal;

        localStorage.setItem('dob', dobVal);
        localStorage.setItem('lifespan', lifeVal);

        renderGrid(predictedLifespan, new Date());
    });

    // --- Initial Load ---
    function initialize() {
        const storedDob = localStorage.getItem('dob');
        const storedLifespan = localStorage.getItem('lifespan');
        
        if (storedDob && storedLifespan) {
            dobInput.value = storedDob;
            lifespanInput.value = storedLifespan;
            dateOfBirth = new Date(storedDob);
            predictedLifespan = parseInt(storedLifespan);
        } else {
            const today = new Date();
            const defaultDob = new Date(today);
            defaultDob.setFullYear(today.getFullYear() - 40);
            defaultDob.setMonth(today.getMonth() - 6);

            predictedLifespan = 82;
            dateOfBirth = defaultDob;

            dobInput.value = defaultDob.toISOString().split('T')[0];
            lifespanInput.value = predictedLifespan;
        }

        renderGrid(predictedLifespan, new Date());
    }

    initialize();
});