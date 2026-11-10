/** Shared insertion protocol. Positions always refer to the original snapshot. */
export function insertionLines(original) {
    return String(original).match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(line => line !== '') || [];
}

export function validateInsertions(original, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).some(key => key !== 'additions') || !Array.isArray(value.additions) ||
        value.additions.length > 50) throw new Error('Expected JSON with an additions array (at most 50 insertions).');
    const lines = insertionLines(original);
    const protectedPositions = new Set();
    let fence = null;
    lines.forEach((line, index) => {
        const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)/);
        if (match) {
            if (!fence) fence = match[1];
            else if (match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) fence = null;
        }
        if (fence) protectedPositions.add(index + 1);
    });
    let size = 0;
    for (const addition of value.additions) {
        if (!addition || typeof addition !== 'object' || Array.isArray(addition) ||
            Object.keys(addition).some(key => !['afterLine', 'text'].includes(key)) ||
            !Number.isInteger(addition.afterLine) || addition.afterLine < 0 || addition.afterLine > lines.length ||
            typeof addition.text !== 'string' || !addition.text.trim()) {
            throw new Error('An insertion has invalid text or an out-of-range line position.');
        }
        if (protectedPositions.has(addition.afterLine)) throw new Error('An insertion targets the inside of a protected code or list block.');
        size += addition.text.length;
        if (size > 100000) throw new Error('The additions are too large (maximum 100,000 characters).');
    }
    return value.additions.map(({ afterLine, text }) => ({ afterLine, text }));
}

export function parseInsertions(original, text) {
    const raw = String(text).trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error('The AI returned invalid insertion JSON. No changes were applied.'); }
    return validateInsertions(original, value);
}

/** Existing bytes are copied verbatim; only new separators and text are inserted. */
export function insertAdditions(original, additions, transform = text => text) {
    validateInsertions(original, { additions });
    const lines = insertionLines(original);
    const newline = String(original).match(/\r\n|\r|\n/)?.[0] || '\n';
    const groups = new Map();
    for (const addition of additions) {
        const list = groups.get(addition.afterLine) || [];
        list.push(transform(addition.text).replace(/\r\n|\r|\n/g, newline));
        groups.set(addition.afterLine, list);
    }
    let result = '';
    for (let position = 0; position <= lines.length; position += 1) {
        if (position > 0) result += lines[position - 1];
        for (const text of groups.get(position) || []) {
            if (result && !/[\r\n]$/.test(result)) result += newline;
            result += text;
            if (!/[\r\n]$/.test(text)) result += newline;
        }
    }
    return result;
}
