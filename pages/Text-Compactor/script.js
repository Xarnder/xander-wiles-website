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
        bolderFormulas: document.getElementById('bolder-formulas'), // New
        zoomLevel: document.getElementById('zoomLevel'),
        zoomVal: document.getElementById('zoom-val'),
        exportFormat: document.getElementById('export-format'),
        btnRender: document.getElementById('btn-render'),
        btnDownload: document.getElementById('btn-download'),
        debug: document.getElementById('debug-content')
    };

    // --- Palettes ---
    const fontColors = [
        '#000000', '#c00000', '#00008b', '#005500', '#550055', '#663300'
    ];

    const bgColors = [
        'transparent',
        '#fff0f0', '#f0f8ff', '#f0fff0',
        '#fff0ff', '#fffff0', '#f0ffff', '#fff5e6'
    ];

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
        // 1. Handle Double Dollar $$...$$ (Block math, but forced inline for cheatsheet)
        text = text.replace(/\$\$([^$]+)\$\$/g, (match, latex) => {
            try {
                return katex.renderToString(latex, {
                    throwOnError: false,
                    displayMode: false // Force inline to save space
                });
            } catch (e) { return match; }
        });

        // 2. Handle Single Dollar $...$ (Inline math)
        text = text.replace(/\$([^$]+)\$/g, (match, latex) => {
            try {
                return katex.renderToString(latex, {
                    throwOnError: false,
                    displayMode: false
                });
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
            if (!rawText) return;

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

                // Skip empty lines or separator lines (---)
                if (text.length === 0 || text.match(/^---+$/)) return;

                // 1. Detect Header
                const headerMatch = text.match(/^(#+)\s+(.*)/);
                let isHeader = false;

                if (headerMatch) {
                    isHeader = true;
                    if (styleMode === 'box') flushBox();
                    sectionIdx++;
                    text = headerMatch[2];
                }

                // 2. Clean Bullets
                if (shouldCleanBullets && !isHeader) {
                    text = text.replace(/^(\*|-|\+)\s+/, '');
                }

                // 3. Process Content (Math & MD)
                text = processMath(text);
                text = parseMarkdown(text);

                // 4. Styles
                const fColor = fontColors[fontColorIdx % fontColors.length];
                let bgColor = 'transparent';
                if (styleMode === 'highlight' && sectionIdx > 0) {
                    bgColor = bgColors[sectionIdx % bgColors.length];
                }

                let spanHTML = "";

                if (isHeader) {
                    // Header Rendering with optional Brackets
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

    // --- Fit to Height Logic ---
    // --- Manual Zoom Logic ---
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

    // --- Update CSS Variables ---
    // --- Update CSS Variables ---
    function updateStyles() {
        // Fix: Do NOT overwrite the number input values here.
        // This breaks typing because it resets the cursor position and value if the listener hasn't fired yet or logic overlaps.

        // Only update the VISUALS on the sheet.
        els.content.style.fontSize = `${els.fontSize.value}px`;
        els.content.style.lineHeight = els.lineHeight.value;
        els.sheet.style.padding = `${els.padPage.value}mm`;
        els.sheet.style.setProperty('--box-pad', `${els.padBox.value}px`);

        if (els.bolderFormulas.checked) {
            els.content.classList.add('bolder-math');
        } else {
            els.content.classList.remove('bolder-math');
        }

        // Update Zoom
        setTimeout(updateZoom, 0);
    }


    // --- Event Listeners ---

    // 1. Style Inputs (Sliders & Numbers)
    // 1. Style Inputs (Sliders & Numbers)
    const syncGroups = [
        { range: els.fontSize, number: els.fsVal },
        { range: els.lineHeight, number: els.lhVal },
        { range: els.padPage, number: els.padPageVal },
        { range: els.padBox, number: els.padBoxVal },
        { range: els.zoomLevel, number: els.zoomVal } // New zoom group
    ];

    syncGroups.forEach(group => {
        // Range -> Number
        group.range.addEventListener('input', () => {
            group.number.value = group.range.value;
            if (group.range === els.zoomLevel) updateZoom();
            else updateStyles();
        });
        // Number -> Range
        group.number.addEventListener('input', () => {
            group.range.value = group.number.value;
            if (group.range === els.zoomLevel) updateZoom();
            else updateStyles();
        });
    });

    // 2. Toggles
    [els.sectionStyle, els.removeBullets, els.showBrackets, els.bolderFormulas, els.orientation]
        .filter(el => el)
        .forEach(el => {
            el.addEventListener('change', (e) => {
                if (e.target.id === 'orientation') {
                    els.sheet.className = `a4-sheet ${e.target.value}`;
                }
                if (e.target.id === 'bolder-formulas') {
                    updateStyles();
                    return;
                }
                render();
            });
        });

    // Remove window resize listener for zoom since it's manual now

    // 3. Input
    let debounceTimer;
    els.input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(render, 500);
    });

    els.btnRender.addEventListener('click', render);

    // 4. Download
    els.btnDownload.addEventListener('click', async () => {
        const format = els.exportFormat.value;

        els.btnDownload.textContent = "Processing...";
        els.btnDownload.disabled = true;

        try {
            // Disable zoom for capture
            const originalTransform = els.sheet.style.transform;
            const originalMargin = els.sheet.style.marginBottom;
            els.sheet.style.transform = 'none';
            els.sheet.style.marginBottom = '0';

            els.sheet.style.boxShadow = 'none';

            // High resolution capture
            const canvas = await html2canvas(els.sheet, {
                scale: 3,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                onclone: (doc) => {
                    doc.getElementById('sheet').style.fontFeatureSettings = '"liga" 0';
                }
            });

            els.sheet.style.boxShadow = '';

            // Restore zoom
            els.sheet.style.transform = originalTransform;
            els.sheet.style.marginBottom = originalMargin;

            if (format === 'pdf') {
                // PDF Export
                const imgData = canvas.toDataURL('image/jpeg', 1.0);
                const { jsPDF } = window.jspdf;

                const isPortrait = els.orientation.value === 'portrait';
                const orient = isPortrait ? 'p' : 'l';
                const formatSize = 'a4';

                const pdf = new jsPDF(orient, 'mm', formatSize);

                const imgProps = pdf.getImageProperties(imgData);
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
                pdf.save(`cheatsheet_${Date.now()}.pdf`);

            } else {
                // Image Export (PNG/JPG)
                const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
                const imgData = canvas.toDataURL(mimeType, 1.0);
                const link = document.createElement('a');
                link.href = imgData;
                link.download = `cheatsheet_${Date.now()}.${format}`;
                link.click();
            }

            log("Download started.");
        } catch (error) {
            log(`Error: ${error.message}`, 'error');
        } finally {
            els.btnDownload.textContent = "Download Image";
            els.btnDownload.disabled = false;
        }
    });

    updateStyles();
});