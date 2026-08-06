(function () {
    const STORAGE_KEY = 'ai-credit-calculator-history-v1';
    const MAX_SAVED = 40;

    const form = document.getElementById('creditForm');
    const amountPaidEl = document.getElementById('amountPaid');
    const creditsBoughtEl = document.getElementById('creditsBought');
    const taskCreditsEl = document.getElementById('taskCredits');
    const currencyEl = document.getElementById('currency');
    const saveInputsBtn = document.getElementById('saveInputsBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const historyBody = document.getElementById('historyBody');
    const historyTable = document.getElementById('historyTable');
    const historyEmpty = document.getElementById('historyEmpty');

    const taskCostEl = document.getElementById('taskCost');
    const runsPossibleEl = document.getElementById('runsPossible');
    const pricePerCreditEl = document.getElementById('pricePerCredit');
    const creditsPerUnitEl = document.getElementById('creditsPerUnit');
    const creditsPerUnitLabelEl = document.getElementById('creditsPerUnitLabel');
    const creditsLeftOneEl = document.getElementById('creditsLeftOne');
    const creditsLeftAllEl = document.getElementById('creditsLeftAll');
    const summaryEl = document.getElementById('summary');

    const currencySymbols = {
        GBP: '£',
        USD: '$',
        EUR: '€'
    };

    function formatMoney(value, currency) {
        const formatter = new Intl.NumberFormat(currency === 'USD' ? 'en-US' : currency === 'EUR' ? 'en-IE' : 'en-GB', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return formatter.format(value);
    }

    /** Tiny unit prices (e.g. £20 / 222000 credits) need more than 2dp or they round to £0.00 */
    function formatUnitPrice(value, currency) {
        const symbol = currencySymbols[currency] || '£';
        if (!Number.isFinite(value) || value <= 0) return symbol + '0';

        let digits = 2;
        if (value < 0.01) digits = 4;
        if (value < 0.0001) digits = 6;
        if (value < 0.000001) digits = 8;

        return (
            symbol +
            value.toLocaleString('en-GB', {
                minimumFractionDigits: digits,
                maximumFractionDigits: digits
            })
        );
    }

    function formatNumber(value) {
        return new Intl.NumberFormat('en-GB', {
            maximumFractionDigits: value < 1 ? 6 : 2
        }).format(value);
    }

    function formatSavedAt(iso) {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function parsePositive(value) {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    function readHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            return [];
        }
    }

    function writeHistory(entries) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }

    function sameInputs(a, b) {
        return (
            a.currency === b.currency &&
            Number(a.amountPaid) === Number(b.amountPaid) &&
            Number(a.creditsBought) === Number(b.creditsBought) &&
            Number(a.taskCredits) === Number(b.taskCredits)
        );
    }

    function getCurrentInputs() {
        const amountPaid = parsePositive(amountPaidEl.value);
        const creditsBought = parsePositive(creditsBoughtEl.value);
        const taskCredits = parsePositive(taskCreditsEl.value);
        if (amountPaid === null || creditsBought === null || taskCredits === null) return null;

        return {
            currency: currencyEl.value,
            amountPaid: amountPaid,
            creditsBought: creditsBought,
            taskCredits: taskCredits
        };
    }

    function applyInputs(entry) {
        currencyEl.value = entry.currency || 'GBP';
        amountPaidEl.value = entry.amountPaid;
        creditsBoughtEl.value = entry.creditsBought;
        taskCreditsEl.value = entry.taskCredits;
        calculate();
        amountPaidEl.focus();
    }

    function renderHistory() {
        const entries = readHistory();
        historyBody.replaceChildren();

        const hasEntries = entries.length > 0;
        historyEmpty.hidden = hasEntries;
        historyTable.hidden = !hasEntries;
        clearHistoryBtn.hidden = !hasEntries;

        entries.forEach(function (entry) {
            const tr = document.createElement('tr');

            const paidTd = document.createElement('td');
            paidTd.textContent = formatMoney(Number(entry.amountPaid), entry.currency || 'GBP');

            const creditsTd = document.createElement('td');
            creditsTd.textContent = formatNumber(Number(entry.creditsBought));

            const taskTd = document.createElement('td');
            taskTd.textContent = formatNumber(Number(entry.taskCredits));

            const savedTd = document.createElement('td');
            savedTd.textContent = formatSavedAt(entry.savedAt);

            const actionsTd = document.createElement('td');
            const actions = document.createElement('div');
            actions.className = 'history-actions';

            const useBtn = document.createElement('button');
            useBtn.type = 'button';
            useBtn.className = 'btn-glass btn-table';
            useBtn.textContent = 'Use';
            useBtn.title = 'Repopulate inputs with these values';
            useBtn.addEventListener('click', function () {
                applyInputs(entry);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn-glass btn-table btn-table-danger';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', function () {
                const next = readHistory().filter(function (item) {
                    return item.id !== entry.id;
                });
                writeHistory(next);
                renderHistory();
            });

            actions.append(useBtn, deleteBtn);
            actionsTd.append(actions);
            tr.append(paidTd, creditsTd, taskTd, savedTd, actionsTd);
            historyBody.append(tr);
        });
    }

    function saveCurrentInputs() {
        const inputs = getCurrentInputs();
        if (!inputs) {
            summaryEl.textContent = 'Enter positive values before saving.';
            return;
        }

        let entries = readHistory().filter(function (entry) {
            return !sameInputs(entry, inputs);
        });

        entries.unshift({
            id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
            savedAt: new Date().toISOString(),
            currency: inputs.currency,
            amountPaid: inputs.amountPaid,
            creditsBought: inputs.creditsBought,
            taskCredits: inputs.taskCredits
        });

        if (entries.length > MAX_SAVED) {
            entries = entries.slice(0, MAX_SAVED);
        }

        writeHistory(entries);
        renderHistory();
        saveInputsBtn.textContent = 'Saved';
        window.setTimeout(function () {
            saveInputsBtn.textContent = 'Save inputs';
        }, 1200);
    }

    function resetResults(message) {
        taskCostEl.textContent = '—';
        runsPossibleEl.textContent = '—';
        pricePerCreditEl.textContent = '—';
        creditsPerUnitEl.textContent = '—';
        creditsLeftOneEl.textContent = '—';
        creditsLeftAllEl.textContent = '—';
        summaryEl.textContent = message;
    }

    function calculate() {
        const amountPaid = parsePositive(amountPaidEl.value);
        const creditsBought = parsePositive(creditsBoughtEl.value);
        const taskCredits = parsePositive(taskCreditsEl.value);
        const currency = currencyEl.value;
        const symbol = currencySymbols[currency] || '£';

        creditsPerUnitLabelEl.textContent = 'Credits per ' + symbol + '1';

        if (amountPaid === null || creditsBought === null || taskCredits === null) {
            resetResults('Enter positive values for amount paid, credits bought, and task credits.');
            return;
        }

        const pricePerCredit = amountPaid / creditsBought;
        const creditsPerUnit = creditsBought / amountPaid;
        const taskCost = pricePerCredit * taskCredits;
        const runsPossible = Math.floor(creditsBought / taskCredits);
        const creditsLeftOne = creditsBought - taskCredits;
        const creditsLeftAll = creditsBought - runsPossible * taskCredits;

        taskCostEl.textContent = formatMoney(taskCost, currency);
        runsPossibleEl.textContent = formatNumber(runsPossible);
        pricePerCreditEl.textContent = formatUnitPrice(pricePerCredit, currency);
        creditsPerUnitEl.textContent = formatNumber(creditsPerUnit);

        if (runsPossible < 1) {
            creditsLeftOneEl.textContent = 'Can’t run';
            creditsLeftAllEl.textContent = formatNumber(creditsBought);
            summaryEl.innerHTML =
                `This task needs <strong>${formatNumber(taskCredits)}</strong> credits, ` +
                `but your pack only has <strong>${formatNumber(creditsBought)}</strong>.`;
            return;
        }

        creditsLeftOneEl.textContent = formatNumber(creditsLeftOne);
        creditsLeftAllEl.textContent = formatNumber(creditsLeftAll);

        const runWord = runsPossible === 1 ? 'time' : 'times';
        summaryEl.innerHTML =
            `At <span class="highlight">${formatUnitPrice(pricePerCredit, currency)}</span> per credit, ` +
            `this task costs <strong>${formatMoney(taskCost, currency)}</strong>. ` +
            `After one run you’d have <strong>${formatNumber(creditsLeftOne)}</strong> credits left. ` +
            `Spend the whole pack on it and you can run it <strong>${formatNumber(runsPossible)}</strong> ${runWord}` +
            (creditsLeftAll > 0
                ? `, with <strong>${formatNumber(creditsLeftAll)}</strong> left over.`
                : `.`);
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        calculate();
    });

    saveInputsBtn.addEventListener('click', saveCurrentInputs);

    clearHistoryBtn.addEventListener('click', function () {
        if (!window.confirm('Clear all saved inputs from this browser?')) return;
        writeHistory([]);
        renderHistory();
    });

    [amountPaidEl, creditsBoughtEl, taskCreditsEl, currencyEl].forEach(function (el) {
        el.addEventListener('input', calculate);
        el.addEventListener('change', calculate);
    });

    renderHistory();
    calculate();
})();
