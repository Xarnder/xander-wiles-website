// --- Configuration ---
const CONFIG = {
    scale: 2.5,
    colors: {
        header: 'rgba(245, 158, 11, 0.15)',
        headerBorder: '#f59e0b',
        colDividers: '#3b82f6',
        limitLines: '#ef4444',
        detectedRows: 'rgba(0, 150, 0, 1.0)' 
    },
    columnTints: [
        'rgba(59, 130, 246, 0.15)', 'rgba(236, 72, 153, 0.15)', 'rgba(34, 197, 94, 0.15)', 
        'rgba(168, 85, 247, 0.15)', 'rgba(249, 115, 22, 0.15)'
    ]
};

// --- State ---
let pdfDoc = null;
let currentTemplatePage = 1;
let templateEffectiveEnd = 0;
let currentMode = null;
let appMode = 'extraction'; 

let layouts = { primary: createEmptyLayout(), secondary: createEmptyLayout() };
let activeLayoutKey = 'primary'; 
let useMultiPage = false;

// Settings
let rowStrategy = 'auto'; 
let fixedStrategy = 'height';
let cleanPipes = true;
let inferDates = true;
let ignoreLastPage = false;

// Data
let columnNames = [];
let columnIsDate = []; 
let extractedData = [];
let detectedRowLines = []; 
let debugZip = null; 

// Culling State
let cullDoc = null;
let cullFileBytes = null;
let cullFileName = "";
let cullCurrentPage = 1;
let pagesToCull = new Set(); 

// --- Elements (Global Refs) ---
let canvas, ctx, overlay, oCtx, rowCountInput;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('pdfCanvas');
    ctx = canvas.getContext('2d');
    overlay = document.getElementById('overlayCanvas');
    oCtx = overlay.getContext('2d');
    rowCountInput = document.getElementById('rowCountInput');

    if(typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    } else {
        console.error("PDF.js not loaded!");
    }

    initEventListeners();
    log("Ready. Upload a template to begin.");
});

function createEmptyLayout() {
    return { headTop: null, headBot: null, tableBot: null, left: null, right: null, dividers: [], row1Bot: null, rowCount: 10 };
}

function log(msg, type = 'info') {
    const consoleDiv = document.getElementById('debugConsole');
    if (consoleDiv) {
        const d = new Date();
        const time = d.toLocaleTimeString('en-GB', { hour12: false });
        const div = document.createElement('div');
        div.style.color = type === 'error' ? '#ff7b72' : (type === 'success' ? '#86efac' : '#e2e8f0');
        div.textContent = `[${time}] ${msg}`;
        consoleDiv.appendChild(div);
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
    }
    if(type === 'error') console.error(msg);
}

function safeAddListener(id, event, handler) {
    const el = document.getElementById(id);
    if(el) el.addEventListener(event, handler);
}

function initEventListeners() {
    // Template
    safeAddListener('templateInput', 'change', (e) => { appMode = 'extraction'; document.getElementById('cullControls').classList.add('hidden'); loadTemplate(e); });

    // Navigation
    safeAddListener('btnPrevPage', 'click', () => changeTemplatePage(-1));
    safeAddListener('btnNextPage', 'click', () => changeTemplatePage(1));
    safeAddListener('chkMultiPage', 'change', (e) => {
        useMultiPage = e.target.checked;
        document.getElementById('layoutSwitcher').classList.toggle('hidden', !useMultiPage);
        if(useMultiPage && layouts.secondary.left === null) {
            layouts.secondary = JSON.parse(JSON.stringify(layouts.primary));
            updateDividerUI();
        }
    });
    safeAddListener('btnEditPage1', 'click', () => { switchLayoutView('primary'); if(currentTemplatePage!==1) changeTemplatePage(1-currentTemplatePage); });
    safeAddListener('btnEditPage2', 'click', () => { switchLayoutView('secondary'); if(pdfDoc && pdfDoc.numPages > 1 && currentTemplatePage!==2) changeTemplatePage(2-currentTemplatePage); });

    // Row Strategy 
    safeAddListener('btnModeAuto', 'click', () => setRowStrategy('auto'));
    safeAddListener('btnModeFixed', 'click', () => setRowStrategy('fixed'));
    document.querySelectorAll('input[name="fixedMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => { fixedStrategy = e.target.value; updateFixedUI(); drawOverlay(); });
    });
    if(rowCountInput) {
        rowCountInput.addEventListener('input', (e) => { layouts[activeLayoutKey].rowCount = parseInt(e.target.value)||1; drawOverlay(); });
    }

    // Extraction Tools
    const modes = { 'btnHeadTop':'HEAD_TOP', 'btnHeadBot':'HEAD_BOT', 'btnTableBot':'TABLE_BOT', 'btnTableLeft':'LEFT', 'btnTableRight':'RIGHT', 'btnColDiv':'DIVIDER', 'btnDelDiv':'DEL_DIVIDER', 'btnRow1':'ROW_1_BOT' };
    Object.keys(modes).forEach(id => {
        safeAddListener(id, 'click', (e) => {
            if(appMode !== 'extraction') { alert("Upload a template first."); return; }
            currentMode = modes[id];
            document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Batch & Settings
    safeAddListener('batchInput', 'change', (e) => { if(e.target.files.length) document.getElementById('btnProcess').disabled = false; });
    safeAddListener('btnProcess', 'click', runBatchOCR);
    safeAddListener('btnExport', 'click', exportCSV);
    safeAddListener('btnExportZip', 'click', exportZip);
    safeAddListener('btnClear', 'click', resetCurrentLayout);
    safeAddListener('btnReadHeaders', 'click', readHeaderTitles);
    safeAddListener('chkCleanPipes', 'change', (e) => cleanPipes = e.target.checked);
    safeAddListener('chkInferDates', 'change', (e) => inferDates = e.target.checked);
    safeAddListener('chkIgnoreLastPage', 'change', async (e) => {
        ignoreLastPage = e.target.checked;
        log(`Ignore Last Page: ${ignoreLastPage}`);
        if(pdfDoc) {
            templateEffectiveEnd = await calculateEffectivePageCount(pdfDoc);
            drawOverlay();
        }
    });

    // Utilities
    safeAddListener('preProcessInput', 'change', (e) => { if(e.target.files.length) document.getElementById('btnRemoveLastPage').disabled = false; });
    safeAddListener('btnRemoveLastPage', 'click', runPageRemovalBatch);
    safeAddListener('cullInput', 'change', loadCullFile);
    safeAddListener('btnCullPrev', 'click', () => changeCullPage(-1));
    safeAddListener('btnCullNext', 'click', () => changeCullPage(1));
    safeAddListener('btnToggleCull', 'click', toggleCullPageStatus);
    safeAddListener('btnDownloadCull', 'click', downloadCulledPdf);

    // Modals & Canvas
    safeAddListener('btnShowGuide', 'click', () => document.getElementById('guideModal').classList.remove('hidden'));
    safeAddListener('btnCloseGuide', 'click', () => document.getElementById('guideModal').classList.add('hidden'));
    if(overlay) overlay.addEventListener('mousedown', handleCanvasClick);
}

// ==========================================
// UI LOGIC
// ==========================================

function setRowStrategy(strat) {
    rowStrategy = strat;
    log(`Row Mode set to: ${strat}`);
    
    document.getElementById('btnModeAuto').classList.toggle('active', strat === 'auto');
    document.getElementById('btnModeFixed').classList.toggle('active', strat === 'fixed');
    document.getElementById('panelAuto').classList.toggle('hidden', strat !== 'auto');
    document.getElementById('panelFixed').classList.toggle('hidden', strat !== 'fixed');
    
    drawOverlay();
}

function updateFixedUI() {
    document.getElementById('subPanelHeight').classList.toggle('hidden', fixedStrategy !== 'height');
    document.getElementById('subPanelCount').classList.toggle('hidden', fixedStrategy !== 'count');
}

function switchLayoutView(key) {
    activeLayoutKey = key;
    document.getElementById('btnEditPage1').classList.toggle('active', key === 'primary');
    document.getElementById('btnEditPage2').classList.toggle('active', key === 'secondary');
    if(rowCountInput) rowCountInput.value = layouts[key].rowCount || 10;
    drawOverlay();
    updateColumns();
    updateDividerUI();
}

function handleCanvasClick(e) {
    if(appMode !== 'extraction') return;
    if (!currentMode) return;
    
    const rect = overlay.getBoundingClientRect();
    const scaleX = overlay.width / rect.width;
    const scaleY = overlay.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const layout = layouts[activeLayoutKey];

    switch (currentMode) {
        case 'HEAD_TOP': layout.headTop = y; break;
        case 'HEAD_BOT': layout.headBot = y; break;
        case 'TABLE_BOT': layout.tableBot = y; break;
        case 'LEFT': layout.left = x; break;
        case 'RIGHT': layout.right = x; break;
        case 'ROW_1_BOT': layout.row1Bot = y; break;
        case 'DIVIDER': 
            layout.dividers.push(x); 
            layout.dividers.sort((a,b) => a - b);
            updateDividerUI();
            break;
        case 'DEL_DIVIDER':
            const matchIndex = layout.dividers.findIndex(d => Math.abs(d - x) < 15);
            if (matchIndex !== -1) { layout.dividers.splice(matchIndex, 1); updateDividerUI(); }
            break;
    }
    if(rowStrategy === 'auto') detectedRowLines = []; 
    drawOverlay();
    updateColumns();
}

function updateDividerUI() {
    const container = document.getElementById('dividerList');
    if(!container) return;
    container.innerHTML = '';
    layouts[activeLayoutKey].dividers.forEach((d, i) => {
        const tag = document.createElement('div');
        tag.className = 'divider-tag';
        tag.innerHTML = `Div ${i+1} <span>×</span>`;
        tag.onclick = () => {
            layouts[activeLayoutKey].dividers.splice(i, 1);
            drawOverlay(); updateColumns(); updateDividerUI();
        };
        container.appendChild(tag);
    });
}

function updateColumns(autoTitles = null) {
    const container = document.getElementById('colContainer');
    if (!container) return;
    container.innerHTML = '';

    const layout = layouts[activeLayoutKey];
    if (layout.left === null || layout.right === null) {
        container.innerHTML = '<em style="color:#666; font-size:0.8rem;">Define Left/Right edges.</em>';
        return;
    }

    const validDividers = layout.dividers.filter(d => d > layout.left && d < layout.right);
    const boundaries = [layout.left, ...validDividers, layout.right];
    const colCount = boundaries.length - 1;

    while(columnNames.length < colCount) {
        columnNames.push(`Column ${columnNames.length + 1}`);
        columnIsDate.push(false);
    }
    columnNames = columnNames.slice(0, colCount);
    columnIsDate = columnIsDate.slice(0, colCount);

    if (autoTitles && autoTitles.length === colCount) {
        columnNames = autoTitles;
        columnIsDate = columnNames.map(n => /date|time/i.test(n));
    }

    columnNames.forEach((name, i) => {
        const div = document.createElement('div');
        div.className = 'column-item';
        div.style.borderLeftColor = CONFIG.columnTints[i % CONFIG.columnTints.length].replace('0.15', '1.0');
        div.innerHTML = `<div class="column-options"><span>#${i+1}</span><input type="text" value="${name}" oninput="columnNames[${i}]=this.value"></div>`;
        const lbl = document.createElement('label');
        lbl.className = 'date-toggle';
        lbl.innerHTML = `<input type="checkbox" ${columnIsDate[i] ? 'checked' : ''} onchange="columnIsDate[${i}]=this.checked"> Is Date?`;
        div.appendChild(lbl);
        container.appendChild(div);
    });
}

function resetCurrentLayout() {
    layouts[activeLayoutKey] = createEmptyLayout();
    if(rowCountInput) rowCountInput.value = 10;
    if(activeLayoutKey === 'primary') {
        columnNames = []; columnIsDate = []; 
        document.getElementById('colContainer').innerHTML = '';
    }
    detectedRowLines = [];
    updateDividerUI();
    drawOverlay();
    log(`Reset layout for ${activeLayoutKey === 'primary' ? "Page 1" : "Page 2+"}.`);
}

// --- VISUALS ---

function drawOverlay() {
    if(appMode === 'culling') return drawCullOverlay();
    if (!overlay || overlay.width === 0 || overlay.height === 0) return;

    try {
        oCtx.clearRect(0, 0, overlay.width, overlay.height);
        
        if (pdfDoc && currentTemplatePage > templateEffectiveEnd && appMode === 'extraction') {
            oCtx.fillStyle = "rgba(0, 0, 0, 0.85)";
            oCtx.fillRect(0, 0, overlay.width, overlay.height);
            oCtx.fillStyle = "white";
            oCtx.textAlign = "center";
            oCtx.font = "bold 40px sans-serif";
            oCtx.fillText("PAGE IGNORED", overlay.width / 2, overlay.height / 2);
            let reason = "Blank Page Detected";
            if(ignoreLastPage && currentTemplatePage === templateEffectiveEnd + 1) reason = "Info Page Ignored (Settings)";
            oCtx.font = "20px sans-serif";
            oCtx.fillText(`(${reason})`, overlay.width / 2, (overlay.height / 2) + 40);
            oCtx.textAlign = "left"; 
            return;
        }

        const layout = layouts[activeLayoutKey];
        
        if (layout.headBot && layout.tableBot && layout.left && layout.right) {
            const bounds = [layout.left, ...layout.dividers, layout.right].sort((a,b)=>a-b);
            for (let i = 0; i < bounds.length - 1; i++) {
                oCtx.fillStyle = CONFIG.columnTints[i % CONFIG.columnTints.length];
                oCtx.fillRect(bounds[i], layout.headBot, bounds[i+1]-bounds[i], layout.tableBot - layout.headBot);
            }
        }
        
        if (layout.headTop) {
            oCtx.fillStyle = CONFIG.colors.header;
            oCtx.fillRect(layout.left || 0, layout.headTop, (layout.right || overlay.width) - (layout.left || 0), layout.headBot - layout.headTop);
        }

        let lines = [];
        if(rowStrategy === 'fixed') lines = calculateFixedGrid(layout);
        else if(detectedRowLines.length) lines = detectedRowLines;
        
        // Pass 0 as offset for live preview
        paintVisuals(oCtx, overlay.width, overlay.height, lines, layout, 0); 
    } catch(e) {
        console.warn("Draw error:", e);
    }
}

function calculateFixedGrid(layout) {
    if (!layout.headBot || !layout.tableBot) return [];
    const lines = [];
    const h = layout.tableBot - layout.headBot;
    let step = 0;
    if(fixedStrategy === 'height' && layout.row1Bot) step = layout.row1Bot - layout.headBot;
    else if(fixedStrategy === 'count') step = h / (layout.rowCount || 10);
    
    if(step > 0) {
        for(let y = layout.headBot + step; y < layout.tableBot + 5; y += step) lines.push(y);
    }
    return lines;
}

// FIX: Numbering logic in Debug Overlay
function paintVisuals(ctx, w, h, rowLines, layout, rowOffset = 0) {
    const safeOffset = Number(rowOffset) || 0;

    if (rowLines.length) {
        ctx.beginPath(); ctx.strokeStyle = CONFIG.colors.detectedRows; ctx.lineWidth = 2;
        rowLines.forEach((y, i) => {
            ctx.moveTo(layout.left, y); ctx.lineTo(layout.right, y);
            ctx.fillStyle = "rgba(0,100,0,0.9)";
            const ly = y - (i===0 ? (y-layout.headBot)/2 : (y-rowLines[i-1])/2);
            ctx.fillRect(layout.left-40, ly-8, 30, 16);
            ctx.fillStyle = "white"; ctx.font = "bold 12px sans-serif";
            
            // Displays: Cumulative Document Index (Offset + current index + 1)
            const displayNum = safeOffset + i + 1;
            ctx.fillText(`#${displayNum}`, layout.left-35, ly+4);
        });
        ctx.stroke();
    }
    
    [layout.headTop, layout.headBot, layout.tableBot].forEach(y => paintLine(ctx, w, h, y, true, CONFIG.colors.headerBorder));
    [layout.left, layout.right, ...layout.dividers].forEach(x => paintLine(ctx, w, h, x, false, CONFIG.colors.limitLines));
}

function paintLine(ctx, w, h, val, isH, color) {
    if (val == null) return;
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(isH?[0,0]:[5,5]);
    if(isH) { ctx.moveTo(0, val); ctx.lineTo(w, val); } else { ctx.moveTo(val, 0); ctx.lineTo(val, h); }
    ctx.stroke();
}

// --- STANDARD LOADER ---
async function loadTemplate(e) {
    const file = e.target.files[0]; 
    if (!file) return;
    
    log(`Loading Template: ${file.name}`); 
    const indicator = document.getElementById('loadingIndicator');
    if(indicator) indicator.classList.remove('hidden');

    try {
        const buffer = await file.arrayBuffer(); 
        pdfDoc = await pdfjsLib.getDocument(buffer).promise;
        currentTemplatePage = 1; 
        document.getElementById('pageIndicator').textContent = "Page 1";
        document.getElementById('btnPrevPage').disabled = true;
        document.getElementById('btnNextPage').disabled = (pdfDoc.numPages <= 1);
        
        templateEffectiveEnd = await calculateEffectivePageCount(pdfDoc);
        
        await renderTemplatePage(); 
        
        const batchInput = document.getElementById('batchInput');
        if(batchInput) batchInput.disabled = false;
        
        if(indicator) indicator.classList.add('hidden'); 
        log('Template loaded.', 'success');
    } catch (err) { 
        console.error(err);
        log(err.message, 'error'); 
        if(indicator) indicator.classList.add('hidden'); 
    }
}

async function renderTemplatePage() {
    document.getElementById('pageIndicator').textContent = `Page ${currentTemplatePage}`;
    const page = await pdfDoc.getPage(currentTemplatePage);
    const viewport = page.getViewport({ scale: CONFIG.scale });
    canvas.width = viewport.width; canvas.height = viewport.height;
    overlay.width = viewport.width; overlay.height = viewport.height;
    canvas.style.width = '100%'; canvas.style.height = 'auto';
    overlay.style.width = '100%'; overlay.style.height = 'auto';
    await page.render({ canvasContext: ctx, viewport }).promise; drawOverlay();
}

function changeTemplatePage(d) {
    const n = currentTemplatePage + d;
    if(n >= 1 && n <= pdfDoc.numPages) { currentTemplatePage = n; renderTemplatePage(); }
}

async function isPageBlank(pdfProxy, pageNum) {
    try {
        const page = await pdfProxy.getPage(pageNum);
        const textContent = await page.getTextContent();
        const str = textContent.items.map(item => item.str).join('');
        return str.trim().length < 40;
    } catch(e) { return false; }
}

async function calculateEffectivePageCount(docProxy) {
    let effectiveTotal = docProxy.numPages;
    if (effectiveTotal <= 1) return 1;
    for (let p = docProxy.numPages; p > 1; p--) {
        const isBlank = await isPageBlank(docProxy, p);
        if (isBlank) effectiveTotal--;
        else break; 
    }
    if (ignoreLastPage && effectiveTotal > 1) effectiveTotal--;
    return effectiveTotal;
}

// --- BATCH EXTRACTION ---
async function runBatchOCR() {
    if (!layouts.primary.tableBot) return log("Set Page 1 layout first.", "error");
    const files = document.getElementById('batchInput').files;
    const btn = document.getElementById('btnProcess');
    btn.disabled = true; btn.textContent = "Processing...";
    
    extractedData = []; 
    debugZip = new JSZip();

    document.getElementById('tableBody').innerHTML = '';
    document.getElementById('resultsSection').classList.remove('hidden');
    
    // FIX: Explicitly adding "Pg Row #" to the Header
    document.getElementById('tableHeader').innerHTML = '<th>File</th><th>Page</th><th>Global #</th><th>Doc Row #</th><th>Pg Row #</th><th>Date Source</th>' + columnNames.map(c => `<th>${c}</th>`).join('');

    const worker = await Tesseract.createWorker('eng');

    for (let i = 0; i < files.length; i++) {
        log(`Processing ${files[i].name}...`);
        try {
            await processFullPdf(files[i], worker);
        } catch (e) { log(`Error: ${e.message}`, 'error'); }
    }

    await worker.terminate();
    drawOverlay(); 
    log("Batch finished.", "success");
    btn.disabled = false; btn.textContent = "Run Extraction";
    document.getElementById('btnExport').classList.remove('hidden');
    document.getElementById('btnExportZip').classList.remove('hidden');
}

async function processFullPdf(file, worker) {
    const buffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument(buffer).promise;
    const fileYear = getYearFromFilename(file.name);
    
    const pagesToProcess = await calculateEffectivePageCount(doc);
    if (pagesToProcess < doc.numPages) log(`  Smart Skip: Processing 1 to ${pagesToProcess}`);
    else log(`  Processing all ${doc.numPages} pages.`);

    let lastValidDate = null;
    let localRowsTotal = 0; // Counts total rows for this current PDF file

    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
        let currentLayout = layouts.primary;
        if (useMultiPage && pageNum > 1) {
            currentLayout = layouts.secondary;
            if (!currentLayout.headBot || !currentLayout.tableBot) continue;
        } 

        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: CONFIG.scale });
        const temp = document.createElement('canvas');
        temp.width = viewport.width; temp.height = viewport.height;
        await page.render({ canvasContext: temp.getContext('2d'), viewport }).promise;

        // FIX: Capture snapshot BEFORE adding new rows for Debug Image Offset
        const startRowOffset = Number(localRowsTotal);

        let pageRows = [];
        let pageRowLines = [];

        if (rowStrategy === 'fixed') {
            const res = await extractFixed(worker, temp, currentLayout, fileYear, lastValidDate);
            pageRows = res.rows; pageRowLines = res.lines; lastValidDate = res.lastDate;
        } else {
            const res = await extractAuto(worker, temp, currentLayout, fileYear, lastValidDate);
            pageRows = res.rows; pageRowLines = res.lines; lastValidDate = res.lastDate;
        }

        // Add to main table
        pageRows.forEach((row, idx) => {
            localRowsTotal++;
            // Pass localRowsTotal (Doc #) and idx+1 (Page Row #)
            addTableRow(file.name, pageNum, row.data, extractedData.length + 1, localRowsTotal, idx + 1, row.dateStatus);
        });

        // Debug Message
        if(pageRows.length > 0) {
            log(`  Page ${pageNum}: Found ${pageRows.length} rows. (Doc # ${startRowOffset+1} to ${localRowsTotal})`);
        }

        // Pass the 'startRowOffset' to the debug generator
        await generateDebugImage(temp, `${file.name}_p${pageNum}`, pageRowLines, currentLayout, startRowOffset);
    }
}

async function extractAuto(worker, fullCanvas, layoutData, fileYear, lastDate) {
    const { cropC, cropY } = cropCanvas(fullCanvas, layoutData);
    const { data: { lines } } = await worker.recognize(cropC);
    const bounds = [0, ...layoutData.dividers.filter(d => d > layoutData.left && d < layoutData.right).map(d => d - layoutData.left), cropC.width];
    
    let rows = []; let lineYs = []; let currentLastDate = lastDate;

    lines.forEach(line => {
        let rowData = new Array(columnNames.length).fill('');
        let hasContent = false;
        line.words.forEach(word => {
            const mx = (word.bbox.x0 + word.bbox.x1)/2;
            for (let c = 0; c < bounds.length - 1; c++) {
                if (mx >= bounds[c] && mx < bounds[c+1]) { rowData[c] += word.text + ' '; hasContent = true; }
            }
        });
        if (hasContent && rowData.join('').length > 3) {
            const result = inferRowDates(rowData, fileYear, currentLastDate);
            currentLastDate = result.lastValidDate;
            rows.push({ data: result.processedRow, dateStatus: result.dateStatus });
            lineYs.push(line.bbox.y1 + cropY);
        }
    });
    return { rows, lines: lineYs, lastDate: currentLastDate };
}

async function extractFixed(worker, fullCanvas, layoutData, fileYear, lastDate) {
    const { cropC, cropY } = cropCanvas(fullCanvas, layoutData);
    const gridY = calculateFixedGrid(layoutData);
    const bounds = [0, ...layoutData.dividers.filter(d => d > layoutData.left && d < layoutData.right).map(d => d - layoutData.left), cropC.width];
    
    let rows = []; let lineYs = []; let currentLastDate = lastDate; let rowTop = 0; 
    
    for(let i=0; i < gridY.length; i++) {
        const rowBot = gridY[i] - cropY;
        const rowH = rowBot - rowTop;
        if (rowH > 5) {
            const strip = document.createElement('canvas');
            strip.width = cropC.width; strip.height = rowH;
            strip.getContext('2d').drawImage(cropC, 0, rowTop, cropC.width, rowH, 0, 0, cropC.width, rowH);
            await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
            const { data: { words } } = await worker.recognize(strip);

            let rowData = new Array(columnNames.length).fill(''); let hasContent = false;
            words.forEach(wd => {
                const mx = (wd.bbox.x0 + wd.bbox.x1)/2;
                for (let c = 0; c < bounds.length - 1; c++) {
                    if (mx >= bounds[c] && mx < bounds[c+1]) { rowData[c] += wd.text + ' '; hasContent = true; }
                }
            });
            if(hasContent && rowData.join('').length > 2) {
                const result = inferRowDates(rowData, fileYear, currentLastDate);
                currentLastDate = result.lastValidDate;
                rows.push({ data: result.processedRow, dateStatus: result.dateStatus });
                
                // FIX: Only add the line to `lineYs` if we actually pushed data
                // This keeps visuals in sync with extracted data
                lineYs.push(gridY[i]); 
            }
        }
        rowTop = rowBot;
    }
    // Return lineYs (only lines with data) instead of gridY (all lines)
    return { rows, lines: lineYs, lastDate: currentLastDate };
}

function cropCanvas(source, layoutData) {
    const cropX = layoutData.left;
    const cropY = layoutData.headBot;
    const cropW = layoutData.right - layoutData.left;
    const cropH = layoutData.tableBot - layoutData.headBot;
    const cropC = document.createElement('canvas');
    cropC.width = cropW; cropC.height = cropH;
    cropC.getContext('2d').drawImage(source, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    return { cropC, cropY };
}

async function generateDebugImage(canvasRef, filename, rowLines, usedLayout, rowOffset) {
    if(!debugZip) return;
    const ctx = canvasRef.getContext('2d');
    // Pass the offset to the visual painter
    paintVisuals(ctx, canvasRef.width, canvasRef.height, rowLines, usedLayout, rowOffset);
    return new Promise((resolve) => {
        canvasRef.toBlob((blob) => {
            if(blob) { debugZip.file(filename.replace(/\.pdf$/i, '') + "_debug.jpg", blob); }
            resolve();
        }, 'image/jpeg', 0.8);
    });
}

function exportZip() {
    if(!debugZip) return;
    const btn = document.getElementById('btnExportZip'); btn.textContent = "Zipping...";
    debugZip.generateAsync({type:"blob"}).then(c => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(c); a.download = "debug_images.zip"; a.click();
        btn.textContent = "Debug ZIP";
    });
}

function inferRowDates(rowData, fileYear, lastValidDate) {
    let dateStatus = "-"; let foundDateInRow = false;
    const processedRow = rowData.map((t, i) => {
        let txt = cleanPipeNoise(t.trim()); 
        if (columnIsDate[i]) {
            let fmtDate = cleanAndFormatDate(txt, fileYear);
            if (fmtDate.length >= 8 && fmtDate.includes('/')) {
                lastValidDate = fmtDate; dateStatus = "Extracted"; foundDateInRow = true; return fmtDate;
            } else if (inferDates && lastValidDate) { return lastValidDate; }
        }
        return txt;
    });
    if (!foundDateInRow && inferDates && lastValidDate) dateStatus = "Inferred";
    return { processedRow, lastValidDate, dateStatus };
}

// FIX: Added columns for Doc Row # and Pg Row #
function addTableRow(fname, pageNum, data, globalIdx, docRowIdx, pageRowIdx, dateStatus) {
    extractedData.push({ file: fname, page: pageNum, data, globalIdx, docRowIdx, pageRowIdx, dateStatus });
    const tr = document.createElement('tr');
    let statusColor = dateStatus === "Extracted" ? "#3b82f6" : (dateStatus === "Inferred" ? "#f59e0b" : "#64748b");
    
    tr.innerHTML = `
        <td style="color:#888;font-size:0.75em">${fname}</td>
        <td>${pageNum}</td>
        <td style="color:#888;">${globalIdx}</td>
        <td style="color:#22c55e;font-weight:bold;">${docRowIdx}</td>
        <td style="color:#3b82f6;font-weight:bold;">${pageRowIdx}</td>
        <td style="color:${statusColor}; font-size:0.8em;">${dateStatus}</td>` + 
        data.map(d => `<td>${d}</td>`).join('');
    
    document.getElementById('tableBody').appendChild(tr);
    document.getElementById('rowCount').textContent = `${extractedData.length} rows found`;
}

function exportCSV() {
    if(!extractedData.length) return;
    const data = extractedData.map(row => {
        let obj = { 
            'Source File': row.file, 
            'Page': row.page,
            'Global #': row.globalIdx, 
            'Doc Row #': row.docRowIdx, 
            'Pg Row #': row.pageRowIdx, 
            'Date Source': row.dateStatus 
        };
        columnNames.forEach((c, i) => obj[c] = row.data[i]);
        return obj;
    });
    const blob = new Blob([Papa.unparse(data)], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `extraction.csv`; a.click();
}

function cleanPipeNoise(text) {
    if (!cleanPipes) return text; return text.replace(/^[\s|I]+|[\s|I]+$/g, '');
}

function getYearFromFilename(fn) { const m = fn.match(/(20\d{2})/); return m ? m[0] : new Date().getFullYear(); }

function cleanAndFormatDate(txt, yr) {
    if (!txt || txt.length < 3) return txt;
    let clean = cleanPipeNoise(txt).replace(/\./g, ' ').trim();
    clean = clean.replace(/0ct/i, 'Oct').replace(/0ec/i, 'Dec').replace(/1an/i, 'Jan').replace(/5ep/i, 'Sep').replace(/Au9/i, 'Aug');
    const regex = /(\d{1,2})[\s\-]*([A-Za-z]{3})/i;
    const match = clean.match(regex);
    if (match) {
        const day = match[1].padStart(2, '0'); let monthStr = match[2].toLowerCase();
        const map = { 'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06','jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12','ju1':'07', 'jui':'07', 'n0v':'11'};
        let mm = map[monthStr] || map[monthStr.substring(0,3)];
        if (mm) return `${day}/${mm}/${yr}`;
    }
    return "";
}

async function readHeaderTitles() {
    const layout = layouts.primary;
    if (!layout.headTop || !layout.headBot) return log('Set boundaries first.', 'error');
    const btn = document.getElementById('btnReadHeaders'); const old = btn.textContent; btn.textContent = "Scanning..."; btn.disabled = true;
    try {
        const w = layout.right - layout.left; const h = layout.headBot - layout.headTop;
        const temp = document.createElement('canvas'); temp.width = w; temp.height = h;
        temp.getContext('2d').drawImage(canvas, layout.left, layout.headTop, w, h, 0, 0, w, h);
        const worker = await Tesseract.createWorker('eng');
        const { data: { words } } = await worker.recognize(temp);
        const relDivs = layout.dividers.filter(d => d > layout.left && d < layout.right).map(d => d - layout.left);
        const bounds = [0, ...relDivs, w]; let titles = new Array(bounds.length - 1).fill('');
        words.forEach(wd => {
            const mx = (wd.bbox.x0 + wd.bbox.x1) / 2;
            for(let i=0; i<bounds.length-1; i++) if (mx >= bounds[i] && mx < bounds[i+1]) titles[i] += wd.text + ' ';
        });
        updateColumns(titles.map(t => cleanPipeNoise(t).trim().replace(/\s+/g,' ') || "Untitled"));
        log("Headers updated.", "success"); await worker.terminate();
    } catch (e) { log(e.message, 'error'); }
    btn.textContent = old; btn.disabled = false;
}

// ---------------------------
// UTILITY 2: CULLING
// ---------------------------
async function loadCullFile(e) {
    const file = e.target.files[0]; if(!file) return;
    appMode = 'culling'; cullFileName = file.name; cullFileBytes = await file.arrayBuffer();
    cullDoc = await pdfjsLib.getDocument(cullFileBytes.slice(0)).promise; 
    cullCurrentPage = 1; pagesToCull.clear(); 
    document.getElementById('cullControls').classList.remove('hidden');
    renderCullPage(); log(`Loaded for Culling: ${file.name}`);
}
async function renderCullPage() {
    if(!cullDoc) return;
    document.getElementById('cullPageIndicator').textContent = `Pg ${cullCurrentPage} / ${cullDoc.numPages}`;
    const page = await cullDoc.getPage(cullCurrentPage);
    const viewport = page.getViewport({ scale: CONFIG.scale }); 
    canvas.width = viewport.width; canvas.height = viewport.height;
    overlay.width = viewport.width; overlay.height = viewport.height;
    canvas.style.width = '100%'; canvas.style.height = 'auto';
    overlay.style.width = '100%'; overlay.style.height = 'auto';
    await page.render({ canvasContext: ctx, viewport }).promise;
    drawCullOverlay();
    const btn = document.getElementById('btnToggleCull');
    if(pagesToCull.has(cullCurrentPage)) { btn.textContent = "Restore Page"; btn.className = "btn success"; } else { btn.textContent = "Mark for Removal"; btn.className = "btn danger-outline"; }
}
function drawCullOverlay() {
    oCtx.clearRect(0, 0, overlay.width, overlay.height);
    if(pagesToCull.has(cullCurrentPage)) {
        oCtx.fillStyle = "rgba(239, 68, 68, 0.4)"; oCtx.fillRect(0, 0, overlay.width, overlay.height);
        oCtx.strokeStyle = "rgba(200, 0, 0, 0.8)"; oCtx.lineWidth = 10;
        oCtx.beginPath(); oCtx.moveTo(0, 0); oCtx.lineTo(overlay.width, overlay.height); oCtx.moveTo(overlay.width, 0); oCtx.lineTo(0, overlay.height); oCtx.stroke();
        oCtx.fillStyle = "white"; oCtx.font = "bold 60px sans-serif"; oCtx.textAlign = "center";
        oCtx.fillText("REMOVED", overlay.width/2, overlay.height/2); oCtx.strokeText("REMOVED", overlay.width/2, overlay.height/2); oCtx.textAlign = "left";
    }
}
function changeCullPage(delta) { const newPage = cullCurrentPage + delta; if(newPage >= 1 && newPage <= cullDoc.numPages) { cullCurrentPage = newPage; renderCullPage(); } }
function toggleCullPageStatus() { if(pagesToCull.has(cullCurrentPage)) pagesToCull.delete(cullCurrentPage); else pagesToCull.add(cullCurrentPage); renderCullPage(); }
async function downloadCulledPdf() {
    if(!cullFileBytes) return; const { PDFDocument } = PDFLib;
    const srcPdf = await PDFDocument.load(cullFileBytes, { ignoreEncryption: true }); const newPdf = await PDFDocument.create();
    const pageCount = srcPdf.getPageCount(); const keepIndices = [];
    for(let i = 0; i < pageCount; i++) { if(!pagesToCull.has(i + 1)) keepIndices.push(i); }
    if(keepIndices.length === 0) return alert("Cannot remove all pages!");
    const copiedPages = await newPdf.copyPages(srcPdf, keepIndices); copiedPages.forEach(p => newPdf.addPage(p));
    const blob = new Blob([await newPdf.save()], { type: 'application/pdf' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = cullFileName.replace(".pdf", "_clean.pdf"); a.click();
}

// ---------------------------
// UTILITY 1: BATCH REMOVAL
// ---------------------------
async function runPageRemovalBatch() {
    const files = document.getElementById('preProcessInput').files;
    const btn = document.getElementById('btnRemoveLastPage');
    if(!files.length) return;
    if (typeof PDFLib === 'undefined') return log("Error: PDF-Lib not loaded."); 
    btn.disabled = true; btn.textContent = "Processing...";
    const zip = new JSZip(); const { PDFDocument } = PDFLib;
    for (let i = 0; i < files.length; i++) {
        try {
            const buffer = await files[i].arrayBuffer();
            const srcPdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
            const count = srcPdf.getPageCount();
            if(count > 1) {
                const newPdf = await PDFDocument.create();
                const indices = Array.from({ length: count - 1 }, (_, k) => k);
                const pages = await newPdf.copyPages(srcPdf, indices);
                pages.forEach(p => newPdf.addPage(p));
                zip.file(files[i].name.replace(".pdf", "_trimmed.pdf"), await newPdf.save());
            } else { zip.file(files[i].name, buffer); }
        } catch(e) { console.error(e); }
    }
    zip.generateAsync({type:"blob"}).then(c => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(c); a.download="trimmed.zip"; a.click();
        btn.disabled = false; btn.textContent = "Process & Download ZIP";
    });
}