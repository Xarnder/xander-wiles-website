// --- Configuration ---
const CONFIG = {
    scale: 2.5, // Increased scale for better accuracy
    colors: {
        header: 'rgba(210, 153, 34, 0.15)', // Orange tint
        data: 'rgba(35, 134, 54, 0.15)',   // Green tint
        lineH: '#d29922',
        lineV: '#58a6ff',
        lineLimit: '#da3633'
    }
};

// --- State ---
let pdfDoc = null;
let currentMode = null; 
let layout = {
    headTop: null,    
    headBot: null,    
    tableBot: null,   
    left: null,       
    right: null,      
    dividers: []      
};
let columnNames = [];
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

// Mode Buttons
const modes = {
    'btnHeadTop': 'HEAD_TOP',
    'btnHeadBot': 'HEAD_BOT',
    'btnTableBot': 'TABLE_BOT',
    'btnTableLeft': 'LEFT',
    'btnTableRight': 'RIGHT',
    'btnColDiv': 'DIVIDER'
};

Object.keys(modes).forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
        setMode(modes[id]);
        document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
    });
});

overlay.addEventListener('mousedown', handleCanvasClick);

// --- PDF Handling ---
async function loadTemplate(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    log(`Loading template: ${file.name}`);
    try {
        const buffer = await file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument(buffer).promise;
        await renderPage(1);
        document.getElementById('batchInput').disabled = false;
    } catch (err) {
        log(err.message, 'error');
    }
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
function setMode(mode) {
    currentMode = mode;
    log(`Mode set: ${mode}`);
}

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
    document.getElementById('colContainer').innerHTML = '';
    drawOverlay();
    log('Layout reset.');
}

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

    // Initialize array if empty
    while(columnNames.length < colCount) columnNames.push(`Column ${columnNames.length + 1}`);
    columnNames = columnNames.slice(0, colCount);

    // Apply auto-titles if provided
    if (autoTitles && autoTitles.length === colCount) {
        columnNames = autoTitles;
    }

    columnNames.forEach((name, i) => {
        const div = document.createElement('div');
        div.className = 'column-item';
        div.innerHTML = `<span>${i+1}</span>`;
        
        const input = document.createElement('input');
        input.value = name;
        input.oninput = (e) => columnNames[i] = e.target.value;
        
        div.appendChild(input);
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

    // Lines
    const drawLine = (val, isH, color, text) => {
        if (val === null) return;
        oCtx.beginPath();
        oCtx.strokeStyle = color;
        oCtx.lineWidth = 2;
        oCtx.setLineDash(isH ? [] : [5, 5]);
        if (isH) {
            oCtx.moveTo(0, val); oCtx.lineTo(w, val);
        } else {
            oCtx.moveTo(val, 0); oCtx.lineTo(val, h);
        }
        oCtx.stroke();
        
        oCtx.fillStyle = '#fff';
        oCtx.font = '12px sans-serif';
        oCtx.fillText(text, isH ? 10 : val + 5, isH ? val - 5 : 20);
    };

    drawLine(layout.headTop, true, CONFIG.colors.lineH, "Header Top");
    drawLine(layout.headBot, true, CONFIG.colors.lineH, "Header Bottom");
    drawLine(layout.tableBot, true, CONFIG.colors.lineLimit, "Table Bottom");
    drawLine(layout.left, false, CONFIG.colors.lineV, "Left");
    drawLine(layout.right, false, CONFIG.colors.lineV, "Right");
    
    layout.dividers.forEach((x, i) => drawLine(x, false, CONFIG.colors.lineV, `Div ${i+1}`));
}

// --- Helper: Manual Crop ---
// This guarantees coordinates start at 0,0 relative to the section of interest
function getCroppedCanvas(sourceCanvas, x, y, width, height) {
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const ctx = output.getContext('2d');
    // Draw only the slice we want
    ctx.drawImage(sourceCanvas, x, y, width, height, 0, 0, width, height);
    return output;
}

// --- Header Auto-Read Logic ---

async function readHeaderTitles() {
    if (!layout.headTop || !layout.headBot || !layout.left || !layout.right) {
        log('Set Header Top, Bottom, Left, and Right lines first.', 'error');
        return;
    }

    const btn = document.getElementById('btnReadHeaders');
    const origText = btn.textContent;
    btn.textContent = "Scanning...";
    btn.disabled = true;

    try {
        const width = layout.right - layout.left;
        const height = layout.headBot - layout.headTop;

        // Manually crop the header strip
        const crop = getCroppedCanvas(canvas, layout.left, layout.headTop, width, height);

        const worker = await Tesseract.createWorker('eng');
        const { data: { lines } } = await worker.recognize(crop); // Send cropped image

        // Boundaries are now relative to the crop (0 is Left Line)
        const relativeDividers = layout.dividers
            .filter(d => d > layout.left && d < layout.right)
            .map(d => d - layout.left);
            
        const boundaries = [0, ...relativeDividers, width];
        
        let titles = new Array(boundaries.length - 1).fill('');

        lines.forEach(line => {
            line.words.forEach(word => {
                const midX = (word.bbox.x0 + word.bbox.x1) / 2;
                for (let i = 0; i < boundaries.length - 1; i++) {
                    if (midX >= boundaries[i] && midX < boundaries[i+1]) {
                        titles[i] += word.text + ' ';
                    }
                }
            });
        });

        titles = titles.map(t => t.trim() || "Untitled");
        log(`Headers detected: ${titles.join(', ')}`, 'success');
        updateColumns(titles);
        await worker.terminate();

    } catch (e) {
        log(`Header Read Error: ${e.message}`, 'error');
    }

    btn.textContent = origText;
    btn.disabled = false;
}

// --- Batch OCR Process ---
async function runBatchOCR() {
    if (!layout.headBot || !layout.tableBot || !layout.left || !layout.right) {
        log("Missing boundaries! Please set Header Bottom, Table Bottom, Left, and Right.", "error");
        return;
    }

    const files = document.getElementById('batchInput').files;
    const btn = document.getElementById('btnProcess');
    
    btn.disabled = true;
    btn.textContent = "Processing...";
    extractedData = [];
    document.getElementById('tableBody').innerHTML = '';
    document.getElementById('resultsSection').classList.remove('hidden');

    // Build Table Header
    const thead = document.getElementById('tableHeader');
    thead.innerHTML = '<th>File</th>' + columnNames.map(c => `<th>${c}</th>`).join('');

    const worker = await Tesseract.createWorker('eng');

    for (let i = 0; i < files.length; i++) {
        log(`Processing ${files[i].name} (${i+1}/${files.length})...`);
        try {
            await processFile(files[i], worker);
        } catch (e) {
            log(`Error in ${files[i].name}: ${e.message}`, 'error');
        }
    }

    await worker.terminate();
    log("Batch processing finished.", "success");
    btn.disabled = false;
    btn.textContent = "Run Extraction";
    document.getElementById('btnExport').classList.remove('hidden');
}

async function processFile(file, worker) {
    const buffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument(buffer).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: CONFIG.scale });

    // 1. Render Full Page to Canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = viewport.width;
    tempCanvas.height = viewport.height;
    await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport }).promise;

    // 2. Prepare Calculation Variables
    const cropWidth = layout.right - layout.left;
    const cropHeight = layout.tableBot - layout.headBot;

    // 3. Manually Crop the Data Zone
    // This creates a new image where X=0 is exactly your Left Line
    const crop = getCroppedCanvas(tempCanvas, layout.left, layout.headBot, cropWidth, cropHeight);

    // 4. OCR the Cropped Image
    // Note: Do NOT use rectangle parameter here, we already cropped it.
    const { data: { lines } } = await worker.recognize(crop);

    // 5. Calculate Boundaries relative to the crop
    // (0 is Left Line, cropWidth is Right Line)
    const relativeDividers = layout.dividers
        .filter(d => d > layout.left && d < layout.right)
        .map(d => d - layout.left);

    const boundaries = [0, ...relativeDividers, cropWidth];

    // 6. Sort Text into Columns
    lines.forEach(line => {
        let rowData = new Array(columnNames.length).fill('');
        let hasContent = false;

        line.words.forEach(word => {
            // word.bbox is now perfectly relative to our column boundaries
            const midX = (word.bbox.x0 + word.bbox.x1) / 2;

            for (let c = 0; c < boundaries.length - 1; c++) {
                if (midX >= boundaries[c] && midX < boundaries[c+1]) {
                    // Simple concatenation, no formatting
                    rowData[c] += word.text + ' ';
                    hasContent = true;
                }
            }
        });

        // 7. Filter empty rows (noise)
        if (hasContent) {
            rowData = rowData.map(s => s.trim());
            // Only add row if it has some substantial data (length > 0)
            if(rowData.some(cell => cell.length > 0)) {
                addTableRow(file.name, rowData);
            }
        }
    });
}

function addTableRow(filename, data) {
    extractedData.push({ file: filename, data });
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${filename}</td>` + data.map(d => `<td>${d}</td>`).join('');
    document.getElementById('tableBody').appendChild(tr);
    document.getElementById('rowCount').textContent = `${extractedData.length} rows found`;
}

function exportCSV() {
    if(!extractedData.length) return;
    
    const csvData = extractedData.map(row => {
        let obj = { 'Source File': row.file };
        columnNames.forEach((col, i) => obj[col] = row.data[i]);
        return obj;
    });

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'statement_data.csv';
    a.click();
}