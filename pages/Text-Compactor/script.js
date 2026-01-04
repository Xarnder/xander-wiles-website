document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const els = {
        input: document.getElementById('input-text'),
        sheet: document.getElementById('sheet'),
        content: document.getElementById('sheet-content'),
        orientation: document.getElementById('orientation'),
        sectionStyle: document.getElementById('section-style'),
        fontSize: document.getElementById('fontSize'),
        lineHeight: document.getElementById('lineHeight'),
        fsVal: document.getElementById('fs-val'),
        lhVal: document.getElementById('lh-val'),

        padPage: document.getElementById('padPage'),
        padBox: document.getElementById('padBox'),
        padPageVal: document.getElementById('pad-page-val'),
        padBoxVal: document.getElementById('pad-box-val'),

        removeBullets: document.getElementById('remove-bullets'),
        showBrackets: document.getElementById('show-brackets'),
        bolderFormulas: document.getElementById('bolder-formulas'),
        zoomLevel: document.getElementById('zoomLevel'),
        zoomVal: document.getElementById('zoom-val'),
        exportFormat: document.getElementById('export-format'),
        btnRender: document.getElementById('btn-render'),
        btnDownload: document.getElementById('btn-download'),

        // New Elements
        folderInput: document.getElementById('folder-input'),
        fileNav: document.getElementById('file-nav'),
        fileInfo: document.getElementById('file-info'),
        btnPrevFile: document.getElementById('btn-prev-file'),
        btnNextFile: document.getElementById('btn-next-file'),
        btnBatchExport: document.getElementById('btn-batch-export'),

        debug: document.getElementById('debug-content')
    };

    // --- State Management ---
    const defaultSettings = {
        orientation: 'portrait',
        sectionStyle: 'box',
        fontSize: 10,
        lineHeight: 1.0,
        padPage: 5,
        padBox: 1,
        removeBullets: true,
        showBrackets: false,
        bolderFormulas: true
    };

    let filesData = [];
    let currentIndex = 0;

    // Initialize with one empty file
    function initState() {
        filesData = [{
            name: "untitled.md",
            content: els.input.value, // Start with placeholder or empty
            settings: { ...defaultSettings }
        }];
        currentIndex = 0;
        updateFileNavUI();
    }

    // --- Palettes ---
    const fontColors = ['#000000', '#c00000', '#00008b', '#005500', '#550055', '#663300'];
    const bgColors = ['transparent', '#fff0f0', '#f0f8ff', '#f0fff0', '#fff0ff', '#fffff0', '#f0ffff', '#fff5e6'];

    function log(msg, type = 'info') {
        const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
        const entry = document.createElement('div');
        entry.textContent = `[${time}] ${msg}`;
        if (type === 'error') entry.style.color = '#ff5555';
        els.debug.appendChild(entry);
        els.debug.scrollTop = els.debug.scrollHeight;
        console.log(`[${time}] ${msg}`);
    }

    log("System initialized.");

    // --- Formatters ---
    function processMath(text) {
        text = text.replace(/\$\$([^$]+)\$\$/g, (match, latex) => {
            try {
                return katex.renderToString(latex, { throwOnError: false, displayMode: false });
            } catch (e) { return match; }
        });
        text = text.replace(/\$([^$]+)\$/g, (match, latex) => {
            try {
                return katex.renderToString(latex, { throwOnError: false, displayMode: false });
            } catch (e) { return match; }
        });
        return text;
    }

    function parseMarkdown(text) {
        let html = text;
        html = html.replace(/\*\*(.*?)\*\*/g, '<span class="md-bold">$1</span>');
        html = html.replace(/\*(.*?)\*/g, '<span class="md-italic">$1</span>');
        html = html.replace(/`(.*?)`/g, '<span class="md-code">$1</span>');
        return html;
    }

    // --- Main Render ---
    function render() {
        try {
            const rawText = els.input.value;
            // Always render even if empty to clear view, but logic below skips empty lines

            const styleMode = els.sectionStyle.value;
            const lines = rawText.split('\n');
            const shouldCleanBullets = els.removeBullets.checked;
            const shouldShowBrackets = els.showBrackets.checked;

            let finalHTML = "";
            let fontColorIdx = 0;
            let sectionIdx = 0;
            let currentBoxBuffer = "";

            const flushBox = () => {
                if (styleMode === 'box' && currentBoxBuffer) {
                    const bg = bgColors[sectionIdx % bgColors.length];
                    finalHTML += `<div class="section-box" style="background-color:${bg}; border-color:${fontColors[sectionIdx % fontColors.length]}">${currentBoxBuffer}</div>`;
                    currentBoxBuffer = "";
                }
            };

            lines.forEach((line) => {
                let text = line.trim();
                if (text.length === 0 || text.match(/^---+$/)) return;

                const headerMatch = text.match(/^(#+)\s+(.*)/);
                let isHeader = false;

                if (headerMatch) {
                    isHeader = true;
                    if (styleMode === 'box') flushBox();
                    sectionIdx++;
                    text = headerMatch[2];
                }

                if (shouldCleanBullets && !isHeader) {
                    text = text.replace(/^(\*|-|\+)\s+/, '');
                }

                text = processMath(text);
                text = parseMarkdown(text);

                const fColor = fontColors[fontColorIdx % fontColors.length];
                let bgColor = 'transparent';
                if (styleMode === 'highlight' && sectionIdx > 0) {
                    bgColor = bgColors[sectionIdx % bgColors.length];
                }

                let spanHTML = "";
                if (isHeader) {
                    const headerContent = shouldShowBrackets ? `[${text}]` : text;
                    spanHTML = `<span class="sheet-span sheet-header" style="color: #000; background-color: ${bgColor};">${headerContent}</span>`;
                    fontColorIdx = 0;
                } else {
                    spanHTML = `<span class="sheet-span" style="color: ${fColor}; background-color: ${bgColor};">${text} </span>`;
                    fontColorIdx++;
                }

                if (styleMode === 'box') {
                    currentBoxBuffer += spanHTML;
                } else {
                    finalHTML += spanHTML;
                }
            });

            flushBox();
            els.content.innerHTML = finalHTML;

        } catch (error) {
            log(`Render Error: ${error.message}`, 'error');
        }
    }

    // --- View Logic ---
    function updateZoom() {
        const scale = parseFloat(els.zoomLevel.value) || 1;
        const sheetH = els.sheet.offsetHeight;
        els.sheet.style.transform = `scale(${scale})`;
        els.sheet.style.transformOrigin = 'top center';
        if (sheetH > 0) {
            const heightDiff = sheetH * (1 - scale);
            els.sheet.style.marginBottom = `-${heightDiff}px`;
        }
    }

    function updateStyles() {
        els.content.style.fontSize = `${els.fontSize.value}px`;
        els.content.style.lineHeight = els.lineHeight.value;
        els.sheet.style.padding = `${els.padPage.value}mm`;
        els.sheet.style.setProperty('--box-pad', `${els.padBox.value}px`);

        if (els.bolderFormulas.checked) els.content.classList.add('bolder-math');
        else els.content.classList.remove('bolder-math');

        setTimeout(updateZoom, 0);
    }

    // --- State Persistence & Navigation ---

    function saveCurrentState() {
        if (!filesData[currentIndex]) return;

        // Save Content
        filesData[currentIndex].content = els.input.value;

        // Save Settings
        filesData[currentIndex].settings = {
            orientation: els.orientation.value,
            sectionStyle: els.sectionStyle.value,
            fontSize: parseFloat(els.fontSize.value),
            lineHeight: parseFloat(els.lineHeight.value),
            padPage: parseInt(els.padPage.value),
            padBox: parseInt(els.padBox.value),
            removeBullets: els.removeBullets.checked,
            showBrackets: els.showBrackets.checked,
            bolderFormulas: els.bolderFormulas.checked
        };
    }

    function loadState(index) {
        if (!filesData[index]) return;
        const file = filesData[index];
        const s = file.settings;

        // Load Content
        els.input.value = file.content;

        // Load Settings to DOM
        els.orientation.value = s.orientation;
        els.sectionStyle.value = s.sectionStyle;

        els.fontSize.value = s.fontSize;
        els.fsVal.value = s.fontSize;

        els.lineHeight.value = s.lineHeight;
        els.lhVal.value = s.lineHeight;

        els.padPage.value = s.padPage;
        els.padPageVal.value = s.padPage;

        els.padBox.value = s.padBox;
        els.padBoxVal.value = s.padBox;

        els.removeBullets.checked = s.removeBullets;
        els.showBrackets.checked = s.showBrackets;
        els.bolderFormulas.checked = s.bolderFormulas;

        // Force orientation update on sheet class
        els.sheet.className = `a4-sheet ${s.orientation}`;

        // Render & Update UI
        updateStyles();
        render();
        updateFileNavUI();
    }

    function updateFileNavUI() {
        if (filesData.length > 1) {
            els.fileNav.style.display = 'flex';
            els.btnBatchExport.style.display = 'inline-block';
        } else {
            els.fileNav.style.display = 'none';
            els.btnBatchExport.style.display = 'none';
        }
        els.fileInfo.textContent = `File ${currentIndex + 1} of ${filesData.length}: ${filesData[currentIndex].name}`;

        els.btnPrevFile.disabled = currentIndex === 0;
        els.btnNextFile.disabled = currentIndex === filesData.length - 1;
    }

    function switchFile(newIndex) {
        if (newIndex < 0 || newIndex >= filesData.length) return;
        saveCurrentState(); // Save old file settings
        currentIndex = newIndex;
        loadState(currentIndex); // Load new file settings
    }

    // --- Folder Upload ---
    els.folderInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files).filter(f => f.name.endsWith('.md') || f.name.endsWith('.txt'));
        if (files.length === 0) {
            alert("No markdown files found in selection.");
            return;
        }

        // Sort files alphabetically to ensure consistent order
        files.sort((a, b) => a.name.localeCompare(b.name));

        const loadedFiles = [];

        // Helper to read file
        const readFileStr = (file) => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsText(file);
        });

        for (const file of files) {
            const content = await readFileStr(file);
            loadedFiles.push({
                name: file.name,
                content: content,
                settings: { ...defaultSettings } // Start with defaults
            });
        }

        filesData = loadedFiles;
        currentIndex = 0;
        loadState(0);
        log(`Loaded folder: ${files.length} files.`);
    });

    // --- Interaction Listeners ---

    // 1. Navigation Buttons
    els.btnPrevFile.addEventListener('click', () => switchFile(currentIndex - 1));
    els.btnNextFile.addEventListener('click', () => switchFile(currentIndex + 1));

    // 2. Keyboard Navigation
    document.addEventListener('keydown', (e) => {
        // Only navigate if NOT typing in inputs
        const target = e.target;
        const isInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT';

        if (!isInput) {
            if (e.key === 'ArrowLeft') switchFile(currentIndex - 1);
            if (e.key === 'ArrowRight') switchFile(currentIndex + 1);
        }
    });

    // 3. Inputs Sync
    const syncGroups = [
        { range: els.fontSize, number: els.fsVal },
        { range: els.lineHeight, number: els.lhVal },
        { range: els.padPage, number: els.padPageVal },
        { range: els.padBox, number: els.padBoxVal },
        { range: els.zoomLevel, number: els.zoomVal }
    ];

    syncGroups.forEach(group => {
        group.range.addEventListener('input', () => {
            group.number.value = group.range.value;
            if (group.range === els.zoomLevel) updateZoom();
            else updateStyles();
        });
        group.number.addEventListener('input', () => {
            group.range.value = group.number.value;
            if (group.range === els.zoomLevel) updateZoom();
            else updateStyles();
        });
    });

    // 4. Input Changes (Text & Settings)
    // We already have listeners for specific settings that call updateStyles/render.
    // But we need to ensure state is saved if we switch away. 
    // `saveCurrentState` is called on switch, so we are good.
    // However, we should listen to changes to update the view live.

    [els.sectionStyle, els.removeBullets, els.showBrackets, els.bolderFormulas].forEach(el => {
        el.addEventListener('change', (e) => {
            if (e.target.id === 'bolder-formulas') updateStyles();
            else render();
        });
    });

    els.orientation.addEventListener('change', (e) => {
        els.sheet.className = `a4-sheet ${e.target.value}`;
        updateZoom();
    });

    let debounceTimer;
    els.input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(render, 500);
    });

    els.btnRender.addEventListener('click', render);

    // --- Export Logic ---

    // Single Export
    els.btnDownload.addEventListener('click', async () => {
        saveCurrentState(); // Ensure state is fresh
        await performExport(false);
    });

    // Batch Export
    els.btnBatchExport.addEventListener('click', async () => {
        saveCurrentState();
        await performBatchExport();
    });

    async function captureSheet() {
        // Disable zoom/margin for clean capture
        const originalTransform = els.sheet.style.transform;
        const originalMargin = els.sheet.style.marginBottom;
        els.sheet.style.transform = 'none';
        els.sheet.style.marginBottom = '0';
        els.sheet.style.boxShadow = 'none';

        try {
            const canvas = await html2canvas(els.sheet, {
                scale: 3,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                onclone: (doc) => {
                    doc.getElementById('sheet').style.fontFeatureSettings = '"liga" 0';
                }
            });
            return canvas;
        } finally {
            // Restore
            els.sheet.style.boxShadow = '';
            els.sheet.style.transform = originalTransform;
            els.sheet.style.marginBottom = originalMargin;
        }
    }

    function getExportFilename(currentContent) {
        const headerMatch = currentContent.match(/^#+\s+(.*)/m);
        if (headerMatch && headerMatch[1]) {
            let title = headerMatch[1].trim();
            title = title.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '');
            if (title.length > 0) return title;
        }
        return `cheatsheet_${Date.now()}`;
    }

    async function performExport(isBatch = false, batchZip = null) {
        const format = els.exportFormat.value;
        const filename = getExportFilename(els.input.value);

        if (!isBatch) {
            els.btnDownload.textContent = "Processing...";
            els.btnDownload.disabled = true;
        }

        try {
            const canvas = await captureSheet();

            if (format === 'pdf') {
                const imgData = canvas.toDataURL('image/jpeg', 1.0);
                const { jsPDF } = window.jspdf;
                const isPortrait = els.orientation.value === 'portrait';
                const pdf = new jsPDF(isPortrait ? 'p' : 'l', 'mm', 'a4');

                const imgProps = pdf.getImageProperties(imgData);
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

                if (isBatch && batchZip) {
                    batchZip.file(`${filename}.pdf`, pdf.output('blob'));
                } else {
                    pdf.save(`${filename}.pdf`);
                }

            } else {
                // Image
                const mime = format === 'png' ? 'image/png' : 'image/jpeg';
                const imgData = canvas.toDataURL(mime, 1.0); // Base64

                if (isBatch && batchZip) {
                    const base64Data = imgData.split(',')[1];
                    batchZip.file(`${filename}.${format}`, base64Data, { base64: true });
                } else {
                    const link = document.createElement('a');
                    link.href = imgData;
                    link.download = `${filename}.${format}`;
                    link.click();
                }
            }
        } catch (e) {
            log(`Export Error: ${e.message}`, 'error');
        } finally {
            if (!isBatch) {
                els.btnDownload.textContent = "Download Image";
                els.btnDownload.disabled = false;
            }
        }
    }

    async function performBatchExport() {
        if (!window.JSZip) {
            alert("JSZip library not loaded.");
            return;
        }

        if (filesData.length === 0) return;

        els.btnBatchExport.textContent = "Packing...";
        els.btnBatchExport.disabled = true;

        const zip = new JSZip();
        // Remember where we were
        const originalIndex = currentIndex;

        try {
            // Iterate all files
            for (let i = 0; i < filesData.length; i++) {
                // Load file state into DOM/Vars
                // We MUST update currentIndex so loadState references correct data
                currentIndex = i;
                loadState(i);

                // Allow DOM to update (render is sync, but images might need a tick? 
                // Math rendering is sync (katex). Should be fine.)
                // Just in case, small delay to let browser paint/layout if needed by html2canvas? 
                // html2canvas reads computed styles. 
                await new Promise(r => setTimeout(r, 50));

                log(`Exporting ${i + 1}/${filesData.length}: ${filesData[i].name}`);
                await performExport(true, zip);
            }

            // Generate Zip
            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = "cheatsheets_batch.zip";
            link.click();
            log("Batch export complete.");

        } catch (e) {
            log(`Batch Export Failed: ${e.message}`, 'error');
        } finally {
            // Restore original view
            currentIndex = originalIndex;
            loadState(currentIndex);

            els.btnBatchExport.textContent = "Batch Export (ZIP)";
            els.btnBatchExport.disabled = false;
        }
    }

    // Init
    initState();
    // If text area had content initially (e.g. browser cache or placeholder), update first file
    if (els.input.value && els.input.value !== filesData[0].content) {
        filesData[0].content = els.input.value;
    }
    // Initial Render
    updateStyles();
    render();
});