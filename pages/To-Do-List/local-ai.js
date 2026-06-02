const PRIMARY_MODEL_ID = 'Qwen3-0.6B-q4f16_1-MLC';
const BACKUP_MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
const MIN_SUMMARY_CHARS = 140;

const enginePromises = new Map();
let lastProgressMessage = '';

function getJsonPrompt(taskText) {
    return [
        {
            role: 'system',
            content: [
                'You convert messy notes into concise to-do tasks.',
                'Return valid JSON only.',
                'Do not include reasoning.',
                'Do not add tasks that are not implied.'
            ].join(' ')
        },
        {
            role: 'user',
            content: `You convert messy notes into concise to-do tasks.

Return valid JSON only:
{
  "title": "max 8 words",
  "summary": "max 25 words",
  "items": [],
  "priority": "low|medium|high",
  "due_date": null,
  "tags": []
}

Do not include reasoning. Do not add tasks that are not implied.

Note:
"""
${taskText}
"""`
        }
    ];
}

function stripReasoning(text) {
    let cleaned = (text || '').trim();
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    const openThinkIndex = cleaned.toLowerCase().lastIndexOf('<think>');
    if (openThinkIndex !== -1) {
        cleaned = cleaned.slice(openThinkIndex + '<think>'.length).trim();
    }

    cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    return cleaned;
}

function extractJson(text) {
    const cleaned = stripReasoning(text);
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        throw new Error('Model did not return a JSON object.');
    }
    return cleaned.slice(start, end + 1);
}

function clampWords(value, maxWords) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return words.join(' ');
    return words.slice(0, maxWords).join(' ');
}

function normaliseItem(item) {
    if (typeof item === 'string') return item.trim();
    if (!item || typeof item !== 'object') return '';

    const value = item.text || item.title || item.summary || item.task || item.name || item.description;
    if (value) return String(value).trim();

    return Object.values(item)
        .filter(part => typeof part === 'string' || typeof part === 'number')
        .map(part => String(part).trim())
        .filter(Boolean)
        .join(' - ');
}

function looksLikeReasoning(text) {
    return /<think|okay,?\s+let'?s|the user wants|i need to|first,?\s+i|original task|tackle this|parse the/i.test(text || '');
}

function normaliseStructuredTask(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Model JSON was not an object.');
    }

    const priority = ['low', 'medium', 'high'].includes(value.priority) ? value.priority : 'medium';
    const items = Array.isArray(value.items)
        ? value.items.map(normaliseItem).filter(Boolean)
        : [];
    const tags = Array.isArray(value.tags)
        ? value.tags.map(tag => String(tag).trim()).filter(Boolean)
        : [];
    const dueDate = value.due_date && typeof value.due_date === 'string' ? value.due_date : null;

    const output = {
        title: clampWords(value.title, 8),
        summary: clampWords(value.summary, 25),
        items,
        priority,
        due_date: dueDate,
        tags
    };

    if (!output.title || !output.summary) {
        throw new Error('Model JSON was missing title or summary.');
    }
    if (looksLikeReasoning(output.title) || looksLikeReasoning(output.summary)) {
        throw new Error('Model returned reasoning instead of task JSON.');
    }

    return output;
}

async function getEngine(modelId, onStatus) {
    if (!enginePromises.has(modelId)) {
        onStatus(`Loading ${modelId} locally...`);
        enginePromises.set(modelId, import('https://esm.run/@mlc-ai/web-llm').then(({ CreateMLCEngine }) => {
            return CreateMLCEngine(modelId, {
                initProgressCallback: (progress) => {
                    const message = progress?.text || `Loading ${modelId}...`;
                    if (message !== lastProgressMessage) {
                        lastProgressMessage = message;
                        onStatus(message);
                    }
                }
            });
        }));
    }

    return enginePromises.get(modelId);
}

async function runModel(modelId, taskText, onStatus) {
    const engine = await getEngine(modelId, onStatus);
    onStatus(`Generating JSON with ${modelId}...`);

    const reply = await engine.chat.completions.create({
        messages: getJsonPrompt(taskText),
        temperature: 0,
        top_p: 0.7,
        max_tokens: 220,
        enable_thinking: false
    });

    const raw = reply?.choices?.[0]?.message?.content || '';
    if (looksLikeReasoning(stripReasoning(raw))) {
        throw new Error(`${modelId} returned reasoning instead of JSON.`);
    }

    return normaliseStructuredTask(JSON.parse(extractJson(raw)));
}

export function canUseLocalAI() {
    return Boolean(navigator.gpu);
}

export function getLocalAIModelId() {
    return `${PRIMARY_MODEL_ID} (backup: ${BACKUP_MODEL_ID})`;
}

export function shouldSummarise(text) {
    return (text || '').trim().length >= MIN_SUMMARY_CHARS;
}

export async function summariseTaskText(taskText, onStatus = () => { }) {
    const text = (taskText || '').trim();

    if (!shouldSummarise(text)) {
        throw new Error('This task is already short enough.');
    }

    if (!canUseLocalAI()) {
        throw new Error('Local AI needs a browser with WebGPU enabled.');
    }

    try {
        return await runModel(PRIMARY_MODEL_ID, text, onStatus);
    } catch (error) {
        onStatus(`Qwen output was invalid: ${error.message}`);
        onStatus(`Falling back to ${BACKUP_MODEL_ID}...`);
        return runModel(BACKUP_MODEL_ID, text, onStatus);
    }
}
