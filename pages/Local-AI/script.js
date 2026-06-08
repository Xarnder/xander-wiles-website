// === LOCAL AI CONFIGURATION ===
const BONSAI_MODEL_NAME = 'Bonsai 8B 1-bit';
const DEFAULT_MODEL_ID = 'prism-ml/Bonsai-8B-gguf:Q1_0';
const DEFAULT_BASE_URL = 'http://127.0.0.1:8080/v1';
const DEFAULT_START_COMMAND = 'llama-server -hf prism-ml/Bonsai-8B-gguf:Q1_0 --host 127.0.0.1 --port 8080 -ngl 99';
const QWEN_MODELS = {
    'qwen3-0.6b': {
        name: 'Qwen3 0.6B',
        id: 'Qwen3-0.6B-q4f16_1-MLC',
        size: '~352MB',
        vram: '~1.3GB WebGPU VRAM',
        url: 'https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC',
        lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Qwen3-0.6B-q4f16_1_cs1k-webgpu.wasm',
        vramRequiredMB: 1300,
        contextWindowSize: 4096
    },
    'qwen3-4b': {
        name: 'Qwen3 4B',
        id: 'Qwen3-4B-q4f16_1-MLC',
        size: '~2.28GB',
        vram: '~3.4GB WebGPU VRAM',
        url: 'https://huggingface.co/mlc-ai/Qwen3-4B-q4f16_1-MLC',
        lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Qwen3-4B-q4f16_1_cs1k-webgpu.wasm',
        vramRequiredMB: 3431.59,
        contextWindowSize: 4096
    }
};
const DEFAULT_QWEN_MODEL_KEY = 'qwen3-0.6b';
const RUNTIME_MODES = {
    QWEN_BROWSER: 'qwen-browser',
    BONSAI_SERVER: 'bonsai-server'
};

const BASE_URL_KEY = 'lai-bonsai-base-url';
const MODEL_ID_KEY = 'lai-bonsai-model-id';
const RUNTIME_MODE_KEY = 'lai-runtime-mode';
const RUNTIME_MODE_EXPLICIT_KEY = 'lai-runtime-mode-explicit';
const QWEN_MODEL_KEY = 'lai-qwen-model';
const STORAGE_KEY = 'lai-chat-history';

let baseUrl = localStorage.getItem(BASE_URL_KEY) || DEFAULT_BASE_URL;
let modelId = localStorage.getItem(MODEL_ID_KEY) || DEFAULT_MODEL_ID;
let qwenModelKey = QWEN_MODELS[localStorage.getItem(QWEN_MODEL_KEY)]
    ? localStorage.getItem(QWEN_MODEL_KEY)
    : DEFAULT_QWEN_MODEL_KEY;
let qwenModel = QWEN_MODELS[qwenModelKey];
let runtimeMode = localStorage.getItem(RUNTIME_MODE_EXPLICIT_KEY) === 'true'
    ? localStorage.getItem(RUNTIME_MODE_KEY) || RUNTIME_MODES.QWEN_BROWSER
    : RUNTIME_MODES.QWEN_BROWSER;
let webllm = null;
let qwenEngine = null;
let isLoaded = false;
let isGenerating = false;
let activeGenerationController = null;
let qwenCacheTrace = [];
let thinkingTimerInterval = null;
let thinkingStartTime = null;
let thinkingMessageElement = null;

// === DOM ELEMENTS ===
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const debugLog = document.getElementById('debug-log');
const progressPanel = document.getElementById('progress-panel');
const dlBar = document.getElementById('dl-bar');
const dlPercent = document.getElementById('dl-percent');
const dlFilename = document.getElementById('dl-filename');
const settingsToggle = document.getElementById('settings-toggle');
const settingsContent = document.getElementById('settings-content');
const thinkingModeToggle = document.getElementById('thinking-mode');
const systemPromptInput = document.getElementById('system-prompt');
const runtimeSelector = document.getElementById('runtime-selector');
const runtimeSelectorSettings = document.getElementById('runtime-selector-settings');
const qwenModelSelector = document.getElementById('qwen-model-selector');
const serverUrlInput = document.getElementById('server-url');
const modelIdInput = document.getElementById('model-id');
const reconnectBtn = document.getElementById('reconnect-btn');
const copyCommandBtn = document.getElementById('copy-command-btn');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const clearQwenCacheBtn = document.getElementById('clear-qwen-cache-btn');
const toggleDebugBtn = document.getElementById('toggle-debug-btn');
const debugWrapper = document.querySelector('.lai-debug-wrapper');

// Chat History DOM Elements
const historySidebar = document.getElementById('history-sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const historyToggleBtn = document.getElementById('history-toggle-btn');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const chatListContainer = document.getElementById('chat-list');

let chatHistory = { chats: [], currentChatId: null };

// === INITIALIZATION ===
window.addEventListener('DOMContentLoaded', () => {
    loadChatsFromStorage();
    initChatHistoryEvents();
    initControls();
    renderChatList();
    updateModelDisplay();

    const currentChat = getCurrentChat();
    if (currentChat && currentChat.messages.length > 0) {
        clearChatUI();
        currentChat.messages.forEach(msg => renderMessageFromData(msg));
    } else if (!currentChat && chatHistory.chats.length === 0) {
        createNewChat(true);
    }

    init();
});

async function init() {
    log('System initialize...');
    log(`Runtime mode: ${runtimeMode}`);
    updateModelDisplay();
    syncRuntimeSelectors();
    syncQwenModelSelector();

    if (serverUrlInput) serverUrlInput.value = baseUrl;
    if (modelIdInput) modelIdInput.value = modelId;

    if (runtimeMode === RUNTIME_MODES.QWEN_BROWSER) {
        await initQwenBrowser();
        return;
    }

    log(`Local endpoint: ${baseUrl}`);
    log(`Model: ${modelId}`);
    updateConnectionPanel('checking');
    updateStatus('busy', 'Connecting...');

    const connected = await pingServer();
    if (connected) {
        finishLoading('bonsai');
    } else {
        showOfflineState();
    }
}

async function initQwenBrowser() {
    updateStatus('busy', 'Loading...');
    updateQwenPanel('checking', 'Checking WebGPU support...');
    isLoaded = false;
    userInput.disabled = true;
    sendBtn.disabled = true;
    userInput.placeholder = 'Loading Qwen in your browser...';
    qwenCacheTrace = [];
    installCacheTracing();

    if (!navigator.gpu) {
        updateStatus('error', 'WebGPU needed');
        updateQwenPanel('offline', 'WebGPU is not available in this browser.');
        userInput.placeholder = 'WebGPU is needed for Qwen Browser mode...';
        appendMessage(
            'system',
            'Qwen Browser mode needs WebGPU. Try Chrome, Edge, or Safari with WebGPU enabled, or switch to Bonsai Server mode.',
            null,
            null,
            false
        );
        return;
    }

    try {
        await requestPersistentStorage();
        const diagnostics = await runQwenDiagnostics();
        logQwenDiagnostics(diagnostics);

        if (!webllm) {
            updateQwenPanel('checking', 'Loading WebLLM runtime...');
            webllm = await import('https://esm.run/@mlc-ai/web-llm');
        }

        if (!qwenEngine) {
            updateQwenPanel('checking', `Downloading/loading ${qwenModel.name} ${qwenModel.size}...`);
            qwenEngine = await webllm.CreateMLCEngine(qwenModel.id, {
                appConfig: createQwenAppConfig(),
                initProgressCallback: (progress) => handleQwenProgress(progress)
            });
        }

        finishLoading('qwen');
    } catch (err) {
        log(`Qwen Browser load failed: ${formatError(err)}`, 'error');
        logErrorDetails(err);
        if (window.lastQwenDiagnostics) {
            window.lastQwenDiagnostics.cacheTrace = summarizeCacheTrace();
        }
        updateStatus('error', 'Failed');
        updateQwenPanel('offline', buildQwenFailureMessage(err), window.lastQwenDiagnostics || null);
        userInput.placeholder = 'Qwen Browser could not load on this browser...';
        appendMessage(
            'system',
            `Qwen Browser failed to load: ${buildQwenFailureMessage(err)}`,
            null,
            null,
            false
        );
    }
}

async function runQwenDiagnostics() {
    updateQwenPanel('checking', 'Running browser diagnostics...');

    const diagnostics = {
        model: qwenModel.id,
        modelSize: qwenModel.size,
        vram: qwenModel.vram,
        userAgent: navigator.userAgent,
        online: navigator.onLine,
        secureContext: window.isSecureContext,
        webGPU: await inspectWebGPU(),
        storage: await inspectStorage(),
        cache: await inspectCache(),
        network: await inspectQwenNetwork()
    };

    window.lastQwenDiagnostics = diagnostics;
    return diagnostics;
}

async function requestPersistentStorage() {
    if (!navigator.storage?.persist) {
        log('Persistent storage request: navigator.storage.persist unavailable.', 'info');
        return false;
    }

    try {
        const granted = await navigator.storage.persist();
        log(`Persistent storage request: ${granted ? 'granted' : 'not granted'}`, granted ? 'success' : 'info');
        return granted;
    } catch (err) {
        log(`Persistent storage request failed: ${formatError(err)}`, 'error');
        return false;
    }
}

function installCacheTracing() {
    if (!window.Cache || Cache.prototype.__laiQwenTraceInstalled) return;

    const originalAdd = Cache.prototype.add;
    const originalAddAll = Cache.prototype.addAll;
    const originalPut = Cache.prototype.put;

    Cache.prototype.add = async function tracedCacheAdd(request) {
        const url = getRequestUrl(request);
        recordCacheTrace('add:start', url);

        try {
            const result = await originalAdd.call(this, request);
            recordCacheTrace('add:ok', url);
            return result;
        } catch (err) {
            recordCacheTrace('add:error', url, err);
            throw err;
        }
    };

    Cache.prototype.addAll = async function tracedCacheAddAll(requests) {
        const urls = Array.from(requests || []).map(getRequestUrl);
        recordCacheTrace('addAll:start', urls.join(', '));

        try {
            const result = await originalAddAll.call(this, requests);
            recordCacheTrace('addAll:ok', urls.join(', '));
            return result;
        } catch (err) {
            recordCacheTrace('addAll:error', urls.join(', '), err);
            throw err;
        }
    };

    Cache.prototype.put = async function tracedCachePut(request, response) {
        const url = getRequestUrl(request);
        recordCacheTrace('put:start', url);

        try {
            const result = await originalPut.call(this, request, response);
            recordCacheTrace('put:ok', url);
            return result;
        } catch (err) {
            recordCacheTrace('put:error', url, err);
            throw err;
        }
    };

    Cache.prototype.__laiQwenTraceInstalled = true;
    log('Cache API tracing installed for Qwen loads.', 'success');
}

function getRequestUrl(request) {
    if (!request) return '(empty request)';
    if (typeof request === 'string') return request;
    if (request.url) return request.url;
    return String(request);
}

function recordCacheTrace(action, url, err = null) {
    const entry = {
        action,
        url,
        error: err ? formatError(err) : null,
        time: new Date().toISOString()
    };

    qwenCacheTrace.push(entry);
    if (qwenCacheTrace.length > 80) qwenCacheTrace.shift();

    if (action.endsWith(':error')) {
        log(`Cache trace ${action}: ${url} -> ${entry.error}`, 'error');
    } else {
        log(`Cache trace ${action}: ${truncateMiddle(url, 180)}`);
    }
}

function summarizeCacheTrace() {
    const failures = qwenCacheTrace.filter(entry => entry.action.endsWith(':error'));
    const last = qwenCacheTrace[qwenCacheTrace.length - 1] || null;

    return {
        total: qwenCacheTrace.length,
        last,
        failures,
        recent: qwenCacheTrace.slice(-10)
    };
}

async function inspectWebGPU() {
    const result = { available: !!navigator.gpu, adapter: null, error: null };
    if (!navigator.gpu) return result;

    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            result.error = 'No WebGPU adapter returned by browser.';
            return result;
        }

        const info = typeof adapter.requestAdapterInfo === 'function'
            ? await adapter.requestAdapterInfo().catch(() => null)
            : null;

        result.adapter = {
            vendor: info?.vendor || 'unknown',
            architecture: info?.architecture || 'unknown',
            device: info?.device || 'unknown',
            description: info?.description || 'unknown',
            limits: {
                maxBufferSize: adapter.limits?.maxBufferSize || null,
                maxStorageBufferBindingSize: adapter.limits?.maxStorageBufferBindingSize || null
            }
        };
    } catch (err) {
        result.error = formatError(err);
    }

    return result;
}

async function inspectStorage() {
    const result = { available: false, quota: null, usage: null, free: null, persisted: null, error: null };
    if (!navigator.storage?.estimate) {
        result.error = 'navigator.storage.estimate is unavailable.';
        return result;
    }

    try {
        const estimate = await navigator.storage.estimate();
        result.available = true;
        result.quota = estimate.quota || 0;
        result.usage = estimate.usage || 0;
        result.free = Math.max(0, result.quota - result.usage);
        result.persisted = navigator.storage.persisted
            ? await navigator.storage.persisted().catch(() => null)
            : null;
    } catch (err) {
        result.error = formatError(err);
    }

    return result;
}

async function inspectCache() {
    const result = { available: !!window.caches, writeTest: false, names: [], error: null };
    if (!window.caches) {
        result.error = 'Cache API is unavailable in this context.';
        return result;
    }

    try {
        result.names = await caches.keys();
        const cache = await caches.open('lai-diagnostics');
        const response = new Response('ok', {
            headers: {
                'Content-Type': 'text/plain',
                'Cache-Control': 'no-store'
            }
        });
        await cache.put('/pages/Local-AI/__diagnostic-cache-test__', response);
        await cache.delete('/pages/Local-AI/__diagnostic-cache-test__');
        result.writeTest = true;
    } catch (err) {
        result.error = formatError(err);
    }

    return result;
}

async function inspectQwenNetwork() {
    const shardProbe = await inspectQwenShards();

    return {
        webllmModule: await probeUrl('https://esm.run/@mlc-ai/web-llm', 'module'),
        modelConfig: await probeUrl(`${qwenModel.url}/resolve/main/mlc-chat-config.json`, 'model config'),
        ndarrayCache: await probeUrl(`${qwenModel.url}/resolve/main/ndarray-cache.json`, 'ndarray cache'),
        tokenizer: await probeUrl(`${qwenModel.url}/resolve/main/tokenizer.json`, 'tokenizer'),
        modelLib: await probeUrl(qwenModel.lib, 'wasm model lib'),
        shards: shardProbe
    };
}

async function inspectQwenShards() {
    const indexUrl = `${qwenModel.url}/resolve/main/ndarray-cache.json`;

    try {
        const response = await fetch(indexUrl, { cache: 'no-store' });
        if (!response.ok) {
            return {
                ok: false,
                label: 'model shards',
                error: `Could not read shard index: HTTP ${response.status}`,
                total: 0,
                checked: 0,
                failed: []
            };
        }

        const index = await response.json();
        const shardRecords = Array.isArray(index.records)
            ? index.records.filter(record => record.dataPath)
            : [];
        const shardUrls = shardRecords.map(record => ({
            label: record.dataPath,
            url: `${qwenModel.url}/resolve/main/${record.dataPath}`,
            declaredSize: Number(record.nbytes) || null
        }));

        const probes = [];
        const concurrency = 4;
        let nextIndex = 0;

        async function worker() {
            while (nextIndex < shardUrls.length) {
                const current = shardUrls[nextIndex++];
                const probe = await probeUrl(current.url, current.label);
                probe.declaredSize = current.declaredSize;
                probes.push(probe);
            }
        }

        await Promise.all(Array.from({ length: Math.min(concurrency, shardUrls.length) }, worker));

        const failed = probes.filter(probe => !probe.ok);
        const totalBytes = shardRecords.reduce((sum, record) => sum + (Number(record.nbytes) || 0), 0);

        return {
            ok: failed.length === 0,
            label: 'model shards',
            total: shardUrls.length,
            checked: probes.length,
            failed,
            totalBytes,
            largest: shardRecords.reduce((largest, record) => {
                const size = Number(record.nbytes) || 0;
                return size > (largest?.nbytes || 0) ? record : largest;
            }, null)
        };
    } catch (err) {
        return {
            ok: false,
            label: 'model shards',
            error: formatError(err),
            total: 0,
            checked: 0,
            failed: []
        };
    }
}

async function probeUrl(url, label) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(url, {
            method: 'HEAD',
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (response.status === 405 || response.status === 403) {
            return await probeUrlWithGet(url, label);
        }

        return {
            label,
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            type: response.type,
            size: Number(response.headers.get('content-length')) || null,
            contentType: response.headers.get('content-type') || null,
            finalUrl: response.url
        };
    } catch (err) {
        clearTimeout(timeout);
        return {
            label,
            ok: false,
            error: formatError(err),
            finalUrl: url
        };
    }
}

async function probeUrlWithGet(url, label) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            headers: { Range: 'bytes=0-0' },
            signal: controller.signal
        });
        clearTimeout(timeout);

        return {
            label,
            ok: response.ok || response.status === 206,
            status: response.status,
            statusText: response.statusText,
            type: response.type,
            size: Number(response.headers.get('content-length')) || null,
            contentType: response.headers.get('content-type') || null,
            finalUrl: response.url
        };
    } catch (err) {
        clearTimeout(timeout);
        return {
            label,
            ok: false,
            error: formatError(err),
            finalUrl: url
        };
    }
}

function createQwenAppConfig() {
    const prebuiltConfig = webllm?.prebuiltAppConfig || {};
    const prebuiltModels = Array.isArray(prebuiltConfig.model_list) ? prebuiltConfig.model_list : [];
    const hasQwen = prebuiltModels.some(model => model.model_id === qwenModel.id);

    return {
        ...prebuiltConfig,
        model_list: hasQwen
            ? prebuiltModels
            : [
                ...prebuiltModels,
                {
                    model: qwenModel.url,
                    model_id: qwenModel.id,
                    model_lib: qwenModel.lib,
                    vram_required_MB: qwenModel.vramRequiredMB,
                    low_resource_required: true,
                    overrides: {
                        context_window_size: qwenModel.contextWindowSize
                    }
                }
            ]
    };
}

async function pingServer() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    try {
        const response = await fetch(`${trimBaseUrl(baseUrl)}/models`, {
            method: 'GET',
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`Server responded with HTTP ${response.status}`);
        }

        const data = await response.json().catch(() => null);
        const names = Array.isArray(data?.data) ? data.data.map(item => item.id).filter(Boolean) : [];
        if (names.length > 0) {
            log(`Server models: ${names.join(', ')}`, 'success');
        }

        return true;
    } catch (err) {
        clearTimeout(timeout);
        log(`Could not reach Bonsai server: ${formatError(err)}`, 'error');
        return false;
    }
}

function finishLoading(runtime) {
    isLoaded = true;
    updateStatus('ready', 'Ready');

    userInput.disabled = false;
    sendBtn.disabled = false;

    if (runtime === 'qwen') {
        updateQwenPanel('connected', `${qwenModel.name} is ready in-browser.`);
        userInput.placeholder = `Ask ${qwenModel.name} something...`;
        appendMessage(
            'system',
            `${qwenModel.name} is ready. It runs locally in this browser with WebGPU and does not need a server.`,
            null,
            null,
            false
        );
        return;
    }

    updateConnectionPanel('connected');
    userInput.placeholder = `Ask ${BONSAI_MODEL_NAME} something...`;

    appendMessage(
        'system',
        `${BONSAI_MODEL_NAME} is connected at ${baseUrl}. All chat requests stay on this local endpoint.`,
        null,
        null,
        false
    );
}

function showOfflineState() {
    isLoaded = false;
    updateStatus('error', 'Offline');
    updateConnectionPanel('offline');
    userInput.disabled = true;
    sendBtn.disabled = true;
    userInput.placeholder = 'Start the local Bonsai server first...';

    appendMessage(
        'system',
        `Bonsai is not reachable yet. Start it locally with:\n\n${DEFAULT_START_COMMAND}\n\nThen press Reconnect.`,
        null,
        null,
        false
    );
}

function updateQwenPanel(state, message, diagnostics = null) {
    if (!progressPanel) return;

    if (state === 'checking') {
        progressPanel.innerHTML = `
            <div class="lai-local-runtime loading">
                <div class="lai-local-runtime-main">
                    <strong>Qwen Browser loading</strong>
                    <span>${escapeHtml(message)}</span>
                    <small>Model: ${qwenModel.id} (${qwenModel.size}, ${qwenModel.vram})</small>
                </div>
                <div class="lai-progress-track">
                    <div id="qwen-progress-bar" class="lai-progress-fill" style="width: 8%"></div>
                </div>
                <small id="qwen-progress-text" class="lai-file-name">${escapeHtml(message)}</small>
            </div>
        `;
        return;
    }

    const isConnected = state === 'connected';
    const diagnosticsHtml = !isConnected && diagnostics
        ? `<div class="lai-diagnostic-list">${buildQwenDiagnosticsHtml(diagnostics)}</div>`
        : '';

    progressPanel.innerHTML = `
        <div class="lai-local-runtime ${isConnected ? 'connected' : 'offline'}">
            <div class="lai-local-runtime-main">
                <strong>${isConnected ? 'Qwen Browser ready' : 'Qwen Browser unavailable'}</strong>
                <span>${escapeHtml(message)}</span>
                <small>Model: ${qwenModel.id} (${qwenModel.size}, ${qwenModel.vram})</small>
            </div>
            ${diagnosticsHtml}
            <div class="lai-local-runtime-actions">
                <button id="runtime-reload-qwen-btn" class="lai-header-btn lai-runtime-btn">${isConnected ? 'Reload' : 'Try Again'}</button>
            </div>
        </div>
    `;

    document.getElementById('runtime-reload-qwen-btn')?.addEventListener('click', reconnect);
}

function buildQwenFailureMessage(err) {
    const message = formatError(err);
    const diagnostics = window.lastQwenDiagnostics;
    const hints = [];

    if (message.includes("Cache.add()")) {
        hints.push('The browser Cache API failed while WebLLM was downloading model files.');
    }

    if (diagnostics?.storage?.free != null) {
        const requiredBytes = qwenModelKey === 'qwen3-4b'
            ? 5 * 1024 * 1024 * 1024
            : 900 * 1024 * 1024;
        if (diagnostics.storage.free < requiredBytes) {
            hints.push(`Browser storage looks low: ${formatBytes(diagnostics.storage.free)} free.`);
        }
    }

    const failedNetwork = diagnostics?.network
        ? Object.entries(diagnostics.network)
            .filter(([key, item]) => key !== 'shards' && !item.ok)
            .map(([, item]) => item)
        : [];
    if (failedNetwork.length > 0) {
        hints.push(`Network probes failed for: ${failedNetwork.map(item => item.label).join(', ')}.`);
    }

    const shardProbe = diagnostics?.network?.shards;
    if (shardProbe && !shardProbe.ok) {
        const failedNames = shardProbe.failed?.slice(0, 5).map(item => item.label).join(', ');
        hints.push(failedNames
            ? `Model shard probes failed for: ${failedNames}.`
            : `Model shard probe failed: ${shardProbe.error || 'unknown shard error'}.`);
    }

    if (diagnostics?.cache && !diagnostics.cache.writeTest) {
        hints.push('Cache API write test failed, so browser/site storage may be blocked.');
    }

    const cacheFailures = diagnostics?.cacheTrace?.failures || [];
    if (cacheFailures.length > 0) {
        const lastFailure = cacheFailures[cacheFailures.length - 1];
        hints.push(`Failing Cache.add URL: ${lastFailure.url}.`);
    }

    return [message, ...hints].join(' ');
}

function buildQwenDiagnosticsHtml(diagnostics) {
    const rows = [];
    const storage = diagnostics.storage;
    const cache = diagnostics.cache;
    const webGPU = diagnostics.webGPU;
    const network = diagnostics.network || {};

    rows.push(diagnosticRow('Online', diagnostics.online ? 'yes' : 'no', diagnostics.online));
    rows.push(diagnosticRow('Secure context', diagnostics.secureContext ? 'yes' : 'no', diagnostics.secureContext));
    rows.push(diagnosticRow('WebGPU', webGPU.available ? describeWebGPU(webGPU) : webGPU.error || 'unavailable', webGPU.available && !webGPU.error));

    if (storage.available) {
        rows.push(diagnosticRow(
            'Storage free',
            `${formatBytes(storage.free)} free of ${formatBytes(storage.quota)} quota`,
            storage.free > 0
        ));
        rows.push(diagnosticRow('Persistent storage', storage.persisted === null ? 'unknown' : storage.persisted ? 'yes' : 'no', storage.persisted !== false));
    } else {
        rows.push(diagnosticRow('Storage estimate', storage.error || 'unavailable', false));
    }

    rows.push(diagnosticRow('Cache API', cache.writeTest ? `write OK (${cache.names.length} cache(s))` : cache.error || 'write failed', cache.writeTest));

    Object.entries(network).forEach(([key, item]) => {
        if (key === 'shards') return;
        const status = item.ok
            ? `OK ${item.status || ''}${item.size ? `, ${formatBytes(item.size)}` : ''}`
            : item.error || `HTTP ${item.status} ${item.statusText || ''}`;
        rows.push(diagnosticRow(`Fetch ${item.label}`, status, item.ok));
    });

    if (network.shards) {
        const shardStatus = network.shards.ok
            ? `${network.shards.checked}/${network.shards.total} OK, total ${formatBytes(network.shards.totalBytes)}`
            : describeShardFailure(network.shards);
        rows.push(diagnosticRow('Fetch model shards', shardStatus, network.shards.ok));

        if (network.shards.largest?.dataPath) {
            rows.push(diagnosticRow(
                'Largest shard',
                `${network.shards.largest.dataPath}, ${formatBytes(network.shards.largest.nbytes)}`,
                true
            ));
        }
    }

    if (diagnostics.cacheTrace) {
        const failures = diagnostics.cacheTrace.failures || [];
        if (failures.length > 0) {
            const lastFailure = failures[failures.length - 1];
            rows.push(diagnosticRow(
                'Failed Cache.add URL',
                `${lastFailure.url} (${lastFailure.error})`,
                false
            ));
        } else if (diagnostics.cacheTrace.last) {
            rows.push(diagnosticRow(
                'Last Cache API action',
                `${diagnostics.cacheTrace.last.action}: ${diagnostics.cacheTrace.last.url}`,
                true
            ));
        }
    }

    return rows.join('');
}

function describeShardFailure(shards) {
    if (shards.error) return shards.error;
    if (!shards.failed || shards.failed.length === 0) {
        return `${shards.checked}/${shards.total} checked, unknown shard failure`;
    }

    return shards.failed
        .slice(0, 6)
        .map(item => `${item.label}: ${item.error || `HTTP ${item.status}`}`)
        .join('; ');
}

function diagnosticRow(label, value, ok) {
    return `
        <div class="lai-diagnostic-row ${ok ? 'ok' : 'bad'}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `;
}

function describeWebGPU(webGPU) {
    if (webGPU.error) return webGPU.error;
    const adapter = webGPU.adapter;
    if (!adapter) return 'available, adapter unknown';
    const description = adapter.description && adapter.description !== 'unknown'
        ? adapter.description
        : [adapter.vendor, adapter.architecture, adapter.device].filter(part => part && part !== 'unknown').join(' ');
    return description || 'available';
}

function logQwenDiagnostics(diagnostics) {
    log(`Qwen diagnostics: model=${diagnostics.model}, size=${diagnostics.modelSize}, vram=${diagnostics.vram}`);
    log(`Browser: online=${diagnostics.online}, secureContext=${diagnostics.secureContext}`);

    if (diagnostics.webGPU?.adapter) {
        log(`WebGPU adapter: ${describeWebGPU(diagnostics.webGPU)}`, 'success');
    } else {
        log(`WebGPU issue: ${diagnostics.webGPU?.error || 'unavailable'}`, 'error');
    }

    if (diagnostics.storage?.available) {
        log(`Storage: ${formatBytes(diagnostics.storage.free)} free / ${formatBytes(diagnostics.storage.quota)} quota, persisted=${diagnostics.storage.persisted}`);
    } else {
        log(`Storage estimate unavailable: ${diagnostics.storage?.error}`, 'error');
    }

    log(`Cache API: ${diagnostics.cache?.writeTest ? 'write test OK' : diagnostics.cache?.error || 'write test failed'}`, diagnostics.cache?.writeTest ? 'success' : 'error');

    Object.entries(diagnostics.network || {}).forEach(([key, item]) => {
        if (key === 'shards') {
            if (item.ok) {
                log(`Network model shards: ${item.checked}/${item.total} OK, total ${formatBytes(item.totalBytes)}`, 'success');
            } else {
                log(`Network model shards failed: ${describeShardFailure(item)}`, 'error');
            }
            return;
        }

        const detail = item.ok
            ? `OK ${item.status}${item.size ? ` (${formatBytes(item.size)})` : ''}`
            : item.error || `HTTP ${item.status}`;
        log(`Network ${item.label}: ${detail}`, item.ok ? 'success' : 'error');
    });
}

function logErrorDetails(err) {
    if (!err) return;
    log(`Error name: ${err.name || 'unknown'}`, 'error');
    if (err.stack) {
        log(`Error stack: ${err.stack}`, 'error');
    }
}

function formatBytes(bytes) {
    if (bytes == null || Number.isNaN(bytes)) return 'unknown';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = Number(bytes);
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function truncateMiddle(text, maxLength) {
    const value = String(text || '');
    if (value.length <= maxLength) return value;

    const sideLength = Math.floor((maxLength - 3) / 2);
    return `${value.slice(0, sideLength)}...${value.slice(-sideLength)}`;
}

function handleQwenProgress(progress) {
    const percent = Math.max(0, Math.min(100, Math.round((progress.progress || 0) * 100)));
    const text = progress.text || progress.timeElapsed
        ? `${progress.text || 'Loading'}`
        : 'Loading model files...';

    const bar = document.getElementById('qwen-progress-bar');
    const label = document.getElementById('qwen-progress-text');

    if (bar) bar.style.width = `${percent || 8}%`;
    if (label) label.textContent = percent > 0 ? `${text} (${percent}%)` : text;

    if (percent > 0 && percent % 20 === 0) {
        log(`Qwen Browser load progress: ${percent}%`);
    }
}

function updateConnectionPanel(state) {
    if (!progressPanel) return;

    const command = escapeHtml(DEFAULT_START_COMMAND);
    const endpoint = escapeHtml(baseUrl);
    const model = escapeHtml(modelId);

    if (state === 'checking') {
        if (dlBar) dlBar.style.width = '35%';
        if (dlPercent) dlPercent.innerText = 'Checking';
        if (dlFilename) dlFilename.innerText = `Connecting to ${baseUrl}`;
        progressPanel.classList.remove('collapsed');
        return;
    }

    const isConnected = state === 'connected';
    progressPanel.innerHTML = `
        <div class="lai-local-runtime ${isConnected ? 'connected' : 'offline'}">
            <div class="lai-local-runtime-main">
                <strong>${isConnected ? 'Bonsai server connected' : 'Bonsai server offline'}</strong>
                <span>${endpoint}</span>
                <small>Model: ${model}</small>
            </div>
            <div class="lai-local-runtime-actions">
                <button id="runtime-reconnect-btn" class="lai-header-btn lai-runtime-btn">${isConnected ? 'Check' : 'Reconnect'}</button>
                <button id="runtime-copy-command-btn" class="lai-header-btn lai-runtime-btn">Copy Command</button>
            </div>
            ${isConnected ? '' : `<pre class="lai-command-box">${command}</pre>`}
        </div>
    `;

    document.getElementById('runtime-reconnect-btn')?.addEventListener('click', reconnect);
    document.getElementById('runtime-copy-command-btn')?.addEventListener('click', copyStartCommand);
}

function updateModelDisplay() {
    const headerTitle = document.getElementById('model-title');
    const headerSubtitle = document.querySelector('.lai-subtitle');
    const platformBadge = document.getElementById('platform-badge');
    const isQwen = runtimeMode === RUNTIME_MODES.QWEN_BROWSER;

    if (headerTitle) {
        headerTitle.innerHTML = isQwen
            ? `${escapeHtml(qwenModel.name.split(' ')[0])} <span>${escapeHtml(qwenModel.name.split(' ').slice(1).join(' '))} MLC</span>`
            : 'Bonsai 8B <span>1-bit</span>';
    }

    if (headerSubtitle) {
        headerSubtitle.textContent = isQwen
            ? 'Running locally in-browser with WebGPU'
            : 'Running locally through an OpenAI-compatible endpoint';
    }

    if (platformBadge) {
        platformBadge.classList.add('visible');
        platformBadge.textContent = isQwen ? 'No server' : 'Local server';
    }

    document.title = `${isQwen ? qwenModel.name : BONSAI_MODEL_NAME} - Local AI Chat`;
}

// === CHAT LOGIC ===
async function handleSend() {
    const text = userInput.value.trim();
    if (!text || isGenerating || !isLoaded) return;

    const startTime = performance.now();
    window.currentGenInputText = text;
    userInput.value = '';
    userInput.style.height = 'auto';
    appendMessage('user', text);

    isGenerating = true;
    updateStatus('busy', 'Thinking...');
    sendBtn.disabled = true;
    showThinkingBubble();

    const systemPrompt = systemPromptInput?.value?.trim() || 'You are a helpful assistant.';
    const directness = thinkingModeToggle?.checked
        ? ''
        : ' Reply directly and do not show hidden chain-of-thought or private reasoning.';

    const messages = buildMessages(`${systemPrompt}${directness}`);
    const inputTokens = countTokens(messages.map(msg => msg.content).join('\n'));

    try {
        if (runtimeMode === RUNTIME_MODES.QWEN_BROWSER) {
            await generateWithQwen(messages, startTime, inputTokens);
            return;
        }

        activeGenerationController = new AbortController();
        updateThinkingStatus('Sending request to local Bonsai server...');
        const response = await fetch(`${trimBaseUrl(baseUrl)}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: activeGenerationController.signal,
            body: JSON.stringify({
                model: modelId,
                messages,
                stream: true,
                temperature: 0.5,
                top_p: 0.9,
                max_tokens: 2048
            })
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status}${errorText ? `: ${errorText}` : ''}`);
        }

        updateThinkingStatus('Streaming response...');
        const output = await readOpenAIStream(response);
        completeGeneration(output, startTime, inputTokens);
    } catch (err) {
        removeThinkingBubble();
        isGenerating = false;
        activeGenerationController = null;
        sendBtn.disabled = false;
        updateStatus(isLoaded ? 'ready' : 'error', isLoaded ? 'Ready' : 'Offline');
        log(`Generation failed: ${formatError(err)}`, 'error');
        appendMessage('system', `Generation failed: ${formatError(err)}`, null, null, false);
    }
}

async function generateWithQwen(messages, startTime, inputTokens) {
    if (!qwenEngine) {
        throw new Error('Qwen Browser model is not loaded yet.');
    }

    updateThinkingStatus('Running Qwen in-browser...');
    const streaming = createStreamingMessage();
    removeThinkingBubble();
    let output = '';

    const chunks = await qwenEngine.chat.completions.create({
        messages,
        stream: true,
        temperature: 0.6,
        top_p: 0.9,
        max_tokens: 1024,
        stream_options: { include_usage: true }
    });

    for await (const chunk of chunks) {
        const token = chunk?.choices?.[0]?.delta?.content || '';
        if (token) {
            output += token;
            streaming.update(output);
        }
    }

    streaming.finalize();
    completeGeneration(output, startTime, inputTokens);
}

function buildMessages(systemPrompt) {
    const currentChat = getCurrentChat();
    const messages = [{ role: 'system', content: systemPrompt }];

    if (!currentChat) return messages;

    currentChat.messages.forEach(msg => {
        if (msg.role === 'user') {
            messages.push({ role: 'user', content: msg.text });
        } else if (msg.role === 'bot') {
            messages.push({ role: 'assistant', content: msg.text });
        }
    });

    return messages;
}

async function readOpenAIStream(response) {
    const contentType = response.headers.get('content-type') || '';

    if (!response.body || !contentType.includes('text/event-stream')) {
        const data = await response.json();
        return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let output = '';
    const streaming = createStreamingMessage();
    removeThinkingBubble();

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || !line.startsWith('data:')) continue;

            const payload = line.replace(/^data:\s*/, '');
            if (payload === '[DONE]') continue;

            try {
                const chunk = JSON.parse(payload);
                const token = chunk?.choices?.[0]?.delta?.content || chunk?.choices?.[0]?.text || '';
                if (token) {
                    output += token;
                    streaming.update(output);
                }
            } catch (err) {
                log(`Skipped malformed stream chunk: ${formatError(err)}`, 'error');
            }
        }
    }

    streaming.finalize();
    return output.trim();
}

function completeGeneration(output, startTime, inputTokens) {
    removeThinkingBubble();
    const response = cleanModelResponse(output);
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    const metrics = {
        duration,
        inputWords: countWords(window.currentGenInputText),
        inputTokens,
        outputWords: countWords(response),
        outputTokens: countTokens(response)
    };

    removeStreamingDraft();
    appendMessage('bot', response || 'No response returned.', null, metrics);

    isGenerating = false;
    activeGenerationController = null;
    updateStatus('ready', 'Ready');
    sendBtn.disabled = false;
    userInput.focus();
    log('Generation complete.', 'success');
}

function createStreamingMessage() {
    removeStreamingDraft();

    const msgDiv = document.createElement('div');
    msgDiv.className = 'lai-message lai-bot';
    msgDiv.id = 'lai-streaming-draft';

    const bubble = document.createElement('div');
    bubble.className = 'lai-bubble';

    const textSpan = document.createElement('span');
    textSpan.className = 'lai-streaming-text';
    textSpan.textContent = '';

    bubble.appendChild(textSpan);
    msgDiv.appendChild(bubble);
    chatContainer.appendChild(msgDiv);

    return {
        update(text) {
            if (typeof marked !== 'undefined') {
                textSpan.innerHTML = marked.parse(text);
            } else {
                textSpan.innerText = text;
            }
            chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
        },
        finalize() {
            msgDiv.dataset.finalized = 'true';
        }
    };
}

function removeStreamingDraft() {
    document.getElementById('lai-streaming-draft')?.remove();
}

function cleanModelResponse(text) {
    return (text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<\|im_end\|>/g, '')
        .replace(/^assistant:?\s*/i, '')
        .trim();
}

// === CHAT HISTORY ===
function generateChatId() {
    return 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
}

function saveChatsToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory));
    } catch (e) {
        console.error('Failed to save chat history:', e);
    }
}

function loadChatsFromStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            chatHistory = JSON.parse(saved);
        }
    } catch (e) {
        console.error('Failed to load chat history:', e);
        chatHistory = { chats: [], currentChatId: null };
    }
}

function createNewChat(silent = false) {
    const newChat = {
        id: generateChatId(),
        title: 'New Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
    };

    chatHistory.chats.unshift(newChat);
    chatHistory.currentChatId = newChat.id;
    saveChatsToStorage();
    clearChatUI();
    renderChatList();

    if (!silent) {
        log('New chat created.', 'info');
    }

    return newChat;
}

function getCurrentChat() {
    if (!chatHistory.currentChatId) return null;
    return chatHistory.chats.find(c => c.id === chatHistory.currentChatId) || null;
}

function loadChat(chatId) {
    const chat = chatHistory.chats.find(c => c.id === chatId);
    if (!chat) return;

    chatHistory.currentChatId = chatId;
    saveChatsToStorage();
    clearChatUI();
    chat.messages.forEach(msg => renderMessageFromData(msg));
    renderChatList();
    closeSidebar();
}

function deleteChat(chatId) {
    const index = chatHistory.chats.findIndex(c => c.id === chatId);
    if (index === -1) return;

    const wasCurrentChat = chatHistory.currentChatId === chatId;
    chatHistory.chats.splice(index, 1);

    if (wasCurrentChat) {
        if (chatHistory.chats.length > 0) {
            chatHistory.currentChatId = chatHistory.chats[0].id;
            loadChat(chatHistory.currentChatId);
        } else {
            createNewChat(true);
        }
    }

    saveChatsToStorage();
    renderChatList();
}

function deleteAllChats() {
    chatHistory = { chats: [], currentChatId: null };
    saveChatsToStorage();
    createNewChat(true);
    renderChatList();
    closeSidebar();
    appendMessage('system', 'All chat history has been deleted.', null, null, false);
}

function updateChatTitle(chatId, firstMessage) {
    const chat = chatHistory.chats.find(c => c.id === chatId);
    if (!chat) return;

    chat.title = firstMessage.substring(0, 40) + (firstMessage.length > 40 ? '...' : '');
    chat.updatedAt = Date.now();
    saveChatsToStorage();
    renderChatList();
}

function addMessageToCurrentChat(role, text, context = null, metrics = null) {
    let chat = getCurrentChat();
    if (!chat) {
        chat = createNewChat(true);
    }

    const message = { role, text };
    if (context) message.context = context;
    if (metrics) message.metrics = metrics;

    chat.messages.push(message);
    chat.updatedAt = Date.now();

    if (role === 'user' && chat.messages.filter(m => m.role === 'user').length === 1) {
        updateChatTitle(chat.id, text);
    }

    saveChatsToStorage();
}

function clearChatUI() {
    chatContainer.innerHTML = `
        <div class="lai-message lai-system">
            <div class="lai-bubble">
                Welcome. Choose Qwen Browser for server-free local chat, or Bonsai Server for the 1-bit model.
            </div>
        </div>`;
}

function renderMessageFromData(msg) {
    appendMessage(msg.role, msg.text, msg.context || null, msg.metrics || null, false);
}

function renderChatList() {
    if (!chatListContainer) return;

    if (chatHistory.chats.length === 0) {
        chatListContainer.innerHTML = `
            <div class="lai-empty-history">
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <p>No chats yet.<br>Start a conversation.</p>
            </div>`;
        return;
    }

    chatListContainer.innerHTML = chatHistory.chats.map(chat => {
        const isActive = chat.id === chatHistory.currentChatId;
        const date = new Date(chat.updatedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="lai-chat-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}">
                <div class="lai-chat-item-info">
                    <div class="lai-chat-item-title">${escapeHtml(chat.title)}</div>
                    <div class="lai-chat-item-date">${date}</div>
                </div>
                <button class="lai-chat-item-delete" data-delete-id="${chat.id}" title="Delete">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>`;
    }).join('');

    chatListContainer.querySelectorAll('.lai-chat-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.lai-chat-item-delete')) return;
            loadChat(item.dataset.chatId);
        });
    });

    chatListContainer.querySelectorAll('.lai-chat-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showConfirmModal(
                'Delete Chat',
                'Are you sure you want to delete this chat? This action cannot be undone.',
                () => deleteChat(btn.dataset.deleteId)
            );
        });
    });
}

// === UI HELPERS ===
function appendMessage(role, text, context = null, metrics = null, saveToHistory = true) {
    if (saveToHistory && role !== 'system') {
        addMessageToCurrentChat(role, text, context, metrics);
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = `lai-message lai-${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'lai-bubble';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'lai-msg-copy-btn';
    copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>`;
    copyBtn.title = 'Copy Text';
    copyBtn.onclick = () => copyText(text);
    bubble.appendChild(copyBtn);

    if (context) {
        const details = document.createElement('details');
        details.className = 'lai-context-details';

        const summary = document.createElement('summary');
        summary.innerText = 'Show Context';
        summary.className = 'lai-context-summary';

        const content = document.createElement('pre');
        content.className = 'lai-context-content';
        content.innerText = context;

        details.appendChild(summary);
        details.appendChild(content);
        bubble.appendChild(details);
    }

    const textSpan = document.createElement('span');
    if (role === 'bot' && typeof marked !== 'undefined') {
        textSpan.innerHTML = marked.parse(text);
    } else {
        textSpan.innerText = text;
    }

    bubble.appendChild(textSpan);

    if (metrics) {
        const footer = document.createElement('div');
        footer.className = 'lai-message-metrics';
        footer.innerText = [
            `${metrics.duration}s`,
            `Input: ${metrics.inputTokens} toks`,
            `Output: ${metrics.outputWords} words (${metrics.outputTokens} toks)`
        ].join('  |  ');
        bubble.appendChild(footer);
    }

    msgDiv.appendChild(bubble);
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
}

function showThinkingBubble() {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'lai-message lai-bot lai-thinking';
    msgDiv.id = 'lai-thinking-message';

    const bubble = document.createElement('div');
    bubble.className = 'lai-bubble';
    bubble.innerHTML = `
        <div class="lai-thinking-bubble">
            <div class="lai-thinking-timer" id="lai-thinking-timer">0.0s</div>
            <div class="lai-thinking-dots"><span></span><span></span><span></span></div>
            <div class="lai-thinking-status" id="lai-thinking-status">Thinking...</div>
        </div>`;

    msgDiv.appendChild(bubble);
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });

    thinkingMessageElement = msgDiv;
    thinkingStartTime = performance.now();
    thinkingTimerInterval = setInterval(() => {
        const elapsed = ((performance.now() - thinkingStartTime) / 1000).toFixed(1);
        const timerEl = document.getElementById('lai-thinking-timer');
        if (timerEl) timerEl.textContent = `${elapsed}s`;
    }, 100);
}

function removeThinkingBubble() {
    if (thinkingTimerInterval) {
        clearInterval(thinkingTimerInterval);
        thinkingTimerInterval = null;
    }

    if (thinkingMessageElement) {
        thinkingMessageElement.remove();
        thinkingMessageElement = null;
    }

    thinkingStartTime = null;
}

function updateThinkingStatus(text) {
    const statusEl = document.getElementById('lai-thinking-status');
    if (statusEl) statusEl.textContent = text;
}

function updateStatus(state, text) {
    if (!statusBadge) return;
    statusBadge.className = `lai-status-badge lai-status-${state}`;
    statusText.innerText = text;
}

function log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const formattedMsg = `[${time}] ${msg}`;

    if (type === 'error') console.error(formattedMsg);
    else console.log(formattedMsg);

    if (!debugLog) return;

    const line = document.createElement('div');
    line.textContent = `> ${msg}`;
    if (type === 'error') line.style.color = '#ff6b6b';
    if (type === 'success') line.style.color = '#4ade80';
    debugLog.appendChild(line);
    debugLog.scrollTop = debugLog.scrollHeight;
}

function initControls() {
    sendBtn.addEventListener('click', handleSend);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
    userInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = `${this.scrollHeight}px`;
    });

    settingsToggle?.addEventListener('click', () => {
        settingsContent?.classList.toggle('hidden');
    });

    reconnectBtn?.addEventListener('click', reconnect);
    copyCommandBtn?.addEventListener('click', copyStartCommand);

    runtimeSelector?.addEventListener('change', (event) => {
        setRuntimeMode(event.target.value);
    });

    runtimeSelectorSettings?.addEventListener('change', (event) => {
        setRuntimeMode(event.target.value);
    });

    qwenModelSelector?.addEventListener('change', async (event) => {
        await setQwenModel(event.target.value);
    });

    serverUrlInput?.addEventListener('change', () => {
        baseUrl = serverUrlInput.value.trim() || DEFAULT_BASE_URL;
        localStorage.setItem(BASE_URL_KEY, baseUrl);
        reconnect();
    });

    modelIdInput?.addEventListener('change', () => {
        modelId = modelIdInput.value.trim() || DEFAULT_MODEL_ID;
        localStorage.setItem(MODEL_ID_KEY, modelId);
        log(`Model id set to ${modelId}`, 'info');
    });

    clearCacheBtn?.addEventListener('click', () => {
        showConfirmModal(
            'Clear Local Settings?',
            'This clears the saved endpoint, model id, and chat history for this page. It does not delete Bonsai model files from your machine.',
            () => {
                localStorage.removeItem(BASE_URL_KEY);
                localStorage.removeItem(MODEL_ID_KEY);
                localStorage.removeItem(RUNTIME_MODE_KEY);
                localStorage.removeItem(RUNTIME_MODE_EXPLICIT_KEY);
                localStorage.removeItem(QWEN_MODEL_KEY);
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            },
            'Clear',
            'danger'
        );
    });

    clearQwenCacheBtn?.addEventListener('click', () => {
        showConfirmModal(
            'Clear Qwen Model Cache?',
            'This deletes browser caches that contain WebLLM, Hugging Face, MLC, or Qwen model files. Chat history and settings are kept.',
            clearQwenModelCaches,
            'Clear Qwen Cache',
            'danger'
        );
    });

    toggleDebugBtn?.addEventListener('click', () => {
        if (!debugWrapper) return;
        const isHidden = debugWrapper.style.display === 'none';
        debugWrapper.style.display = isHidden ? 'block' : 'none';
        toggleDebugBtn.style.opacity = isHidden ? '1' : '0.6';
    });

    const copyLogBtn = document.getElementById('copy-log-btn');
    copyLogBtn?.addEventListener('click', () => {
        if (debugLog) copyText(debugLog.innerText);
    });

    const examplePromptBtn = document.getElementById('example-prompt-btn');
    examplePromptBtn?.addEventListener('click', fillExamplePrompt);
}

async function clearQwenModelCaches() {
    if (!window.caches) {
        appendMessage('system', 'Cache API is unavailable in this browser.', null, null, false);
        return;
    }

    await resetQwenEngine();

    const names = await caches.keys();
    const deleted = [];
    const inspected = [];

    for (const name of names) {
        let shouldDelete = /qwen|webllm|mlc|huggingface|model|transformers|wasm|diagnostics/i.test(name);

        try {
            const cache = await caches.open(name);
            const requests = await cache.keys();
            inspected.push(`${name} (${requests.length})`);
            shouldDelete = shouldDelete || requests.some(request => /qwen|webllm|mlc-ai|huggingface|params_shard|ndarray-cache|tokenizer|wasm/i.test(request.url));
        } catch (err) {
            log(`Could not inspect cache ${name}: ${formatError(err)}`, 'error');
        }

        if (shouldDelete && await caches.delete(name)) {
            deleted.push(name);
        }
    }

    log(`Inspected caches: ${inspected.join(', ') || 'none'}`);
    log(`Deleted Qwen/WebLLM caches: ${deleted.join(', ') || 'none'}`, deleted.length > 0 ? 'success' : 'info');
    appendMessage(
        'system',
        deleted.length > 0
            ? `Cleared ${deleted.length} Qwen/WebLLM cache(s): ${deleted.join(', ')}. Try loading Qwen again.`
            : 'No Qwen/WebLLM caches were found to clear.',
        null,
        null,
        false
    );
}

function initChatHistoryEvents() {
    historyToggleBtn?.addEventListener('click', openSidebar);
    closeSidebarBtn?.addEventListener('click', closeSidebar);
    sidebarOverlay?.addEventListener('click', closeSidebar);
    newChatBtn?.addEventListener('click', () => createNewChat());

    document.getElementById('delete-all-chats-btn')?.addEventListener('click', () => {
        showConfirmModal(
            'Delete All Chats',
            'This will permanently delete all your chat history. This action cannot be undone.',
            deleteAllChats
        );
    });
}

async function reconnect() {
    if (runtimeSelector) {
        runtimeMode = runtimeSelector.value || RUNTIME_MODES.QWEN_BROWSER;
        localStorage.setItem(RUNTIME_MODE_KEY, runtimeMode);
    }

    if (serverUrlInput) {
        baseUrl = serverUrlInput.value.trim() || DEFAULT_BASE_URL;
        localStorage.setItem(BASE_URL_KEY, baseUrl);
    }

    if (modelIdInput) {
        modelId = modelIdInput.value.trim() || DEFAULT_MODEL_ID;
        localStorage.setItem(MODEL_ID_KEY, modelId);
    }

    isLoaded = false;
    userInput.disabled = true;
    sendBtn.disabled = true;
    await init();
}

async function setQwenModel(modelKey) {
    if (!QWEN_MODELS[modelKey]) return;
    if (modelKey === qwenModelKey && qwenEngine) return;

    qwenModelKey = modelKey;
    qwenModel = QWEN_MODELS[qwenModelKey];
    localStorage.setItem(QWEN_MODEL_KEY, qwenModelKey);
    syncQwenModelSelector();
    updateModelDisplay();
    await resetQwenEngine();

    if (runtimeMode !== RUNTIME_MODES.QWEN_BROWSER) {
        setRuntimeMode(RUNTIME_MODES.QWEN_BROWSER);
        return;
    }

    clearChatUI();
    appendMessage(
        'system',
        `Switched to ${qwenModel.name}. This model runs locally in your browser without a server.`,
        null,
        null,
        false
    );
    reconnect();
}

async function resetQwenEngine() {
    if (!qwenEngine) return;

    try {
        if (typeof qwenEngine.unload === 'function') {
            await qwenEngine.unload();
        } else if (typeof qwenEngine.dispose === 'function') {
            await qwenEngine.dispose();
        }
    } catch (err) {
        log(`Could not unload previous Qwen model cleanly: ${formatError(err)}`, 'error');
    } finally {
        qwenEngine = null;
    }
}

function setRuntimeMode(mode) {
    if (!Object.values(RUNTIME_MODES).includes(mode)) return;
    runtimeMode = mode;
    localStorage.setItem(RUNTIME_MODE_KEY, runtimeMode);
    localStorage.setItem(RUNTIME_MODE_EXPLICIT_KEY, 'true');
    syncRuntimeSelectors();
    clearChatUI();
    appendMessage(
        'system',
        runtimeMode === RUNTIME_MODES.QWEN_BROWSER
            ? 'Switched to Qwen Browser mode. This runs locally in your browser and does not need a server.'
            : 'Switched to Bonsai Server mode. Start the local Bonsai runtime, then reconnect.',
        null,
        null,
        false
    );
    reconnect();
}

function syncRuntimeSelectors() {
    if (runtimeSelector) runtimeSelector.value = runtimeMode;
    if (runtimeSelectorSettings) runtimeSelectorSettings.value = runtimeMode;
}

function syncQwenModelSelector() {
    if (qwenModelSelector) qwenModelSelector.value = qwenModelKey;
}

function copyStartCommand() {
    copyText(DEFAULT_START_COMMAND);
    log('Copied Bonsai server command.', 'success');
}

function copyText(text) {
    navigator.clipboard?.writeText(text).catch(() => {
        log('Clipboard permission failed.', 'error');
    });
}

function fillExamplePrompt() {
    const prompts = [
        'Explain quantum computing in simple terms',
        'Write a concise project plan for a personal website refresh',
        'Give me five ideas for improving focus while coding',
        'Summarize why 1-bit models are useful for local AI',
        'Draft a short story about a tiny model with big ambitions'
    ];
    fillExamplePrompt.index = ((fillExamplePrompt.index || 0) + 1) % prompts.length;
    userInput.value = prompts[fillExamplePrompt.index];
    userInput.style.height = 'auto';
    userInput.style.height = `${userInput.scrollHeight}px`;
    userInput.focus();
}

function openSidebar() {
    historySidebar?.classList.add('open');
    sidebarOverlay?.classList.add('visible');
}

function closeSidebar() {
    historySidebar?.classList.remove('open');
    sidebarOverlay?.classList.remove('visible');
}

function showConfirmModal(title, message, onConfirm, confirmText = 'Delete', confirmClass = 'danger') {
    const overlay = document.createElement('div');
    overlay.className = 'lai-confirm-overlay';

    const modal = document.createElement('div');
    modal.className = 'lai-confirm-modal';
    modal.innerHTML = `
        <div class="lai-confirm-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        </div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="lai-confirm-buttons">
            <button class="lai-confirm-btn cancel">Cancel</button>
            <button class="lai-confirm-btn ${confirmClass} enabled">${escapeHtml(confirmText)}</button>
        </div>`;

    const closeModal = () => {
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 300);
    };

    modal.querySelector('.cancel').onclick = closeModal;
    modal.querySelector(`.${confirmClass}`).onclick = () => {
        closeModal();
        onConfirm();
    };

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

function countWords(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).filter(Boolean).length;
}

function countTokens(str) {
    if (!str) return 0;
    return Math.ceil(str.length / 4);
}

function trimBaseUrl(url) {
    return url.replace(/\/$/, '');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatError(err) {
    if (err?.name === 'AbortError') return 'Request timed out';
    return err?.message || String(err);
}

window.onerror = function (msg, source, lineno) {
    log(`Global error: ${msg} (${source}:${lineno})`, 'error');
};

window.onunhandledrejection = function (event) {
    log(`Unhandled rejection: ${formatError(event.reason)}`, 'error');
};
