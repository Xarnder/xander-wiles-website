// --- Configuration ---
const CONFIG = {
    scale: 2.5,
    colors: {
        header: 'rgba(245, 158, 11, 0.15)',
        headerBorder: '#f59e0b',
        colDividers: '#3b82f6',
        limitLines: '#ef4444',
        detectedRows: 'rgba(50, 205, 50, 0.8)'
    },
    columnTints: [
        'rgba(59, 130, 246, 0.1)', 'rgba(236, 72, 153, 0.1)', 'rgba(34, 197, 94, 0.1)', 
        'rgba(168, 85, 247, 0.1)', 'rgba(249, 115, 22, 0.1)'
    ]
};

// --- State ---
let pdfDoc = null;
let currentMode = null;
let layout = {
    headTop: null, headBot: null, tableBot: null, 
    left: null, right: null, dividers: [], row1Bot: null 
};

let rowStrategy = 'auto'; // 'auto' or 'fixed'
let fixedStrategy = 'height'; // 'height' or 'count'
let cleanPipes = true;

let columnNames = [];
let columnIsDate = []; 
let extractedData = [];
let detectedRowLines = []; 

// --- Elements ---
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlayCanvas');
const oCtx = overlay.getContext('2d');
const consoleDiv = document.getElementById('debugConsole');

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// --- Logging ---
function log(msg, type = 'info') {
    const d = new Date();
    const time = d.toLocaleTimeString('en-GB', { hour12: false });
    const color = type === 'error' ? '#ff7b72' : (type === 'success' ? '#3fb950' : '#e2e8f0');
    const div = document.createElement('div');
    div.style.color = color;
    div.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
    div.style.padding = "4px 0";
    div.textContent = `[${time}] ${msg}`;
    consoleDiv.appendChild(div);
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
    if(type === 'error') console.error(msg);
}

// --- Event Listeners ---
document.getElementById('templateInput').addEventListener('change', loadTemplate);
document.getElementById('batchInput').addEventListener('change', (e) => {
    if(e.target.files.length) { document.getElementById('btnProcess').disabled = false; log(`Selected ${e.target.files.length} files.`); }
});
document.getElementById('btnProcess').addEventListener('click', runBatchOCR);
document.getElementById('btnExport').addEventListener('click', exportCSV);
document.getElementById('btnClear').addEventListener('click', resetLayout);
document.getElementById('btnReadHeaders').addEventListener('click', readHeaderTitles);
document.getElementById('btnShowGuide').addEventListener('click', () => document.getElementById('guideModal').classList.remove('hidden'));
document.getElementById('btnCloseGuide').addEventListener('click', () => document.getElementById('guideModal').classList.add('hidden'));
document.getElementById('chkCleanPipes').addEventListener('change', (e) => { cleanPipes = e.target.checked; log(`Pipe cleaning: ${cleanPipes}`); });

// Mode Toggles
document.getElementById('btnModeAuto').addEventListener('click', () => setRowStrategy('auto'));
document.getElementById('btnModeFixed').addEventListener('click', () => setRowStrategy('fixed'));

document.querySelectorAll('input[name="fixedMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        fixedStrategy = e.target.value;
        updateFixedUI();
        drawOverlay();
    });
});
document.getElementById('rowCountInput').addEventListener('input', drawOverlay);

const modes = {
    'btnHeadTop': 'HEAD_TOP', 'btnHeadBot': 'HEAD_BOT', 'btnTableBot': 'TABLE_BOT',
    'btnTableLeft': 'LEFT', 'btnTableRight': 'RIGHT', 'btnColDiv': 'DIVIDER',
    'btnRow1': 'ROW_1_BOT'
};

Object.keys(modes).forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
        setMode(modes[id]);
        document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
    });
});

overlay.addEventListener('mousedown', handleCanvasClick);

// --- Logic ---

function setRowStrategy(strat) {
    rowStrategy = strat;
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

function setMode(mode) { currentMode = mode; log(`Tool: ${mode}`); }

function handleCanvasClick(e) {
    if (!currentMode) return;
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (overlay.width / rect.width);
    const y = (e.clientY - rect.top) * (overlay.height / rect.height);

    switch (currentMode) {
        case 'HEAD_TOP': layout.headTop = y; break;
        case 'HEAD_BOT': layout.headBot = y; break;
        case 'TABLE_BOT': layout.tableBot = y; break;
        case 'LEFT': layout.left = x; break;
        case 'RIGHT': layout.right = x; break;
        case 'ROW_1_BOT': layout.row1Bot = y; break;
        case 'DIVIDER': 
            if(layout.left !== null && x < layout.left) return log("Divider must be inside Left Edge", "error");
            if(layout.right !== null && x > layout.right) return log("Divider must be inside Right Edge", "error");
            layout.dividers.push(x); 
            layout.dividers.sort((a,b) => a - b);
            break;
    }
    
    if(rowStrategy === 'auto') detectedRowLines = []; 
    drawOverlay();
    updateColumns();
}

function resetLayout() {
    layout = { headTop: null, headBot: null, tableBot: null, left: null, right: null, dividers: [], row1Bot: null };
    columnNames = []; columnIsDate = []; detectedRowLines = [];
    document.getElementById('colContainer').innerHTML = '';
    drawOverlay();
}

// --- Grid Calculation ---
function calculateFixedGrid() {
    if (!layout.headBot || !layout.tableBot) return [];
    const lines = [];
    const totalH = layout.tableBot - layout.headBot;
    
    if (fixedStrategy === 'height') {
        if (!layout.row1Bot) return [];
        const rowH = layout.row1Bot - layout.headBot;
        if (rowH <= 0) return [];
        let currentY = layout.headBot + rowH;
        while (currentY <= layout.tableBot + 5) {
            lines.push(currentY);
            currentY += rowH;
        }
    } else {
        const count = parseInt(document.getElementById('rowCountInput').value) || 10;
        const rowH = totalH / count;
        for (let i = 1; i <= count; i++) {
            lines.push(layout.headBot + (rowH * i));
        }
    }
    return lines;
}

// --- Visual Overlay ---
function drawOverlay() {
    oCtx.clearRect(0, 0, overlay.width, overlay.height);

    // 1. Columns
    if (layout.headBot && layout.tableBot && layout.left && layout.right) {
        const validDividers = layout.dividers.filter(d => d > layout.left && d < layout.right);
        const boundaries = [layout.left, ...validDividers, layout.right];
        const topY = layout.headBot;
        const height = layout.tableBot - layout.headBot;

        for (let i = 0; i < boundaries.length - 1; i++) {
            const startX = boundaries[i];
            const width = boundaries[i+1] - startX;
            oCtx.fillStyle = CONFIG.columnTints[i % CONFIG.columnTints.length];
            oCtx.fillRect(startX, topY, width, height);
            if(i > 0) drawLine(boundaries[i], false, CONFIG.colors.colDividers, false);
        }
    }

    // 2. Header
    if (layout.headTop && layout.headBot && layout.left && layout.right) {
        oCtx.fillStyle = CONFIG.colors.header;
        oCtx.fillRect(layout.left, layout.headTop, (layout.right - layout.left), (layout.headBot - layout.headTop));
    }

    // 3. Row Lines (Fixed or Auto) + Numbers
    let linesToDraw = [];
    if (rowStrategy === 'fixed') {
        linesToDraw = calculateFixedGrid();
    } else if (detectedRowLines.length > 0) {
        linesToDraw = detectedRowLines;
    }

    if (linesToDraw.length > 0) {
        oCtx.beginPath();
        oCtx.strokeStyle = CONFIG.colors.detectedRows;
        oCtx.lineWidth = 1;
        oCtx.font = "bold 10px sans-serif";
        
        linesToDraw.forEach((y, index) => {
            // Draw Line
            oCtx.moveTo(layout.left, y);
            oCtx.lineTo(layout.right, y);
            
            // Draw Number Label
            // We draw the label slightly above the line on the left
            const rowHeightEstimate = index === 0 ? (y - layout.headBot) : (y - linesToDraw[index-1]);
            const labelY = y - (rowHeightEstimate / 2) + 4; // Centered vertically in row
            
            oCtx.fillStyle = "#22c55e"; // Green text
            oCtx.fillText(`#${index + 1}`, layout.left - 25, labelY);
        });
        oCtx.stroke();
    }

    // 4. Layout Boundaries
    drawLine(layout.headTop, true, CONFIG.colors.headerBorder, "1. Head Top");
    drawLine(layout.headBot, true, CONFIG.colors.headerBorder, "2. Head Bot");
    drawLine(layout.tableBot, true, CONFIG.colors.limitLines, "3. Table Bot");
    drawLine(layout.left, false, CONFIG.colors.limitLines, "4. Left");
    drawLine(layout.right, false, CONFIG.colors.limitLines, "5. Right");
    if(rowStrategy === 'fixed' && fixedStrategy === 'height') {
        drawLine(layout.row1Bot, true, CONFIG.colors.detectedRows, "Row 1 Bot");
    }
}

function drawLine(val, isH, color, text) {
    if (val === null || val === undefined) return;
    oCtx.beginPath();
    oCtx.strokeStyle = color;
    oCtx.lineWidth = 2;
    oCtx.setLineDash(isH ? [] : [5, 5]);
    if (isH) { oCtx.moveTo(0, val); oCtx.lineTo(overlay.width, val); } 
    else { oCtx.moveTo(val, 0); oCtx.lineTo(val, overlay.height); }
    oCtx.stroke();
    if (text) {
        oCtx.fillStyle = color; oCtx.font = 'bold 12px sans-serif';
        oCtx.fillText(text, isH?10:val+5, isH?val-5:20);
    }
}

// --- Data Cleaning ---

function cleanPipeNoise(text) {
    if (!cleanPipes) return text;
    // Removes leading/trailing pipes and spaces
    // e.g. "| 200.00 |" -> "200.00"
    return text.replace(/^[\s|]+|[\s|]+$/g, '');
}

function getYearFromFilename(fn) { 
    const m = fn.match(/(20\d{2})/); 
    return m ? m[0] : new Date().getFullYear(); 
}

function cleanAndFormatDate(txt, yr) {
    if (!txt || txt.length < 3) return txt;

    // 1. Initial aggressive cleanup
    let clean = cleanPipeNoise(txt)
        .replace(/\./g, ' ')
        .trim();

    // 2. Specific Typos for Months (Numbers as letters)
    // 0ct -> Oct, 0ec -> Dec, 1an -> Jan, etc
    clean = clean
        .replace(/0ct/i, 'Oct')
        .replace(/0ec/i, 'Dec')
        .replace(/1an/i, 'Jan')
        .replace(/5ep/i, 'Sep')
        .replace(/Au9/i, 'Aug');

    // 3. Regex Match
    // Matches: "31", "31 ", "31-" followed by "Oct", "0ct" (handled above), "Nov"
    // Also captures attached strings like "30Oct"
    const regex = /(\d{1,2})[\s\-]*([A-Za-z]{3})/i;
    const match = clean.match(regex);

    if (match) {
        const day = match[1].padStart(2, '0'); 
        let monthStr = match[2].toLowerCase();

        const map = { 
            'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06',
            'jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12',
            // Residual typo map if regex caught them
            'ju1':'07', 'jui':'07', 'n0v':'11'
        };

        let mm = map[monthStr];
        if (!mm && map[monthStr.substring(0,3)]) mm = map[monthStr.substring(0,3)];

        if (mm) {
            // Optional: You could check here if 'day' > 31 and try to fix "77" -> "17"
            // but that risks corrupting data. Better to output "77/11/2025" and let user fix.
            return `${day}/${mm}/${yr}`;
        }
    }
    return clean;
}

// --- Processing ---

async function runBatchOCR() {
    if (!layout.tableBot) return log("Set Table Bottom line first.", "error");
    const files = document.getElementById('batchInput').files;
    const btn = document.getElementById('btnProcess');
    btn.disabled = true; btn.textContent = "Processing...";
    
    extractedData = []; 
    document.getElementById('tableBody').innerHTML = '';
    document.getElementById('resultsSection').classList.remove('hidden');
    
    // Header with # column
    document.getElementById('tableHeader').innerHTML = '<th>File</th><th>#</th>' + columnNames.map(c => `<th>${c}</th>`).join('');

    const worker = await Tesseract.createWorker('eng');

    for (let i = 0; i < files.length; i++) {
        log(`Processing ${files[i].name}...`);
        try {
            if (rowStrategy === 'fixed') {
                await processFileFixed(files[i], worker);
            } else {
                await processFileAuto(files[i], worker, i === 0);
            }
        } catch (e) { log(`Error: ${e.message}`, 'error'); }
    }

    await worker.terminate();
    drawOverlay(); // Redraw to show final numbering
    log("Batch finished.", "success");
    btn.disabled = false; btn.textContent = "Run Extraction";
    document.getElementById('btnExport').classList.remove('hidden');
}

// AUTO MODE
async function processFileAuto(file, worker, captureRows) {
    const { cropC, cropY, fileYear } = await prepareCanvas(file);
    const { data: { lines } } = await worker.recognize(cropC);
    
    const bounds = [0, ...layout.dividers.filter(d => d > layout.left && d < layout.right).map(d => d - layout.left), cropC.width];
    
    if (captureRows) detectedRowLines = [];

    lines.forEach(line => {
        let rowData = new Array(columnNames.length).fill('');
        let hasContent = false;
        
        line.words.forEach(word => {
            const mx = (word.bbox.x0 + word.bbox.x1)/2;
            for (let c = 0; c < bounds.length - 1; c++) {
                if (mx >= bounds[c] && mx < bounds[c+1]) {
                    rowData[c] += word.text + ' ';
                    hasContent = true;
                }
            }
        });

        if (hasContent && rowData.join('').length > 3) {
            rowData = rowData.map((t, i) => {
                let txt = cleanPipeNoise(t.trim());
                return columnIsDate[i] ? cleanAndFormatDate(txt, fileYear) : txt;
            });
            // rowId is extractedData.length + 1
            addTableRow(file.name, rowData, extractedData.length + 1);
            if(captureRows) detectedRowLines.push(line.bbox.y1 + cropY);
        }
    });
}

// FIXED MODE
async function processFileFixed(file, worker) {
    const { cropC, cropY, fileYear } = await prepareCanvas(file);
    const gridY = calculateFixedGrid();
    if(gridY.length === 0) throw new Error("Grid undefined");

    const bounds = [0, ...layout.dividers.filter(d => d > layout.left && d < layout.right).map(d => d - layout.left), cropC.width];
    let rowTop = 0; 
    
    for(let i=0; i < gridY.length; i++) {
        const rowBot = gridY[i] - cropY;
        const rowH = rowBot - rowTop;
        
        if (rowH > 5) {
            const strip = document.createElement('canvas');
            strip.width = cropC.width; strip.height = rowH;
            strip.getContext('2d').drawImage(cropC, 0, rowTop, cropC.width, rowH, 0, 0, cropC.width, rowH);

            await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
            const { data: { words } } = await worker.recognize(strip);

            let rowData = new Array(columnNames.length).fill('');
            let hasContent = false;

            words.forEach(wd => {
                const mx = (wd.bbox.x0 + wd.bbox.x1)/2;
                for (let c = 0; c < bounds.length - 1; c++) {
                    if (mx >= bounds[c] && mx < bounds[c+1]) {
                        rowData[c] += wd.text + ' ';
                        hasContent = true;
                    }
                }
            });

            if(hasContent && rowData.join('').length > 2) {
                rowData = rowData.map((t, i) => {
                    let txt = cleanPipeNoise(t.trim());
                    return columnIsDate[i] ? cleanAndFormatDate(txt, fileYear) : txt;
                });
                addTableRow(file.name, rowData, extractedData.length + 1);
            }
        }
        rowTop = rowBot;
    }
}

// Helpers
async function prepareCanvas(file) {
    const buffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument(buffer).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: CONFIG.scale });
    const temp = document.createElement('canvas');
    temp.width = viewport.width; temp.height = viewport.height;
    await page.render({ canvasContext: temp.getContext('2d'), viewport }).promise;

    const cropX = layout.left;
    const cropY = layout.headBot;
    const cropW = layout.right - layout.left;
    const cropH = layout.tableBot - layout.headBot;
    
    const cropC = document.createElement('canvas');
    cropC.width = cropW; cropC.height = cropH;
    cropC.getContext('2d').drawImage(temp, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    return { cropC, cropY, fileYear: getYearFromFilename(file.name) };
}

function addTableRow(fname, data, rowIndex) {
    extractedData.push({ file: fname, data, rowIndex });
    const tr = document.createElement('tr');
    
    // File Name
    tr.innerHTML = `<td style="color:#888;font-size:0.75em">${fname}</td>`;
    
    // Row Index (The new column)
    tr.innerHTML += `<td style="color:#22c55e;font-weight:bold;">${rowIndex}</td>`;
    
    // Data
    tr.innerHTML += data.map(d => `<td>${d}</td>`).join('');
    
    document.getElementById('tableBody').appendChild(tr);
    document.getElementById('rowCount').textContent = `${extractedData.length} rows found`;
}

function exportCSV() {
    if(!extractedData.length) return;
    const data = extractedData.map(row => {
        let obj = { 'Source File': row.file, 'Row #': row.rowIndex };
        columnNames.forEach((c, i) => obj[c] = row.data[i]);
        return obj;
    });
    const blob = new Blob([Papa.unparse(data)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `extraction.csv`;
    a.click();
}

// Initial functions
async function loadTemplate(e) {
    const file = e.target.files[0];
    if (!file) return;
    log(`Loading: ${file.name}`);
    document.getElementById('loadingIndicator').classList.remove('hidden');
    try {
        const buffer = await file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument(buffer).promise;
        await renderPage(1);
        document.getElementById('batchInput').disabled = false;
        document.getElementById('loadingIndicator').classList.add('hidden');
        log('Template loaded.', 'success');
    } catch (err) { log(err.message, 'error'); document.getElementById('loadingIndicator').classList.add('hidden'); }
}

async function renderPage(num) {
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: CONFIG.scale });
    canvas.width = viewport.width; canvas.height = viewport.height;
    overlay.width = viewport.width; overlay.height = viewport.height;
    canvas.style.width = '100%'; canvas.style.height = 'auto';
    overlay.style.width = '100%'; overlay.style.height = 'auto';
    await page.render({ canvasContext: ctx, viewport }).promise;
    drawOverlay();
}

function updateColumns(autoTitles = null) {
    const container = document.getElementById('colContainer');
    container.innerHTML = '';
    if (layout.left === null || layout.right === null) return;
    const validDividers = layout.dividers.filter(d => d > layout.left && d < layout.right);
    const boundaries = [layout.left, ...validDividers, layout.right];
    const colCount = boundaries.length - 1;
    while(columnNames.length < colCount) { columnNames.push(`Col ${columnNames.length + 1}`); columnIsDate.push(false); }
    columnNames = columnNames.slice(0, colCount); columnIsDate = columnIsDate.slice(0, colCount);
    if (autoTitles && autoTitles.length === colCount) { columnNames = autoTitles; columnIsDate = columnNames.map(n => /date|time/i.test(n)); }
    columnNames.forEach((name, i) => {
        const div = document.createElement('div'); div.className = 'column-item';
        div.style.borderLeftColor = CONFIG.columnTints[i % CONFIG.columnTints.length].replace('0.1', '1.0');
        div.innerHTML = `<div class="column-options"><span>#${i+1}</span><input type="text" value="${name}" oninput="columnNames[${i}]=this.value"></div>`;
        const lbl = document.createElement('label'); lbl.className = 'date-toggle';
        lbl.innerHTML = `<input type="checkbox" ${columnIsDate[i] ? 'checked' : ''} onchange="columnIsDate[${i}]=this.checked"> Is Date?`;
        div.appendChild(lbl); container.appendChild(div);
    });
}

async function readHeaderTitles() {
    if (!layout.headTop || !layout.headBot || !layout.left || !layout.right) return log('Set boundaries first.', 'error');
    const btn = document.getElementById('btnReadHeaders');
    const old = btn.textContent; btn.textContent = "Scanning..."; btn.disabled = true;
    try {
        const w = layout.right - layout.left; const h = layout.headBot - layout.headTop;
        const temp = document.createElement('canvas'); temp.width = w; temp.height = h;
        temp.getContext('2d').drawImage(canvas, layout.left, layout.headTop, w, h, 0, 0, w, h);
        const worker = await Tesseract.createWorker('eng');
        const { data: { words } } = await worker.recognize(temp);
        const relDivs = layout.dividers.filter(d => d > layout.left && d < layout.right).map(d => d - layout.left);
        const bounds = [0, ...relDivs, w];
        let titles = new Array(bounds.length - 1).fill('');
        words.forEach(wd => {
            const mx = (wd.bbox.x0 + wd.bbox.x1) / 2;
            for(let i=0; i<bounds.length-1; i++) if (mx >= bounds[i] && mx < bounds[i+1]) titles[i] += wd.text + ' ';
        });
        updateColumns(titles.map(t => t.trim().replace(/\s+/g,' ') || "Untitled"));
        log("Headers updated.", "success");
        await worker.terminate();
    } catch (e) { log(e.message, 'error'); }
    btn.textContent = old; btn.disabled = false;
}