/** Small, non-executable spreadsheet expression language. Raw formulas stay in CSV. */
export function columnName(c) {
    let s = '';
    for (c++; c; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + (c - 1) % 26) + s;
    return s;
}
function address(s) {
    const m = /^\$?([A-Z]+)\$?([1-9]\d*)$/i.exec(s);
    if (!m) throw Error('#REF!');
    return [Number(m[2]) - 1, [...m[1].toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1];
}
function numeric(value) {
    const s = String(value).trim().replace(/^([+-]?)[£$€]/, '$1');
    if (!s) return 0;
    if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+|\d*\.\d+)(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(s)) throw Error('#VALUE!');
    const n = Number(s.replaceAll(',', ''));
    if (!Number.isFinite(n)) throw Error('#NUM!');
    return n;
}
export function calculateSheet(rows) {
    const cache = new Map(), visiting = new Set();
    const width = Math.max(1, ...rows.map(r => r.length));
    const cell = (r, c) => {
        if (r < 0 || c < 0 || r >= rows.length || c >= width) throw Error('#REF!');
        const key = `${r}:${c}`;
        if (visiting.has(key)) throw Error('#CYCLE!');
        if (cache.has(key)) {
            const result = cache.get(key);
            if (result instanceof Error) throw result;
            return result;
        }
        const raw = rows[r]?.[c] ?? '';
        if (!raw.trimStart().startsWith('=')) return raw;
        visiting.add(key);
        try {
            if (visiting.size > 256 || raw.length > 4096) throw Error('#LIMIT!');
            const source = raw.trimStart().slice(1);
            const tokens = source.match(/#REF!|\$?[A-Za-z]+\$?[1-9]\d*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z]+|[^\s]/g) || [];
            let i = 0;
            const take = t => tokens[i] === t ? (i++, true) : false;
            const need = t => { if (!take(t)) throw Error('#ERROR!'); };
            const number = x => typeof x === 'number' ? x : numeric(x);
            const primary = () => {
                if (take('+')) return number(primary());
                if (take('-')) return -number(primary());
                if (take('(')) { const n = expression(); need(')'); return n; }
                const t = tokens[i++];
                if (t === '#REF!') throw Error('#REF!');
                if (/^\$?[A-Z]+\$?[1-9]\d*$/i.test(t || '')) {
                    const [r, c] = address(t);
                    return number(cell(r, c));
                }
                if (/^(?:\d|\.)/.test(t || '')) return numeric(t);
                if (/^[A-Z]+$/i.test(t || '')) {
                    if (t.toUpperCase() !== 'SUM') throw Error('#NAME?');
                    need('(');
                    let total = 0;
                    if (take(')')) return total;
                    do {
                        if (/^\$?[A-Z]+\$?[1-9]\d*$/i.test(tokens[i] || '') && tokens[i + 1] === ':') {
                            const a = address(tokens[i]); i += 2;
                            const b = address(tokens[i++]);
                            if (Math.max(a[0], b[0]) >= rows.length || Math.max(a[1], b[1]) >= width) throw Error('#REF!');
                            for (let r = Math.min(a[0], b[0]); r <= Math.max(a[0], b[0]); r++) {
                                for (let c = Math.min(a[1], b[1]); c <= Math.max(a[1], b[1]); c++) {
                                    const v = cell(r, c);
                                    try { total += number(v); } catch (e) { if (e.message !== '#VALUE!') throw e; }
                                }
                            }
                        } else total += number(expression());
                    } while (take(',') || take(';'));
                    need(')'); return total;
                }
                throw Error('#ERROR!');
            };
            const product = () => {
                let n = primary();
                while (tokens[i] === '*' || tokens[i] === '/') {
                    const op = tokens[i++], right = primary();
                    if (op === '/' && right === 0) throw Error('#DIV/0!');
                    n = op === '*' ? n * right : n / right;
                }
                return n;
            };
            const expression = () => {
                let n = product();
                while (tokens[i] === '+' || tokens[i] === '-') {
                    const op = tokens[i++], right = product();
                    n = op === '+' ? n + right : n - right;
                }
                return n;
            };
            const value = expression();
            if (i !== tokens.length) throw Error('#ERROR!');
            if (!Number.isFinite(value)) throw Error('#NUM!');
            cache.set(key, value);
            return value;
        } catch (e) {
            const error = /^#[A-Z/0-9]+[!?]$/.test(e.message) ? e : Error('#ERROR!');
            cache.set(key, error); throw error;
        } finally { visiting.delete(key); }
    };
    return rows.map((row, r) => Array.from({ length: width }, (_, c) => {
        try { const v = cell(r, c); return typeof v === 'number' ? String(Number(v.toPrecision(12))) : v; }
        catch (e) { return e.message; }
    }));
}

/** Keep references attached to their cells after a row/column is removed. */
export function adjustDeletedReferences(rows, axis, index) {
    return rows.map(row => row.map(raw => raw.trimStart().startsWith('=')
        ? raw.replace(/\$?[A-Z]+\$?[1-9]\d*/gi, ref => {
            const [r, c] = address(ref), n = axis === 'row' ? r : c;
            if (n === index) return '#REF!';
            if (n < index) return ref;
            const nr = axis === 'row' ? r - 1 : r, nc = axis === 'column' ? c - 1 : c;
            return `${ref.startsWith('$') ? '$' : ''}${columnName(nc)}${/\$\d/.test(ref) ? '$' : ''}${nr + 1}`;
        }) : raw));
}
