const CUSTOM_WORDS_KEY = 'journal-harper-custom-words';

let linterPromise;

async function setupWithTimeout(linter, timeoutMs = 12000) {
    let timeoutId;

    try {
        await Promise.race([
            linter.setup(),
            new Promise((_, reject) => {
                timeoutId = window.setTimeout(
                    () => reject(new Error('Harper worker setup timed out')),
                    timeoutMs
                );
            })
        ]);
    } finally {
        window.clearTimeout(timeoutId);
    }
}

function getPreferredDialect(Dialect) {
    const locale = (navigator.languages?.[0] || navigator.language || 'en-GB').toLowerCase();

    if (locale.startsWith('en-au')) return Dialect.Australian;
    if (locale.startsWith('en-ca')) return Dialect.Canadian;
    if (locale.startsWith('en-in')) return Dialect.Indian;
    if (locale.startsWith('en-gb') || locale.startsWith('en-ie')) return Dialect.British;
    return Dialect.American;
}

function getStoredWords() {
    try {
        const storedWords = JSON.parse(localStorage.getItem(CUSTOM_WORDS_KEY) || '[]');
        return Array.isArray(storedWords)
            ? storedWords.filter((word) => typeof word === 'string' && word.trim())
            : [];
    } catch {
        return [];
    }
}

async function createLinter() {
    const [{ Dialect, LocalLinter, WorkerLinter }, { slimBinary }] = await Promise.all([
        import('harper.js'),
        import('harper.js/slimBinary')
    ]);
    const init = {
        binary: slimBinary,
        dialect: getPreferredDialect(Dialect)
    };

    let linter;

    try {
        linter = new WorkerLinter(init);
        await setupWithTimeout(linter);
    } catch (workerError) {
        console.warn('Harper worker unavailable; using the on-device fallback.', workerError);
        void linter?.dispose?.().catch(() => undefined);
        linter = new LocalLinter(init);
        await linter.setup();
    }

    const customWords = getStoredWords();
    if (customWords.length > 0) {
        await linter.importWords(customWords);
    }

    return linter;
}

export function getHarperLinter() {
    if (!linterPromise) {
        linterPromise = createLinter().catch((error) => {
            linterPromise = null;
            throw error;
        });
    }

    return linterPromise;
}

export async function checkWithHarper(text) {
    const linter = await getHarperLinter();
    const lints = await linter.lint(text, {
        language: 'markdown',
        dedup: true
    });

    return lints.map((lint, lintIndex) => {
        const span = lint.span();
        const allSuggestions = lint.suggestions();
        const suggestions = allSuggestions.slice(0, 4).map((suggestion, suggestionIndex) => ({
            id: `${lintIndex}-${suggestionIndex}`,
            replacement: suggestion.get_replacement_text(),
            rawSuggestion: suggestion
        }));
        allSuggestions.slice(4).forEach((suggestion) => suggestion.free());
        const issue = {
            id: `${span.start}-${span.end}-${lintIndex}`,
            start: span.start,
            end: span.end,
            problemText: lint.get_problem_text(),
            kind: lint.lint_kind_pretty(),
            message: lint.message(),
            suggestions,
            rawLint: lint
        };

        span.free();
        return issue;
    });
}

export async function applyHarperSuggestion(text, issue, suggestion) {
    const linter = await getHarperLinter();
    return linter.applySuggestion(text, issue.rawLint, suggestion.rawSuggestion);
}

export async function addHarperWord(word) {
    const normalizedWord = word.trim();
    if (!normalizedWord) return;

    const linter = await getHarperLinter();
    await linter.importWords([normalizedWord]);

    const storedWords = new Set(getStoredWords());
    storedWords.add(normalizedWord);
    try {
        localStorage.setItem(CUSTOM_WORDS_KEY, JSON.stringify([...storedWords].sort()));
    } catch {
        // The word remains learned for this session when storage is unavailable.
    }
}

export function releaseHarperIssues(issues) {
    issues.forEach((issue) => {
        issue.suggestions.forEach((suggestion) => suggestion.rawSuggestion?.free?.());
        issue.rawLint?.free?.();
    });
}
