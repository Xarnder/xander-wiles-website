/* START OF UPDATED script.js */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const fileInput = document.getElementById('chatFile');
    const fileNameDisplay = document.getElementById('fileName');
    const chatContainer = document.getElementById('chat-container');
    const senderLegend = document.getElementById('sender-legend');
    const increaseSizeBtn = document.getElementById('increaseSize');
    const decreaseSizeBtn = document.getElementById('decreaseSize');
    const themeCheckbox = document.getElementById('themeCheckbox');
    const searchInput = document.getElementById('searchInput');
    const searchPrevBtn = document.getElementById('searchPrev');
    const searchNextBtn = document.getElementById('searchNext');
    const searchResultCount = document.getElementById('searchResultCount');
    const rootElement = document.documentElement; // For CSS variables
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
    const DEFAULT_REPLACEMENT = "(Media/Attachment omitted)";

    const SIZE_ADJUST_STEP = 0.08;
    const MIN_UI_SCALE = 0.7;
    const MAX_UI_SCALE = 1.5;
    const MIN_CHAT_FONT_SCALE = 0.7;
    const MAX_CHAT_FONT_SCALE = 1.8;

    const senderStylesConfig = [
        { align: 'flex-end', light: { bg: '#DCF8C6', name: '#056055', text: '#111B21' }, dark: { bg: '#005C4B', name: '#E9EDEF', text: '#E9EDEF' } },
        { align: 'flex-start', light: { bg: '#FFFFFF', name: '#111B21', text: '#111B21' }, dark: { bg: '#202C33', name: '#E9EDEF', text: '#E9EDEF' } },
        { align: 'flex-start', light: { bg: '#E0F7FA', name: '#00796B', text: '#111B21' }, dark: { bg: '#1A4A5F', name: '#ADD8E6', text: '#E9EDEF' } },
        { align: 'flex-start', light: { bg: '#FFF9C4', name: '#AF8D0C', text: '#111B21' }, dark: { bg: '#4F483A', name: '#FFF59D', text: '#E9EDEF' } },
        { align: 'flex-start', light: { bg: '#EDE7F6', name: '#5E35B1', text: '#111B21' }, dark: { bg: '#3C2A4F', name: '#D1C4E9', text: '#E9EDEF' } },
        { align: 'flex-start', light: { bg: '#FCE4EC', name: '#AD1457', text: '#111B21' }, dark: { bg: '#5A1A3C', name: '#F8BBD0', text: '#E9EDEF' } },
    ];

    // --- State Variables ---
    let assignedSenderStyles = {};
    let uniqueSenders = new Set();
    let currentUiScale = 1.0;
    let currentChatFontScale = 1.0;
    let currentTheme = localStorage.getItem('chatViewerTheme') || 'light';
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
    themeCheckbox.addEventListener('change', handleThemeToggle);
    searchInput.addEventListener('input', handleSearchInput);
    searchPrevBtn.addEventListener('click', () => navigateSearchResults(-1, false));
    searchNextBtn.addEventListener('click', () => navigateSearchResults(1, false));


    // --- Functions ---

    function applyTheme(theme) {
        bodyElement.setAttribute('data-theme', theme);
        themeCheckbox.checked = (theme === 'dark');
        currentTheme = theme;
        localStorage.setItem('chatViewerTheme', theme);
        if (chatContainer.children.length > 1 || (chatContainer.children.length === 1 && !chatContainer.querySelector('.placeholder'))) {
             updateAllMessageStyles();
        }
        updateLegendStyles();
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


    function handleThemeToggle() {
        applyTheme(themeCheckbox.checked ? 'dark' : 'light');
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

    function resetChatView() {
         chatContainer.innerHTML = '';
         senderLegend.innerHTML = '';
         assignedSenderStyles = {};
         uniqueSenders = new Set();
         searchInput.value = '';
         handleSearchInput();
    }

    // --- Updated function to handle ALL THREE date/time formats ---
    function parseWhatsAppTimestamp(dateStr, timeNumStr, ampmStr) { // Takes numeric time and optional am/pm
        if (!dateStr || !timeNumStr) return null;

        // Normalize AM/PM if present
        const ampm = ampmStr ? ampmStr.trim().toUpperCase() : null;

        const dateParts = dateStr.split('/');
        // Match numeric time parts (e.g., "15:24:46" or "3:24:46")
        const timeMatch = timeNumStr.match(/(\d{1,2}):(\d{2}):(\d{2})/);

        if (!dateParts || dateParts.length !== 3 || !timeMatch) {
            // console.warn("Could not parse date/time parts:", dateStr, timeNumStr, ampmStr);
            return null;
        }

        let day, month, year;

        // Determine date format based on year length
        if (dateParts[2].length === 4) {
            // Assume DD/MM/YYYY
            day = parseInt(dateParts[0], 10);
            month = parseInt(dateParts[1], 10) - 1; // JS months are 0-indexed
            year = parseInt(dateParts[2], 10);
        } else if (dateParts[2].length === 2) {
            // Assume M/D/YY or MM/DD/YY
            month = parseInt(dateParts[0], 10) - 1; // JS months are 0-indexed
            day = parseInt(dateParts[1], 10);
            year = parseInt(dateParts[2], 10) + 2000; // Convert YY to 20YY
        } else {
            return null; // Invalid year format
        }

        let hour = parseInt(timeMatch[1], 10);
        const minute = parseInt(timeMatch[2], 10);
        const second = parseInt(timeMatch[3], 10);

        // Adjust hour based on presence and value of AM/PM
        if (ampm) {
            // 12-hour format detected
            if (ampm === 'PM' && hour < 12) hour += 12;
            else if (ampm === 'AM' && hour === 12) hour = 0; // Midnight case
        } else {
            // 24-hour format detected (no AM/PM)
            // Hour is already correct. Add basic validation.
            if (hour < 0 || hour > 23) {
                // console.warn("Invalid 24-hour format hour:", hour, "in", timeNumStr);
                return null;
            }
        }

        // Basic sanity check for year
        const currentYear = new Date().getFullYear();
        if (year < 2000 || year > currentYear + 5) {
             return null;
        }

        try {
             const date = new Date(year, month, day, hour, minute, second);
             // Final validation
             if (isNaN(date.getTime()) ||
                 date.getFullYear() !== year ||
                 date.getMonth() !== month ||
                 date.getDate() !== day) {
                 return null;
             }
             return date;
        } catch (e) {
            return null;
        }
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

     // --- Search Functions (unchanged from previous version) ---
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
                     element: "mark",
                     className: "search-highlight",
                     separateWordSearch: false,
                     accuracy: "partially",
                     iframes: false,
                     acrossElements: false,
                     exclude: [".sender", ".message-meta"],
                     each: (markElement) => {
                         const bubble = markElement.closest('.message-bubble');
                         if (bubble && !searchResults.includes(bubble)) {
                             searchResults.push(bubble);
                         }
                     },
                     done: () => {
                         updateSearchResultDisplay();
                         if (searchResults.length > 0) {
                            navigateSearchResults(0, true);
                         } else {
                             searchPrevBtn.disabled = true;
                             searchNextBtn.disabled = true;
                         }
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
        if (searchResults.length === 0) { return; }
        const previousIndex = currentHighlightIndex;
        if (previousIndex >= 0 && previousIndex < searchResults.length) {
            const prevElement = searchResults[previousIndex];
            if (prevElement && prevElement instanceof Element) {
                prevElement.classList.remove('highlight-bubble');
            }
        }
        let nextIndex;
        if (stayAtFirst) {
            nextIndex = 0;
        } else {
            nextIndex = previousIndex + direction;
            nextIndex = Math.max(0, Math.min(searchResults.length - 1, nextIndex));
        }
        currentHighlightIndex = nextIndex;
        const targetElement = searchResults[currentHighlightIndex];
        if (targetElement && targetElement instanceof Element) {
            targetElement.classList.add('highlight-bubble');
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } else {
            console.error(`Search result at index ${currentHighlightIndex} is NOT a valid element:`, targetElement);
        }
        updateSearchResultDisplay();
    }
     // --- End Search Functions ---


    // --- Updated Parsing Logic ---
    function parseAndDisplayChat(chatText) {
        // Regex updated AGAIN to handle optional AM/PM (making it non-capturing initially)
        // Captures: 1:Date, 2:NumericTime, 3:AM/PM (optional), 4:Sender, 5:Content
        const messageRegex = /^\[\s*(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}:\d{2})(?:\s?[\u202f]?(am|pm|AM|PM))?\s*\]\s*(.*?):\s*(.*)/;
        // System message regex updated similarly
        // Captures: 1:Date, 2:NumericTime, 3:AM/PM (optional), 4:Content
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
                // New user message line
                if (currentMessage) messages.push(currentMessage);

                const dateStr = match[1].trim();
                const timeNumStr = match[2].trim(); // e.g., "15:24:46" or "3:24:46"
                const ampmStr = match[3] ? match[3].trim() : null; // e.g., "pm", "AM", or null
                const sender = match[4].trim();
                let content = match[5].replace(leadingInvisibleCharRegex, '').trim(); // Content is now group 5
                let isPlaceholder = false;
                const lowerCaseContent = content.toLowerCase();

                const omittedMatchKey = Object.keys(REPLACEMENT_TEXT_MAP).find(key => lowerCaseContent.startsWith(key));
                if (omittedMatchKey && lowerCaseContent.length <= omittedMatchKey.length + 5) {
                     content = REPLACEMENT_TEXT_MAP[omittedMatchKey];
                     isPlaceholder = true;
                }

                // Store the reconstructed original time string for potential display fallback
                const originalTimeStr = `${timeNumStr}${ampmStr ? ' ' + ampmStr : ''}`;

                currentMessage = {
                    dateStr: dateStr,
                    timeStr: originalTimeStr, // Store original full time string
                    sender: sender,
                    content: content,
                    type: 'user',
                    isPlaceholder: isPlaceholder,
                    // Pass numeric time and optional am/pm separately for parsing
                    dateObj: parseWhatsAppTimestamp(dateStr, timeNumStr, ampmStr)
                };
                 if (sender !== 'System') {
                     uniqueSenders.add(sender);
                 }

            } else if (currentMessage && !line.match(systemMessageRegex1) && !line.match(messageRegex)) {
                // Continuation of the previous user message
                 const lineContentClean = line.replace(leadingInvisibleCharRegex, '').trim();
                 const lowerCaseLineContent = lineContentClean.toLowerCase();
                 const continuationOmittedKey = Object.keys(REPLACEMENT_TEXT_MAP).find(key => lowerCaseLineContent.startsWith(key));

                 if (continuationOmittedKey && lowerCaseLineContent.length <= continuationOmittedKey.length + 5) {
                      messages.push(currentMessage);
                       messages.push({
                          dateStr: currentMessage.dateStr, timeStr: currentMessage.timeStr, dateObj: currentMessage.dateObj,
                          sender: 'System',
                          content: REPLACEMENT_TEXT_MAP[continuationOmittedKey],
                          type: 'system'
                       });
                       currentMessage = null;
                 } else {
                      currentMessage.content += '\n' + line.trimEnd();
                 }

            } else {
                 // System message, unhandled line, or start of file
                 if (currentMessage) messages.push(currentMessage);
                 currentMessage = null;

                 const systemMatch = line.match(systemMessageRegex1);
                 let systemContent = line.trim();
                 let systemDateStr = '', systemTimeStr = '', systemDateObj = null;
                 let isLikelySystem = false;

                 if (systemMatch) {
                      systemDateStr = systemMatch[1].trim();
                      const systemTimeNumStr = systemMatch[2].trim();
                      const systemAmpmStr = systemMatch[3] ? systemMatch[3].trim() : null;
                      systemContent = systemMatch[4].replace(leadingInvisibleCharRegex, '').trim(); // Content is group 4
                      systemDateObj = parseWhatsAppTimestamp(systemDateStr, systemTimeNumStr, systemAmpmStr);

                      // Reconstruct original time string for potential display fallback
                      systemTimeStr = `${systemTimeNumStr}${systemAmpmStr ? ' ' + systemAmpmStr : ''}`;
                      isLikelySystem = true;

                      const lowerSystemContent = systemContent.toLowerCase();
                      if (REPLACEMENT_TEXT_MAP[lowerSystemContent]) {
                           systemContent = REPLACEMENT_TEXT_MAP[lowerSystemContent];
                      } else if (systemContent.includes(': ')) { // Check if it looks like a user message again
                           isLikelySystem = false;
                           systemContent = line.trim();
                           systemDateStr = ''; systemTimeStr = ''; systemDateObj = null;
                      }

                 } else {
                       const commonSystemIndicators = [
                           'end-to-end encrypted', 'created group', 'added', 'removed', 'left',
                           'changed the subject', 'changed this group\'s icon',
                           'changed their phone number', 'security code changed',
                           'is a contact.', 'You blocked', 'You unblocked',
                       ];
                       const lowerCaseContent = systemContent.toLowerCase();
                       if (commonSystemIndicators.some(indicator => lowerCaseContent.includes(indicator))) {
                           isLikelySystem = true;
                       }
                       if (REPLACEMENT_TEXT_MAP[lowerCaseContent]) {
                           isLikelySystem = true;
                           systemContent = REPLACEMENT_TEXT_MAP[lowerCaseContent];
                       }
                 }


                 if (isLikelySystem && systemContent) {
                     messages.push({
                         dateStr: systemDateStr, timeStr: systemTimeStr, // Use reconstructed string
                         sender: 'System', content: systemContent, type: 'system', dateObj: systemDateObj
                     });
                 } else if (systemContent) {
                     messages.push({
                         dateStr: '', timeStr: '', sender: 'System', content: systemContent, type: 'system', dateObj: null
                     });
                 }
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
            if (isTwoPersonChat) {
                 styleIndex = index === 0 ? 0 : 1;
            } else {
                 if (index === 0) { styleIndex = 0; }
                 else {
                      styleIndex = nextIncomingIndex++;
                      if (nextIncomingIndex >= senderStylesConfig.length) { nextIncomingIndex = 1; }
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

        // Build Legend
        senderList.forEach(sender => {
             if (assignedSenderStyles[sender]) {
                 const styleInfo = assignedSenderStyles[sender];
                 const config = senderStylesConfig[styleInfo.styleIndex];
                 const themeColors = config[currentTheme];
                 const legendItem = document.createElement('div');
                 legendItem.classList.add('legend-item');
                 legendItem.dataset.sender = sender;
                 const colorBox = document.createElement('span');
                 colorBox.classList.add('color-box');
                 colorBox.style.backgroundColor = themeColors.bg;
                 const nameSpan = document.createElement('span');
                 nameSpan.classList.add('sender-name');
                 nameSpan.textContent = sender;
                 const swapButton = document.createElement('button');
                 swapButton.classList.add('swap-button');
                 swapButton.dataset.sender = sender;
                 swapButton.title = `Swap alignment for ${sender}`;
                 swapButton.textContent = 'Swap Align';
                 swapButton.addEventListener('click', () => handleSenderSwap(sender));
                 legendItem.appendChild(colorBox);
                 legendItem.appendChild(nameSpan);
                 legendItem.appendChild(swapButton);
                 senderLegend.appendChild(legendItem);
             }
        });

        // Display Messages
        messages.forEach((msg, index) => {
            const messageBubble = document.createElement('div');
             messageBubble.dataset.messageIndex = index;

            if (msg.type === 'system') {
                messageBubble.classList.add('system-message');
                messageBubble.textContent = msg.content;
                if (msg.dateObj) {
                    const timeSpan = document.createElement('span');
                    timeSpan.style.fontSize = '0.8em';
                    timeSpan.style.opacity = '0.7';
                    timeSpan.style.marginLeft = '10px';
                    // Use locale default for time display (respects 12/24 hour preference)
                    timeSpan.textContent = `(${msg.dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`;
                    messageBubble.appendChild(timeSpan);
                }
            } else {
                 messageBubble.classList.add('message-bubble');
                 messageBubble.dataset.sender = msg.sender;

                 const styleInfo = assignedSenderStyles[msg.sender];
                 if (styleInfo) {
                    const config = senderStylesConfig[styleInfo.styleIndex];
                    const themeColors = config[currentTheme];
                    messageBubble.style.backgroundColor = themeColors.bg;
                    messageBubble.style.alignSelf = styleInfo.currentAlign;

                    const senderDiv = document.createElement('div');
                    senderDiv.classList.add('sender');
                    senderDiv.textContent = msg.sender;
                    senderDiv.style.color = themeColors.name;
                    messageBubble.appendChild(senderDiv);

                    const contentDiv = document.createElement('div');
                    contentDiv.classList.add('content');
                     contentDiv.style.color = themeColors.text;
                     contentDiv.innerText = msg.content; // Use innerText for newlines
                    if (msg.isPlaceholder) {
                        contentDiv.classList.add('placeholder-content');
                    }
                    messageBubble.appendChild(contentDiv);

                    const metaDiv = document.createElement('div');
                    metaDiv.classList.add('message-meta');
                    // Use locale default for time display
                    const displayTime = msg.dateObj ? msg.dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : msg.timeStr;
                    const displayDate = msg.dateObj ? msg.dateObj.toLocaleDateString([], { day: 'numeric', month: 'numeric', year: 'numeric' }) : msg.dateStr;
                    const ago = timeAgo(msg.dateObj);

                    metaDiv.textContent = `${displayDate}, ${displayTime}`;
                    if (ago) {
                        const agoSpan = document.createElement('span');
                        agoSpan.classList.add('time-ago');
                        agoSpan.textContent = `• ${ago}`;
                         metaDiv.appendChild(agoSpan);
                    }
                    messageBubble.appendChild(metaDiv);

                 } else {
                      messageBubble.innerText = `${msg.dateStr}, ${msg.timeStr} - ${msg.sender}: ${msg.content}`;
                      messageBubble.style.alignSelf = 'flex-start';
                      messageBubble.style.backgroundColor = '#eee';
                 }
            }
            chatContainer.appendChild(messageBubble);
        });

        requestAnimationFrame(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        });

        if (searchInput.value.trim()) {
            handleSearchInput();
        }
    }

}); // End DOMContentLoaded

/* END OF UPDATED script.js */