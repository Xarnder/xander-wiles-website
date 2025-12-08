// --- Configuration ---
const CONFIG = {
    scale: 2.5, // High resolution for OCR
    colors: {
        header: 'rgba(210, 153, 34, 0.15)',
        data: 'rgba(35, 134, 54, 0.15)',
        lineH: '#d29922',
        lineV: '#58a6ff',
        lineLimit: '#da3633'
    }
};

// --- State ---
let pdfDoc = null;
let currentMode = null; 
let layout = {
    headTop: null, headBot: null, tableBot: null, 
    left: null, right: null, dividers: []
};
let columnNames = [];
let columnIsDate = []; // Stores boolean for each column
let extractedData = [];

// --- Elements ---
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlayCanvas');
const oCtx = overlay.getContext('2d');
const consoleDiv = document.getElementById('debugConsole');

// --- Initialization ---
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// --- Logging ---
function log(msg, type = 'info') {
    const color = type === 'error' ? '#ff7b72' : (type === 'success' ? '#3fb950' : '#8b949e');
    const div = document.createElement('div');
    div.style.color = color;
    div.textContent = `> ${msg}`;
    consoleDiv.appendChild(div);
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

// --- Event Listeners ---
document.getElementById('templateInput').addEventListener('change', loadTemplate);
document.getElementById('batchInput').addEventListener('change', (e) => {
    if(e.target.files.length) document.getElementById('btnProcess').disabled = false;
});
document.getElementById('btnProcess').addEventListener('click', runBatchOCR);
document.getElementById('btnExport').addEventListener('click', exportCSV);
document.getElementById('btnClear').addEventListener('click', resetLayout);
document.getElementById('btnReadHeaders').addEventListener('click', readHeaderTitles);

const modes = {
    'btnHeadTop': 'HEAD_TOP', 'btnHeadBot': 'HEAD_BOT', 'btnTableBot': 'TABLE_BOT',
    'btnTableLeft': 'LEFT', 'btnTableRight': 'RIGHT', 'btnColDiv': 'DIVIDER'
};

Object.keys(modes).forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
        setMode(modes[id]);
        document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
    });
});

overlay.addEventListener('mousedown', handleCanvasClick);

// --- PDF Loading ---
async function loadTemplate(e) {
    const file = e.target.files[0];
    if (!file) return;
    log(`Loading template: ${file.name}`);
    try {
        const buffer = await file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument(buffer).promise;
        await renderPage(1);
        document.getElementById('batchInput').disabled = false;
    } catch (err) { log(err.message, 'error'); }
}

async function renderPage(num) {
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: CONFIG.scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    overlay.width = viewport.width;
    overlay.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    drawOverlay();
}

// --- Layout Logic ---
function setMode(mode) { currentMode = mode; log(`Mode: ${mode}`); }

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
        case 'DIVIDER': 
            layout.dividers.push(x); 
            layout.dividers.sort((a,b) => a - b);
            break;
    }
    drawOverlay();
    updateColumns();
}

function resetLayout() {
    layout = { headTop: null, headBot: null, tableBot: null, left: null, right: null, dividers: [] };
    columnNames = [];
    columnIsDate = [];
    document.getElementById('colContainer').innerHTML = '';
    drawOverlay();
    log('Layout reset.');
}

// --- Column UI with Date Toggles ---
function updateColumns(autoTitles = null) {
    const container = document.getElementById('colContainer');
    container.innerHTML = '';

    if (layout.left === null || layout.right === null) {
        container.innerHTML = '<em style="color:#666">Set Left and Right edges first.</em>';
        return;
    }

    const validDividers = layout.dividers.filter(d => d > layout.left && d < layout.right);
    const boundaries = [layout.left, ...validDividers, layout.right];
    const colCount = boundaries.length - 1;

    // Resize arrays
    while(columnNames.length < colCount) {
        columnNames.push(`Column ${columnNames.length + 1}`);
        columnIsDate.push(false);
    }
    columnNames = columnNames.slice(0, colCount);
    columnIsDate = columnIsDate.slice(0, colCount);

    if (autoTitles && autoTitles.length === colCount) {
        columnNames = autoTitles;
        // Simple auto-detect: if title contains "Date", set flag
        columnIsDate = columnNames.map(n => n.toLowerCase().includes('date'));
    }

    columnNames.forEach((name, i) => {
        const div = document.createElement('div');
        div.className = 'column-item';
        
        // Input Wrapper
        const opts = document.createElement('div');
        opts.className = 'column-options';

        const span = document.createElement('span');
        span.textContent = i + 1;

        const input = document.createElement('input');
        input.value = name;
        input.oninput = (e) => columnNames[i] = e.target.value;

        // Date Toggle
        const label = document.createElement('label');
        label.className = 'date-toggle';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = columnIsDate[i];
        check.onchange = (e) => columnIsDate[i] = e.target.checked;
        
        label.appendChild(check);
        label.appendChild(document.createTextNode('Is Date?'));

        opts.appendChild(span);
        opts.appendChild(input);
        
        div.appendChild(opts);
        div.appendChild(label); // Date toggle below or beside
        
        container.appendChild(div);
    });
}

function drawOverlay() {
    oCtx.clearRect(0, 0, overlay.width, overlay.height);
    const w = overlay.width;
    const h = overlay.height;

    // Zones
    if (layout.headTop && layout.headBot) {
        oCtx.fillStyle = CONFIG.colors.header;
        oCtx.fillRect(0, layout.headTop, w, layout.headBot - layout.headTop);
    }
    if (layout.headBot && layout.tableBot) {
        oCtx.fillStyle = CONFIG.colors.data;
        oCtx.fillRect(0, layout.headBot, w, layout.tableBot - layout.headBot);
    }

    // Helper
    const line = (val, isH, color, text) => {
        if (val === null) return;
        oCtx.beginPath();
        oCtx.strokeStyle = color;
        oCtx.lineWidth = 2;
        oCtx.setLineDash(isH ? [] : [5, 5]);
        if (isH) { oCtx.moveTo(0, val); oCtx.lineTo(w, val); } 
        else { oCtx.moveTo(val, 0); oCtx.lineTo(val, h); }
        oCtx.stroke();
        oCtx.fillStyle = '#fff';
        oCtx.font = '12px sans-serif';
        oCtx.fillText(text, isH?10:val+5, isH?val-5:20);
    };

    line(layout.headTop, true, CONFIG.colors.lineH, "Header Top");
    line(layout.headBot, true, CONFIG.colors.lineH, "Header Bottom");
    line(layout.tableBot, true, CONFIG.colors.lineLimit, "Table Bottom");
    line(layout.left, false, CONFIG.colors.lineV, "Left");
    line(layout.right, false, CONFIG.colors.lineV, "Right");
    layout.dividers.forEach((x, i) => line(x, false, CONFIG.colors.lineV, `Div ${i+1}`));
}

// --- Date Processing Logic ---

function getYearFromFilename(filename) {
    // Looks for 4 digits starting with 20 (e.g. 2023, 2024)
    const match = filename.match(/(20\d{2})/);
    return match ? match[0] : new Date().getFullYear(); // Default to current if not found
}

function cleanAndFormatDate(rawText, year) {
    if (!rawText || rawText.length < 3) return rawText;

    // 1. Aggressive OCR Cleaning for Dates
    let clean = rawText
        .replace(/O|o/g, '0') // O to 0
        .replace(/l|I|i/g, '1') // l/I to 1
        .replace(/T/g, '1') // T often matches 1 (e.g. T7Sep -> 17Sep)
        .replace(/S/g, '5') // S sometimes 5, but be careful with Sep
        .replace(/\./g, '') // remove dots
        .trim();

    // 2. Fix specific month issues (Zero-ct -> Oct)
    clean = clean.replace(/0ct/i, 'Oct').replace(/0ec/i, 'Dec');
    
    // 3. Extract Day and Month
    // Regex looks for: 1 or 2 digits, optional space, 3 letters
    const dateMatch = clean.match(/(\d{1,2})\s*([A-Za-z]{3})/);

    if (dateMatch) {
        let day = dateMatch[1].padStart(2, '0'); // Ensure 01, 02
        let monthStr = dateMatch[2].toLowerCase();
        
        // Month Map
        const months = {
            'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
            'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
        };

        const month = months[monthStr];
        if (month) {
            return `${day}/${month}/${year}`;
        }
    }

    // Return original if parsing failed (so we don't lose data)
    return rawText;
}

// --- Helper: Crop ---
function getCroppedCanvas(source, x, y, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(source, x, y, w, h, 0, 0, w, h);
    return c;
}

// --- Header Auto-Read ---
async function readHeaderTitles() {
    if (!layout.headTop || !layout.headBot) { log('Set layout first.', 'error'); return; }
    
    const btn = document.getElementById('btnReadHeaders');
    btn.textContent = "Scanning..."; btn.disabled = true;

    try {
        const w = layout.right - layout.left;
        const h = layout.headBot - layout.headTop;
        const crop = getCroppedCanvas(canvas, layout.left, layout.headTop, w, h);
        
        const worker = await Tesseract.createWorker('eng');
        const { data: { lines } } = await worker.recognize(crop);
        
        const relativeDividers = layout.dividers
            .filter(d => d > layout.left && d < layout.right)
            .map(d => d - layout.left);
        const boundaries = [0, ...relativeDividers, w];

        let titles = new Array(boundaries.length - 1).fill('');
        lines.forEach(l => l.words.forEach(wd => {
            const mx = (wd.bbox.x0 + wd.bbox.x1)/2;
            for(let i=0; i<boundaries.length-1; i++) {
                if(mx >= boundaries[i] && mx < boundaries[i+1]) titles[i] += wd.text + ' ';
            }
        }));

        updateColumns(titles.map(t => t.trim() || "Untitled"));
        await worker.terminate();
        log('Headers detected.', 'success');
    } catch(e) { log(e.message, 'error'); }
    btn.textContent = "✨ Auto-Read Headers"; btn.disabled = false;
}

// --- Batch Process ---
async function runBatchOCR() {
    if (!layout.tableBot) { log("Set layout first.", "error"); return; }
    
    const files = document.getElementById('batchInput').files;
    const btn = document.getElementById('btnProcess');
    btn.disabled = true; btn.textContent = "Processing...";
    
    extractedData = [];
    document.getElementById('tableBody').innerHTML = '';
    document.getElementById('resultsSection').classList.remove('hidden');

    // Header Row
    const tr = document.getElementById('tableHeader');
    tr.innerHTML = '<th>File</th>' + columnNames.map(c => `<th>${c}</th>`).join('');

    const worker = await Tesseract.createWorker('eng');

    for (let i = 0; i < files.length; i++) {
        log(`Processing ${files[i].name}...`);
        try {
            await processFile(files[i], worker);
        } catch (e) { log(`Error: ${e.message}`, 'error'); }
    }

    await worker.terminate();
    log("Done!", "success");
    btn.disabled = false; btn.textContent = "Run Extraction";
    document.getElementById('btnExport').classList.remove('hidden');
}

async function processFile(file, worker) {
    const buffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument(buffer).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: CONFIG.scale });

    const temp = document.createElement('canvas');
    temp.width = viewport.width; temp.height = viewport.height;
    await page.render({ canvasContext: temp.getContext('2d'), viewport }).promise;

    const w = layout.right - layout.left;
    const h = layout.tableBot - layout.headBot;
    const crop = getCroppedCanvas(temp, layout.left, layout.headBot, w, h);

    const { data: { lines } } = await worker.recognize(crop);

    const relativeDividers = layout.dividers
        .filter(d => d > layout.left && d < layout.right)
        .map(d => d - layout.left);
    const boundaries = [0, ...relativeDividers, w];

    // Extract Year from Filename
    const fileYear = getYearFromFilename(file.name);

    lines.forEach(line => {
        let rowData = new Array(columnNames.length).fill('');
        let hasContent = false;

        line.words.forEach(word => {
            const mx = (word.bbox.x0 + word.bbox.x1)/2;
            for (let c = 0; c < boundaries.length - 1; c++) {
                if (mx >= boundaries[c] && mx < boundaries[c+1]) {
                    rowData[c] += word.text + ' ';
                    hasContent = true;
                }
            }
        });

        if (hasContent) {
            rowData = rowData.map((cell, index) => {
                let text = cell.trim();
                // If this column is marked as DATE, clean it
                if (columnIsDate[index]) {
                    return cleanAndFormatDate(text, fileYear);
                }
                return text;
            });

            // Filter out empty rows or pure noise
            if(rowData.join('').length > 2) {
                addTableRow(file.name, rowData);
            }
        }
    });
}

function addTableRow(fname, data) {
    extractedData.push({ file: fname, data });
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${fname}</td>` + data.map(d => `<td>${d}</td>`).join('');
    document.getElementById('tableBody').appendChild(tr);
    document.getElementById('rowCount').textContent = `${extractedData.length} rows`;
}

function exportCSV() {
    if(!extractedData.length) return;
    const data = extractedData.map(row => {
        let obj = { 'Source File': row.file };
        columnNames.forEach((c, i) => obj[c] = row.data[i]);
        return obj;
    });
    const blob = new Blob([Papa.unparse(data)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'extracted_statements.csv';
    a.click();
}