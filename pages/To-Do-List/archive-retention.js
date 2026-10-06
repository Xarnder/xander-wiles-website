/** Archived tasks are eligible for deletion only after this long. */
export const ARCHIVE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

/** Ignore dates before Task Master existed. A bad timestamp must not count as "old". */
const EARLIEST_ARCHIVE_MS = Date.UTC(2020, 0, 1);
const FUTURE_SKEW_MS = 5 * 60 * 1000;

/**
 * Turn a stored date into milliseconds.
 * Numbers below 1e12 are treated as seconds. Anything that is not a real
 * past-or-present archive time returns null so it can never justify a delete.
 */
export function asEpochMillis(value, now = Date.now()) {
    let ms = null;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) ms = value;
    else if (value && typeof value.toMillis === "function") {
        const converted = value.toMillis();
        if (typeof converted === "number" && Number.isFinite(converted) && converted > 0) ms = converted;
    }
    if (ms == null) return null;
    if (ms < 1e12) ms *= 1000;
    if (ms < EARLIEST_ARCHIVE_MS || ms > now + FUTURE_SKEW_MS) return null;
    return ms;
}

/**
 * Decide what to do with one task document.
 * "delete" is returned only when the document is archived and its archive
 * date is at least 60 days ago. Created, completed, and updated dates are
 * never used as the archive clock.
 *
 * @returns {"delete"|"stamp"|"clear-stamp"|"keep"}
 */
export function archivedTaskRetentionAction(data, now = Date.now()) {
    if (!data || typeof data !== "object") return "keep";

    const archivedAt = asEpochMillis(data.archivedAt, now);

    if (data.archived === true) {
        if (archivedAt == null) return "stamp";
        if (now - archivedAt >= ARCHIVE_RETENTION_MS) return "delete";
        return "keep";
    }

    if (data.archived === false && archivedAt != null) return "clear-stamp";
    return "keep";
}
