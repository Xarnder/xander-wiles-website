/**
 * Basic CSV detection, parsing, and writing.
 * Preserves raw cell text, including formulas evaluated by csv-formulas.js.
 */

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_NATIVE_PREFIX = 'application/vnd.google-apps.';

/**
 * A CSV file: text/csv (or a .csv name), never a folder, Google Doc, note, or PDF.
 * `notes.csv.md` stays markdown. `notes.md.csv` is CSV.
 * @param {{ mimeType?: string, name?: string } | null | undefined} file
 */
export function isCsvFile(file) {
    if (!file || file.mimeType === FOLDER_MIME) return false;
    if (file.mimeType?.startsWith(GOOGLE_NATIVE_PREFIX)) return false;
    const name = String(file.name || '').toLowerCase();
    if (name.endsWith('.md') || name.endsWith('.markdown')) return false;
    if (name.endsWith('.pdf') || file.mimeType === 'application/pdf') return false;
    if (
        file.mimeType === 'text/csv' ||
        file.mimeType === 'application/csv' ||
        file.mimeType === 'text/comma-separated-values'
    ) {
        return true;
    }
    return name.endsWith('.csv');
}

/**
 * Pick a delimiter from the first record. Comma wins ties.
 * @param {string} text
 * @returns {',' | ';' | '\t'}
 */
export function detectCsvDelimiter(text) {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQuotes = false;
    const source = String(text ?? '');
    for (let i = 0; i < source.length; i += 1) {
        const ch = source[i];
        if (inQuotes) {
            if (ch === '"') {
                if (source[i + 1] === '"') {
                    i += 1;
                    continue;
                }
                inQuotes = false;
            }
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            continue;
        }
        if (ch === '\n') break;
        if (Object.prototype.hasOwnProperty.call(counts, ch)) counts[ch] += 1;
    }
    let best = ',';
    let bestCount = counts[','];
    if (counts[';'] > bestCount) {
        best = ';';
        bestCount = counts[';'];
    }
    if (counts['\t'] > bestCount) best = '\t';
    return best;
}

/**
 * @param {string} text
 * @returns {{ rows: string[][], delimiter: ',' | ';' | '\t', bom: boolean, trailingNewline: boolean }}
 */
export function parseCsv(text) {
    const raw = String(text ?? '');
    const bom = raw.charCodeAt(0) === 0xfeff;
    const body = bom ? raw.slice(1) : raw;
    const delimiter = detectCsvDelimiter(body);
    /** @type {string[][]} */
    const rows = [];
    /** @type {string[]} */
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < body.length; i += 1) {
        const ch = body[i];
        if (inQuotes) {
            if (ch === '"') {
                if (body[i + 1] === '"') {
                    field += '"';
                    i += 1;
                    continue;
                }
                inQuotes = false;
                continue;
            }
            if (ch !== '\r') field += ch;
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            continue;
        }
        if (ch === delimiter) {
            row.push(field);
            field = '';
            continue;
        }
        if (ch === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            continue;
        }
        if (ch === '\r') continue;
        field += ch;
    }

    if (field.length || row.length) {
        row.push(field);
        rows.push(row);
    }
    if (!rows.length) rows.push(['']);

    return {
        rows,
        delimiter,
        bom,
        trailingNewline: body.endsWith('\n'),
    };
}

/**
 * @param {string} value
 * @param {string} delimiter
 */
function escapeCsvField(value, delimiter) {
    const text = String(value ?? '');
    if (text.includes('"') || text.includes('\n') || text.includes(delimiter)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

/**
 * @param {string[][]} rows
 * @param {string} [delimiter]
 * @param {{ bom?: boolean, trailingNewline?: boolean }} [options]
 */
/**
 * Write pasted text into a grid. A single value stays in one cell.
 * Tabs or newlines spread across cells, starting at rowIndex, colIndex.
 * @param {string[][]} rows
 * @param {number} rowIndex
 * @param {number} colIndex
 * @param {string} text
 * @returns {{ rows: string[][], focusRow: number, focusCol: number }}
 */
export function pasteIntoRows(rows, rowIndex, colIndex, text) {
    const source = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const r0 = Math.max(0, Number(rowIndex) || 0);
    const c0 = Math.max(0, Number(colIndex) || 0);
    const next = (Array.isArray(rows) ? rows : [['']]).map((row) =>
        Array.isArray(row) ? [...row] : ['']
    );
    if (!next.length) next.push(['']);

    const place = (r, c, value) => {
        while (next.length <= r) next.push([]);
        const row = next[r];
        while (row.length <= c) row.push('');
        row[c] = value;
    };

    const multi = source.includes('\n') || source.includes('\t');
    if (!multi) {
        place(r0, c0, source);
        return { rows: next, focusRow: r0, focusCol: c0 };
    }

    const parsed = parseCsv(source);
    let focusRow = r0;
    let focusCol = c0;
    parsed.rows.forEach((blockRow, dr) => {
        blockRow.forEach((value, dc) => {
            focusRow = r0 + dr;
            focusCol = c0 + dc;
            place(focusRow, focusCol, value);
        });
    });
    return { rows: next, focusRow, focusCol };
}

/**
 * @param {string[][]} rows
 * @param {string} [delimiter]
 * @param {{ bom?: boolean, trailingNewline?: boolean }} [options]
 */
export function serializeCsv(rows, delimiter = ',', options = {}) {
    const sep = delimiter === ';' || delimiter === '\t' ? delimiter : ',';
    const source = Array.isArray(rows) && rows.length ? rows : [['']];
    const lines = source.map((row) => {
        const cells = Array.isArray(row) && row.length ? row : [''];
        return cells.map((cell) => escapeCsvField(cell, sep)).join(sep);
    });
    let text = lines.join('\n');
    if (options.trailingNewline) text += '\n';
    if (options.bom) text = `\uFEFF${text}`;
    return text;
}

/** Convert a purchase checklist to cells on paste; ignore prose and existing totals. */
export function purchaseMarkdownRows(text, startRow = 0, startCol = 0) {
    const items = [];
    for (const line of String(text).split(/\r?\n/)) {
        const bullet = /^\s*[-*+]\s+(?:\[[ xX]\]\s*)?(.+)$/.exec(line);
        if (!bullet) continue;
        const date = /\{\{?date:(\d{4}-\d{2}-\d{2})\}\}?/.exec(bullet[1]);
        const clean = bullet[1].replace(/\{\{?date:[^}]+\}\}?/g, '').trim();
        const price = /\s+-\s*([$£€])\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*$/.exec(clean);
        if (!price) return null; // Do not silently drop unrecognised list items.
        items.push([clean.slice(0, price.index).trim(), date?.[1] ?? '', price[1], price[2].replaceAll(',', '')]);
    }
    if (!items.length) return null;
    const currencies = [...new Set(items.map(item => item[2]))];
    const result = [['Item', 'Date', ...currencies.map(c => ({ '$': 'USD', '£': 'GBP', '€': 'EUR' })[c])],
        ...items.map(([name, date, currency, cost]) => [name, date, ...currencies.map(c => c === currency ? cost : '')])];
    const label = index => {
        let value = ''; for (index++; index; index = Math.floor((index - 1) / 26)) value = String.fromCharCode(65 + (index - 1) % 26) + value;
        return value;
    };
    result.push(['Total', '', ...currencies.map((_, c) => {
        const col = label(startCol + c + 2);
        return `=SUM(${col}${startRow + 2}:${col}${startRow + items.length + 1})`;
    })]);
    return result;
}
