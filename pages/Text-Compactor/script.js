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
        
        // Margin & Padding Inputs
        padPage: document.getElementById('padPage'),
        padBox: document.getElementById('padBox'),
        padPageVal: document.getElementById('pad-page-val'),
        padBoxVal: document.getElementById('pad-box-val'),

        removeBullets: document.getElementById('remove-bullets'),
        exportFormat: document.getElementById('export-format'),
        btnRender: document.getElementById('btn-render'),
        btnDownload: document.getElementById('btn-download'),
        debug: document.getElementById('debug-content')
    };

    // --- Palettes ---
    const fontColors = [
        '#000000', // Black
        '#c00000', // Deep Red
        '#00008b', // Dark Blue
        '#005500', // Dark Green
        '#550055', // Purple
        '#663300'  // Brown
    ];

    const bgColors = [
        'transparent',
        '#fff0f0', '#f0f8ff', '#f0fff0', 
        '#fff0ff', '#fffff0', '#f0ffff', '#fff5e6'
    ];

    // --- Logger ---
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
        return text.replace(/\$([^$]+)\$/g, (match, latex) => {
            try {
                return katex.renderToString(latex, { throwOnError: false, displayMode: false });
            } catch (e) { return match; }
        });
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
                if (text.length === 0) return;

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

                // 3. Process Content
                text = processMath(text);
                text = parseMarkdown(text);

                // 4. Styles
                const fColor = fontColors[fontColorIdx % fontColors.length];
                let bgColor = 'transparent';
                // Only use bg colors on spans if NOT in box mode (box mode colors the container)
                if (styleMode === 'highlight' && sectionIdx > 0) {
                    bgColor = bgColors[sectionIdx % bgColors.length];
                }

                let spanHTML = "";
                
                if (isHeader) {
                    spanHTML = `<span class="sheet-span sheet-header" style="color: #000; background-color: ${bgColor};">[${text}]</span>`;
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

    // --- Update CSS Variables & Styles ---
    function updateStyles() {
        // Font
        els.fsVal.textContent = els.fontSize.value;
        els.content.style.fontSize = `${els.fontSize.value}px`;
        
        // Line Height
        els.lhVal.textContent = els.lineHeight.value;
        els.content.style.lineHeight = els.lineHeight.value;

        // Page Margin
        const margin = els.padPage.value;
        els.padPageVal.textContent = margin;
        els.sheet.style.padding = `${margin}mm`;

        // Box Padding (Using CSS Variable for instant updates)
        const boxPad = els.padBox.value;
        els.padBoxVal.textContent = boxPad;
        els.sheet.style.setProperty('--box-pad', `${boxPad}px`);
    }

    // --- Event Listeners ---

    // 1. Style Inputs (Live CSS updates)
    [els.fontSize, els.lineHeight, els.padPage, els.padBox].forEach(el => {
        el.addEventListener('input', updateStyles);
    });

    // 2. Trigger Full Renders
    [els.sectionStyle, els.removeBullets, els.orientation].forEach(el => {
        el.addEventListener('change', (e) => {
            if(e.target.id === 'orientation') {
                els.sheet.className = `a4-sheet ${e.target.value}`;
            }
            render();
        });
    });

    // 3. Text Input
    let debounceTimer;
    els.input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(render, 500);
    });

    els.btnRender.addEventListener('click', render);

    // 4. Download
    els.btnDownload.addEventListener('click', async () => {
        const format = els.exportFormat.value; 
        const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
        
        els.btnDownload.textContent = "Processing...";
        els.btnDownload.disabled = true;
        
        try {
            els.sheet.style.boxShadow = 'none';

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

            const imgData = canvas.toDataURL(mimeType, 1.0);
            const link = document.createElement('a');
            link.href = imgData;
            link.download = `cheatsheet_${Date.now()}.${format}`;
            link.click();
            
            log("Download started.");
        } catch (error) {
            log(`Error: ${error.message}`, 'error');
        } finally {
            els.btnDownload.textContent = "Download Image";
            els.btnDownload.disabled = false;
        }
    });

    // Initial Setup
    updateStyles();
});