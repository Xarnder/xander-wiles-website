// Configuration
const CONFIG = {
    scale: 1.5, // Viewport scale for rendering
};

// Global State
let pdfDoc = null;
let pdfBytes = null;
let fileName = "";
let currentPage = 1;
let totalPages = 0;
let pageStatus = []; // Array storing status: 'KEEP' (default) or 'CULL'

// DOM Elements
const els = {
    input: document.getElementById('pdfInput'),
    fileName: document.getElementById('fileName'),
    canvas: document.getElementById('theCanvas'),
    ctx: document.getElementById('theCanvas').getContext('2d'),
    actionSection: document.getElementById('actionSection'),
    overlay: document.getElementById('cullOverlay'),
    intro: document.getElementById('introMessage'),

    // Stats
    cntKept: document.getElementById('countKept'),
    cntCulled: document.getElementById('countCulled'),
    cntRem: document.getElementById('countRemaining'),
    indicator: document.getElementById('pageIndicator'),

    // Controls
    btnKeep: document.getElementById('btnKeep'),
    btnCull: document.getElementById('btnCull'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnDownload: document.getElementById('btnDownload'),
    autoAdvance: document.getElementById('chkAutoAdvance')
};

// --- Initialization ---

// Set PDF.js Worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
} else {
    console.error("PDF.js library not loaded.");
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    els.input.addEventListener('change', handleFileUpload);

    // Buttons
    els.btnPrev.addEventListener('click', () => changePage(-1));
    els.btnNext.addEventListener('click', () => changePage(1));
    els.btnKeep.addEventListener('click', () => markCurrentPage('KEEP'));
    els.btnCull.addEventListener('click', () => markCurrentPage('CULL'));
    els.btnDownload.addEventListener('click', downloadFinalPdf);

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (!pdfDoc) return;
        switch (e.key) {
            case "ArrowLeft": changePage(-1); break;
            case "ArrowRight": changePage(1); break;
            case "k": case "K": markCurrentPage('KEEP'); break;
            case "x": case "X": case "c": case "C": markCurrentPage('CULL'); break;
        }
    });
});

// --- Core Functions ---

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        console.log(`Loading file: ${file.name}`);
        els.fileName.textContent = file.name;
        fileName = file.name;

        // Read file
        const buffer = await file.arrayBuffer();
        pdfBytes = buffer.slice(0); // Clone buffer for pdf-lib as pdfjsLib may detach the original
        pdfDoc = await pdfjsLib.getDocument(buffer).promise;

        // Reset State
        totalPages = pdfDoc.numPages;
        currentPage = 1;
        // Initialize all pages as 'KEEP' by default
        pageStatus = new Array(totalPages).fill('KEEP');

        // UI Updates
        els.actionSection.classList.remove('disabled');
        els.intro.classList.add('hidden');

        console.log(`PDF Loaded. Pages: ${totalPages}`);
        updateStats();
        renderPage();

    } catch (err) {
        console.error("Error loading PDF:", err);
        alert("Failed to load PDF. Check console.");
    }
}

async function renderPage() {
    if (!pdfDoc) return;

    // 1. Fetch Page
    const page = await pdfDoc.getPage(currentPage);

    // 2. Prepare Canvas
    // Calculate scale to fit container width if needed, or stick to fixed quality
    const viewport = page.getViewport({ scale: CONFIG.scale });
    els.canvas.width = viewport.width;
    els.canvas.height = viewport.height;

    // 3. Render
    await page.render({
        canvasContext: els.ctx,
        viewport: viewport
    }).promise;

    // 4. Update UI Overlay (Visual Feedback)
    const status = pageStatus[currentPage - 1]; // 0-indexed
    if (status === 'CULL') {
        els.overlay.classList.remove('hidden');
    } else {
        els.overlay.classList.add('hidden');
    }

    // 5. Update Controls text
    els.indicator.textContent = `Page ${currentPage} / ${totalPages}`;
    els.btnPrev.disabled = currentPage <= 1;
    els.btnNext.disabled = currentPage >= totalPages;

    console.log(`Rendered Page ${currentPage}. Status: ${status}`);
}

function changePage(delta) {
    const next = currentPage + delta;
    if (next >= 1 && next <= totalPages) {
        currentPage = next;
        renderPage();
        updateStats(); // Update 'To Go' logic
    }
}

function markCurrentPage(status) {
    if (!pdfDoc) return;

    // Update State
    pageStatus[currentPage - 1] = status;
    console.log(`Page ${currentPage} marked as ${status}`);

    // Visual Update
    if (status === 'CULL') {
        els.overlay.classList.remove('hidden');
    } else {
        els.overlay.classList.add('hidden');
    }

    updateStats();

    // Auto Advance Logic
    if (els.autoAdvance.checked && currentPage < totalPages) {
        // Small delay for visual feedback
        setTimeout(() => {
            changePage(1);
        }, 150);
    }
}

function updateStats() {
    if (!pdfDoc) return;

    const kept = pageStatus.filter(s => s === 'KEEP').length;
    const culled = pageStatus.filter(s => s === 'CULL').length;
    // "To Go" is pages after the current one
    const remaining = totalPages - currentPage;

    els.cntKept.textContent = kept;
    els.cntCulled.textContent = culled;
    els.cntRem.textContent = Math.max(0, remaining);
}

async function downloadFinalPdf() {
    if (!pdfBytes) return;

    try {
        const btnOldText = els.btnDownload.textContent;
        els.btnDownload.textContent = "Processing...";
        els.btnDownload.disabled = true;

        const { PDFDocument } = PDFLib;

        // Load source
        const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        // Create new
        const newDoc = await PDFDocument.create();

        // Calculate indices to keep (0-based)
        const keepIndices = [];
        pageStatus.forEach((status, index) => {
            if (status === 'KEEP') {
                keepIndices.push(index);
            }
        });

        console.log(`Generating PDF. Keeping indices: ${keepIndices.join(', ')}`);

        if (keepIndices.length === 0) {
            alert("You removed all pages! Nothing to download.");
            els.btnDownload.textContent = btnOldText;
            els.btnDownload.disabled = false;
            return;
        }

        // Copy pages
        const copiedPages = await newDoc.copyPages(srcDoc, keepIndices);
        copiedPages.forEach(p => newDoc.addPage(p));

        // Serialize
        const pdfBytesOutput = await newDoc.save();
        const blob = new Blob([pdfBytesOutput], { type: 'application/pdf' });

        // Trigger Download
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName.replace('.pdf', '_culled.pdf');
        link.click();

        console.log("Download triggered.");
        els.btnDownload.textContent = btnOldText;
        els.btnDownload.disabled = false;

    } catch (err) {
        console.error("Error generating PDF:", err);
        alert("Error creating PDF. Check console.");
        els.btnDownload.textContent = "Error";
    }
}