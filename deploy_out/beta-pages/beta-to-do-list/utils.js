// --- UTILS ---

export function generateId() {
    return 'id-' + Math.random().toString(36).substr(2, 9);
}

export function escapeHtml(text) {
    if (!text) return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function showToast(msg, type = 'warning') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const icon = toast.querySelector('i');

    toast.className = `toast ${type}`; // Reset classes
    toastMessage.innerText = msg;

    // Icon logic
    if (type === 'success') {
        icon.className = 'ph ph-check-circle';
    } else if (type === 'warning') {
        icon.className = 'ph ph-warning';
    } else {
        icon.className = 'ph ph-info';
    }

    toast.classList.remove('hidden');

    setTimeout(() => { toast.classList.add('hidden'); }, 3000);
}

/**
 * Parses and processes CSV text for Todoist import
 * @param {string} csvText 
 * @returns {Array} List of list objects prepared for import
 */
export function parseTodoistCSV(csvText) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    // Normalize newlines
    const chars = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        const nextChar = chars[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = '';
        } else if (char === '\n' && !inQuotes) {
            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = '';
        } else {
            currentCell += char;
        }
    }
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }

    return rows;
}
