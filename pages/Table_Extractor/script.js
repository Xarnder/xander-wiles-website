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
        'rgba(59, 130, 246, 0.15)', 'rgba(236, 72, 153, 0.15)', 'rgba(34, 197, 94, 0.15)', 
        'rgba(168, 85, 247, 0.15)', 'rgba(249, 115, 22, 0.15)'
    ]
};

// --- State ---
let pdfDoc = null;
let currentMode = null;
let layout = {
    headTop: null, headBot: null, tableBot: null, 
    left: null, right: null, dividers: [], row1Bot: null 
};

let rowStrategy = 'auto'; 
let fixedStrategy = 'height';
let cleanPipes = true;
let inferDates = true; // NEW STATE

let columnNames = [];
let columnIsDate = []; 
let extractedData = [];
let detectedRowLines = []; 
let debugZip = null; 

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
document.getElementById('btnExportZip').addEventListener('click', exportZip);
document.getElementById('btnClear').addEventListener('click', resetLayout);
document.getElementById('btnReadHeaders').addEventListener('click', readHeaderTitles);
document.getElementById('btnShowGuide').addEventListener('click', () => document.getElementById('guideModal').classList.remove('hidden'));
document.getElementById('btnCloseGuide').addEventListener('click', () => document.getElementById('guideModal').classList.add('hidden'));

// Toggles
document.getElementById('chkCleanPipes').addEventListener('change', (e) => { cleanPipes = e.target.checked; log(`Pipe cleaning: ${cleanPipes}`); });
document.getElementById('chkInferDates').addEventListener('change', (e) => { inferDates = e.target.checked; log(`Infer Missing Dates: ${inferDates}`); });

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
            if(layout.left !== null && x < layout.left) return log("Error: Divider outside bounds", "error");
            if(layout.right !== null && x > layout.right) return log("Error: Divider outside bounds", "error");
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

// --- Visuals ---
function paintVisuals(ctx, width, height, rowLines) {
    if (layout.headBot && layout.tableBot && layout.left && layout.right) {
        const validDividers = layout.dividers.filter(d => d > layout.left && d < layout.right);
        const boundaries = [layout.left, ...validDividers, layout.right];
        const topY = layout.headBot;
        const h = layout.tableBot - layout.headBot;
        for (let i = 0; i < boundaries.length - 1; i++) {
            const startX = boundaries[i];
            const w = boundaries[i+1] - startX;
            ctx.fillStyle = CONFIG.columnTints[i % CONFIG.columnTints.length];
            ctx.fillRect(startX, topY, w, h);
            if(i > 0) paintLine(ctx, width, height, boundaries[i], false, CONFIG.colors.colDividers, false);
        }
    }
    if (layout.headTop && layout.headBot && layout.left && layout.right) {
        ctx.fillStyle = CONFIG.colors.header;
        ctx.fillRect(layout.left, layout.headTop, (layout.right - layout.left), (layout.headBot - layout.headTop));
    }
    if (rowLines && rowLines.length > 0) {
        ctx.beginPath(); ctx.strokeStyle = CONFIG.colors.detectedRows; ctx.lineWidth = 1; ctx.font = "bold 12px sans-serif";
        rowLines.forEach((y, index) => {
            ctx.moveTo(layout.left, y); ctx.lineTo(layout.right, y);
            const rowHeightEstimate = index === 0 ? (y - layout.headBot) : (y - rowLines[index-1]);
            const labelY = y - (rowHeightEstimate / 2) + 4;
            ctx.fillStyle = "#006400"; ctx.fillText(`#${index + 1}`, layout.left - 30, labelY);
            ctx.strokeStyle = "white"; ctx.lineWidth = 0.5; ctx.strokeText(`#${index + 1}`, layout.left - 30, labelY);
        });
        ctx.stroke();
    }
    paintLine(ctx, width, height, layout.headTop, true, CONFIG.colors.headerBorder, "Head Top");
    paintLine(ctx, width, height, layout.headBot, true, CONFIG.colors.headerBorder, "Head Bot");
    paintLine(ctx, width, height, layout.tableBot, true, CONFIG.colors.limitLines, "Table Bot");
    paintLine(ctx, width, height, layout.left, false, CONFIG.colors.limitLines, "Left");
    paintLine(ctx, width, height, layout.right, false, CONFIG.colors.limitLines, "Right");
}

function paintLine(ctx, w, h, val, isH, color, text) {
    if (val === null || val === undefined) return;
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(isH ? [] : [5, 5]);
    if (isH) { ctx.moveTo(0, val); ctx.lineTo(w, val); } else { ctx.moveTo(val, 0); ctx.lineTo(val, h); }
    ctx.stroke();
    if (text) { ctx.fillStyle = color; ctx.font = 'bold 12px sans-serif'; ctx.fillText(text, isH?10:val+5, isH?val-5:20); }
}

function drawOverlay() {
    oCtx.clearRect(0, 0, overlay.width, overlay.height);
    let lines = [];
    if (rowStrategy === 'fixed') lines = calculateFixedGrid();
    else if (detectedRowLines.length > 0) lines = detectedRowLines;
    paintVisuals(oCtx, overlay.width, overlay.height, lines);
}

// --- Processing ---

async function runBatchOCR() {
    if (!layout.tableBot) return log("Set Table Bottom line first.", "error");
    const files = document.getElementById('batchInput').files;
    const btn = document.getElementById('btnProcess');
    btn.disabled = true; btn.textContent = "Processing...";
    
    extractedData = []; 
    debugZip = new JSZip();

    document.getElementById('tableBody').innerHTML = '';
    document.getElementById('resultsSection').classList.remove('hidden');
    
    // NEW: Added "Date Source" column
    document.getElementById('tableHeader').innerHTML = '<th>File</th><th>Global #</th><th>Doc #</th><th>Date Source</th>' + columnNames.map(c => `<th>${c}</th>`).join('');

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
    drawOverlay(); 
    log("Batch finished.", "success");
    btn.disabled = false; btn.textContent = "Run Extraction";
    document.getElementById('btnExport').classList.remove('hidden');
    document.getElementById('btnExportZip').classList.remove('hidden');
}

// --- Helper: Date Inference & Cleaning Logic ---
// Returns: { processedRow: [], status: "Extracted" | "Inferred" | "-" }
function inferRowDates(rowData, fileYear, lastValidDate) {
    let dateStatus = "-";
    let foundDateInRow = false;

    const processedRow = rowData.map((t, i) => {
        let txt = cleanPipeNoise(t.trim()); // Apply pipe clean
        
        if (columnIsDate[i]) {
            // Try to extract date
            let fmtDate = cleanAndFormatDate(txt, fileYear);
            
            // Check if it's a valid date string (simple check: contains / or is long enough)
            if (fmtDate.length >= 8 && fmtDate.includes('/')) {
                lastValidDate = fmtDate; // Update memory
                dateStatus = "Extracted";
                foundDateInRow = true;
                return fmtDate;
            } 
            else if (inferDates && lastValidDate) {
                // No date found, but we have memory -> Infer it
                return lastValidDate;
            }
        }
        return txt;
    });

    // If we inserted a date from memory, and didn't find a new one
    if (!foundDateInRow && inferDates && lastValidDate) {
        dateStatus = "Inferred";
    }

    return { processedRow, lastValidDate, dateStatus };
}

// AUTO MODE
async function processFileAuto(file, worker, captureRows) {
    const { cropC, cropY, fileYear, fullCanvas } = await prepareCanvas(file);
    const { data: { lines } } = await worker.recognize(cropC);
    
    const bounds = [0, ...layout.dividers.filter(d => d > layout.left && d < layout.right).map(d => d - layout.left), cropC.width];
    
    let localRows = [];
    let localLinesY = [];
    let lastValidDate = null; // Reset per file

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
            // Process dates
            const result = inferRowDates(rowData, fileYear, lastValidDate);
            lastValidDate = result.lastValidDate;

            localRows.push(result.processedRow);
            const localIdx = localRows.length;
            const globalIdx = extractedData.length + 1;
            
            addTableRow(file.name, result.processedRow, globalIdx, localIdx, result.dateStatus);
            localLinesY.push(line.bbox.y1 + cropY);
        }
    });

    if(captureRows) detectedRowLines = localLinesY;
    await generateDebugImage(fullCanvas, file.name, localLinesY);
}

// FIXED MODE
async function processFileFixed(file, worker) {
    const { cropC, cropY, fileYear, fullCanvas } = await prepareCanvas(file);
    const gridY = calculateFixedGrid();
    if(gridY.length === 0) throw new Error("Grid undefined");

    const bounds = [0, ...layout.dividers.filter(d => d > layout.left && d < layout.right).map(d => d - layout.left), cropC.width];
    let rowTop = 0; 
    let localRows = 0;
    let lastValidDate = null; // Reset per file
    
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
                // Process dates
                const result = inferRowDates(rowData, fileYear, lastValidDate);
                lastValidDate = result.lastValidDate;

                localRows++;
                const globalIdx = extractedData.length + 1;
                addTableRow(file.name, result.processedRow, globalIdx, localRows, result.dateStatus);
            }
        }
        rowTop = rowBot;
    }

    await generateDebugImage(fullCanvas, file.name, gridY);
}

// --- Image Export Logic ---
async function generateDebugImage(canvasRef, filename, rowLines) {
    if(!debugZip) return;
    const ctx = canvasRef.getContext('2d');
    paintVisuals(ctx, canvasRef.width, canvasRef.height, rowLines);
    return new Promise((resolve) => {
        canvasRef.toBlob((blob) => {
            if(blob) {
                const imgName = filename.replace(/\.pdf$/i, '') + "_debug.jpg";
                debugZip.file(imgName, blob);
            }
            resolve();
        }, 'image/jpeg', 0.8);
    });
}

function exportZip() {
    if(!debugZip) return;
    const btn = document.getElementById('btnExportZip');
    btn.textContent = "Zipping...";
    debugZip.generateAsync({type:"blob"}).then(function(content) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = "debug_images.zip";
        a.click();
        btn.textContent = "Debug ZIP";
    });
}

// --- Helpers ---
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
    return { cropC, cropY, fileYear: getYearFromFilename(file.name), fullCanvas: temp };
}

function addTableRow(fname, data, globalIdx, localIdx, dateStatus) {
    // Add dateStatus to stored data for CSV export
    extractedData.push({ file: fname, data, globalIdx, localIdx, dateStatus });
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="color:#888;font-size:0.75em">${fname}</td>`;
    tr.innerHTML += `<td>${globalIdx}</td>`; 
    tr.innerHTML += `<td style="color:#22c55e;font-weight:bold;">${localIdx}</td>`; 
    
    // Status Badge
    let statusColor = dateStatus === "Extracted" ? "#3b82f6" : (dateStatus === "Inferred" ? "#f59e0b" : "#64748b");
    tr.innerHTML += `<td style="color:${statusColor}; font-size:0.8em;">${dateStatus}</td>`;

    tr.innerHTML += data.map(d => `<td>${d}</td>`).join('');
    document.getElementById('tableBody').appendChild(tr);
    document.getElementById('rowCount').textContent = `${extractedData.length} rows found`;
}

function exportCSV() {
    if(!extractedData.length) return;
    const data = extractedData.map(row => {
        let obj = { 
            'Source File': row.file, 
            'Global #': row.globalIdx, 
            'Doc #': row.localIdx,
            'Date Source': row.dateStatus 
        };
        columnNames.forEach((c, i) => obj[c] = row.data[i]);
        return obj;
    });
    const blob = new Blob([Papa.unparse(data)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `extraction.csv`;
    a.click();
}

// Data Cleaning
function cleanPipeNoise(text) {
    if (!cleanPipes) return text;
    // Remove leading/trailing pipes, spaces, and OCR noise like 'I' if it looks like a pipe
    return text.replace(/^[\s|I]+|[\s|I]+$/g, '');
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
    return ""; // Return empty if not a valid date, allows inference logic to work
}

// Standard Loaders
async function loadTemplate(e) {
    const file = e.target.files[0]; if (!file) return;
    log(`Loading: ${file.name}`); document.getElementById('loadingIndicator').classList.remove('hidden');
    try {
        const buffer = await file.arrayBuffer(); pdfDoc = await pdfjsLib.getDocument(buffer).promise;
        await renderPage(1); document.getElementById('batchInput').disabled = false;
        document.getElementById('loadingIndicator').classList.add('hidden'); log('Template loaded.', 'success');
    } catch (err) { log(err.message, 'error'); document.getElementById('loadingIndicator').classList.add('hidden'); }
}
async function renderPage(num) {
    const page = await pdfDoc.getPage(num); const viewport = page.getViewport({ scale: CONFIG.scale });
    canvas.width = viewport.width; canvas.height = viewport.height;
    overlay.width = viewport.width; overlay.height = viewport.height;
    canvas.style.width = '100%'; canvas.style.height = 'auto';
    overlay.style.width = '100%'; overlay.style.height = 'auto';
    await page.render({ canvasContext: ctx, viewport }).promise; drawOverlay();
}
function updateColumns(autoTitles = null) {
    const container = document.getElementById('colContainer'); container.innerHTML = '';
    if (layout.left === null || layout.right === null) return;
    const validDividers = layout.dividers.filter(d => d > layout.left && d < layout.right);
    const boundaries = [layout.left, ...validDividers, layout.right];
    const colCount = boundaries.length - 1;
    while(columnNames.length < colCount) { columnNames.push(`Col ${columnNames.length + 1}`); columnIsDate.push(false); }
    columnNames = columnNames.slice(0, colCount); columnIsDate = columnIsDate.slice(0, colCount);
    if (autoTitles && autoTitles.length === colCount) { columnNames = autoTitles; columnIsDate = columnNames.map(n => /date|time/i.test(n)); }
    columnNames.forEach((name, i) => {
        const div = document.createElement('div'); div.className = 'column-item';
        div.style.borderLeftColor = CONFIG.columnTints[i % CONFIG.columnTints.length].replace('0.15', '1.0');
        div.innerHTML = `<div class="column-options"><span>#${i+1}</span><input type="text" value="${name}" oninput="columnNames[${i}]=this.value"></div>`;
        const lbl = document.createElement('label'); lbl.className = 'date-toggle';
        lbl.innerHTML = `<input type="checkbox" ${columnIsDate[i] ? 'checked' : ''} onchange="columnIsDate[${i}]=this.checked"> Is Date?`;
        div.appendChild(lbl); container.appendChild(div);
    });
}
async function readHeaderTitles() {
    if (!layout.headTop || !layout.headBot || !layout.left || !layout.right) return log('Set boundaries first.', 'error');
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
        // Added pipe cleaning to headers
        updateColumns(titles.map(t => cleanPipeNoise(t).trim().replace(/\s+/g,' ') || "Untitled"));
        log("Headers updated.", "success"); await worker.terminate();
    } catch (e) { log(e.message, 'error'); }
    btn.textContent = old; btn.disabled = false;
}