import {
    SITE_LLM_MODELS,
    canUseSiteLocalLLM,
    getSiteLocalLLMEngine,
    runSiteLocalLLMChatCompletion
} from '/assets/js/local-llm.js';

export const LOCAL_SUMMARISER_MODEL_ID = SITE_LLM_MODELS.qwenTodo.id;

const MODEL_ID = LOCAL_SUMMARISER_MODEL_ID;
const MIN_CHUNK_WORDS = 500;
const MAX_CHUNK_WORDS = 700;
const MIN_INPUT_WORDS = 25;
const CHUNK_MAX_TOKENS = 900;
const FINAL_MAX_TOKENS = 700;
const DEBUG_PREVIEW_CHARS = 4000;
const UNSUPPORTED_MESSAGE = 'Local AI summarisation is not supported on this device/browser yet. It needs WebGPU, which is still rolling out on mobile browsers.';

function notify(onProgress, update) {
    if (typeof onProgress === 'function') {
        onProgress(update);
    }
}

function notifyDebug(onProgress, level, message, details = {}) {
    notify(onProgress, {
        stage: 'debug',
        debug: true,
        level,
        message,
        details
    });
}

function previewText(text, limit = DEBUG_PREVIEW_CHARS) {
    const value = String(text || '');
    if (value.length <= limit) return value;
    return `${value.slice(0, limit)}\n... [truncated ${value.length - limit} chars]`;
}

function getWords(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean);
}

function normaliseText(text) {
    return String(text || '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
}

function clampWords(value, maxWords) {
    const words = getWords(value);
    if (words.length <= maxWords) return words.join(' ');
    return words.slice(0, maxWords).join(' ');
}

function capitaliseFirst(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function getFirstSentence(text, maxWords = 35) {
    const cleaned = normaliseText(text).replace(/\s+/g, ' ');
    const sentence = cleaned.match(/^(.+?[.!?])(?:\s|$)/)?.[1] || cleaned;
    return clampWords(sentence, maxWords);
}

function getFirstSentences(text, maxSentences = 3) {
    const cleaned = normaliseText(text).replace(/\s+/g, ' ');
    const matches = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];

    return matches
        .map(sentence => clampWords(sentence.trim(), 32))
        .filter(Boolean)
        .slice(0, maxSentences);
}

function splitLongTextByWords(text, maxWords) {
    const words = getWords(text);
    const chunks = [];

    for (let index = 0; index < words.length; index += maxWords) {
        chunks.push(words.slice(index, index + maxWords).join(' '));
    }

    return chunks;
}

function splitIntoChunks(text) {
    const paragraphs = normaliseText(text).split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
    const chunks = [];
    let currentParts = [];
    let currentWordCount = 0;

    const pushCurrent = () => {
        if (!currentParts.length) return;
        chunks.push(currentParts.join('\n\n'));
        currentParts = [];
        currentWordCount = 0;
    };

    for (const paragraph of paragraphs) {
        const paragraphWordCount = getWords(paragraph).length;

        if (paragraphWordCount > MAX_CHUNK_WORDS) {
            pushCurrent();
            chunks.push(...splitLongTextByWords(paragraph, MAX_CHUNK_WORDS));
            continue;
        }

        const nextWordCount = currentWordCount + paragraphWordCount;
        const wouldBeTooLarge = nextWordCount > MAX_CHUNK_WORDS;
        const canGrowSmallChunk = currentWordCount < MIN_CHUNK_WORDS && nextWordCount <= MAX_CHUNK_WORDS + 100;

        if (currentWordCount > 0 && wouldBeTooLarge && !canGrowSmallChunk) {
            pushCurrent();
        }

        currentParts.push(paragraph);
        currentWordCount += paragraphWordCount;
    }

    pushCurrent();
    return chunks.length ? chunks : [normaliseText(text)];
}

function getProgressPercent(progress) {
    if (!progress || typeof progress.progress !== 'number') return null;
    const value = progress.progress <= 1 ? progress.progress * 100 : progress.progress;
    return Math.max(0, Math.min(100, value));
}

function createChunkMessages(chunkText) {
    return [
        {
            role: 'system',
            content: 'Return valid JSON only. No markdown. No explanation. Do not include reasoning. If you are Qwen, use /no_think.'
        },
        {
            role: 'user',
            content: `/no_think

You are summarising a private journal entry chunk.

Return valid JSON only. No markdown. No explanation.

Schema:
{
  "events": [],
  "decisions": [],
  "tasks": [],
  "people": [],
  "emotions": [],
  "one_sentence_summary": ""
}

Rules:
- Do not invent facts.
- Preserve important personal details if they are relevant.
- Extract explicit or strongly implied tasks only.
- Keep the summary concise.
- Use arrays of short strings only. Do not put objects inside arrays.
- Keep each array to 5 items or fewer.
- If the chunk has content, one_sentence_summary must not be empty.
- Do not include reasoning.

Journal chunk:
"""
${chunkText}
"""`
        }
    ];
}

function createFinalMessages(chunkSummariesJson) {
    return [
        {
            role: 'system',
            content: 'Return valid JSON only. No markdown. No explanation. Do not include reasoning. If you are Qwen, use /no_think.'
        },
        {
            role: 'user',
            content: `/no_think

You are combining chunk summaries from a private journal entry.

Return valid JSON only. No markdown. No explanation.

Schema:
{
  "title": "max 10 words",
  "short_summary": "max 60 words",
  "key_points": [],
  "tasks": [],
  "mood": "",
  "tags": []
}

Rules:
- Do not invent new facts.
- Merge duplicate tasks.
- Keep tasks action-oriented.
- Use simple, natural language.
- Use arrays of short strings only. Do not put objects inside arrays.
- Tags should be lowercase short labels.
- Mood should be a short phrase, not a diagnosis.
- Do not include reasoning.

Chunk summaries:
"""
${chunkSummariesJson}
"""`
        }
    ];
}

function createStrictChunkMessages(chunkText) {
    return [
        {
            role: 'system',
            content: 'You output JSON only. Start with { and end with }. No prose. No markdown. No thinking. /no_think'
        },
        {
            role: 'user',
            content: `/no_think

Summarise this private journal chunk by filling exactly this JSON object:
{"events":[],"decisions":[],"tasks":[],"people":[],"emotions":[],"one_sentence_summary":""}

Rules: do not invent facts; use short strings in arrays, not objects; keep arrays short; tasks must be explicit or strongly implied; one_sentence_summary must not be empty if the text has content.

Text:
"""
${chunkText}
"""`
        }
    ];
}

function createStrictFinalMessages(chunkSummariesJson) {
    return [
        {
            role: 'system',
            content: 'You output JSON only. Start with { and end with }. No prose. No markdown. No thinking. /no_think'
        },
        {
            role: 'user',
            content: `/no_think

Combine these chunk summaries as exactly this JSON object:
{"title":"","short_summary":"","key_points":[],"tasks":[],"mood":"","tags":[]}

Rules: do not invent facts; merge duplicate tasks; tags are lowercase; title max 10 words; short_summary max 60 words.

Chunk summaries:
"""
${chunkSummariesJson}
"""`
        }
    ];
}

function stripReasoning(text) {
    let cleaned = String(text || '').trim();
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    const openThinkIndex = cleaned.toLowerCase().lastIndexOf('<think>');
    if (openThinkIndex !== -1) {
        const jsonStartAfterThink = cleaned.indexOf('{', openThinkIndex);
        cleaned = jsonStartAfterThink === -1
            ? cleaned.slice(0, openThinkIndex).trim()
            : cleaned.slice(jsonStartAfterThink).trim();
    }

    return cleaned
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

function extractJsonObject(text) {
    const cleaned = stripReasoning(text);
    const start = cleaned.indexOf('{');

    if (start === -1) {
        throw new Error('Model did not return a JSON object.');
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    // Walk the model output so braces inside JSON strings do not break extraction.
    for (let index = start; index < cleaned.length; index += 1) {
        const char = cleaned[index];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return cleaned.slice(start, index + 1);
            }
        }
    }

    throw new Error('Model returned incomplete JSON.');
}

function normaliseArray(value) {
    const source = Array.isArray(value) ? value : (typeof value === 'string' && value.trim() ? [value] : []);

    return source
        .map(item => {
            if (typeof item === 'string' || typeof item === 'number') return String(item).trim();
            if (!item || typeof item !== 'object') return '';

            const bestValue = item.text || item.title || item.summary || item.task || item.name || item.description;
            if (bestValue) return String(bestValue).trim();

            return Object.values(item)
                .filter(part => typeof part === 'string' || typeof part === 'number')
                .map(part => String(part).trim())
                .filter(Boolean)
                .join(' - ');
        })
        .filter(Boolean);
}

function dedupeArray(values) {
    const seen = new Set();

    return values.filter(value => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function normaliseChunkSummary(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Chunk summary JSON was not an object.');
    }

    return {
        events: dedupeArray(normaliseArray(value.events)).slice(0, 8),
        decisions: dedupeArray(normaliseArray(value.decisions)).slice(0, 8),
        tasks: dedupeArray(normaliseArray(value.tasks)).slice(0, 8),
        people: dedupeArray(normaliseArray(value.people)).slice(0, 8),
        emotions: dedupeArray(normaliseArray(value.emotions)).slice(0, 8),
        one_sentence_summary: clampWords(value.one_sentence_summary, 35)
    };
}

function normaliseTags(value) {
    return dedupeArray(normaliseArray(value)
        .map(tag => tag.toLowerCase().replace(/^#/, '').trim())
        .filter(Boolean)
        .map(tag => clampWords(tag, 3)))
        .slice(0, 8);
}

function normaliseFinalSummary(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Final summary JSON was not an object.');
    }

    return {
        title: capitaliseFirst(clampWords(value.title, 10)),
        short_summary: clampWords(value.short_summary, 60),
        key_points: dedupeArray(normaliseArray(value.key_points)).slice(0, 10),
        tasks: dedupeArray(normaliseArray(value.tasks)).slice(0, 10),
        mood: clampWords(value.mood, 8),
        tags: normaliseTags(value.tags)
    };
}

function hasChunkContent(summary) {
    return Boolean(
        summary.one_sentence_summary ||
        summary.events.length ||
        summary.decisions.length ||
        summary.tasks.length ||
        summary.people.length ||
        summary.emotions.length
    );
}

function hasFinalContent(summary) {
    return Boolean(
        summary.short_summary ||
        summary.key_points.length ||
        summary.tasks.length ||
        summary.mood ||
        summary.tags.length
    );
}

async function runLocalCompletion(messages, maxTokens, onProgress, label) {
    notifyDebug(onProgress, 'request', `${label}: sending request`, {
        maxTokens,
        model: MODEL_ID
    });

    const reply = await runSiteLocalLLMChatCompletion(MODEL_ID, {
        messages,
        temperature: 0,
        top_p: 0.7,
        max_tokens: maxTokens,
        enable_thinking: false,
        chat_template_kwargs: {
            enable_thinking: false
        }
    }, (message) => {
        notify(onProgress, {
            stage: 'generating',
            message
        });
    });

    const content = reply?.choices?.[0]?.message?.content || '';
    notifyDebug(onProgress, 'raw', `${label}: raw model output`, {
        characters: content.length,
        finishReason: reply?.choices?.[0]?.finish_reason || 'unknown',
        text: previewText(content)
    });

    if (!content.trim()) {
        throw new Error('The local model returned an empty response.');
    }

    return content;
}

async function runJsonAttempt({ messages, maxTokens, normalise, isUsable, onProgress, label }) {
    const raw = await runLocalCompletion(messages, maxTokens, onProgress, label);
    const jsonText = extractJsonObject(raw);
    notifyDebug(onProgress, 'parse', `${label}: extracted JSON`, {
        characters: jsonText.length,
        text: previewText(jsonText)
    });
    const parsed = JSON.parse(jsonText.replace(/,\s*([}\]])/g, '$1'));
    const normalised = normalise(parsed);
    if (typeof isUsable === 'function' && !isUsable(normalised)) {
        throw new Error('Model returned valid JSON, but it did not contain a usable summary.');
    }
    notifyDebug(onProgress, 'parse', `${label}: normalised JSON`, {
        text: previewText(JSON.stringify(normalised, null, 2))
    });
    return normalised;
}

async function runJsonCompletion({ label, messages, retryMessages, maxTokens, normalise, isUsable, fallback, onProgress }) {
    try {
        return await runJsonAttempt({
            messages,
            maxTokens,
            normalise,
            isUsable,
            onProgress,
            label
        });
    } catch (firstError) {
        notifyDebug(onProgress, 'error', `${label}: first JSON parse failed`, {
            error: firstError.message
        });
        notify(onProgress, {
            stage: 'retrying_json',
            message: 'The local model returned text instead of JSON. Retrying with a stricter local prompt...'
        });

        try {
            return await runJsonAttempt({
                messages: retryMessages,
                maxTokens,
                normalise,
                isUsable,
                onProgress,
                label: `${label} retry`
            });
        } catch (secondError) {
            notifyDebug(onProgress, 'error', `${label}: retry JSON parse failed`, {
                error: secondError.message
            });
            notify(onProgress, {
                stage: 'json_fallback',
                message: 'The local model still did not return clean JSON, so this summary uses a conservative local fallback.'
            });
            notifyDebug(onProgress, 'fallback', `${label}: using local fallback`, {
                reason: secondError.message
            });
            console.warn('Local summariser JSON parse failed twice:', firstError, secondError);
            return fallback();
        }
    }
}

function createFallbackChunkSummary(chunkText) {
    const sentences = getFirstSentences(chunkText, 3);

    return normaliseChunkSummary({
        events: sentences,
        decisions: [],
        tasks: [],
        people: [],
        emotions: [],
        one_sentence_summary: getFirstSentence(chunkText)
    });
}

function createFallbackFinalSummary(chunkSummaries) {
    const oneSentenceSummaries = chunkSummaries
        .map(summary => summary.one_sentence_summary)
        .filter(Boolean);

    return normaliseFinalSummary({
        title: oneSentenceSummaries[0] || 'Journal summary',
        short_summary: oneSentenceSummaries.join(' '),
        key_points: [
            ...chunkSummaries.flatMap(summary => summary.events),
            ...oneSentenceSummaries
        ],
        tasks: chunkSummaries.flatMap(summary => summary.tasks),
        mood: dedupeArray(chunkSummaries.flatMap(summary => summary.emotions)).join(', '),
        tags: []
    });
}

export function isWebGPUSupported() {
    if (typeof navigator === 'undefined') return false;
    return canUseSiteLocalLLM();
}

export async function loadSummariserModel(onProgress = () => { }) {
    if (!isWebGPUSupported()) {
        throw new Error(UNSUPPORTED_MESSAGE);
    }

    return getSiteLocalLLMEngine(MODEL_ID, (message, progress) => {
        notify(onProgress, {
            stage: 'loading_model',
            message,
            percent: getProgressPercent(progress)
        });
    });
}

export async function summariseJournalEntry(text, onProgress = () => { }) {
    const inputText = normaliseText(text);
    const inputWordCount = getWords(inputText).length;

    if (!inputText || inputWordCount < MIN_INPUT_WORDS) {
        throw new Error('Write a little more before asking the local AI to summarise this entry.');
    }

    if (!isWebGPUSupported()) {
        throw new Error(UNSUPPORTED_MESSAGE);
    }

    notify(onProgress, {
        stage: 'loading_model',
        message: 'Preparing the local summariser...'
    });
    notifyDebug(onProgress, 'info', 'Starting local journal summary', {
        inputWords: inputWordCount,
        model: MODEL_ID
    });
    await loadSummariserModel(onProgress);

    const chunks = splitIntoChunks(inputText);
    notify(onProgress, {
        stage: 'chunking',
        message: `Split the entry into ${chunks.length} local chunk${chunks.length === 1 ? '' : 's'}.`,
        current: 0,
        total: chunks.length
    });
    notifyDebug(onProgress, 'info', 'Chunk plan', {
        chunks: chunks.map((chunk, index) => ({
            chunk: index + 1,
            words: getWords(chunk).length,
            characters: chunk.length
        }))
    });

    const chunkSummaries = [];

    for (let index = 0; index < chunks.length; index += 1) {
        notify(onProgress, {
            stage: 'summarising_chunks',
            message: `Summarising chunk ${index + 1} of ${chunks.length} locally...`,
            current: index + 1,
            total: chunks.length
        });

        const chunkSummary = await runJsonCompletion({
            label: `chunk ${index + 1}/${chunks.length}`,
            messages: createChunkMessages(chunks[index]),
            retryMessages: createStrictChunkMessages(chunks[index]),
            maxTokens: CHUNK_MAX_TOKENS,
            normalise: normaliseChunkSummary,
            isUsable: hasChunkContent,
            fallback: () => createFallbackChunkSummary(chunks[index]),
            onProgress
        });
        chunkSummaries.push(chunkSummary);
    }

    notify(onProgress, {
        stage: 'combining',
        message: 'Combining the local chunk summaries...',
        current: chunks.length,
        total: chunks.length
    });

    const chunkSummariesJson = JSON.stringify(chunkSummaries, null, 2);
    notifyDebug(onProgress, 'info', 'Intermediate chunk summaries', {
        text: previewText(chunkSummariesJson)
    });
    const finalSummary = await runJsonCompletion({
        label: 'final summary',
        messages: createFinalMessages(chunkSummariesJson),
        retryMessages: createStrictFinalMessages(chunkSummariesJson),
        maxTokens: FINAL_MAX_TOKENS,
        normalise: normaliseFinalSummary,
        isUsable: hasFinalContent,
        fallback: () => createFallbackFinalSummary(chunkSummaries),
        onProgress
    });

    notify(onProgress, {
        stage: 'complete',
        message: 'Local summary ready.',
        current: chunks.length,
        total: chunks.length
    });

    return finalSummary;
}
