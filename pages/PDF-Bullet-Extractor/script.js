// script.js

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// DOM Elements
const fileInput = document.getElementById('pdf-upload');
const fileNameDisplay = document.getElementById('file-name');
const btnJson = document.getElementById('download-json');
const btnCsv = document.getElementById('download-csv');
const jsonPreview = document.getElementById('json-preview');
const bulletTogglesContainer = document.getElementById('bullet-toggles');

// Bullet symbols configuration
const BULLET_SYMBOLS = [
    { symbol: '•', id: 'bullet-standard' },
    { symbol: '●', id: 'bullet-circle-black' },
    { symbol: '○', id: 'bullet-circle-white' },
    { symbol: '◦', id: 'bullet-circle-small' },
    { symbol: '■', id: 'bullet-square-black' },
    { symbol: '▫', id: 'bullet-square-white' },
    { symbol: '▪', id: 'bullet-square-small' },
    { symbol: '‣', id: 'bullet-tri-right' },
    { symbol: '⁃', id: 'bullet-hyphen-long' },
    { symbol: '-', id: 'bullet-dash' },
    { symbol: '*', id: 'bullet-asterisk' },
    { symbol: 'x', id: 'bullet-x' },
    { symbol: '>', id: 'bullet-gt' }
];

// Initialize toggles
function initBulletToggles() {
    BULLET_SYMBOLS.forEach(item => {
        const toggleDiv = document.createElement('div');
        toggleDiv.className = 'toggle-item';
        toggleDiv.innerHTML = `
            <span>${item.symbol}</span>
            <label class="switch">
                <input type="checkbox" id="${item.id}" checked>
                <span class="slider"></span>
            </label>
        `;
        bulletTogglesContainer.appendChild(toggleDiv);
    });
}

initBulletToggles();

// Get active bullet symbols as a regex-safe string
function getActiveBulletRegex() {
    const activeSymbols = BULLET_SYMBOLS
        .filter(item => document.getElementById(item.id).checked)
        .map(item => {
            // Escape special regex characters, including hyphen for character classes
            return item.symbol.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
        });
    
    if (activeSymbols.length === 0) return null;
    return new RegExp(`^([${activeSymbols.join('')}])`, 'i');
}

// Data storage
let extractedDataJSON = [];
let extractedDataCSV = "";

// Listen for file uploads
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    fileNameDisplay.textContent = file.name;
    console.log(`[File Loaded] Starting to process: ${file.name}`);

    try {
        const fileArrayBuffer = await file.arrayBuffer();
        await processPDF(fileArrayBuffer);
    } catch (error) {
        console.error("[Fatal Error] Could not read or process the PDF:", error);
        jsonPreview.textContent = "Error parsing PDF. Check the browser console.";
    }
});

async function processPDF(arrayBuffer) {
    console.log("[PDF Prep] Initializing PDF.js...");
    const loadingTask = pdfjsLib.getDocument(arrayBuffer);
    const pdf = await loadingTask.promise;
    console.log(`[PDF Loaded] Found ${pdf.numPages} page(s).`);

    let rawLines = [];

    // Extract text and X-coordinates page by page
    for (let i = 1; i <= pdf.numPages; i++) {
        console.log(`[Extraction] Processing Page ${i}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // Group items that are on the same Y axis (same line)
        let lineGroups = {};
        textContent.items.forEach(item => {
            // Transform[5] is the Y coordinate, Transform[4] is the X coordinate
            // We round the Y coordinate slightly because PDF formatting isn't always perfectly flat
            let y = Math.round(item.transform[5] / 2) * 2;
            let x = item.transform[4];
            let str = item.str.trim();

            if (str.length > 0) {
                if (!lineGroups[y]) lineGroups[y] = [];
                lineGroups[y].push({ text: str, x: x });
            }
        });

        // Sort Y coordinates descending (PDFs draw from bottom to top)
        let sortedY = Object.keys(lineGroups).map(Number).sort((a, b) => b - a);

        sortedY.forEach(y => {
            // Sort items on the same line from left to right
            lineGroups[y].sort((a, b) => a.x - b.x);
            let fullText = lineGroups[y].map(item => item.text).join(' ');
            let minX = lineGroups[y][0].x; // The starting indent of the line

            rawLines.push({ text: fullText, indent: minX });
        });
    }

    console.log(`[Parser] Extracted ${rawLines.length} raw lines of text.`);
    buildHierarchy(rawLines);
}

function buildHierarchy(lines) {
    console.log("[Hierarchy] Building nested structure...");

    let structuredData = [];
    let currentPath = [];
    // currentPath will hold objects like { text: 'Category', indent: 50 }

    const bulletRegex = getActiveBulletRegex();

    lines.forEach((line, index) => {
        // Look for common bullet indicators
        let text = line.text;
        let isBullet = bulletRegex ? bulletRegex.test(text) : false;

        while (isBullet) {
            // Clean the bullet character off the string
            text = text.substring(1).trim();
            // Check if there's another bullet (e.g. "● ● Item")
            isBullet = bulletRegex ? bulletRegex.test(text) : false;
        }

        // We use an indentation threshold because PDFs aren't pixel-perfect
        const INDENT_TOLERANCE = 5;

        // Adjust the current path based on indentation
        while (currentPath.length > 0) {
            let lastItem = currentPath[currentPath.length - 1];

            if (line.indent > lastItem.indent + INDENT_TOLERANCE) {
                // Nested further in
                break;
            } else if (Math.abs(line.indent - lastItem.indent) <= INDENT_TOLERANCE) {
                // Sibling (same level) -> pop the last sibling out
                currentPath.pop();
                break;
            } else {
                // Moving back out -> pop the parent out
                currentPath.pop();
            }
        }

        // Add this item to the tree structure
        let node = { title: text, indent: line.indent, children: [] };

        if (currentPath.length === 0) {
            // Root level
            structuredData.push(node);
        } else {
            // Add as child to the current deepest parent
            let parent = currentPath[currentPath.length - 1];
            parent.children.push(node);
        }

        currentPath.push(node);
    });

    // Clean up indent property for final JSON output
    const cleanJSON = JSON.parse(JSON.stringify(structuredData));
    const removeIndents = (nodes) => {
        nodes.forEach(n => {
            delete n.indent;
            if (n.children.length === 0) delete n.children;
            else removeIndents(n.children);
        });
    };
    removeIndents(cleanJSON);

    extractedDataJSON = cleanJSON;
    console.log("[Success] JSON Tree generated.");

    // Generate CSV
    extractedDataCSV = buildCSV(structuredData);
    console.log("[Success] CSV string generated.");

    // Update UI
    jsonPreview.textContent = JSON.stringify(extractedDataJSON, null, 2);
    btnJson.disabled = false;
    btnCsv.disabled = false;
}

// Recursively flatten tree for CSV
function buildCSV(tree) {
    let rows = [];
    let maxDepth = 0;

    function traverse(nodes, currentPath) {
        if (currentPath.length > maxDepth) maxDepth = currentPath.length;

        nodes.forEach(node => {
            let path = [...currentPath, node.title];
            if (node.children && node.children.length > 0) {
                traverse(node.children, path);
            } else {
                rows.push(path);
            }
        });
    }

    traverse(tree, []);

    // Create CSV Header
    let csvString = "";
    for (let i = 1; i <= maxDepth; i++) {
        csvString += `Level ${i},`;
    }
    // Remove last comma and add newline
    csvString = csvString.slice(0, -1) + "\n";

    // Add rows
    rows.forEach(row => {
        let paddedRow = [...row];
        // Pad with empty strings if a row doesn't reach max depth
        while (paddedRow.length < maxDepth) paddedRow.push("");

        // Escape quotes and wrap in quotes for safe CSV formatting
        let safeRow = paddedRow.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',');
        csvString += safeRow + "\n";
    });

    return csvString;
}

// Download Handlers
btnJson.addEventListener('click', () => {
    console.log("[Download] Triggering JSON download...");
    const dataStr = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(extractedDataJSON, null, 2));
    triggerDownload(dataStr, "extracted-notes.json");
});

btnCsv.addEventListener('click', () => {
    console.log("[Download] Triggering CSV download...");
    const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(extractedDataCSV);
    triggerDownload(dataStr, "extracted-notes.csv");
});

function triggerDownload(dataString, filename) {
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataString);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}