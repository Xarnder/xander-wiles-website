/**
 * Heuristic for large / destructive edits that should not race quietly to Drive.
 */

/** Absolute characters removed (approx) that counts as destructive. */
export const DESTRUCTIVE_MIN_DELETED_CHARS = 500;

/** Relative shrink vs previous content (0.10 = 10%). */
export const DESTRUCTIVE_MIN_SHRINK_RATIO = 0.1;

/** Previous length required before “became empty” counts as destructive. */
export const DESTRUCTIVE_MIN_PREV_SIZE_FOR_EMPTY = 80;

/**
 * Near-total replacement: deleted this many chars AND inserted at least this many.
 */
export const DESTRUCTIVE_REPLACE_MIN_DELETED = 400;
export const DESTRUCTIVE_REPLACE_MIN_INSERTED = 400;

/** Extra idle time after a destructive edit before autosave (ms). */
export const DESTRUCTIVE_AUTOSAVE_DEFER_MS = 8_000;

/**
 * @param {string} previousContent
 * @param {string} nextContent
 * @returns {{ destructive: boolean, reason: string | null, deleted: number, inserted: number, prevLen: number, nextLen: number }}
 */
export function analyzeContentChange(previousContent, nextContent) {
    const prev = String(previousContent ?? '');
    const next = String(nextContent ?? '');
    const prevLen = prev.length;
    const nextLen = next.length;
    const deleted = Math.max(0, prevLen - nextLen);
    const inserted = Math.max(0, nextLen - prevLen);

    if (prevLen === 0) {
        return { destructive: false, reason: null, deleted, inserted, prevLen, nextLen };
    }

    if (nextLen === 0 && prevLen >= DESTRUCTIVE_MIN_PREV_SIZE_FOR_EMPTY) {
        return { destructive: true, reason: 'cleared', deleted, inserted, prevLen, nextLen };
    }

    if (deleted >= DESTRUCTIVE_MIN_DELETED_CHARS) {
        return { destructive: true, reason: 'large-delete', deleted, inserted, prevLen, nextLen };
    }

    if (prevLen > 0 && deleted / prevLen >= DESTRUCTIVE_MIN_SHRINK_RATIO && deleted >= 40) {
        return { destructive: true, reason: 'shrink', deleted, inserted, prevLen, nextLen };
    }

    // Rough replacement signal when lengths stay similar but both sides moved a lot.
    // Without a full diff, use: high deleted-from-prefix/suffix proxy via shared prefix/suffix.
    if (
        deleted >= DESTRUCTIVE_REPLACE_MIN_DELETED &&
        inserted >= DESTRUCTIVE_REPLACE_MIN_INSERTED
    ) {
        return { destructive: true, reason: 'replace', deleted, inserted, prevLen, nextLen };
    }

    const shared = sharedPrefixSuffixLen(prev, next);
    const replacedApprox = prevLen - shared;
    if (
        replacedApprox >= DESTRUCTIVE_REPLACE_MIN_DELETED &&
        nextLen - shared >= DESTRUCTIVE_REPLACE_MIN_INSERTED
    ) {
        return {
            destructive: true,
            reason: 'replace',
            deleted: replacedApprox,
            inserted: nextLen - shared,
            prevLen,
            nextLen,
        };
    }

    return { destructive: false, reason: null, deleted, inserted, prevLen, nextLen };
}

/**
 * @param {string} previousContent
 * @param {string} nextContent
 * @returns {boolean}
 */
export function isDestructiveChange(previousContent, nextContent) {
    return analyzeContentChange(previousContent, nextContent).destructive;
}

/**
 * Length of shared prefix + shared suffix without double-counting the middle.
 * @param {string} a
 * @param {string} b
 */
function sharedPrefixSuffixLen(a, b) {
    const minLen = Math.min(a.length, b.length);
    let prefix = 0;
    while (prefix < minLen && a[prefix] === b[prefix]) prefix += 1;

    let suffix = 0;
    while (
        suffix < minLen - prefix &&
        a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
    ) {
        suffix += 1;
    }
    return prefix + suffix;
}
