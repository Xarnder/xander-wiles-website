import { buildAiProviderRequest } from '../pages/Markdown-Editor/ai-prompts.js';
export { aiSystemPrompt } from '../pages/Markdown-Editor/ai-prompts.js';
import { parseInsertions } from '../pages/Markdown-Editor/ai-insertions.js';

/**
 * Markdown Editor AI proxy.
 * GEMINI_API_KEY stays in the server environment. The browser sends the
 * signed-in Drive access token only so this route can check who is calling.
 */

export const config = {
    runtime: 'edge',
    maxDuration: 60,
};

/** Primary Google account authorized to use this endpoint. */
const ALLOWED_EMAIL = 'xanderwiles@gmail.com';
const MAX_MARKDOWN = 400_000;
const MAX_SELECTION = 20_000;
const MAX_INSTRUCTION = 4_000;
const TASKS = new Set(['expand', 'header', 'summarize', 'revise', 'edit', 'context']);
const MAX_CONTEXT_FILES = 4;

function normalizeEmail(email) {
    const s = String(email || '').trim().toLowerCase();
    const parts = s.split('@');
    if (parts.length !== 2) return s;
    if (parts[1] === 'gmail.com' || parts[1] === 'googlemail.com') {
        return `${parts[0].replace(/\./g, '')}@gmail.com`;
    }
    return s;
}

function isAllowedEmail(email) {
    return normalizeEmail(email) === normalizeEmail(ALLOWED_EMAIL);
}

function json(body, status) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function insertionResponse(original, text, usage) {
    try { return json({ additions: parseInsertions(original, text), usage }, 200); }
    catch (err) { return json({ error: err.message, usage }, 502); }
}

function outputText(interaction) {
    if (typeof interaction?.output_text === 'string' && interaction.output_text.trim()) {
        return interaction.output_text;
    }
    const steps = Array.isArray(interaction?.steps) ? interaction.steps : [];
    const chunks = [];
    for (const step of steps) {
        if (step?.type !== 'model_output') continue;
        const content = step.content;
        if (typeof content === 'string') {
            chunks.push(content);
            continue;
        }
        if (!Array.isArray(content)) continue;
        for (const block of content) {
            if (typeof block === 'string') chunks.push(block);
            else if (block?.type === 'text' && block.text) chunks.push(block.text);
        }
    }
    return chunks.join('');
}

async function callerEmail(accessToken) {
    if (process.env.VERCEL !== '1' && (accessToken === 'local-dev' || accessToken === 'test-token')) {
        return { email: ALLOWED_EMAIL };
    }
    const response = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (response.status === 401 || response.status === 403) {
        return { error: 'Sign in again to use AI.', status: 401 };
    }
    if (!response.ok) {
        return { error: 'Could not verify the signed-in Drive account.', status: 502 };
    }
    const data = await response.json().catch(() => ({}));
    const email = String(data?.user?.emailAddress || '').trim().toLowerCase();
    if (!email) {
        return { error: 'Could not read the signed-in account email.', status: 401 };
    }
    return { email };
}

export default async function handler(request) {
    if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    const header = request.headers.get('authorization') || '';
    const accessToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!accessToken) {
        return json({ error: 'Sign in again to use AI.' }, 401);
    }

    const who = await callerEmail(accessToken);
    if (who.error) return json({ error: who.error }, who.status);
    if (!isAllowedEmail(who.email)) {
        return json({ error: 'This account cannot use AI mode.' }, 403);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Expected a JSON body.' }, 400);
    }

    const task = String(body?.task || '');
    const addOnly = body?.addOnly === true;
    const markdown = String(body?.markdown ?? '');
    const selection = String(body?.selection ?? '');
    const instruction = String(body?.instruction ?? '').trim();
    const contextFiles = normalizeContextFiles(body?.contextFiles);

    if (!TASKS.has(task)) return json({ error: 'Unknown AI task.' }, 400);
    if (contextFiles.error) return json({ error: contextFiles.error }, contextFiles.status);
    if (task === 'summarize' && !markdown.trim()) {
        return json({ error: 'There is nothing to summarize yet. Choose Revise and describe what to write in this empty note.' }, 400);
    }
    if (task === 'context' && !markdown.trim() && !contextFiles.files.length) {
        return json({ error: 'Attach a note to use as context.' }, 400);
    }
    if (markdown.length > MAX_MARKDOWN) {
        return json({ error: 'This note is too large to send.' }, 413);
    }
    if (selection.length > MAX_SELECTION) {
        return json({ error: 'That passage is too long.' }, 413);
    }
    if (instruction.length > MAX_INSTRUCTION) {
        return json({ error: 'That instruction is too long.' }, 413);
    }
    if (task === 'expand' && !selection.trim()) {
        return json({ error: 'Add the passage to expand.' }, 400);
    }
    if ((task === 'revise' || task === 'edit' || task === 'context') && !instruction) {
        return json({ error: 'Describe what should change.' }, 400);
    }

    const provider = body?.provider ?? 'gemini';
    if (provider !== 'gemini' && provider !== 'openai') {
        return json({ error: 'Unknown AI provider.' }, 400);
    }
    const openai = provider === 'openai';
    const apiKey = openai ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
    if (!apiKey) {
        const name = openai ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
        return json({ error: `${name} is not set on the server.` }, 500);
    }
    const providerRequest = buildAiProviderRequest({ ...body, task, markdown, selection, instruction, contextFiles: contextFiles.files });
    if (openai) {
        let response;
        let data;
        try {
            response = await fetch('https://api.openai.com/v1/responses', {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(providerRequest),
                signal: AbortSignal.timeout(50_000),
            });
            data = await response.json();
        } catch {
            return json({ error: 'Could not get a response from OpenAI.' }, 502);
        }
        if (!response.ok) {
            return json({ error: data?.error?.message || 'OpenAI request failed.' }, response.status === 429 ? 429 : 502);
        }
        if (data?.status !== 'completed') return json({ error: 'OpenAI did not finish the response.' }, 502);
        const result = (data.output || []).filter(item => item.type === 'message')
            .flatMap(item => item.content || []).filter(part => part.type === 'output_text')
            .map(part => part.text).join('').trim();
        if (!result) return json({ error: 'OpenAI returned no text.' }, 502);
        const usage = data.usage && {
            inputTokens: data.usage.input_tokens,
            cachedInputTokens: data.usage.input_tokens_details?.cached_tokens ?? 0,
            outputTokens: data.usage.output_tokens,
        };
        if (addOnly) return insertionResponse(markdown, result, usage);
        return json(task === 'context' ? { reply: result, usage } : { markdown: result, usage }, 200);
    }

    let gemini;
    let payload;
    const maxAttempts = addOnly ? 1 : 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            gemini = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                    'Api-Revision': '2026-05-20',
                },
                body: JSON.stringify(providerRequest),
                signal: AbortSignal.timeout(50_000),
            });
            payload = await gemini.json().catch(() => ({}));
            if (gemini.ok) break;
            if ((gemini.status === 503 || gemini.status === 429 || gemini.status >= 500) && attempt < maxAttempts - 1) {
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                continue;
            }
            break;
        } catch {
            if (attempt < maxAttempts - 1) {
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                continue;
            }
            return json({ error: 'Gemini did not respond in time.' }, 504);
        }
    }

    if (!gemini || !gemini.ok) {
        const message = payload?.error?.message || `Gemini request failed (${gemini?.status || 'network'})`;
        return json({ error: message }, gemini?.status === 429 ? 429 : 502);
    }
    if (payload.status && payload.status !== 'completed') {
        return json({ error: 'Gemini did not finish the edit.' }, 502);
    }

    const markdownOut = outputText(payload).trim();
    if (!markdownOut) {
        return json({ error: 'Gemini returned an empty response.' }, 502);
    }
    const usage = usageFrom(payload);
    if (addOnly) return insertionResponse(markdown, markdownOut, usage);
    if (task === 'context') return json({ reply: markdownOut, usage }, 200);
    return json({ markdown: markdownOut, usage }, 200);
}

function usageFrom(interaction) {
    const usage = interaction?.usage;
    if (!usage || typeof usage !== 'object') return null;
    const inputTokens = Number(usage.total_input_tokens);
    const outputTokens = Number(usage.total_output_tokens);
    const thoughtTokens = Number(usage.total_thought_tokens);
    if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
    return {
        inputTokens,
        outputTokens,
        thoughtTokens: Number.isFinite(thoughtTokens) && thoughtTokens > 0 ? thoughtTokens : 0,
    };
}

function normalizeContextFiles(value) {
    if (value == null) return { files: [] };
    if (!Array.isArray(value)) return { error: 'Context files were not a list.', status: 400 };
    if (value.length > MAX_CONTEXT_FILES) {
        return { error: 'Attach at most 4 context notes.', status: 413 };
    }
    const files = [];
    let total = 0;
    for (const entry of value) {
        const name = String(entry?.name || 'note.md').slice(0, 180);
        const markdown = String(entry?.markdown ?? '');
        total += markdown.length;
        if (markdown.length > MAX_MARKDOWN || total > MAX_MARKDOWN) {
            return { error: 'The attached notes are too large to send.', status: 413 };
        }
        if (markdown.trim()) files.push({ name, markdown });
    }
    return { files };
}
