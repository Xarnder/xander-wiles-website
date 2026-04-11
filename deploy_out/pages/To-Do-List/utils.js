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
/**
 * Formats a timestamp into a readable date and time string.
 * @param {number} timestamp 
 * @returns {string} Formatted date string
 */
export function formatDateTime(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}
/**
 * Returns the correct term (e.g. task vs idea) based on APP_CONFIG.
 * @param {boolean} singular 
 * @param {boolean} capitalize 
 * @returns {string} The appropriate term
 */
export function getTerm(singular = true, capitalize = false) {
    const config = window.APP_CONFIG || {};
    const terms = config.terms || { singular: 'task', plural: 'tasks' };
    let term = singular ? terms.singular : terms.plural;
    
    if (capitalize) {
        term = term.charAt(0).toUpperCase() + term.slice(1);
    }
    return term;
}

/**
 * Parses indented text (markdown-style) into a recursive structure.
 * @param {string} text 
 * @returns {Array} Recursive array of {text, nestedIdeas: []}
 */
export function parseNestedMarkdown(text) {
    if (!text) return [];
    const lines = text.split('\n').filter(l => l.trim() !== '');
    const result = [];
    const stack = [{ indent: -1, children: result }];

    lines.forEach(line => {
        const indentMatch = line.match(/^(\s*)/);
        // Treat tabs as 4 spaces for consistency
        const indent = indentMatch ? indentMatch[1].replace(/\t/g, '    ').length : 0;
        const cleanText = line.trim().replace(/^[-*+]\s+/, '');

        if (!cleanText) return;

        const newItem = { text: cleanText, nestedIdeas: [] };

        // Pop until we find the parent level
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }

        stack[stack.length - 1].children.push(newItem);
        stack.push({ indent: indent, children: newItem.nestedIdeas });
    });

    return result;
}
/**
 * Toggles native browser spellcheck on an element.
 * @param {HTMLElement} el 
 * @param {boolean} state 
 */
export function toggleSpellcheck(el, state) {
    if (!el) return;
    el.setAttribute('spellcheck', state ? 'true' : 'false');
}

/**
 * Copies text to the clipboard with high compatibility (including iOS).
 * @param {string} text 
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
    if (!text) return false;

    // Modern API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Clipboard API failed, falling back...', err);
        }
    }

    // Fallback: Temporary textarea
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        
        // Ensure it's not visible but exists in DOM
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) {
        console.error('Fallback copy failed:', err);
        return false;
    }
}

/**
 * Checks if the user is currently typing in an input or textarea.
 * @returns {boolean}
 */
export function isUserTyping() {
    const el = document.activeElement;
    if (!el) return false;
    const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
    const hasValue = el.value && el.value.trim().length > 0;
    return isInput && hasValue;
}
