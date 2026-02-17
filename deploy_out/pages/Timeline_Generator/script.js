document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const textInput = document.getElementById('text-input');
    const generateButton = document.getElementById('generate-button');
    const timelineOutput = document.getElementById('timeline-output');
    const debugOutput = document.getElementById('debug-output');
    const timelineTitle = document.getElementById('timeline-title');
    const colorToggle = document.getElementById('color-toggle');
    const exportControls = document.getElementById('export-controls');
    const exportPngBtn = document.getElementById('export-png');
    const exportJpgBtn = document.getElementById('export-jpg');
    const exportSvgBtn = document.getElementById('export-svg');
    const timelineOutputContainer = document.getElementById('timeline-output-container');
    const aspectRatioSelector = document.querySelector('.aspect-ratio-buttons');
    const customRatioInput = document.getElementById('custom-ratio-input');
    const resolutionSelector = document.querySelector('.resolution-buttons');

    // --- State Variables ---
    let selectedAspectRatio = 'auto';
    let selectedMultiplier = 1;

    // --- Event Listeners ---
    generateButton.addEventListener('click', generateTimeline);
    colorToggle.addEventListener('change', applyColorTheme);
    exportPngBtn.addEventListener('click', () => exportTimeline('png'));
    exportJpgBtn.addEventListener('click', () => exportTimeline('jpeg'));
    exportSvgBtn.addEventListener('click', () => exportTimeline('svg'));

    aspectRatioSelector.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            selectedAspectRatio = e.target.dataset.ratio;
            aspectRatioSelector.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            customRatioInput.value = '';
            customRatioInput.blur();
        }
    });

    customRatioInput.addEventListener('focus', () => {
        aspectRatioSelector.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
        selectedAspectRatio = customRatioInput.value.trim() || 'auto';
    });
    
    customRatioInput.addEventListener('input', () => {
        selectedAspectRatio = customRatioInput.value.trim();
    });

    resolutionSelector.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            selectedMultiplier = parseFloat(e.target.dataset.multiplier);
            resolutionSelector.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
        }
    });
    
    // --- Initial Setup ---
    applyColorTheme();

    // --- Core Functions ---

    function applyColorTheme() {
        if (colorToggle.checked) {
            timelineOutputContainer.classList.add('colorful');
        } else {
            timelineOutputContainer.classList.remove('colorful');
        }
    }
    
    function triggerDownload(dataUrl, filename) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
        console.log(`Download triggered for ${filename}`);
    }

    async function exportTimeline(format) {
        console.log(`--- Starting export: format=${format}, ratio=${selectedAspectRatio}, multiplier=${selectedMultiplier}x ---`);
        updateDebug([{ type: 'info', message: 'Step 1: Capturing timeline...' }]);

        const originalNode = timelineOutputContainer;
        const timelineName = (timelineTitle.textContent || 'timeline').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const filename = `${timelineName}.${format}`;
        const backgroundColor = getComputedStyle(originalNode).backgroundColor;

        if (format === 'svg') {
            console.log("SVG format does not support multipliers or padding. Exporting directly.");
            try {
                const svgDataUrl = await domtoimage.toSvg(originalNode);
                triggerDownload(svgDataUrl, filename);
                updateDebug([{ type: 'info', message: 'SVG export successful!' }]);
            } catch (error) {
                console.error("Direct SVG export failed!", error);
                updateDebug([{ type: 'warn', message: '<strong>Export Failed:</strong> Could not generate SVG.' }]);
            }
            return;
        }

        // --- Step 1: Generate the base image with the resolution multiplier ---
        const originalWidth = originalNode.offsetWidth;
        const originalHeight = originalNode.offsetHeight;
        
        const captureOptions = {
            width: originalWidth * selectedMultiplier,
            height: originalHeight * selectedMultiplier,
            style: {
                transform: `scale(${selectedMultiplier})`,
                transformOrigin: 'top left'
            },
            bgcolor: backgroundColor
        };

        let basePngDataUrl;
        try {
            basePngDataUrl = await domtoimage.toPng(originalNode, captureOptions);
            console.log(`Successfully captured base PNG at ${selectedMultiplier}x resolution.`);
            updateDebug([{ type: 'info', message: 'Step 2: Processing image...' }]);
        } catch (error) {
            console.error("dom-to-image failed to capture the base image!", error);
            updateDebug([{ type: 'warn', message: '<strong>Export Failed:</strong> Could not capture the timeline content.' }]);
            return;
        }

        if (selectedAspectRatio === 'auto' || selectedAspectRatio === '') {
            console.log("Aspect ratio is 'auto'. Downloading directly.");
            if (format === 'png') {
                triggerDownload(basePngDataUrl, filename);
            } else {
                const finalDataUrl = await convertDataUrl(basePngDataUrl, 'image/jpeg');
                triggerDownload(finalDataUrl, filename);
            }
            updateDebug([{ type: 'info', message: 'Export successful!' }]);
            return;
        }

        const ratioRegex = /^(\d+(\.\d+)?):(\d+(\.\d+)?)$/;
        const ratioMatch = selectedAspectRatio.match(ratioRegex);
        if (!ratioMatch) {
            updateDebug([{ type: 'warn', message: `Invalid aspect ratio format. Use "width:height".` }]);
            return;
        }
        
        const [, rawW, , rawH] = ratioMatch;
        const ratioW = parseFloat(rawW);
        const ratioH = parseFloat(rawH);

        try {
            const img = new Image();
            img.src = basePngDataUrl;
            await img.decode();

            const { canvasWidth, canvasHeight } = calculatePaddedDimensions(img.width, img.height, ratioW, ratioH);
            console.log(`Creating padded canvas of size: ${canvasWidth}x${canvasHeight}`);

            const canvas = document.createElement('canvas');
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const x = (canvas.width - img.width) / 2;
            const y = (canvas.height - img.height) / 2;
            ctx.drawImage(img, x, y);

            const finalMimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
            const finalDataUrl = canvas.toDataURL(finalMimeType, 0.98);

            triggerDownload(finalDataUrl, filename);
            updateDebug([{ type: 'info', message: 'Export successful! Check your downloads.' }]);

        } catch (error) {
            console.error("Failed during canvas processing!", error);
            updateDebug([{ type: 'warn', message: '<strong>Export Failed:</strong> Could not process the image.' }]);
        }
    }
    
    function calculatePaddedDimensions(imgWidth, imgHeight, targetRatioW, targetRatioH) {
        const targetRatio = targetRatioW / targetRatioH;
        let canvasWidth, canvasHeight;

        if ((imgWidth / imgHeight) > targetRatio) {
            canvasWidth = imgWidth;
            canvasHeight = (imgWidth / targetRatioW) * targetRatioH;
        } else {
            canvasHeight = imgHeight;
            canvasWidth = (imgHeight / targetRatioH) * targetRatioW;
        }
        return { canvasWidth: Math.round(canvasWidth), canvasHeight: Math.round(canvasHeight) };
    }

    async function convertDataUrl(dataUrl, targetMimeType) {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        return canvas.toDataURL(targetMimeType, 0.98);
    }

    // --- All other functions (timeToMinutes, generateTimeline, etc.) remain the same ---
    
    function timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) { return null; }
        return hours * 60 + minutes;
    }

    function generateTimeline() {
        const rawText = textInput.value;
        if (!rawText.trim()) {
            updateDebug([{ type: 'warn', message: 'Input text is empty. Please paste your schedule.' }]);
            updateTimeline([], null);
            return;
        }
        const lines = rawText.split('\n');
        const events = [];
        const debugMessages = [];
        let potentialTitle = null;
        const timeRegex = /^(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\s*(.+)$/;
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            const match = trimmedLine.match(timeRegex);
            if (match) {
                const event = { startTime: match[1], endTime: match[2] || null, description: match[3].trim(), duration: null };
                if (event.startTime && event.endTime) {
                    let startMinutes = timeToMinutes(event.startTime);
                    let endMinutes = timeToMinutes(event.endTime);
                    if (startMinutes !== null && endMinutes !== null) {
                        if (endMinutes < startMinutes) { endMinutes += 24 * 60; }
                        event.duration = endMinutes - startMinutes;
                    }
                }
                events.push(event);
            } else {
                if (!potentialTitle && events.length === 0) { potentialTitle = trimmedLine; } 
                else { debugMessages.push({ type: 'warn', message: `Skipped line: <strong>"${trimmedLine}"</strong> (Couldn't find a time at the start).` }); }
            }
        }
        if (events.length > 0) { debugMessages.unshift({ type: 'info', message: `Successfully parsed ${events.length} event(s).` }); } 
        else { debugMessages.unshift({ type: 'warn', message: 'Could not find any valid events in the text provided.' }); }
        
        updateTimeline(events, potentialTitle);
        updateDebug(debugMessages);
    }

    function updateTimeline(events, title) {
        timelineOutput.innerHTML = '';
        timelineTitle.textContent = title ? title : 'Your Timeline';
        if (events.length === 0) {
            timelineOutput.innerHTML = '<p class="placeholder-text">No events to display.</p>';
            exportControls.classList.add('hidden');
            return;
        }
        exportControls.classList.remove('hidden');
        const PIXELS_PER_MINUTE = 1.2;
        const BASE_SPACING_PX = 24;
        const MAX_SPACING_PX = 400;
        const ul = document.createElement('ul');
        ul.className = 'timeline';
        for (const event of events) {
            const li = document.createElement('li');
            li.className = 'timeline-item';
            if (event.duration && event.duration > 0) {
                const calculatedPadding = event.duration * PIXELS_PER_MINUTE;
                const finalPadding = Math.max(BASE_SPACING_PX, Math.min(calculatedPadding, MAX_SPACING_PX));
                li.style.paddingBottom = `${finalPadding}px`;
            }
            let timeString = event.startTime;
            if (event.endTime) { timeString += ` - ${event.endTime}`; }
            if (event.duration) { timeString += ` <span style="color: var(--text-secondary); font-weight: 400;">(${event.duration} min)</span>`; }
            li.innerHTML = `<div class="timeline-time">${timeString}</div><p class="timeline-description">${event.description}</p>`;
            ul.appendChild(li);
        }
        timelineOutput.appendChild(ul);
    }

    function updateDebug(messages) {
        debugOutput.innerHTML = '';
        if (messages.length === 0) {
            return;
        }
        for (const msg of messages) {
            const p = document.createElement('p');
            p.classList.add(msg.type);
            p.innerHTML = msg.message;
            debugOutput.appendChild(p);
        }
    }
});