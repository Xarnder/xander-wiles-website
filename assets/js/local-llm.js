const WEB_LLM_URL = 'https://esm.run/@mlc-ai/web-llm';

export const SITE_LLM_MODELS = Object.freeze({
    qwenTodo: Object.freeze({
        id: 'Qwen3-0.6B-q4f16_1-MLC',
        name: 'Qwen3 0.6B',
        role: 'primary to-do summariser'
    }),
    llamaTodo: Object.freeze({
        id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        name: 'Llama 3.2 1B Instruct',
        role: 'backup to-do summariser'
    })
});

const sharedState = globalThis.__xanderSiteLocalLLM || {
    webLLMPromise: null,
    enginePromises: new Map(),
    lastProgressMessageByModel: new Map()
};

globalThis.__xanderSiteLocalLLM = sharedState;

function getWebLLM() {
    if (!sharedState.webLLMPromise) {
        sharedState.webLLMPromise = import(/* @vite-ignore */ WEB_LLM_URL);
    }

    return sharedState.webLLMPromise;
}

export function canUseSiteLocalLLM() {
    return Boolean(navigator.gpu);
}

export function getSiteLocalLLMModelLabel(primaryModelId = SITE_LLM_MODELS.qwenTodo.id, backupModelId = SITE_LLM_MODELS.llamaTodo.id) {
    return `${primaryModelId} (backup: ${backupModelId})`;
}

export async function getSiteLocalLLMEngine(modelId, onStatus = () => { }) {
    if (!sharedState.enginePromises.has(modelId)) {
        onStatus(`Loading ${modelId} locally...`);
        sharedState.enginePromises.set(modelId, getWebLLM().then(({ CreateMLCEngine }) => {
            return CreateMLCEngine(modelId, {
                initProgressCallback: (progress) => {
                    const message = progress?.text || `Loading ${modelId}...`;
                    if (message !== sharedState.lastProgressMessageByModel.get(modelId)) {
                        sharedState.lastProgressMessageByModel.set(modelId, message);
                        onStatus(message, progress);
                    }
                }
            });
        }));
    }

    return sharedState.enginePromises.get(modelId);
}

export async function runSiteLocalLLMChatCompletion(modelId, options, onStatus = () => { }) {
    const engine = await getSiteLocalLLMEngine(modelId, onStatus);
    onStatus(`Generating with ${modelId}...`);
    return engine.chat.completions.create(options);
}
