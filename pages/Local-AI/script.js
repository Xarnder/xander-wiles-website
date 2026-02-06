// REMOVED TOP LEVEL IMPORT to prevent silent failures
// import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@latest';

// === CONFIGURATION ===
// Model options for WebGPU (macOS with WebGPU enabled)
const WEBGPU_MODELS = {
    'qwen3-4b': {
        id: 'onnx-community/Qwen3-4B-ONNX',
        name: 'Qwen 3 (4B Instruct)',
        size: '~2.5GB',
        description: 'Fast, balanced performance'
    },
    'qwen3-8b': {
        id: 'onnx-community/Qwen3-8B-ONNX',
        name: 'Qwen 3 (8B Instruct)',
        size: '~5GB',
        description: 'More capable, requires more VRAM'
    }
};

// Default WebGPU model
const DEFAULT_WEBGPU_MODEL = 'qwen3-4b';

// WASM fallback model: Qwen 2.5 1.5B (better quality, works on CPU)
const WASM_MODEL_ID = 'onnx-community/Qwen2.5-1.5B-Instruct';
const WASM_MODEL_NAME = 'Qwen 2.5 (1.5B Instruct)';
const WASM_MODEL_SIZE = '~1.5GB';

// Storage key for selected model
const MODEL_SELECTION_KEY = 'lai-selected-model';

let MODEL_ID = WEBGPU_MODELS[DEFAULT_WEBGPU_MODEL].id;
let MODEL_NAME = WEBGPU_MODELS[DEFAULT_WEBGPU_MODEL].name;
let MODEL_SIZE = WEBGPU_MODELS[DEFAULT_WEBGPU_MODEL].size;
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
const modelSelector = document.getElementById('model-selector');
const resetHardwareBtn = document.getElementById('reset-hardware-btn');
const stopDownloadBtn = document.getElementById('stop-download-btn');
const restartDownloadBtn = document.getElementById('restart-download-btn');
const enableWebGPUBtn = document.getElementById('enable-webgpu-btn');
const toggleDebugBtn = document.getElementById('toggle-debug-btn');
const debugWrapper = document.querySelector('.lai-debug-wrapper');

// === STATE ===
let worker = null;
let isGenerating = false;
let isDownloadStopped = false;
let isLoaded = false;
let thinkingTimerInterval = null;
let thinkingStartTime = null;
let thinkingMessageElement = null;

// === PLATFORM DETECTION STATE ===
let platformInfo = {
    isMacOS: false,
    isAppleSilicon: false,
    gpuName: 'Unknown',
    chipName: null,
    osVersion: null,
    webGPUAvailable: false  // Track WebGPU availability for fallback
};

// === PLATFORM DETECTION FUNCTIONS ===
function detectPlatform() {
    const ua = navigator.userAgent;
    const platform = navigator.platform;

    // Detect macOS
    platformInfo.isMacOS = platform.includes('Mac') ||
        ua.includes('Macintosh') ||
        ua.includes('Mac OS X');

    // Extract macOS version if available
    const macVersionMatch = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
    if (macVersionMatch) {
        platformInfo.osVersion = macVersionMatch[1].replace(/_/g, '.');
    }

    // Initial Apple Silicon check from user agent (ARM-based Mac)
    if (platformInfo.isMacOS) {
        // Safari on Apple Silicon often reports ARM or has specific markers
        const isARM = ua.includes('ARM') || ua.includes('arm');
        // Modern Macs with Apple Silicon don't report x86 in certain contexts
        const notIntel = !ua.includes('Intel');

        // This is a preliminary check; GPU adapter will give us definitive info
        if (isARM || (notIntel && platform === 'MacIntel')) {
            // Could be Apple Silicon - WebGPU check will confirm
        }
    }

    return platformInfo;
}

async function detectGPU() {
    if (!navigator.gpu) {
        log("WebGPU not available for GPU detection", 'error');
        return null;
    }

    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            log("No GPU adapter available", 'error');
            return null;
        }

        // Get adapter info - this gives us GPU name
        const info = await adapter.requestAdapterInfo();
        platformInfo.gpuName = info.description || info.device || 'Unknown GPU';

        // Detect Apple Silicon from GPU name
        const gpuLower = platformInfo.gpuName.toLowerCase();
        if (gpuLower.includes('apple')) {
            platformInfo.isAppleSilicon = true;

            // Extract chip name (M1, M2, M3, M4, etc.)
            const chipMatch = platformInfo.gpuName.match(/Apple\s+(M\d+(?:\s+(?:Pro|Max|Ultra))?)/i);
            if (chipMatch) {
                platformInfo.chipName = chipMatch[1];
            }
        }

        return adapter;
    } catch (e) {
        log(`GPU detection failed: ${e.message}`, 'error');
        return null;
    }
}

function getPlatformDisplayString() {
    let parts = [];

    if (platformInfo.isMacOS) {
        if (platformInfo.isAppleSilicon && platformInfo.chipName) {
            parts.push(`Apple ${platformInfo.chipName}`);
        } else if (platformInfo.isAppleSilicon) {
            parts.push('Apple Silicon Mac');
        } else {
            parts.push('macOS');
        }
    }

    if (platformInfo.gpuName && !platformInfo.gpuName.toLowerCase().includes('unknown')) {
        // Don't duplicate if already showing Apple chip
        if (!platformInfo.isAppleSilicon) {
            parts.push(platformInfo.gpuName);
        }
    }

    return parts.length > 0 ? parts.join(' • ') : null;
}

function updatePlatformBadge() {
    const badge = document.getElementById('platform-badge');
    if (!badge) return;

    if (platformInfo.isMacOS) {
        badge.classList.add('visible');

        if (platformInfo.isAppleSilicon && platformInfo.chipName) {
            badge.innerHTML = `
                <svg class="lai-apple-logo" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                ${platformInfo.chipName}`;
        } else if (platformInfo.isAppleSilicon) {
            badge.innerHTML = `
                <svg class="lai-apple-logo" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Apple Silicon`;
        } else {
            badge.innerHTML = `
                <svg class="lai-apple-logo" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                macOS`;
        }
    }
}

// Update the header to show which model is currently loaded
function updateModelDisplay() {
    const headerTitle = document.getElementById('model-title');
    const headerSubtitle = document.querySelector('.lai-subtitle');
    const modelSelector = document.getElementById('model-selector');

    if (headerTitle) {
        // Parse the model name to extract base name and size
        const modelParts = MODEL_NAME.split(' ');
        const baseName = modelParts.slice(0, 2).join(' '); // e.g., "Qwen 3" or "Qwen 2.5"
        const sizeInfo = modelParts.slice(2).join(' '); // e.g., "(4B Instruct)"

        headerTitle.innerHTML = `${baseName} <span>${sizeInfo}</span>`;
    }

    // Update page title
    document.title = `${MODEL_NAME} - Local AI Chat`;

    if (headerSubtitle) {
        const deviceMode = platformInfo.webGPUAvailable ? 'WebGPU (GPU)' : 'WASM (CPU)';
        headerSubtitle.textContent = `Running locally in-browser • ${deviceMode}`;
    }

    // Sync dropdown selector with current model
    if (modelSelector && platformInfo.webGPUAvailable) {
        // Find which model key matches the current MODEL_ID
        for (const [key, model] of Object.entries(WEBGPU_MODELS)) {
            if (model.id === MODEL_ID) {
                modelSelector.value = key;
                break;
            }
        }
    }
}

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
                This downloads ${MODEL_SIZE} once. Future reloads will be instant.
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
        <h2>${title}</h2>
        <p>${message}</p>
        <div class="lai-confirm-buttons">
            <button class="lai-confirm-btn cancel">Cancel</button>
            <button class="lai-confirm-btn ${confirmClass} enabled">${confirmText}</button>
        </div>
    `;

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

        // Detect platform early
        detectPlatform();
        if (platformInfo.isMacOS) {
            log(`Platform: macOS${platformInfo.osVersion ? ' ' + platformInfo.osVersion : ''}`, 'success');
        } else {
            log(`Platform: ${navigator.platform}`);
        }

        if (dlFilename) dlFilename.innerText = "Checking Hardware...";

        // REMOVED: Main thread Transformers.js import (Worker handles this now)
        log("Using background Worker for AI engine.");

        // === BROWSER CACHE CONFIG ===
        try {
            if (!window.caches) throw new Error("Cache API missing");
            log("Browser Cache available.");
        } catch (e) {
            console.warn("Cache blocked.");
        }

        // CHECK GPU & HARDWARE PREFERENCE
        log("Checking Hardware...");

        // 1. Always check for user preference (or ask if new user)
        // This ensures the modal appears for first-time users regardless of auto-detection
        const hardwareChoice = await showHardwareSelectionModal();

        // 2. Adjust platform info based on user choice
        if (hardwareChoice.isAppleSilicon) {
            platformInfo.isMacOS = true;
            platformInfo.isAppleSilicon = true;
            platformInfo.chipName = 'Apple Silicon';
        } else if (hardwareChoice.isMacOS) {
            platformInfo.isMacOS = true;
        }

        // 3. Check browser capabilities
        if (!navigator.gpu) {
            // Browser doesn't support WebGPU
            platformInfo.webGPUAvailable = false;

            if (hardwareChoice.hasGPU) {
                // User has GPU but browser blocks it -> Show instructions via button (don't auto-popup)
                log("WebGPU not available via browser API.", 'info');
                log(`User selected: ${hardwareChoice.isAppleSilicon ? 'Apple Silicon' : 'Dedicated GPU'}`, 'info');

                if (enableWebGPUBtn) {
                    enableWebGPUBtn.style.display = 'inline-flex';
                    enableWebGPUBtn.onclick = () => {
                        showErrorModal(
                            "Enable WebGPU for Best Performance",
                            `<div style="text-align: left;">
                                <p style="margin-bottom: 12px;">You have <strong>${hardwareChoice.isAppleSilicon ? 'Apple Silicon' : 'a dedicated GPU'}</strong> but WebGPU isn't enabled in your browser. The model will run using <strong>WASM (CPU)</strong> which is slower.</p>
                                
                                <div style="background: rgba(139, 92, 246, 0.1); padding: 12px; border-radius: 8px; margin-bottom: 12px; border: 1px solid rgba(139, 92, 246, 0.3);">
                                    <strong>⚡ Enable WebGPU for 10x faster performance:</strong>
                                    <ol style="margin: 8px 0 0 20px; padding: 0;">
                                        ${platformInfo.isMacOS ?
                                `<li>Open <code>chrome://flags</code> in Chrome</li>
                                            <li>Search for <strong>"WebGPU"</strong></li>
                                            <li>Enable <strong>"Unsafe WebGPU Support"</strong></li>
                                            <li>Relaunch Chrome</li>
                                            <li style="margin-top: 8px;"><em>Or try Safari which has native WebGPU support!</em></li>`
                                :
                                `<li>Open <code>chrome://flags</code> in Chrome</li>
                                            <li>Search for <strong>"WebGPU"</strong></li>
                                            <li>Enable <strong>"WebGPU Developer Features"</strong></li>
                                            <li>Relaunch Chrome</li>`
                            }
                                    </ol>
                                </div>
                            </div>`
                        );
                    };
                }

                updatePlatformBadge();
            } else {
                log("User selected CPU only - using WASM mode.", 'info');
            }
        } else {
            // Browser SUPPORTS WebGPU
            if (hardwareChoice.hasGPU) {
                // User wants GPU + Browser has GPU -> Great!
                // Still allow detectGPU to refine info (get exact GPU name)
                const adapter = await detectGPU();

                if (!adapter) {
                    log("WebGPU supported but no adapter found. Using WASM fallback.", 'info');
                    platformInfo.webGPUAvailable = false;
                } else {
                    platformInfo.webGPUAvailable = true;
                    log("WebGPU is available - using GPU acceleration!", 'success');
                    updatePlatformBadge();
                }
            } else {
                // User explicitly selected CPU-only even though browser supports WebGPU
                log("User selected CPU-only mode (overriding WebGPU availability).", 'info');
                platformInfo.webGPUAvailable = false;
            }
        }

        // Determine device, model, and dtype based on WebGPU availability
        const useDevice = platformInfo.webGPUAvailable ? 'webgpu' : 'wasm';

        // Select model based on device and user preference
        if (platformInfo.webGPUAvailable) {
            // Check for saved model preference
            const savedModel = localStorage.getItem(MODEL_SELECTION_KEY);
            const selectedKey = (savedModel && WEBGPU_MODELS[savedModel]) ? savedModel : DEFAULT_WEBGPU_MODEL;

            MODEL_ID = WEBGPU_MODELS[selectedKey].id;
            MODEL_NAME = WEBGPU_MODELS[selectedKey].name;
            MODEL_SIZE = WEBGPU_MODELS[selectedKey].size;
        } else {
            MODEL_ID = WASM_MODEL_ID;
            MODEL_NAME = WASM_MODEL_NAME;
            MODEL_SIZE = WASM_MODEL_SIZE;
            log("Using CPU-compatible model (Qwen2.5-1.5B) for WASM mode", 'info');
        }

        log(`Using device: ${useDevice}`);
        log(`Model: ${MODEL_NAME}`);
        updateStatus('busy', `Loading ${MODEL_NAME}...`);

        // Update the UI header to show the current model
        updateModelDisplay();

        log(`Starting Pipeline for: ${MODEL_ID}`);

        if (dlFilename) dlFilename.innerText = "Initializing Model...";

        // Build pipeline options (Worker will handle progress_callback logic via messages)
        const pipelineOptions = {
            device: useDevice,
            // progress_callback: implicitly handled by worker
        };

        // Add dtype for WebGPU mode
        if (platformInfo.webGPUAvailable) {
            pipelineOptions.dtype = 'q4f16';
        }

        // Initialize Worker
        worker = new Worker('worker.js', { type: 'module' });

        // Add detailed error logging for Worker startup
        worker.onerror = (err) => {
            console.error("Worker Error Event:", err);
            log(`Worker Startup Error: ${err.message || 'Check console for details'}`, 'error');
            if (dlFilename) {
                dlFilename.innerText = "Worker Initialization Failed";
                dlFilename.style.color = "red";
            }
        };

        // Define Message Handler
        worker.onmessage = (e) => {
            const { type, data, error, output, partial, status } = e.data;

            if (type === 'progress') {
                handleDownloadProgress(data);
            }
            else if (type === 'ready') {
                isLoaded = true;
                log("Pipeline creation complete (Worker).", 'success');
                finishLoading();
            }
            else if (type === 'error') {
                log(`Worker Error: ${error}`, 'error');
                if (dlFilename) {
                    dlFilename.innerText = `Error: ${error}`;
                    dlFilename.style.color = "red";
                }
                removeThinkingBubble();
                isGenerating = false;
                sendBtn.disabled = false;
            }
            else if (type === 'output') {
                // Partial output (if implemented in worker)
            }
            else if (type === 'complete') {
                // Generation Complete
                handleGenerationComplete(output);
            }
            else if (type === 'status') {
                if (data.status === 'initiate') {
                    log(`Initiating download: ${data.file}`);
                    if (dlFilename) dlFilename.innerText = `Preparing: ${data.file}`;
                } else if (data.status === 'done') {
                    log(`Finished: ${data.file}`, 'success');
                }
            }
        };

        log("Worker initialized. Sending init command...", 'info');
        worker.postMessage({
            type: 'init',
            data: { model: MODEL_ID, options: pipelineOptions }
        });

    } catch (err) {
        // If user stopped the download, suppress the error
        if (isDownloadStopped) {
            log("Download process terminated by user.", 'info');
            return;
        }

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
    // Show success message
    progressPanel.classList.remove('collapsed');
    progressPanel.style.display = 'block';
    progressPanel.innerHTML = '<div style="color: var(--lai-success); font-weight: 700; text-align: center; padding: 10px;">Model Downloaded Successfully</div>';

    // Enable Chat
    updateStatus('ready', 'Ready');
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.placeholder = `Ask ${MODEL_NAME.split(' ')[0]} something...`;

    // Build context-aware welcome message that includes model name
    let welcomeMsg = `✅ System Online. ${MODEL_NAME} loaded on your device.`;

    if (platformInfo.webGPUAvailable) {
        // WebGPU is available - show GPU acceleration message
        if (platformInfo.isMacOS) {
            if (platformInfo.isAppleSilicon && platformInfo.chipName) {
                welcomeMsg = `✅ ${MODEL_NAME} is ready! Running on your Apple ${platformInfo.chipName} with WebGPU acceleration.`;
            } else if (platformInfo.isAppleSilicon) {
                welcomeMsg = `✅ ${MODEL_NAME} is ready! Running on your Apple Silicon Mac with WebGPU.`;
            } else {
                welcomeMsg = `✅ ${MODEL_NAME} is ready! Running on your Mac with WebGPU.`;
            }
        } else {
            welcomeMsg = `✅ ${MODEL_NAME} is ready! Using WebGPU acceleration.`;
        }
    } else {
        // WASM fallback - show CPU message with tips
        if (platformInfo.isMacOS) {
            welcomeMsg = `✅ ${MODEL_NAME} is ready! Running on your Mac using WASM (CPU). Enable WebGPU in Chrome flags for the larger 4B model!`;
        } else {
            welcomeMsg = `✅ ${MODEL_NAME} is ready! Using WASM (CPU mode). Responses may be slower.`;
        }
    }
    appendMessage('system', welcomeMsg);
}

// === CHAT LOGIC ===
async function handleSend() {
    const text = userInput.value.trim();
    if (!text || isGenerating || !worker) return;

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
    window.genTimeoutWarning = setTimeout(() => {
        if (isGenerating) {
            updateStatus('busy', 'Still working on it...');
            updateThinkingStatus('Still processing, please wait...');
            log("Generation is taking longer than usual...", 'info');
        }
    }, 8000); // 8 seconds

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

    // Store stats for current generation and update metrics (approx)
    window.currentGenStartTime = startTime;
    window.currentGenInputText = text;
    window.currentGenPrompt = prompt;
    window.currentGenInputTokens = countTokens(prompt);

    updateThinkingStatus('Starting inference (Worker)...');

    worker.postMessage({
        type: 'generate',
        data: {
            prompt: prompt,
            config: {
                max_new_tokens: 2048,
                temperature: 0.7,
                do_sample: true,
                top_k: 50,
            }
        }
    });

    // Cleanup logic (timeout) remains in main thread, but handling success is now in worker.onmessage
}

// === WORKER HANDLERS ===
function handleGenerationComplete(outputRaw) {
    if (!isGenerating) return;

    clearTimeout(window.genTimeoutWarning);

    const startTime = window.currentGenStartTime;
    const prompt = window.currentGenPrompt;

    const endTime = performance.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // Parse output
    const { context, response } = parseChatOutput(outputRaw, prompt);

    // Metrics
    const inputWords = countWords(window.currentGenInputText);
    const inputTokens = window.currentGenInputTokens;
    const outputWords = countWords(response);
    const outputTokens = countTokens(response);

    const metrics = {
        duration,
        inputWords,
        inputTokens,
        outputWords,
        outputTokens
    };

    removeThinkingBubble();
    appendMessage('bot', response, context, metrics);
    log("Generation Complete.", 'success');

    isGenerating = false;
    updateStatus('ready', 'Ready');
    sendBtn.disabled = false;
    userInput.focus();
}

function handleDownloadProgress(data) {
    // Reused logic from original progress_callback
    const percent = Math.round(data.progress || 0);
    const loaded = data.loaded || 0;
    const total = data.total || 0;
    const fileName = data.file;

    if (dlBar) dlBar.style.width = `${percent}%`;
    if (dlPercent) dlPercent.innerText = `${percent}%`;

    const sizeText = total > 0
        ? `(${Math.round(loaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB)`
        : '';

    if (dlFilename) dlFilename.innerText = `Downloading: ${fileName} ${sizeText}`;

    if (percent % 10 === 0 && percent > 0) {
        log(`[${fileName}] ${percent}%`);
    }
}

function countWords(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).length;
}

function countTokens(str) {
    if (!str) return 0;
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
    clearCacheBtn.addEventListener('click', () => {
        showConfirmModal(
            'Clear Model Cache?',
            'This will delete ALL cached model files (4B and 8B models). You will need to re-download them.',
            async () => {
                try {
                    log('Clearing all model caches...', 'info');
                    clearCacheBtn.disabled = true;
                    clearCacheBtn.textContent = 'Clearing...';

                    if (!window.caches) {
                        throw new Error("Cache API not available (requires HTTPS or localhost)");
                    }

                    // Get all cache names and delete any that look like transformers/model caches
                    const cacheNames = await window.caches.keys();
                    let deletedCount = 0;

                    for (const cacheName of cacheNames) {
                        // Delete transformers cache and any other model-related caches
                        if (cacheName.includes('transformers') ||
                            cacheName.includes('onnx') ||
                            cacheName.includes('huggingface') ||
                            cacheName.includes('model')) {
                            const deleted = await window.caches.delete(cacheName);
                            if (deleted) {
                                log(`Deleted cache: ${cacheName}`, 'success');
                                deletedCount++;
                            }
                        }
                    }

                    // Also try the main transformers-cache directly
                    const mainCacheDeleted = await window.caches.delete('transformers-cache');
                    if (mainCacheDeleted) deletedCount++;

                    if (deletedCount > 0) {
                        log(`Cleared ${deletedCount} cache(s) successfully!`, 'success');
                        appendMessage('system', `Cleared ${deletedCount} model cache(s)! Models will be re-downloaded on next use.`);
                    } else {
                        log('No model caches found to delete.', 'info');
                        appendMessage('system', 'No cached models found.');
                    }

                    clearCacheBtn.disabled = false;
                    clearCacheBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Clear Cache`;
                } catch (err) {
                    log(`Failed to clear cache: ${err.message}`, 'error');
                    clearCacheBtn.disabled = false;
                }
            },
            'Clear Cache',
            'danger'
        );
    });
}

// Reset Hardware Choice Button
if (resetHardwareBtn) {
    resetHardwareBtn.addEventListener('click', () => {
        showConfirmModal(
            'Reset Hardware Choice?',
            'This will clear your saved preference and reload the page to detect hardware again.',
            () => {
                clearHardwareSelection();
                location.reload();
            },
            'Reset & Reload',
            'danger'
        );
    });
}

// Download Control Buttons
if (stopDownloadBtn) {
    stopDownloadBtn.addEventListener('click', () => {
        log('Stopping download by user request...', 'info');
        isDownloadStopped = true;
        window.stop(); // Stops network activity

        // Update UI
        if (typeof statusText !== 'undefined') statusText.innerText = 'Download Cancelled';
        if (typeof dlFilename !== 'undefined') dlFilename.innerText = 'Download stopped by user.';

        stopDownloadBtn.classList.add('hidden');
        if (restartDownloadBtn) restartDownloadBtn.classList.remove('hidden');

        // Disable loaders
        const bar = document.querySelector('.lai-infinite-bar');
        if (bar) bar.style.animation = 'none';
    });
}

if (restartDownloadBtn) {
    restartDownloadBtn.addEventListener('click', () => {
        location.reload();
    });
}

if (restartDownloadBtn) {
    restartDownloadBtn.addEventListener('click', () => {
        location.reload();
    });
}

// Debug Console Toggle
if (toggleDebugBtn) {
    toggleDebugBtn.addEventListener('click', () => {
        // Toggle the entire debug wrapper (header + log)
        if (debugWrapper) {
            const isHidden = debugWrapper.style.display === 'none';
            debugWrapper.style.display = isHidden ? 'block' : 'none';

            // Update icon opacity
            toggleDebugBtn.style.opacity = isHidden ? '1' : '0.6';
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

// Hardware Selection Modal - shown when auto-detection fails
const HARDWARE_SELECTION_KEY = 'lai-hardware-selection';

function showHardwareSelectionModal() {
    return new Promise((resolve) => {
        // Check if user has previously made a selection
        const savedSelection = localStorage.getItem(HARDWARE_SELECTION_KEY);
        if (savedSelection) {
            const parsed = JSON.parse(savedSelection);
            resolve(parsed);
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'lai-modal-overlay lai-hardware-modal';

        const modal = document.createElement('div');
        modal.className = 'lai-modal lai-hardware-selection';

        modal.innerHTML = `
            <div class="lai-modal-icon" style="background: rgba(139, 92, 246, 0.15); color: var(--lai-accent);">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                    <rect x="9" y="9" width="6" height="6"></rect>
                    <line x1="9" y1="1" x2="9" y2="4"></line>
                    <line x1="15" y1="1" x2="15" y2="4"></line>
                    <line x1="9" y1="20" x2="9" y2="23"></line>
                    <line x1="15" y1="20" x2="15" y2="23"></line>
                    <line x1="20" y1="9" x2="23" y2="9"></line>
                    <line x1="20" y1="14" x2="23" y2="14"></line>
                    <line x1="1" y1="9" x2="4" y2="9"></line>
                    <line x1="1" y1="14" x2="4" y2="14"></line>
                </svg>
            </div>
            <h2>Select Your Hardware</h2>
            <p style="color: var(--lai-text-secondary); margin-bottom: 20px; font-size: 0.9rem;">
                We couldn't automatically detect your hardware. Please select your device type for the best performance:
            </p>
            
            <div class="lai-hardware-options">
                <button class="lai-hardware-option" data-type="apple-silicon">
                    <div class="lai-hw-icon">
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                        </svg>
                    </div>
                    <div class="lai-hw-info">
                        <strong>Apple Silicon Mac</strong>
                        <span>M1, M2, M3, M4 chip</span>
                    </div>
                    <div class="lai-hw-tag fast">⚡ Fast</div>
                </button>
                
                <button class="lai-hardware-option" data-type="dedicated-gpu">
                    <div class="lai-hw-icon">
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                            <line x1="6" y1="12" x2="6" y2="12.01"></line>
                            <line x1="10" y1="12" x2="10" y2="12.01"></line>
                            <line x1="14" y1="12" x2="14" y2="12.01"></line>
                            <line x1="18" y1="12" x2="18" y2="12.01"></line>
                        </svg>
                    </div>
                    <div class="lai-hw-info">
                        <strong>Dedicated GPU</strong>
                        <span>NVIDIA/AMD graphics card</span>
                    </div>
                    <div class="lai-hw-tag fast">⚡ Fast</div>
                </button>
                
                <button class="lai-hardware-option" data-type="cpu-only">
                    <div class="lai-hw-icon">
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                            <rect x="9" y="9" width="6" height="6"></rect>
                        </svg>
                    </div>
                    <div class="lai-hw-info">
                        <strong>CPU Only</strong>
                        <span>No dedicated GPU / Intel Mac</span>
                    </div>
                    <div class="lai-hw-tag slow">🐢 Slower</div>
                </button>
            </div>
            
            <label class="lai-remember-choice">
                <input type="checkbox" id="remember-hardware" checked>
                <span>Remember my choice</span>
            </label>
        `;

        const closeAndResolve = (selection) => {
            const remember = modal.querySelector('#remember-hardware').checked;
            if (remember) {
                localStorage.setItem(HARDWARE_SELECTION_KEY, JSON.stringify(selection));
            }
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.remove();
                resolve(selection);
            }, 300);
        };

        // Handle option clicks
        modal.querySelectorAll('.lai-hardware-option').forEach(btn => {
            btn.onclick = () => {
                const type = btn.dataset.type;
                let selection = { hasGPU: false, isAppleSilicon: false, isMacOS: false };

                if (type === 'apple-silicon') {
                    selection = { hasGPU: true, isAppleSilicon: true, isMacOS: true };
                } else if (type === 'dedicated-gpu') {
                    selection = { hasGPU: true, isAppleSilicon: false, isMacOS: false };
                } else {
                    selection = { hasGPU: false, isAppleSilicon: false, isMacOS: false };
                }

                closeAndResolve(selection);
            };
        });

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    });
}

// Clear saved hardware selection (useful for settings)
function clearHardwareSelection() {
    localStorage.removeItem(HARDWARE_SELECTION_KEY);
    log('Hardware selection cleared. Will ask on next load.', 'info');
}

window.addEventListener('DOMContentLoaded', () => {
    // Initialize chat history
    loadChatsFromStorage();
    initChatHistoryEvents();
    renderChatList();

    // Initialize model selector (always visible in header)
    initModelSelector();

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

// === MODEL SELECTOR ===
function initModelSelector() {
    const modelSelectorWrapper = document.getElementById('model-selector-wrapper');
    const modelSelector = document.getElementById('model-selector');
    const fallbackBadge = document.getElementById('fallback-badge');

    if (!modelSelector) return;

    // Check if WebGPU is available (navigator.gpu exists)
    // Note: Full WebGPU check happens in init(), this is just for UI
    const hasWebGPU = !!navigator.gpu;

    if (hasWebGPU) {
        // Show model selector for WebGPU users
        if (modelSelectorWrapper) modelSelectorWrapper.style.display = 'flex';
        if (fallbackBadge) fallbackBadge.style.display = 'none';

        // Load saved preference and set MODEL_NAME/MODEL_ID immediately
        const savedModel = localStorage.getItem(MODEL_SELECTION_KEY);
        const selectedKey = (savedModel && WEBGPU_MODELS[savedModel]) ? savedModel : DEFAULT_WEBGPU_MODEL;

        // Set the dropdown value
        modelSelector.value = selectedKey;

        // Set global MODEL_NAME and MODEL_ID to show correct name immediately
        MODEL_ID = WEBGPU_MODELS[selectedKey].id;
        MODEL_NAME = WEBGPU_MODELS[selectedKey].name;

        // Update the display immediately
        updateModelDisplay();

        // Handle model change
        modelSelector.addEventListener('change', (e) => {
            const newModel = e.target.value;
            const currentModel = localStorage.getItem(MODEL_SELECTION_KEY) || DEFAULT_WEBGPU_MODEL;

            if (newModel !== currentModel) {
                localStorage.setItem(MODEL_SELECTION_KEY, newModel);

                // Show confirmation and reload
                showModelChangeModal(
                    'Model Changed',
                    `Switching to <strong>${WEBGPU_MODELS[newModel].name}</strong> (${WEBGPU_MODELS[newModel].size}).<br><br>The page will reload to load the new model.`,
                    () => window.location.reload()
                );
            }
        });

        log(`Model selector initialized (${MODEL_NAME})`, 'success');
    } else {
        // Hide model selector, show fallback badge for WASM/CPU users
        if (modelSelectorWrapper) modelSelectorWrapper.style.display = 'none';
        if (fallbackBadge) fallbackBadge.style.display = 'flex';

        // Set to WASM model
        MODEL_ID = WASM_MODEL_ID;
        MODEL_NAME = WASM_MODEL_NAME;

        // Update the display to show the WASM model
        updateModelDisplay();

        log(`WebGPU not available - using ${MODEL_NAME} (CPU mode)`, 'info');
    }
}

function showModelChangeModal(title, message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'lai-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'lai-modal';

    modal.innerHTML = `
        <div class="lai-modal-icon" style="color: #8b5cf6;">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                <rect x="9" y="9" width="6" height="6"></rect>
                <line x1="9" y1="1" x2="9" y2="4"></line>
                <line x1="15" y1="1" x2="15" y2="4"></line>
                <line x1="9" y1="20" x2="9" y2="23"></line>
                <line x1="15" y1="20" x2="15" y2="23"></line>
                <line x1="20" y1="9" x2="23" y2="9"></line>
                <line x1="20" y1="14" x2="23" y2="14"></line>
                <line x1="1" y1="9" x2="4" y2="9"></line>
                <line x1="1" y1="14" x2="4" y2="14"></line>
            </svg>
        </div>
        <h2>${title}</h2>
        <div class="lai-modal-body">${message}</div>
        <button class="lai-modal-btn">Reload Now</button>
    `;

    const btn = modal.querySelector('.lai-modal-btn');
    btn.onclick = () => {
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.remove();
            onConfirm();
        }, 300);
    };

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}