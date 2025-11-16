/* START OF UPDATED script.js */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const fileInput = document.getElementById('chatFile');
    const fileNameDisplay = document.getElementById('fileName');
    const chatContainer = document.getElementById('chat-container');
    const senderLegend = document.getElementById('sender-legend');
    const increaseSizeBtn = document.getElementById('increaseSize');
    const decreaseSizeBtn = document.getElementById('decreaseSize');
    const themeToggleButton = document.getElementById('theme-toggle'); // Changed from checkbox
    const searchInput = document.getElementById('searchInput');
    const searchPrevBtn = document.getElementById('searchPrev');
    const searchNextBtn = document.getElementById('searchNext');
    const searchResultCount = document.getElementById('searchResultCount');
    const rootElement = document.documentElement;
    const bodyElement = document.body;

    // --- Configuration ---
    const OMITTED_CONTENT_REGEX = /^(?:\u200e)?(<attached: |<Media omitted>|image omitted|video omitted|audio omitted|sticker omitted|GIF omitted|document omitted|This message was deleted.|Messages and calls are end-to-end encrypted\.)/i;
    const REPLACEMENT_TEXT_MAP = {
        '<attached: ': '(Attachment omitted)',
        '<media omitted>': '(Media omitted)',
        'image omitted': '(Image omitted)',
        'video omitted': '(Video omitted)',
        'audio omitted': '(Audio omitted)',
        'sticker omitted': '(Sticker omitted)',
        'gif omitted': '(GIF omitted)',
        'document omitted': '(Document omitted)',
        'this message was deleted.': '(Message deleted)',
        'messages and calls are end-to-end encrypted.': '(Info: End-to-end encryption enabled)',
    };

    // --- NEW MODERN THEME Color Configuration ---
    const senderStylesConfig = [
        // Style 0 (typically outgoing)
        { align: 'flex-end',  light: { bg: 'rgba(139, 92, 246, 0.15)', name: '#8b5cf6', text: '#18181b' }, dark: { bg: 'rgba(139, 92, 246, 0.4)', name: '#a78bfa', text: '#f4f4f5' } },
        // Style 1 (typically incoming)
        { align: 'flex-start', light: { bg: '#ffffff', name: '#52525b', text: '#18181b' }, dark: { bg: '#18181b', name: '#a1a1aa', text: '#f4f4f5' } },
        // Additional styles for group chats
        { align: 'flex-start', light: { bg: 'rgba(56, 189, 248, 0.15)', name: '#0ea5e9', text: '#18181b' }, dark: { bg: 'rgba(56, 189, 248, 0.3)', name: '#7dd3fc', text: '#f4f4f5' } },
        { align: 'flex-start', light: { bg: 'rgba(234, 179, 8, 0.15)', name: '#ca8a04', text: '#18181b' }, dark: { bg: 'rgba(234, 179, 8, 0.3)', name: '#facc15', text: '#f4f4f5' } },
        { align: 'flex-start', light: { bg: 'rgba(236, 72, 153, 0.1)', name: '#db2777', text: '#18181b' }, dark: { bg: 'rgba(236, 72, 153, 0.3)', name: '#f9a8d4', text: '#f4f4f5' } },
        { align: 'flex-start', light: { bg: 'rgba(22, 163, 74, 0.1)', name: '#15803d', text: '#18181b' }, dark: { bg: 'rgba(22, 163, 74, 0.3)', name: '#4ade80', text: '#f4f4f5' } },
    ];
    
    const SIZE_ADJUST_STEP = 0.08;
    const MIN_UI_SCALE = 0.7;
    const MAX_UI_SCALE = 1.5;
    const MIN_CHAT_FONT_SCALE = 0.7;
    const MAX_CHAT_FONT_SCALE = 1.8;

    // --- State Variables ---
    let assignedSenderStyles = {};
    let uniqueSenders = new Set();
    let currentUiScale = 1.0;
    let currentChatFontScale = 1.0;
    // Default to dark, check storage, then check system preference
    let preferredTheme = localStorage.getItem('chatViewerTheme');
    let currentTheme = preferredTheme ? preferredTheme : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    let markInstance = null;
    let searchResults = [];
    let currentHighlightIndex = -1;
    const leadingInvisibleCharRegex = /^\u200e/;


    // --- Initialization ---
    applyTheme(currentTheme);
    adjustSize(0);
    markInstance = new Mark(chatContainer);
    searchPrevBtn.disabled = true;
    searchNextBtn.disabled = true;

    // --- Event Listeners ---
    fileInput.addEventListener('change', handleFileSelect);
    increaseSizeBtn.addEventListener('click', () => adjustSize(SIZE_ADJUST_STEP));
    decreaseSizeBtn.addEventListener('click', () => adjustSize(-SIZE_ADJUST_STEP));
    themeToggleButton.addEventListener('click', handleThemeToggle); // Changed event
    searchInput.addEventListener('input', handleSearchInput);
    searchPrevBtn.addEventListener('click', () => navigateSearchResults(-1, false));
    searchNextBtn.addEventListener('click', () => navigateSearchResults(1, false));


    // --- Functions ---

    function applyTheme(theme) {
        if (theme === 'light') {
            bodyElement.classList.add('light-mode');
        } else {
            bodyElement.classList.remove('light-mode');
        }
        currentTheme = theme;
        localStorage.setItem('chatViewerTheme', theme);
        if (chatContainer.children.length > 1 || (chatContainer.children.length === 1 && !chatContainer.querySelector('.placeholder'))) {
             updateAllMessageStyles();
        }
        updateLegendStyles();
    }

    function handleThemeToggle() {
        const newTheme = bodyElement.classList.contains('light-mode') ? 'dark' : 'light';
        applyTheme(newTheme);
    }

    function updateAllMessageStyles() {
        const messageBubbles = chatContainer.querySelectorAll('.message-bubble');
        messageBubbles.forEach(bubble => {
            const sender = bubble.dataset.sender;
            if (sender && assignedSenderStyles[sender]) {
                const styleInfo = assignedSenderStyles[sender];
                const config = senderStylesConfig[styleInfo.styleIndex];
                const themeColors = config[currentTheme];
                bubble.style.backgroundColor = themeColors.bg;
                bubble.style.alignSelf = styleInfo.currentAlign;
                const senderDiv = bubble.querySelector('.sender');
                if (senderDiv) senderDiv.style.color = themeColors.name;
                 const contentDiv = bubble.querySelector('.content');
                 if(contentDiv) contentDiv.style.color = themeColors.text;
            }
        });
    }

     function updateLegendStyles() {
         const legendItems = senderLegend.querySelectorAll('.legend-item');
         legendItems.forEach(item => {
             const sender = item.dataset.sender;
              if (sender && assignedSenderStyles[sender]) {
                const styleInfo = assignedSenderStyles[sender];
                const config = senderStylesConfig[styleInfo.styleIndex];
                const themeColors = config[currentTheme];
                const colorBox = item.querySelector('.color-box');
                if (colorBox) colorBox.style.backgroundColor = themeColors.bg;
              }
         })
     }

    function adjustSize(delta) {
        currentUiScale = Math.max(MIN_UI_SCALE, Math.min(MAX_UI_SCALE, currentUiScale + delta));
        currentChatFontScale = Math.max(MIN_CHAT_FONT_SCALE, Math.min(MAX_CHAT_FONT_SCALE, currentChatFontScale + delta));
        rootElement.style.setProperty('--ui-scale', currentUiScale);
        rootElement.style.setProperty('--chat-font-scale', currentChatFontScale);
    }

    function handleFileSelect(event) {
        const file = event.target.files[0];
        resetChatView();

        if (!file) {
            fileNameDisplay.textContent = 'No file selected';
            chatContainer.innerHTML = '<p class="placeholder">Upload a WhatsApp chat export (.txt) file.</p>';
            return;
        }
        if (file.type !== 'text/plain') {
             alert('Please upload a valid .txt file.');
             fileNameDisplay.textContent = 'Invalid file type';
             fileInput.value = '';
             return;
        }

        fileNameDisplay.textContent = `Loading: ${file.name}...`;
        chatContainer.innerHTML = '<p class="placeholder">Loading chat...</p>';

        const reader = new FileReader();
        reader.onload = (e) => {
            fileNameDisplay.textContent = `Viewing: ${file.name}`;
            parseAndDisplayChat(e.target.result);
        };
        reader.onerror = (e) => {
            console.error("Error reading file:", e);
            chatContainer.innerHTML = '<p class="placeholder error">Error reading file.</p>';
            fileNameDisplay.textContent = 'Error loading file';
        };
        reader.readAsText(file);
    }
    
    // Unchanged functions (resetChatView, parseWhatsAppTimestamp, timeAgo, search functions, parsing logic)
    // are omitted for brevity but should be copied from your original `script.js` file.
    // The following are placeholders for the functions that remain identical to your provided script.

    function resetChatView() {
         chatContainer.innerHTML = '';
         senderLegend.innerHTML = '';
         assignedSenderStyles = {};
         uniqueSenders = new Set();
         searchInput.value = '';
         handleSearchInput();
    }
    function parseWhatsAppTimestamp(dateStr, timeNumStr, ampmStr) { // Takes numeric time and optional am/pm
        if (!dateStr || !timeNumStr) return null;
        const ampm = ampmStr ? ampmStr.trim().toUpperCase() : null;
        const dateParts = dateStr.split('/');
        const timeMatch = timeNumStr.match(/(\d{1,2}):(\d{2}):(\d{2})/);
        if (!dateParts || dateParts.length !== 3 || !timeMatch) return null;
        let day, month, year;
        if (dateParts[2].length === 4) {
            day = parseInt(dateParts[0], 10);
            month = parseInt(dateParts[1], 10) - 1;
            year = parseInt(dateParts[2], 10);
        } else if (dateParts[2].length === 2) {
            month = parseInt(dateParts[0], 10) - 1;
            day = parseInt(dateParts[1], 10);
            year = parseInt(dateParts[2], 10) + 2000;
        } else { return null; }
        let hour = parseInt(timeMatch[1], 10);
        const minute = parseInt(timeMatch[2], 10);
        const second = parseInt(timeMatch[3], 10);
        if (ampm) {
            if (ampm === 'PM' && hour < 12) hour += 12;
            else if (ampm === 'AM' && hour === 12) hour = 0;
        } else { if (hour < 0 || hour > 23) return null; }
        const currentYear = new Date().getFullYear();
        if (year < 2000 || year > currentYear + 5) return null;
        try {
             const date = new Date(year, month, day, hour, minute, second);
             if (isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
             return date;
        } catch (e) { return null; }
    }
    function timeAgo(messageDate) {
        if (!(messageDate instanceof Date) || isNaN(messageDate)) return "";
        const now = new Date();
        const diffInSeconds = Math.round((now - messageDate) / 1000);
        const minute = 60, hour = 3600, day = 86400, week = 604800, month = 2629800, year = 31557600;
        if (diffInSeconds < minute) return "Just now";
        if (diffInSeconds < hour) return `${Math.floor(diffInSeconds / minute)}m ago`;
        if (diffInSeconds < day) return `${Math.floor(diffInSeconds / hour)}h ago`;
        if (diffInSeconds < week * 2) return `${Math.floor(diffInSeconds / day)}d ago`;
        if (diffInSeconds < month * 2) return `${Math.floor(diffInSeconds / week)}w ago`;
        if (diffInSeconds < year) return `${Math.floor(diffInSeconds / month)}mo ago`;
        return `${Math.floor(diffInSeconds / year)}y ago`;
    }
    function handleSearchInput() {
         const searchTerm = searchInput.value.trim();
         markInstance.unmark({
            done: () => {
                 searchResults = [];
                 currentHighlightIndex = -1;
                 chatContainer.querySelectorAll('.highlight-bubble').forEach(el => el.classList.remove('highlight-bubble'));
                 if (searchTerm.length < 1) {
                     searchResultCount.textContent = '';
                     searchPrevBtn.disabled = true;
                     searchNextBtn.disabled = true;
                     return;
                 }
                 markInstance.mark(searchTerm, {
                     element: "mark", className: "search-highlight", separateWordSearch: false, accuracy: "partially", iframes: false, acrossElements: false, exclude: [".sender", ".message-meta"],
                     each: (markElement) => {
                         const bubble = markElement.closest('.message-bubble');
                         if (bubble && !searchResults.includes(bubble)) { searchResults.push(bubble); }
                     },
                     done: () => {
                         updateSearchResultDisplay();
                         if (searchResults.length > 0) { navigateSearchResults(0, true); } 
                         else { searchPrevBtn.disabled = true; searchNextBtn.disabled = true; }
                     }
                 });
             }
         });
    }
    function updateSearchResultDisplay() {
        const count = searchResults.length;
        const currentNum = currentHighlightIndex + 1;
        if (count > 0) {
            searchResultCount.textContent = `${currentNum} of ${count}`;
            searchPrevBtn.disabled = currentNum <= 1;
            searchNextBtn.disabled = currentNum >= count;
        } else {
            searchResultCount.textContent = searchInput.value ? '0 results' : '';
            searchPrevBtn.disabled = true;
            searchNextBtn.disabled = true;
        }
    }
    function navigateSearchResults(direction, stayAtFirst = false) {
        if (searchResults.length === 0) return;
        const previousIndex = currentHighlightIndex;
        if (previousIndex >= 0 && previousIndex < searchResults.length) {
            const prevElement = searchResults[previousIndex];
            if (prevElement && prevElement instanceof Element) prevElement.classList.remove('highlight-bubble');
        }
        let nextIndex = stayAtFirst ? 0 : Math.max(0, Math.min(searchResults.length - 1, previousIndex + direction));
        currentHighlightIndex = nextIndex;
        const targetElement = searchResults[currentHighlightIndex];
        if (targetElement && targetElement instanceof Element) {
            targetElement.classList.add('highlight-bubble');
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
        updateSearchResultDisplay();
    }
    function parseAndDisplayChat(chatText) {
        const messageRegex = /^\[\s*(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}:\d{2})(?:\s?[\u202f]?(am|pm|AM|PM))?\s*\]\s*(.*?):\s*(.*)/;
        const systemMessageRegex1 = /^\[\s*(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}:\d{2})(?:\s?[\u202f]?(am|pm|AM|PM))?\s*\]\s*(.*)/;
        const lines = chatText.split('\n');
        let messages = [];
        let currentMessage = null;
        uniqueSenders = new Set();
        lines.forEach(rawLine => {
            const line = rawLine.replace(leadingInvisibleCharRegex, '');
            if (!line.trim()) return;
            const match = line.match(messageRegex);
            if (match) {
                if (currentMessage) messages.push(currentMessage);
                const [ , dateStr, timeNumStr, ampmStr, sender, rawContent] = match.map(s => s ? s.trim() : s);
                let content = rawContent.replace(leadingInvisibleCharRegex, '');
                let isPlaceholder = false;
                const lowerCaseContent = content.toLowerCase();
                const omittedMatchKey = Object.keys(REPLACEMENT_TEXT_MAP).find(key => lowerCaseContent.startsWith(key));
                if (omittedMatchKey && lowerCaseContent.length <= omittedMatchKey.length + 5) {
                     content = REPLACEMENT_TEXT_MAP[omittedMatchKey];
                     isPlaceholder = true;
                }
                const originalTimeStr = `${timeNumStr}${ampmStr ? ' ' + ampmStr : ''}`;
                currentMessage = { dateStr, timeStr: originalTimeStr, sender, content, type: 'user', isPlaceholder, dateObj: parseWhatsAppTimestamp(dateStr, timeNumStr, ampmStr) };
                if (sender !== 'System') uniqueSenders.add(sender);
            } else if (currentMessage && !line.match(systemMessageRegex1) && !line.match(messageRegex)) {
                const lineContentClean = line.replace(leadingInvisibleCharRegex, '').trim();
                const lowerCaseLineContent = lineContentClean.toLowerCase();
                const continuationOmittedKey = Object.keys(REPLACEMENT_TEXT_MAP).find(key => lowerCaseLineContent.startsWith(key));
                if (continuationOmittedKey && lowerCaseLineContent.length <= continuationOmittedKey.length + 5) {
                    messages.push(currentMessage);
                    messages.push({ dateStr: currentMessage.dateStr, timeStr: currentMessage.timeStr, dateObj: currentMessage.dateObj, sender: 'System', content: REPLACEMENT_TEXT_MAP[continuationOmittedKey], type: 'system' });
                    currentMessage = null;
                } else { currentMessage.content += '\n' + line.trimEnd(); }
            } else {
                if (currentMessage) messages.push(currentMessage);
                currentMessage = null;
                const systemMatch = line.match(systemMessageRegex1);
                let systemContent = line.trim();
                let systemDateStr = '', systemTimeStr = '', systemDateObj = null, isLikelySystem = false;
                if (systemMatch) {
                    systemDateStr = systemMatch[1].trim();
                    const systemTimeNumStr = systemMatch[2].trim();
                    const systemAmpmStr = systemMatch[3] ? systemMatch[3].trim() : null;
                    systemContent = systemMatch[4].replace(leadingInvisibleCharRegex, '').trim();
                    systemDateObj = parseWhatsAppTimestamp(systemDateStr, systemTimeNumStr, systemAmpmStr);
                    systemTimeStr = `${systemTimeNumStr}${systemAmpmStr ? ' ' + systemAmpmStr : ''}`;
                    isLikelySystem = true;
                    const lowerSystemContent = systemContent.toLowerCase();
                    if (REPLACEMENT_TEXT_MAP[lowerSystemContent]) systemContent = REPLACEMENT_TEXT_MAP[lowerSystemContent];
                    else if (systemContent.includes(': ')) {
                        isLikelySystem = false;
                        systemContent = line.trim();
                        systemDateStr = ''; systemTimeStr = ''; systemDateObj = null;
                    }
                } else {
                    const commonSystemIndicators = ['end-to-end encrypted', 'created group', 'added', 'removed', 'left', 'changed the subject', 'changed this group\'s icon', 'changed their phone number', 'security code changed', 'is a contact.', 'You blocked', 'You unblocked'];
                    const lowerCaseContent = systemContent.toLowerCase();
                    if (commonSystemIndicators.some(indicator => lowerCaseContent.includes(indicator))) isLikelySystem = true;
                    if (REPLACEMENT_TEXT_MAP[lowerCaseContent]) {
                        isLikelySystem = true;
                        systemContent = REPLACEMENT_TEXT_MAP[lowerCaseContent];
                    }
                }
                if (isLikelySystem && systemContent) messages.push({ dateStr: systemDateStr, timeStr: systemTimeStr, sender: 'System', content: systemContent, type: 'system', dateObj: systemDateObj });
                else if (systemContent) messages.push({ dateStr: '', timeStr: '', sender: 'System', content: systemContent, type: 'system', dateObj: null });
            }
        });
        if (currentMessage) messages.push(currentMessage);
        displayMessages(messages, Array.from(uniqueSenders));
    }
    function assignInitialSenderStyles(senderList) {
        assignedSenderStyles = {};
        let nextIncomingIndex = 1;
        const isTwoPersonChat = senderList.length === 2;
        senderList.forEach((sender, index) => {
            let styleIndex;
            if (isTwoPersonChat) styleIndex = index === 0 ? 0 : 1;
            else {
                if (index === 0) styleIndex = 0;
                else {
                    styleIndex = nextIncomingIndex++;
                    if (nextIncomingIndex >= senderStylesConfig.length) nextIncomingIndex = 1;
                }
            }
            assignedSenderStyles[sender] = { styleIndex: styleIndex, currentAlign: senderStylesConfig[styleIndex].align };
        });
    }
    function handleSenderSwap(sender) {
        if (!assignedSenderStyles[sender]) return;
        const currentStyle = assignedSenderStyles[sender];
        const newAlign = currentStyle.currentAlign === 'flex-start' ? 'flex-end' : 'flex-start';
        assignedSenderStyles[sender].currentAlign = newAlign;
        const bubblesToUpdate = chatContainer.querySelectorAll(`.message-bubble[data-sender="${sender}"]`);
        bubblesToUpdate.forEach(bubble => { bubble.style.alignSelf = newAlign; });
    }
    function displayMessages(messages, senderList) {
        chatContainer.innerHTML = '';
        senderLegend.innerHTML = '';
        if (messages.length === 0) {
            chatContainer.innerHTML = '<p class="placeholder">No messages found or parsed in file.</p>';
            return;
        }
        assignInitialSenderStyles(senderList);
        senderList.forEach(sender => {
             if (assignedSenderStyles[sender]) {
                 const styleInfo = assignedSenderStyles[sender];
                 const config = senderStylesConfig[styleInfo.styleIndex];
                 const themeColors = config[currentTheme];
                 const legendItem = document.createElement('div');
                 legendItem.className = 'legend-item';
                 legendItem.dataset.sender = sender;
                 legendItem.innerHTML = `<span class="color-box" style="background-color: ${themeColors.bg};"></span><span class="sender-name">${sender}</span>`;
                 const swapButton = document.createElement('button');
                 swapButton.className = 'btn swap-button';
                 swapButton.dataset.sender = sender;
                 swapButton.title = `Swap alignment for ${sender}`;
                 swapButton.textContent = 'Swap Align';
                 swapButton.addEventListener('click', () => handleSenderSwap(sender));
                 legendItem.appendChild(swapButton);
                 senderLegend.appendChild(legendItem);
             }
        });
        messages.forEach((msg, index) => {
            const messageBubble = document.createElement('div');
            messageBubble.dataset.messageIndex = index;
            if (msg.type === 'system') {
                messageBubble.className = 'system-message';
                messageBubble.textContent = msg.content;
                if (msg.dateObj) {
                    const timeSpan = document.createElement('span');
                    timeSpan.style.cssText = 'font-size: 0.8em; opacity: 0.7; margin-left: 10px;';
                    timeSpan.textContent = `(${msg.dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`;
                    messageBubble.appendChild(timeSpan);
                }
            } else {
                 messageBubble.className = 'message-bubble';
                 messageBubble.dataset.sender = msg.sender;
                 const styleInfo = assignedSenderStyles[msg.sender];
                 if (styleInfo) {
                    const config = senderStylesConfig[styleInfo.styleIndex];
                    const themeColors = config[currentTheme];
                    messageBubble.style.backgroundColor = themeColors.bg;
                    messageBubble.style.alignSelf = styleInfo.currentAlign;
                    const displayTime = msg.dateObj ? msg.dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : msg.timeStr;
                    const displayDate = msg.dateObj ? msg.dateObj.toLocaleDateString([], { day: 'numeric', month: 'numeric', year: 'numeric' }) : msg.dateStr;
                    const ago = timeAgo(msg.dateObj);
                    messageBubble.innerHTML = `
                        <div class="sender" style="color: ${themeColors.name};">${msg.sender}</div>
                        <div class="content ${msg.isPlaceholder ? 'placeholder-content' : ''}" style="color: ${themeColors.text};"></div>
                        <div class="message-meta">${displayDate}, ${displayTime} ${ago ? `<span class="time-ago">• ${ago}</span>` : ''}</div>
                    `;
                    messageBubble.querySelector('.content').innerText = msg.content;
                 } else {
                      messageBubble.innerText = `${msg.dateStr}, ${msg.timeStr} - ${msg.sender}: ${msg.content}`;
                      messageBubble.style.alignSelf = 'flex-start';
                 }
            }
            chatContainer.appendChild(messageBubble);
        });
        requestAnimationFrame(() => { chatContainer.scrollTop = chatContainer.scrollHeight; });
        if (searchInput.value.trim()) handleSearchInput();
    }

}); // End DOMContentLoaded