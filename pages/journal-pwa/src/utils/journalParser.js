import { format } from 'date-fns';

export const correctCommonTypos = (text) => {
    const corrections = { "Uagast": "August", "Des": "Dec", "Fr": "Fri", "Tues": "Tue" };
    let corrected = text;
    for (const [typo, correction] of Object.entries(corrections)) {
        // Regex: \btypo\b, case insensitive
        corrected = corrected.replace(new RegExp(`\\b${typo}\\b`, 'gi'), correction);
    }
    return corrected;
};

export const parseJournalEntries = (fileContent, sourceFilename) => {
    const entries = [];

    // regex for splitting entries
    // Python: r'\n\s*(?=(?:(?:\*\*?)\+\+|(?:(?:## )?\*\*?)Xander(?: Wiles)?.*?:))'
    // JS equivalent with lookahead
    const entryStartPattern = /\n\s*(?=(?:(?:\*\*?)\+\+|(?:(?:## )?\*\*?)Xander(?: Wiles)?.*?:))/is;

    // Split content
    let potentialBlocks = fileContent.split(entryStartPattern);

    // Discard first block if it doesn't match start pattern (header garbage)
    // Check if the first block *starts* with a valid entry marker. If not, drop it.
    // Note: split with lookahead keeps the lookahead part in the *next* segment? 
    // Wait, split(Lookahead) splits AT the position.
    // "A\n++B".split(/(?=\n\+\+)/) -> ["A", "\n++B"] assuming the newline is part of match? 
    // The python regex matches `\n\s*` followed by lookahead.
    // So it consumes the newline and spaces before the entry.
    // "Header\n\n++Entry".split(...)
    // Match is `\n\n` (followed by ++).
    // Result: ["Header", "++Entry"] (if split removes the separator) -> The separator IS `\n\s*`.
    // So we lose the preceding newlines. That's fine.

    if (potentialBlocks.length > 0) {
        // Check if the first block looks like a real entry start.
        // It might be file header text. The Python script checks:
        // if not re.match(r'^\s*(?:\*\*?\+\+|(?:(?:## )?\*\*?)Xander)', potential_blocks[0], re.IGNORECASE):
        const startCheck = /^\s*(?:(?:\*\*?)\+\+|(?:(?:## )?\*\*?)Xander)/i;
        if (!startCheck.test(potentialBlocks[0])) {
            potentialBlocks = potentialBlocks.slice(1);
        }
    }

    const monthsPattern = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';

    const dateRegexFull = new RegExp(
        `((?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\w*\\s*,?\\s*)?\\d{1,2}(?:st|nd|rd|th)?\\s+${monthsPattern}(?:\\s+\\d{2,4})?)`,
        'i'
    );

    // Day + Year (no month?) - The python regex says `date_regex_no_month`: `\d{1,2} ... \d{4}` 
    // Actually the python var name is `date_regex_no_month` but the regex body includes `months_pattern`?
    // Wait, looking at python code:
    // date_regex_no_month = re.compile(r'((?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s*,?\s*)?\d{1,2}(?:st|nd|rd|th)?\s+\d{4})', re.IGNORECASE)
    // It matches e.g. "Mon 12 2023" ?? It looks for DayNumber then Year. No month name. 

    const dateRegexNoMonth = /((?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s*,?\s*)?\d{1,2}(?:st|nd|rd|th)?\s+\d{4})/i;

    const yearCheckRegex = /\b\d{4}\b/;

    for (let block of potentialBlocks) {
        block = block.trim();
        if (!block) continue;

        let dateStrFound = null;
        let yearInferred = false;

        // Search areas: start and end of block
        const searchAreas = [block.slice(0, 300), block.slice(-200)];

        for (const area of searchAreas) {
            const matchFull = area.match(dateRegexFull);
            const matchNoMonth = area.match(dateRegexNoMonth);

            // In python: `match = date_regex_full.search(area) or date_regex_no_month.search(area)`
            // So full priority.
            if (matchFull) {
                dateStrFound = matchFull[1].trim();
                break;
            } else if (matchNoMonth) {
                dateStrFound = matchNoMonth[1].trim();
                break;
            }
        }

        if (!dateStrFound) continue;

        // Parse Date
        let entryDate = null;

        // Check year
        if (!yearCheckRegex.test(dateStrFound)) {
            // Try to find year in filename
            const filenameYearMatch = sourceFilename.match(/(\d{4})/);
            if (filenameYearMatch) {
                const year = parseInt(filenameYearMatch[1], 10);
                // Date parsing without year usually defaults to current year in JS `Date.parse`, 
                // but we need to be careful. Strings like "Jan 1" parse to "Jan 1 2001" or current year?
                // Best to append the year to the string before parsing if possible.
                // dateStrFound is like "August 12"
                const possibleDate = new Date(`${dateStrFound} ${year}`);
                if (!isNaN(possibleDate.getTime())) {
                    entryDate = possibleDate;
                    yearInferred = true;
                }
            }
        } else {
            // Fix suffixes mostly for JS Date parser: 1st, 2nd, 3rd, 4th...
            // JS `new Date()` handles standard formats, but "Monday 1st August 2023" might fail on some browsers.
            // Removing st, nd, rd, th usually helps.
            const cleanDateStr = dateStrFound.replace(/(\d+)(st|nd|rd|th)/i, '$1');
            entryDate = new Date(cleanDateStr);
        }

        if (!entryDate || isNaN(entryDate.getTime())) continue;

        // Basic validation (1950 - 2100)
        const year = entryDate.getFullYear();
        if (year < 1950 || year > 2100) continue;

        // Title is first line
        const title = block.split('\n')[0];

        // Format date key YYYY-MM-DD
        // Format date key YYYY-MM-DD using local time
        const dateKey = format(entryDate, 'yyyy-MM-dd');

        entries.push({
            date: dateKey,
            dateObj: entryDate,
            title: title,
            text: block, // Original parser keeps the full block
            yearInferred,
            sourceFile: sourceFilename
        });
    }

    return entries;
};
