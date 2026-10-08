/** Drive simple uploads (uploadType=media) accept at most 5 MB. */
export const PDF_SIMPLE_UPLOAD_LIMIT = 5 * 1024 * 1024;

/**
 * @param {number} byteLength
 * @returns {'media' | 'resumable'}
 */
export function pdfUploadKind(byteLength) {
    return byteLength <= PDF_SIMPLE_UPLOAD_LIMIT ? 'media' : 'resumable';
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_NATIVE_PREFIX = 'application/vnd.google-apps.';

/**
 * A real PDF file, not a Google Doc and not a markdown note.
 * @param {{ mimeType?: string, name?: string }} file
 */
export function isPdfFile(file) {
    if (!file || file.mimeType === FOLDER_MIME) return false;
    if (file.mimeType?.startsWith(GOOGLE_NATIVE_PREFIX)) return false;
    if (file.mimeType === 'application/pdf') return true;
    return String(file.name || '').toLowerCase().endsWith('.pdf');
}

/**
 * SVG path for pdf-lib drawSvgPath. Points are PDF user space (origin
 * bottom-left). The path y is distance from the top of the page so it can be
 * drawn with `{ x: 0, y: pageHeight }`, which flips SVG y back to PDF y.
 * @param {Array<{ x: number, y: number }>} points
 * @param {number} pageHeight
 */
export function strokeToSvgPath(points, pageHeight) {
    const source = Array.isArray(points) ? points.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)) : [];
    if (!source.length || !Number.isFinite(pageHeight)) return '';
    const pts =
        source.length === 1
            ? [source[0], { x: source[0].x + 0.35, y: source[0].y }]
            : source;
    const fmt = (n) => String(Math.round(n * 100) / 100);
    const yDown = (p) => pageHeight - p.y;
    let d = `M ${fmt(pts[0].x)} ${fmt(yDown(pts[0]))}`;
    for (let i = 1; i < pts.length; i += 1) {
        d += ` L ${fmt(pts[i].x)} ${fmt(yDown(pts[i]))}`;
    }
    return d;
}

/**
 * Helvetica in pdf-lib is WinAnsi. Keep Latin-1 and replace the rest.
 * @param {string} text
 */
export function toWinAnsi(text) {
    let out = '';
    for (const ch of String(text ?? '')) {
        const code = ch.codePointAt(0) || 0;
        if (code === 10) {
            out += '\n';
            continue;
        }
        if (code === 9) {
            out += ' ';
            continue;
        }
        if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
            out += ch;
            continue;
        }
        out += '?';
    }
    return out;
}

/**
 * Distance from a point to a line segment, in the same units as the points.
 * @param {{ x: number, y: number }} point
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
export function distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(point.x - a.x, point.y - a.y);
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
    return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/**
 * True when a finger lands on the painted stroke, including the band around
 * the centerline. `slop` is extra reach in the same units (PDF points).
 * A single point is a round dot of diameter `width`, centered on that point.
 * @param {{ x: number, y: number }} point
 * @param {Array<{ x: number, y: number }>} points
 * @param {number} width
 * @param {number} [slop]
 */
export function strokeCoversPoint(point, points, width, slop = 0) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const source = Array.isArray(points) ? points : [];
    if (!source.length) return false;
    const reach = Math.max(0, Number(width) || 0) / 2 + Math.max(0, Number(slop) || 0);
    if (source.length === 1) {
        return Math.hypot(source[0].x - point.x, source[0].y - point.y) <= reach;
    }
    for (let i = 1; i < source.length; i += 1) {
        if (distanceToSegment(point, source[i - 1], source[i]) <= reach) return true;
    }
    return false;
}

/**
 * Turn pdf.js text items into lines a finger can edit. Items are in content
 * stream order. A later item that starts at the same origin replaces the line
 * (text drawn over a saved edit). A wide horizontal gap starts a new line.
 * @param {Array<{ str?: string, transform?: number[], width?: number, height?: number, hasEOL?: boolean }>} items
 * @returns {Array<{ text: string, x: number, y: number, width: number, size: number }>}
 */
export function groupPdfTextLines(items) {
    /** @type {Array<{ str: string, x: number, y: number, width: number, size: number, eol: boolean }>} */
    const runs = [];
    for (const item of items || []) {
        const str = String(item?.str ?? '');
        if (!str.trim()) continue;
        const transform = item?.transform;
        if (!transform || transform.length < 6) continue;
        const size = Math.hypot(transform[2], transform[3]) || Number(item?.height) || 0;
        if (size < 2) continue;
        const axis = Math.hypot(transform[0], transform[1]) || size;
        if (Math.abs(transform[1]) / axis > 0.3) continue;
        const width = Number(item?.width) > 0 ? Number(item.width) : str.length * size * 0.45;
        runs.push({
            str,
            x: transform[4],
            y: transform[5],
            width,
            size,
            eol: Boolean(item?.hasEOL),
        });
    }

    /** @type {Array<{ text: string, x: number, y: number, width: number, size: number, end: number, eol: boolean }>} */
    const lines = [];
    const sameBaseline = (line, run) =>
        Math.abs(line.y - run.y) <= Math.max(line.size, run.size) * 0.45 &&
        Math.abs(line.size - run.size) <= Math.max(line.size, run.size) * 0.45;

    for (const run of runs) {
        const candidates = lines.filter((candidate) => sameBaseline(candidate, run) && !candidate.eol);
        const replaced = candidates.find((line) => Math.abs(run.x - line.x) <= 2 && run.x + 1 < line.end);
        if (replaced) {
            replaced.text = run.str;
            replaced.y = run.y;
            replaced.size = run.size;
            replaced.width = run.width;
            replaced.end = run.x + run.width;
            replaced.eol = run.eol;
            continue;
        }
        const line = candidates.find((candidate) => {
            const gap = run.x - candidate.end;
            return run.x >= candidate.x - 1 && gap <= Math.max(candidate.size, run.size) * 1.75;
        });
        if (!line) {
            lines.push({
                text: run.str,
                x: run.x,
                y: run.y,
                width: run.width,
                size: run.size,
                end: run.x + run.width,
                eol: run.eol,
            });
            continue;
        }
        const gap = run.x - line.end;
        if (gap > line.size * 0.12) line.text += ' ';
        line.text += run.str;
        line.end = Math.max(line.end, run.x + run.width);
        line.width = line.end - line.x;
        if (run.eol) line.eol = true;
    }

    return lines
        .map((line) => ({
            text: line.text.replace(/[ \t]+/g, ' ').trim(),
            x: line.x,
            y: line.y,
            width: Math.max(line.width, line.size * 0.4),
            size: line.size,
        }))
        .filter((line) => line.text);
}

/**
 * Glyph box around a text line, in PDF user space (y is the baseline).
 * @param {{ x: number, y: number, width: number, size: number }} line
 */
export function textLineBox(line) {
    const size = Number(line?.size) || 12;
    const below = size * 0.3;
    const above = size * 0.95;
    return {
        x: line.x - 1,
        y: line.y - below,
        width: Math.max(Number(line?.width) || 0, size * 0.4) + 2,
        height: below + above,
    };
}

/**
 * The line under a tap, preferring the closest baseline when boxes overlap.
 * `slop` expands the box in PDF points so a finger can hit a short line.
 * @param {Array<{ x: number, y: number, width: number, size: number }>} lines
 * @param {{ x: number, y: number } | null | undefined} point
 * @param {number} [slop]
 */
export function lineAtPoint(lines, point, slop = 0) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    const extra = Math.max(0, Number(slop) || 0);
    let best = null;
    let bestDist = Infinity;
    for (const line of lines || []) {
        if (!line || !Number.isFinite(line.x) || !Number.isFinite(line.y)) continue;
        const box = textLineBox(line);
        if (point.x < box.x - extra || point.x > box.x + box.width + extra) continue;
        if (point.y < box.y - extra || point.y > box.y + box.height + extra) continue;
        const dist = Math.abs(point.y - line.y);
        if (dist < bestDist) {
            best = line;
            bestDist = dist;
        }
    }
    return best;
}

/**
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgbUnit(hex) {
    const raw = String(hex || '').trim().replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) return { r: 0.07, g: 0.07, b: 0.07 };
    return {
        r: parseInt(raw.slice(0, 2), 16) / 255,
        g: parseInt(raw.slice(2, 4), 16) / 255,
        b: parseInt(raw.slice(4, 6), 16) / 255,
    };
}
