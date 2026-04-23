document.addEventListener('DOMContentLoaded', function () {
    // DOM elements
    const lifeGrid = document.getElementById('life-grid');
    const ageLabels = document.getElementById('age-labels');
    const weekLabels = document.getElementById('week-labels');
    const linesContainer = document.getElementById('lines-container');
    const themeToggle = document.getElementById('theme-toggle');
    const peopleListEl = document.getElementById('people-list');
    const statsPersonSelect = document.getElementById('stats-person-select');
    
    // Add Person Form elements
    const addPersonForm = document.querySelector('.add-person-form');
    const formTitle = document.getElementById('form-title');
    const newNameInput = document.getElementById('new-name');
    const newDobInput = document.getElementById('new-dob');
    const newLifespanInput = document.getElementById('new-lifespan');
    const newColorInput = document.getElementById('new-color');
    const addPersonButton = document.getElementById('add-person-button');
    const cancelEditButton = document.getElementById('cancel-edit-button');

    // Stats elements
    const weeksSinceEl = document.getElementById('weeks-since-birthday');
    const percentageThroughYearEl = document.getElementById('percentage-through-year');
    const percentageEl = document.getElementById('percentage-completed');
    const totalLivedEl = document.getElementById('total-lived');
    const totalLeftEl = document.getElementById('total-left');

    // Constants
    const BOX_SIZE = 8; 
    const GAP_SIZE = 3;
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const MS_PER_WEEK = MS_PER_DAY * 7;

    // State
    let people = [];
    let editingId = null;

    // --- Theme Handling ---
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

    // --- Data Persistence ---
    function savePeople() {
        localStorage.setItem('people_list', JSON.stringify(people));
    }

    function loadPeople() {
        const stored = localStorage.getItem('people_list');
        if (stored) {
            people = JSON.parse(stored);
        } else {
            // Legacy support
            const oldDob = localStorage.getItem('dob');
            const oldLifespan = localStorage.getItem('lifespan');
            if (oldDob && oldLifespan) {
                people = [{
                    id: Date.now(),
                    name: 'Me',
                    dob: oldDob,
                    lifespan: parseInt(oldLifespan),
                    color: '#8b5cf6'
                }];
                savePeople();
            }
        }
    }

    // --- Calculation Helpers ---
    function getStats(person, today = new Date()) {
        const dob = new Date(person.dob);
        const lifespan = person.lifespan;

        const lastBirthday = new Date(dob);
        lastBirthday.setFullYear(today.getFullYear());
        if (today < lastBirthday) {
            lastBirthday.setFullYear(today.getFullYear() - 1);
        }

        const nextBirthday = new Date(lastBirthday);
        nextBirthday.setFullYear(lastBirthday.getFullYear() + 1);

        const totalMsInYear = nextBirthday - lastBirthday;
        const elapsedMsInYear = today - lastBirthday;
        const percentageThroughYear = (elapsedMsInYear / totalMsInYear) * 100;

        const totalMsLived = today - dob;
        const totalDaysLived = Math.floor(totalMsLived / MS_PER_DAY);
        const totalWeeksLived = Math.floor(totalMsLived / MS_PER_WEEK);
        const totalMonthsLived = (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth());

        const deathDate = new Date(dob);
        deathDate.setFullYear(dob.getFullYear() + lifespan);
        const totalMsLeft = deathDate - today;
        const totalDaysLeft = Math.floor(totalMsLeft / MS_PER_DAY);
        const totalWeeksLeft = Math.floor(totalMsLeft / MS_PER_WEEK);
        const totalMonthsLeft = (deathDate.getFullYear() - today.getFullYear()) * 12 + (deathDate.getMonth() - today.getMonth());

        const age = Math.floor(totalDaysLived / 365.25);
        const weeksSinceBirthday = Math.floor(elapsedMsInYear / MS_PER_WEEK);
        const totalWeeksLivedGrid = (age * 52) + weeksSinceBirthday;
        const totalLifespanWeeks = lifespan * 52;
        
        return {
            weeksSinceBirthday,
            percentageThroughYear,
            totalWeeksLivedGrid,
            totalLifespanWeeks,
            lived: { days: totalDaysLived, weeks: totalWeeksLived, months: totalMonthsLived },
            left: { days: totalDaysLeft > 0 ? totalDaysLeft : 0, weeks: totalWeeksLeft > 0 ? totalWeeksLeft : 0, months: totalMonthsLeft > 0 ? totalMonthsLeft : 0 }
        };
    }

    // --- Rendering logic ---
    function renderPeopleList() {
        peopleListEl.innerHTML = '';
        const currentSelection = statsPersonSelect.value;
        statsPersonSelect.innerHTML = '<option value="summary">Summary</option>';
        
        people.forEach(p => {
            const tag = document.createElement('div');
            tag.className = 'person-tag';
            tag.innerHTML = `
                <div class="person-color-dot" style="background-color: ${p.color}"></div>
                <span>${p.name}</span>
                <div class="person-actions">
                    <button class="edit-person" data-id="${p.id}" title="Edit">✎</button>
                    <button class="remove-person" data-id="${p.id}" title="Remove">&times;</button>
                </div>
            `;
            peopleListEl.appendChild(tag);

            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.name;
            statsPersonSelect.appendChild(option);
        });

        // Restore selection if possible
        if (currentSelection && [...statsPersonSelect.options].some(opt => opt.value === currentSelection)) {
            statsPersonSelect.value = currentSelection;
        }

        document.querySelectorAll('.remove-person').forEach(btn => {
            btn.onclick = (e) => {
                const id = parseInt(e.target.dataset.id);
                people = people.filter(p => p.id !== id);
                if (editingId === id) cancelEdit();
                savePeople();
                updateAll();
            };
        });

        document.querySelectorAll('.edit-person').forEach(btn => {
            btn.onclick = (e) => {
                const id = parseInt(e.target.dataset.id);
                startEdit(id);
            };
        });
    }

    function startEdit(id) {
        const person = people.find(p => p.id === id);
        if (!person) return;

        editingId = id;
        newNameInput.value = person.name;
        newDobInput.value = person.dob;
        newLifespanInput.value = person.lifespan;
        newColorInput.value = person.color;

        formTitle.textContent = 'Edit Person';
        addPersonButton.textContent = 'Save Changes';
        cancelEditButton.style.display = 'block';
        addPersonForm.classList.add('editing');
        newNameInput.focus();
    }

    function cancelEdit() {
        editingId = null;
        newNameInput.value = '';
        newDobInput.value = '';
        newLifespanInput.value = '90';
        newColorInput.value = '#8b5cf6';
        
        formTitle.textContent = 'Add Person';
        addPersonButton.textContent = 'Add to Grid';
        cancelEditButton.style.display = 'none';
        addPersonForm.classList.remove('editing');
    }

    function renderGrid() {
        lifeGrid.innerHTML = '';
        ageLabels.innerHTML = '';
        weekLabels.innerHTML = '';
        linesContainer.innerHTML = '';

        if (people.length === 0) {
            lifeGrid.style.gridTemplateColumns = 'repeat(90, 8px)';
            return;
        }

        const today = new Date();
        const processedPeople = people.map(p => ({
            ...p,
            stats: getStats(p, today)
        }));

        const maxLifespan = Math.max(...processedPeople.map(p => p.lifespan));
        const maxLivedWeeks = Math.max(...processedPeople.map(p => p.stats.totalWeeksLivedGrid));
        const totalWeeksNeeded = maxLifespan * 52;

        lifeGrid.style.gridTemplateColumns = `repeat(${maxLifespan}, ${BOX_SIZE}px)`;
        ageLabels.style.gridTemplateColumns = `repeat(${maxLifespan}, ${BOX_SIZE}px)`;

        // Age labels
        for (let i = 0; i < maxLifespan; i++) {
            if (i % 5 === 0 || i === maxLifespan - 1) {
                const label = document.createElement('div');
                label.className = 'age-label';
                label.textContent = i;
                label.style.gridColumnStart = i + 1; 
                ageLabels.appendChild(label);
            }
        }

        // Week labels
        for (let i = 1; i <= 52; i++) {
            const label = document.createElement('div');
            label.className = 'week-label';
            label.textContent = (i === 1 || i % 5 === 0 || i === 52) ? i : ''; 
            weekLabels.appendChild(label);
        }

        // --- GRID PRIORITY LOGIC ---
        const sortedByLived = [...processedPeople].sort((a, b) => a.stats.totalWeeksLivedGrid - b.stats.totalWeeksLivedGrid);
        const sortedByLifespan = [...processedPeople].sort((a, b) => a.lifespan - b.lifespan);

        for (let i = 0; i < totalWeeksNeeded; i++) {
            const box = document.createElement('div');
            box.className = 'square';
            const isLived = i < maxLivedWeeks;
            
            if (isLived) {
                const person = sortedByLived.find(p => i < p.stats.totalWeeksLivedGrid);
                if (person) {
                    box.classList.add('filled');
                    box.style.backgroundColor = person.color;
                    box.style.borderColor = person.color;
                }
            } else {
                const person = sortedByLifespan.find(p => i < p.stats.totalLifespanWeeks);
                if (person) {
                    box.style.backgroundColor = person.color + '22';
                    box.style.borderColor = person.color + '44';
                }
            }
            lifeGrid.appendChild(box);
        }

        // --- MULTIPLE WEEK LINES ---
        const selectedId = statsPersonSelect.value;
        processedPeople.forEach(p => {
            const line = document.createElement('div');
            line.className = 'week-line';
            const isActive = p.id == selectedId || (selectedId === 'summary' && p === processedPeople[0]);
            if (isActive) line.classList.add('active');
            
            const lineTop = p.stats.weeksSinceBirthday * (BOX_SIZE + GAP_SIZE);
            line.style.top = `${lineTop}px`;
            line.style.backgroundColor = p.color;
            if (isActive) line.style.boxShadow = `0 0 8px ${p.color}`;
            
            linesContainer.appendChild(line);
        });
    }

    function updateStats() {
        const selectedId = statsPersonSelect.value;
        const focusPerson = people.find(p => p.id == selectedId);

        if (focusPerson) {
            const stats = getStats(focusPerson);
            weeksSinceEl.innerHTML = `Weeks since ${focusPerson.name}'s last birthday: <strong>${stats.weeksSinceBirthday}</strong>`;
            percentageThroughYearEl.innerHTML = `Percentage through current year: <strong>${stats.percentageThroughYear.toFixed(2)}%</strong>`;
            percentageEl.innerHTML = `Total life completed: <strong>${((stats.lived.weeks / (stats.lived.weeks + stats.left.weeks)) * 100).toFixed(2)}%</strong>`;
            totalLivedEl.innerHTML = `${focusPerson.name} has lived for: <strong>${stats.lived.months.toLocaleString()}</strong> months, <strong>${stats.lived.weeks.toLocaleString()}</strong> weeks, or <strong>${stats.lived.days.toLocaleString()}</strong> days.`;
            totalLeftEl.innerHTML = `${focusPerson.name} has left (est.): <strong>${stats.left.months.toLocaleString()}</strong> months, <strong>${stats.left.weeks.toLocaleString()}</strong> weeks, or <strong>${stats.left.days.toLocaleString()}</strong> days.`;
        } else if (people.length > 0) {
            // Summary mode
            const totalLivedDays = people.reduce((acc, p) => acc + getStats(p).lived.days, 0);
            const avgAge = people.reduce((acc, p) => acc + (getStats(p).lived.days / 365.25), 0) / people.length;
            
            // Average Birthday
            const avgBirthTimestamp = people.reduce((acc, p) => acc + new Date(p.dob).getTime(), 0) / people.length;
            const avgBirthDate = new Date(avgBirthTimestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            
            // Average Lifespan
            const avgLifespan = people.reduce((acc, p) => acc + p.lifespan, 0) / people.length;

            weeksSinceEl.innerHTML = `Tracking <strong>${people.length}</strong> people.`;
            percentageThroughYearEl.innerHTML = `Average Birth Date: <strong>${avgBirthDate}</strong>`;
            percentageEl.innerHTML = `Average Lifespan: <strong>${avgLifespan.toFixed(1)}</strong> years.`;
            totalLivedEl.innerHTML = `Combined days lived: <strong>${totalLivedDays.toLocaleString()}</strong> days (Avg age: ${avgAge.toFixed(1)}).`;
            totalLeftEl.innerHTML = `Multiple lines on the grid show everyone's current week.`;
        } else {
            weeksSinceEl.innerHTML = `Add someone to see their journey.`;
            percentageThroughYearEl.innerHTML = `--`;
            percentageEl.innerHTML = `--`;
            totalLivedEl.innerHTML = `--`;
            totalLeftEl.innerHTML = `--`;
        }
    }

    function updateAll() {
        renderPeopleList();
        renderGrid();
        updateStats();
    }

    function getNextColor() {
        const presets = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#10b981', '#6366f1', '#f43f5e', '#eab308', '#a855f7', '#0ea5e9'];
        const usedColors = people.map(p => p.color.toLowerCase());
        
        // Try to find an unused preset
        const unusedPreset = presets.find(c => !usedColors.includes(c.toLowerCase()));
        if (unusedPreset) return unusedPreset;
        
        // Otherwise generate a random HSL color for variety
        const hue = Math.floor(Math.random() * 360);
        return `hsl(${hue}, 70%, 60%)`; // Convert this to hex for the input[type=color]?
        // Wait, input[type=color] requires hex. Let's use a hex generator.
    }

    // Helper to convert HSL to Hex
    function hslToHex(h, s, l) {
        l /= 100;
        const a = s * Math.min(l, 1 - l) / 100;
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }

    function generateUniqueColor() {
        const presets = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#10b981', '#6366f1', '#f43f5e', '#eab308', '#a855f7', '#0ea5e9'];
        const usedColors = people.map(p => p.color.toLowerCase());
        
        const unusedPreset = presets.find(c => !usedColors.includes(c.toLowerCase()));
        if (unusedPreset) return unusedPreset;

        // Random HSL to Hex
        return hslToHex(Math.floor(Math.random() * 360), 70, 60);
    }

    // --- Event Handlers ---
    addPersonButton.addEventListener('click', () => {
        const name = newNameInput.value.trim() || `Person ${people.length + 1}`;
        const dob = newDobInput.value;
        const lifespan = parseInt(newLifespanInput.value);
        const color = newColorInput.value;

        if (!dob || !lifespan || lifespan <= 0) {
            alert('Please enter a valid date of birth and lifespan.');
            return;
        }

        if (editingId) {
            // Update existing
            const index = people.findIndex(p => p.id === editingId);
            if (index !== -1) {
                people[index] = { ...people[index], name, dob, lifespan, color };
            }
            editingId = null;
        } else {
            // Add new
            const newPerson = { id: Date.now(), name, dob, lifespan, color };
            people.push(newPerson);
        }

        savePeople();
        cancelEdit(); // Reset form
        
        // Cycle to next color for the next person
        newColorInput.value = generateUniqueColor();
        
        updateAll();
    });

    cancelEditButton.addEventListener('click', cancelEdit);

    statsPersonSelect.addEventListener('change', () => {
        updateStats();
        renderGrid();
    });

    // --- Initial Load ---
    function initialize() {
        loadPeople();
        const thirtyYearsAgo = new Date();
        thirtyYearsAgo.setFullYear(thirtyYearsAgo.getFullYear() - 30);
        newDobInput.value = thirtyYearsAgo.toISOString().split('T')[0];
        
        // Initial color
        newColorInput.value = generateUniqueColor();
        
        updateAll();
    }

    initialize();
});