// REMOVED TOP LEVEL IMPORT to prevent silent failures
// import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@latest';

// === CONFIGURATION ===
// Switched to Qwen 3 (4B) - ONNX Community version
const MODEL_ID = 'onnx-community/Qwen3-4B-ONNX';
let env, pipeline; // Will be loaded dynamically

// === DOM ELEMENTS ===
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const debugLog = document.getElementById('debug-log');

// Progress Elements
const progressPanel = document.getElementById('progress-panel');
const downloadStage = document.getElementById('download-stage');
const initStage = document.getElementById('init-stage');
const dlBar = document.getElementById('dl-bar');
const dlPercent = document.getElementById('dl-percent');
const dlFilename = document.getElementById('dl-filename');

// Settings Elements
const settingsToggle = document.getElementById('settings-toggle');
const settingsContent = document.getElementById('settings-content');
const thinkingModeToggle = document.getElementById('thinking-mode');
const systemPromptInput = document.getElementById('system-prompt');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const cacheLocationText = document.getElementById('cache-location');

// === STATE ===
let generator = null;
let isGenerating = false;
let isLoaded = false;
let thinkingTimerInterval = null;
let thinkingStartTime = null;
let thinkingMessageElement = null;

// === CHAT HISTORY STATE ===
const STORAGE_KEY = 'lai-chat-history';
let chatHistory = { chats: [], currentChatId: null };

// Chat History DOM Elements
const historySidebar = document.getElementById('history-sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const historyToggleBtn = document.getElementById('history-toggle-btn');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const chatListContainer = document.getElementById('chat-list');

// === CHAT HISTORY FUNCTIONS ===
function generateChatId() {
    return 'chat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
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
    // Save current chat first if it has messages
    const currentChat = getCurrentChat();
    if (currentChat && currentChat.messages.length > 1) {
        saveChatsToStorage();
    }

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

    // Clear the chat UI
    clearChatUI();
    renderChatList();

    if (!silent) {
        log('New chat created', 'info');
    }

    return newChat;
}

function getCurrentChat() {
    if (!chatHistory.currentChatId) return null;
    return chatHistory.chats.find(c => c.id === chatHistory.currentChatId);
}

function loadChat(chatId) {
    const chat = chatHistory.chats.find(c => c.id === chatId);
    if (!chat) return;

    chatHistory.currentChatId = chatId;
    saveChatsToStorage();

    // Clear and render messages
    clearChatUI();
    chat.messages.forEach(msg => {
        renderMessageFromData(msg);
    });

    renderChatList();
    closeSidebar();
    log(`Loaded chat: ${chat.title}`, 'info');
}

function deleteChat(chatId) {
    const index = chatHistory.chats.findIndex(c => c.id === chatId);
    if (index === -1) return;

    const wasCurrentChat = chatHistory.currentChatId === chatId;
    chatHistory.chats.splice(index, 1);

    if (wasCurrentChat) {
        if (chatHistory.chats.length > 0) {
            loadChat(chatHistory.chats[0].id);
        } else {
            createNewChat(true);
        }
    }

    saveChatsToStorage();
    renderChatList();
    log('Chat deleted', 'info');
}

function updateChatTitle(chatId, firstMessage) {
    const chat = chatHistory.chats.find(c => c.id === chatId);
    if (!chat) return;

    // Generate title from first 40 chars of first user message
    const title = firstMessage.substring(0, 40) + (firstMessage.length > 40 ? '...' : '');
    chat.title = title;
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

    // Update title from first user message
    if (role === 'user' && chat.messages.filter(m => m.role === 'user').length === 1) {
        updateChatTitle(chat.id, text);
    }

    saveChatsToStorage();
}

function clearChatUI() {
    chatContainer.innerHTML = `
        <div class="lai-message lai-system">
            <div class="lai-bubble">
                Welcome. The model is loading above. <br>
                This downloads ~2.5GB once. Future reloads will be instant.
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
                <p>No chats yet.<br>Start a conversation!</p>
            </div>`;
        return;
    }

    chatListContainer.innerHTML = chatHistory.chats.map(chat => {
        const isActive = chat.id === chatHistory.currentChatId;
        const date = new Date(chat.updatedAt).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
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

    // Add event listeners
    chatListContainer.querySelectorAll('.lai-chat-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.lai-chat-item-delete')) return;
            loadChat(item.dataset.chatId);
        });
    });

    chatListContainer.querySelectorAll('.lai-chat-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const chatId = btn.dataset.deleteId;
            showConfirmModal(
                'Delete Chat',
                'Are you sure you want to delete this chat? This action cannot be undone.',
                () => deleteChat(chatId)
            );
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openSidebar() {
    historySidebar?.classList.add('open');
    sidebarOverlay?.classList.add('visible');
}

function closeSidebar() {
    historySidebar?.classList.remove('open');
    sidebarOverlay?.classList.remove('visible');
}
// === STYLED CONFIRMATION MODALS ===
function showConfirmModal(title, message, onConfirm) {
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
        <h2>${title}</h2>
        <p>${message}</p>
        <div class="lai-confirm-buttons">
            <button class="lai-confirm-btn cancel">Cancel</button>
            <button class="lai-confirm-btn danger enabled">Delete</button>
        </div>
    `;

    const closeModal = () => {
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 300);
    };

    modal.querySelector('.cancel').onclick = closeModal;
    modal.querySelector('.danger').onclick = () => {
        closeModal();
        onConfirm();
    };

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

function showSliderConfirmModal(title, message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'lai-confirm-overlay';

    const modal = document.createElement('div');
    modal.className = 'lai-confirm-modal';

    modal.innerHTML = `
        <div class="lai-confirm-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
        </div>
        <h2>${title}</h2>
        <p>${message}</p>
        <div class="lai-slider-confirm">
            <span class="lai-slider-label">Slide to confirm</span>
            <div class="lai-slider-track" id="slider-track">
                <span class="lai-slider-text">→ Slide to delete →</span>
                <div class="lai-slider-thumb" id="slider-thumb">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </div>
            </div>
        </div>
        <div class="lai-confirm-buttons">
            <button class="lai-confirm-btn cancel">Cancel</button>
            <button class="lai-confirm-btn danger" id="confirm-delete-btn">Delete All</button>
        </div>
    `;

    const closeModal = () => {
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 300);
    };

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Setup slider
    const track = modal.querySelector('#slider-track');
    const thumb = modal.querySelector('#slider-thumb');
    const confirmBtn = modal.querySelector('#confirm-delete-btn');
    let isDragging = false;
    let confirmed = false;
    const trackWidth = 360 - 32; // Approximate track width minus padding
    const thumbWidth = 60;
    const maxLeft = trackWidth - thumbWidth - 8;

    const handleMove = (clientX) => {
        if (!isDragging || confirmed) return;
        const rect = track.getBoundingClientRect();
        let newLeft = clientX - rect.left - thumbWidth / 2;
        newLeft = Math.max(4, Math.min(newLeft, maxLeft));
        thumb.style.left = newLeft + 'px';

        if (newLeft >= maxLeft - 10) {
            confirmed = true;
            track.classList.add('confirmed');
            confirmBtn.classList.add('enabled');
        }
    };

    thumb.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
    thumb.addEventListener('touchstart', (e) => { isDragging = true; });

    document.addEventListener('mousemove', (e) => handleMove(e.clientX));
    document.addEventListener('touchmove', (e) => handleMove(e.touches[0].clientX));

    document.addEventListener('mouseup', () => { isDragging = false; if (!confirmed) resetSlider(); });
    document.addEventListener('touchend', () => { isDragging = false; if (!confirmed) resetSlider(); });

    function resetSlider() {
        thumb.style.left = '4px';
    }

    modal.querySelector('.cancel').onclick = closeModal;
    confirmBtn.onclick = () => {
        if (!confirmed) return;
        closeModal();
        onConfirm();
    };
}

function deleteAllChats() {
    chatHistory.chats = [];
    chatHistory.currentChatId = null;
    saveChatsToStorage();
    createNewChat(true);
    renderChatList();
    closeSidebar();
    log('All chats deleted', 'info');
    appendMessage('system', 'All chat history has been deleted.', null, null, false);
}

// Initialize chat history event listeners
function initChatHistoryEvents() {
    historyToggleBtn?.addEventListener('click', openSidebar);
    closeSidebarBtn?.addEventListener('click', closeSidebar);
    sidebarOverlay?.addEventListener('click', closeSidebar);
    newChatBtn?.addEventListener('click', () => createNewChat());

    const deleteAllBtn = document.getElementById('delete-all-chats-btn');
    deleteAllBtn?.addEventListener('click', () => {
        showSliderConfirmModal(
            'Delete All Chats',
            'This will permanently delete all your chat history. This action cannot be undone.',
            deleteAllChats
        );
    });
}

// === THINKING BUBBLE ===
function showThinkingBubble() {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'lai-message lai-bot lai-thinking';
    msgDiv.id = 'lai-thinking-message';

    const bubble = document.createElement('div');
    bubble.className = 'lai-bubble';

    const thinkingContent = document.createElement('div');
    thinkingContent.className = 'lai-thinking-bubble';

    // Timer at the top
    const timer = document.createElement('div');
    timer.className = 'lai-thinking-timer';
    timer.id = 'lai-thinking-timer';
    timer.textContent = '0.0s';

    // Animated dots
    const dots = document.createElement('div');
    dots.className = 'lai-thinking-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';

    // Status text
    const status = document.createElement('div');
    status.className = 'lai-thinking-status';
    status.id = 'lai-thinking-status';
    status.textContent = 'Thinking...';

    thinkingContent.appendChild(timer);
    thinkingContent.appendChild(dots);
    thinkingContent.appendChild(status);
    bubble.appendChild(thinkingContent);
    msgDiv.appendChild(bubble);

    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });

    thinkingMessageElement = msgDiv;
    thinkingStartTime = performance.now();

    // Start live timer
    thinkingTimerInterval = setInterval(() => {
        const elapsed = ((performance.now() - thinkingStartTime) / 1000).toFixed(1);
        const timerEl = document.getElementById('lai-thinking-timer');
        if (timerEl) {
            timerEl.textContent = `${elapsed}s`;
        }
    }, 100);

    return msgDiv;
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
    if (statusEl) {
        statusEl.textContent = text;
    }
}

// === DEBUGGING ===
function log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const formattedMsg = `[${time}] ${msg}`;

    if (type === 'error') console.error(formattedMsg);
    else console.log(formattedMsg);

    if (debugLog) {
        const line = document.createElement('div');
        line.textContent = `> ${msg}`;
        if (type === 'error') line.style.color = '#ff6b6b';
        if (type === 'success') line.style.color = '#4ade80';
        debugLog.appendChild(line);
        // Auto-scroll
        debugLog.scrollTop = debugLog.scrollHeight;
    }

    if (type === 'error') appendMessage('system', `Error: ${msg}`);
}

// Global Error Handlers
window.onerror = function (msg, source, lineno, colno, error) {
    log(`Global Error: ${msg} (${source}:${lineno})`, 'error');
};
window.onunhandledrejection = function (event) {
    log(`Unhandled Rejection: ${event.reason}`, 'error');
};

// === INITIALIZATION ===
async function init() {
    try {
        log("System Initialize...");
        log(`User Agent: ${navigator.userAgent}`);
        log(`Device Memory (RAM): ${navigator.deviceMemory ? '~' + navigator.deviceMemory + 'GB' : 'Unknown'}`);

        if (dlFilename) dlFilename.innerText = "Loading Libraries...";

        // DYNAMIC IMPORT
        log("Importing Transformers.js...");
        try {
            // Updated to @latest for modern model support (e.g. Qwen 3, Gemma 3)
            const module = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@latest');
            pipeline = module.pipeline;
            env = module.env;
            log("Library Loaded Successfully.", 'success');
            log(`Version: ${module.env.version}`, 'info');
        } catch (loadErr) {
            throw new Error(`Failed to load Transformers.js: ${loadErr.message}. Check Internet/AdBlock.`);
        }

        // === BROWSER CACHE CONFIG ===
        env.allowLocalModels = false;
        env.allowRemoteModels = true;

        try {
            if (!window.caches) throw new Error("Cache API missing");
            // use generic cache name
            await window.caches.open('transformers-cache');
            env.useBrowserCache = true;
            log("Browser Cache enabled.");
        } catch (e) {
            console.warn("Cache blocked.");
            env.useBrowserCache = false;
        }

        // CHECK GPU
        log("Checking GPU Support...");
        if (!navigator.gpu) {
            log("WebGPU not available. Falling back to CPU (Slow).", 'error');
            updateStatus('error', 'WebGPU Missing');
            showErrorModal(
                "WebGPU Not Supported",
                `This browser does not support WebGPU, which is required for fast local inference.
                <br><br>
                <div style="text-align: left; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                    <strong>Enable on macOS (Chrome/Edge):</strong>
                    <ol style="margin: 8px 0 0 20px; padding: 0;">
                        <li>Open <code>chrome://flags</code> in a new tab</li>
                        <li>Search for <strong>"Unsafe WebGPU"</strong></li>
                        <li>Set it to <strong>Enabled</strong></li>
                        <li>Relaunch the browser</li>
                    </ol>
                </div>
                Alternatively, try using the latest version of <b>Google Chrome Canary</b>.`
            );
        } else {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                log("No WebGPU adapter found.", 'error');
                updateStatus('error', 'No GPU Adapter');
                showErrorModal("No GPU Adapter Found", "WebGPU is supported, but no suitable graphics adapter was found.<br><br>Please check your <b>Graphics Drivers</b> and ensure hardware acceleration is enabled.");
            } else {
                // Show real limits
                log(`GPU Adapter: ${JSON.stringify(adapter.limits)}`);
            }
        }

        updateStatus('busy', 'Starting Pipeline...');
        log(`Starting Pipeline for: ${MODEL_ID}`);

        if (dlFilename) dlFilename.innerText = "Initializing Model...";

        // Start Pipeline
        generator = await pipeline('text-generation', MODEL_ID, {
            device: 'webgpu',
            dtype: 'q4f16', // CRITICAL: Use 4-bit quantization with fp16 activations
            progress_callback: (data) => {
                // detailed logging
                if (data.status === 'initiate') {
                    log(`Initiating download: ${data.file}`);
                    if (dlFilename) dlFilename.innerText = `Preparing: ${data.file}`;
                } else if (data.status === 'download') {
                    // NO-OP
                } else if (data.status === 'done') {
                    log(`Finished: ${data.file}`, 'success');
                }

                // Handle Download Progress
                if (data.status === 'progress') {
                    const percent = Math.round(data.progress || 0);
                    const loaded = data.loaded || 0;
                    const total = data.total || 0;
                    const fileName = data.file;

                    // Update UI
                    if (dlBar) dlBar.style.width = `${percent}%`;
                    if (dlPercent) dlPercent.innerText = `${percent}%`;

                    const sizeText = total > 0
                        ? `(${Math.round(loaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB)`
                        : '';

                    if (dlFilename) dlFilename.innerText = `Downloading: ${fileName} ${sizeText}`;

                    if (percent % 10 === 0 && percent > 0) {
                        log(`[${fileName}] ${percent}%`);
                    }

                    if ((fileName.endsWith('.onnx') || fileName.includes('model')) && percent >= 99.5) {
                        // Almost done
                    }
                }
            }
        });

        // Setup Complete
        isLoaded = true;
        log("Pipeline creation complete.", 'success');
        finishLoading();

    } catch (err) {
        console.error("CRITICAL ERROR OBJECT:", err);
        const errMsg = err?.message || err?.toString() || "Unknown Error";
        const errStack = err?.stack || "No stack trace";

        log(`CRITICAL: ${errMsg}`, 'error');
        log(`Stack: ${errStack}`, 'error');

        updateStatus('error', 'Failed');
        if (dlFilename) {
            dlFilename.innerText = "Error: " + errMsg;
            dlFilename.style.color = "red";
        }
    }
}

// === LOADING UI HELPERS ===
function switchToInitStage() {
    if (!downloadStage.classList.contains('hidden')) {
        log("Switching to Initialization Stage...");
        downloadStage.classList.add('hidden');
        initStage.classList.remove('hidden');
        updateStatus('busy', 'Initializing GPU...');
    }
}

function finishLoading() {
    // Hide all progress bars
    progressPanel.classList.add('collapsed');

    // Enable Chat
    updateStatus('ready', 'Ready');
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.placeholder = "Ask Qwen something...";
    appendMessage('system', "System Online. Model loaded on your device.");
}

// === CHAT LOGIC ===
async function handleSend() {
    const text = userInput.value.trim();
    if (!text || isGenerating || !generator) return;

    // Metrics: Start Time
    const startTime = performance.now();

    userInput.value = '';
    userInput.style.height = 'auto';
    appendMessage('user', text);

    isGenerating = true;
    updateStatus('busy', 'Thinking...');
    sendBtn.disabled = true;

    // Show the animated thinking bubble with timer
    showThinkingBubble();

    // Timeout warning for slow generations
    const timeoutWarning = setTimeout(() => {
        if (isGenerating) {
            updateStatus('busy', 'Still working on it...');
            updateThinkingStatus('Still processing, please wait...');
            log("Generation is taking longer than usual...", 'info');
        }
    }, 8000); // 8 seconds

    try {
        log("Generating response...");
        // Get settings values
        const systemPrompt = systemPromptInput?.value?.trim() || 'You are a helpful assistant.';
        const thinkingEnabled = thinkingModeToggle?.checked || false;
        const thinkingDirective = thinkingEnabled ? '' : ' /no_think';

        // Qwen3 uses ChatML format
        const prompt = `<|im_start|>system
${systemPrompt}${thinkingDirective}<|im_end|>
<|im_start|>user
${text}<|im_end|>
<|im_start|>assistant
`;

        // Metrics: Input calculation
        const inputWords = countWords(text);
        const inputTokens = countTokens(prompt);

        const output = await generator(prompt, {
            max_new_tokens: 2048,
            temperature: 0.7,
            do_sample: true,
            top_k: 50,
        });

        // Metrics: End Time
        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        const raw = output[0].generated_text;

        // Parse the output to separate context from the actual response
        const { context, response } = parseChatOutput(raw, prompt);

        // Metrics: Output calculation
        const outputWords = countWords(response);
        const outputTokens = countTokens(response); // Approximation or precise if using tokenizer

        const metrics = {
            duration,
            inputWords,
            inputTokens,
            outputWords,
            outputTokens
        };

        // Remove thinking bubble before showing actual response
        removeThinkingBubble();

        appendMessage('bot', response, context, metrics);
        log("Generation Complete.", 'success');

    } catch (err) {
        // Remove thinking bubble on error too
        removeThinkingBubble();
        log(err.message, 'error');
    } finally {
        clearTimeout(timeoutWarning);
        isGenerating = false;
        updateStatus('ready', 'Ready');
        sendBtn.disabled = false;
        userInput.focus();
    }
}

function countWords(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).length;
}

function countTokens(str) {
    if (!str) return 0;
    // Accurate count if tokenizer is exposed, otherwise approximation
    if (generator && generator.tokenizer) {
        try {
            const encoded = generator.tokenizer(str);
            return encoded.input_ids.size || encoded.input_ids.length;
        } catch (e) {
            // Fallback
            return Math.ceil(str.length / 4);
        }
    }
    // Fallback approximation (rule of thumb: 4 chars per token)
    return Math.ceil(str.length / 4);
}

function parseChatOutput(raw, originalPrompt) {
    // 1. Try to cleanly strip the original prompt if it matches exactly
    let clean = raw;
    let context = "";

    // The model typically echoes the prompt or part of it. 
    // We want to find where the "assistant" starts speaking.
    // Based on user report, it might output: "system\n... user\n... assistant\n\nResponse..."

    // Strategy: Look for the last occurrence of "<|im_start|>assistant" or just "assistant" header
    // But since we provided the prompt, we should ideally just strip that exact string.

    if (raw.startsWith(originalPrompt)) {
        context = originalPrompt;
        clean = raw.substring(originalPrompt.length).trim();
    } else {
        // Fallback: splitting by known tokens
        const parts = raw.split('<|im_start|>assistant');
        if (parts.length > 1) {
            // The last part is likely the response
            clean = parts.pop().trim();
            context = parts.slice(0, -1).join('<|im_start|>assistant') + '<|im_start|>assistant';
        } else {
            // Fallback for "system... user... assistant" plain text artifacts (CRITICAL FIX)
            // Regex to find "assistant" followed by newline(s) at the start of a line
            const assistantRegex = /assistant\s*$/im;
            const plainSplit = raw.split(/assistant\s*\n/i);

            if (plainSplit.length > 1) {
                // We take the last part as response, everything else as context
                clean = plainSplit.pop().trim();
                context = raw.substring(0, raw.lastIndexOf(clean)).trim();
            }
        }
    }

    // Clean up the response
    // Remove any <think>...</think> blocks
    clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Remove any leftover ChatML tokens
    clean = clean.replace(/<\|im_end\|>/g, '').trim();

    // Remove leading "assistant" label if it stuck around
    clean = clean.replace(/^assistant:?\s*/i, '').trim();

    // If context is empty (perfect match wasn't found), try to extract what looks like system/user turns
    if (!context) {
        // Just treat everything before the cleaned response as context
        const responseIndex = raw.indexOf(clean);
        if (responseIndex > 0) {
            context = raw.substring(0, responseIndex).trim();
        }
    }

    return { context, response: clean };
}

// === UI HELPERS ===
function appendMessage(role, text, context = null, metrics = null, saveToHistory = true) {
    // Save to chat history if requested (not when reloading from storage)
    if (saveToHistory && role !== 'system') {
        addMessageToCurrentChat(role, text, context, metrics);
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = `lai-message lai-${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'lai-bubble';

    // Copy Button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'lai-msg-copy-btn';
    copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>`;
    copyBtn.title = 'Copy Text';
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="text-green-500">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>`;
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
            }, 2000);
        });
    };
    bubble.appendChild(copyBtn);

    // If there is context (e.g. system prompt echoes), add a toggle
    if (context) {
        const details = document.createElement('details');
        details.className = 'lai-context-details';

        const summary = document.createElement('summary');
        summary.innerText = 'Show Context / Thought Process';
        summary.className = 'lai-context-summary';

        const content = document.createElement('pre');
        content.className = 'lai-context-content';
        content.innerText = context;

        details.appendChild(summary);
        details.appendChild(content);
        bubble.appendChild(details);
    }

    const textSpan = document.createElement('span');

    // Parse Markdown for bot messages
    if (role === 'bot' && typeof marked !== 'undefined') {
        textSpan.innerHTML = marked.parse(text);
    } else {
        textSpan.innerText = text;
    }

    bubble.appendChild(textSpan);

    // Metrics Footer
    if (metrics) {
        const footer = document.createElement('div');
        footer.className = 'lai-message-metrics';

        // Refined Format: Input: ... | Output: ...
        const parts = [
            `⏱️ ${metrics.duration}s`,
            `Input: ${metrics.inputWords} words (${metrics.inputTokens} toks)`,
            `Output: ${metrics.outputWords} words (${metrics.outputTokens} toks)`
        ];

        footer.innerText = parts.join('  |  ');
        bubble.appendChild(footer);
    }

    msgDiv.appendChild(bubble);
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
}

function updateStatus(state, text) {
    if (!statusBadge) return;
    statusBadge.className = `lai-status-badge lai-status-${state}`;
    statusText.innerText = text;
}

// === EVENTS ===
sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});
userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

const copyLogBtn = document.getElementById('copy-log-btn');
if (copyLogBtn) {
    copyLogBtn.addEventListener('click', () => {
        if (!debugLog) return;
        const textToCopy = debugLog.innerText;
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = copyLogBtn.innerHTML;
            copyLogBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" class="text-green-500" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg> Copied!`;
            setTimeout(() => {
                copyLogBtn.innerHTML = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
            log("Clipboard permission failed.", 'error');
        });
    });
}

// Settings Toggle
if (settingsToggle && settingsContent) {
    settingsToggle.addEventListener('click', () => {
        settingsContent.classList.toggle('hidden');
    });
}

// === EXAMPLE PROMPTS ===
const examplePrompts = [
    "Explain quantum computing in simple terms",
    "Write a haiku about programming",
    "What are the benefits of meditation?",
    "How do I make the perfect cup of coffee?",
    "Explain the theory of relativity like I'm 10",
    "What are 5 creative date ideas for a rainy day?",
    "Write a short story about a robot learning to love",
    "What's the difference between machine learning and AI?",
    "Give me a workout routine I can do at home",
    "Explain blockchain technology without using jargon",
    "What are some tips for better sleep?",
    "Write a poem about the ocean",
    "How do I start learning a new language effectively?",
    "What are the most important soft skills for career success?",
    "Explain how vaccines work",
    "Give me 3 healthy breakfast ideas",
    "What's the history behind the internet?",
    "How can I be more productive while working from home?",
    "Write a motivational quote about perseverance",
    "Explain the water cycle to a child",
    "What are some eco-friendly lifestyle changes I can make?",
    "How do neural networks learn?"
];
let currentPromptIndex = 0;

const examplePromptBtn = document.getElementById('example-prompt-btn');
if (examplePromptBtn) {
    examplePromptBtn.addEventListener('click', () => {
        if (userInput) {
            userInput.value = examplePrompts[currentPromptIndex];
            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';
            userInput.focus();
            currentPromptIndex = (currentPromptIndex + 1) % examplePrompts.length;
        }
    });
}

// Clear Cache Button
if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
        if (!confirm('This will delete all cached model files (~2.5GB). You will need to re-download them. Continue?')) {
            return;
        }

        try {
            log('Clearing model cache...', 'info');
            clearCacheBtn.disabled = true;
            clearCacheBtn.textText = 'Clearing...';

            // Delete the transformers cache
            const deleted = await caches.delete('transformers-cache');

            if (deleted) {
                log('Cache cleared successfully!', 'success');
                appendMessage('system', 'Cache cleared! The model will be re-downloaded on your next message.');
                clearCacheBtn.disabled = false;
                clearCacheBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Clear Cache`;
            } else {
                log('No cache found to delete.', 'info');
                alert('No cached models found.');
                clearCacheBtn.disabled = false;
                clearCacheBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Clear Cache`;
            }
        } catch (err) {
            log(`Failed to clear cache: ${err.message}`, 'error');
            clearCacheBtn.disabled = false;
        }
    });
}

function showErrorModal(title, message) {
    // Create Overlay
    const overlay = document.createElement('div');
    overlay.className = 'lai-modal-overlay';

    // Create Modal
    const modal = document.createElement('div');
    modal.className = 'lai-modal';

    modal.innerHTML = `
        <div class="lai-modal-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
        </div>
        </div>
        <h2>${title}</h2>
        <div class="lai-modal-body">${message}</div>
        <button class="lai-modal-btn">I Understand</button>
    `;

    // Cleanup on click
    const btn = modal.querySelector('.lai-modal-btn');
    btn.onclick = () => {
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 300);
    };

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

window.addEventListener('DOMContentLoaded', () => {
    // Initialize chat history
    loadChatsFromStorage();
    initChatHistoryEvents();
    renderChatList();

    // Load current chat if exists, otherwise create new one
    const currentChat = getCurrentChat();
    if (currentChat && currentChat.messages.length > 0) {
        clearChatUI();
        currentChat.messages.forEach(msg => renderMessageFromData(msg));
    } else if (!currentChat && chatHistory.chats.length === 0) {
        // First visit - create initial chat silently
        createNewChat(true);
    }

    // Initialize the AI model
    init();
});