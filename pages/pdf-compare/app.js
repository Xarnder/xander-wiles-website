// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/**
 * PDFViewer class handles the extraction, processing, and rendering of a PDF
 * with sentence-level highlighting.
 */
class PDFViewer {
    constructor(containerId, role) {
        this.container = document.getElementById(containerId);
        this.role = role; // 'original' or 'modified'
        this.pdf = null;
        this.pageData = [];
        this.allItems = [];
        this.fullText = "";
        this.sentences = [];
        this.zoomLevel = 1.5;
    }

    /**
     * Resets the viewer state for a new document.
     */
    reset() {
        this.container.innerHTML = '';
        this.pageData = [];
        this.allItems = [];
        this.fullText = "";
        this.sentences = [];
    }

    /**
     * Set zoom level and re-render
     */
    setZoom(level, otherDocSentencesSet) {
        this.zoomLevel = level;
        this.render(otherDocSentencesSet);
    }

    /**
     * Loads the PDF and extracts all text content.
     */
    async load(file) {
        this.reset();
        const arrayBuffer = await file.arrayBuffer();
        this.pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        console.log(`[${this.role}] PDF Loaded: ${this.pdf.numPages} pages.`);

        for (let i = 1; i <= this.pdf.numPages; i++) {
            const page = await this.pdf.getPage(i);
            const textContent = await page.getTextContent();
            this.pageData.push({ page, textContent });
            this.allItems.push(...textContent.items);
        }

        // We join with a space to build a searchable full text
        this.fullText = this.allItems.map(item => item.str).join(' ');
        this.sentences = this.parseSentences(this.fullText);
        
        // Map sentences back to text item indices for highlighting
        this.mapSentencesToItems();
    }

    /**
     * Parses full text into individual sentences with match metadata.
     */
    parseSentences(text) {
        // Normalize whitespace
        const cleanText = text.replace(/\s+/g, ' ').trim();
        // Regex for sentence splitting (punctuation followed by space or end of string)
        const sentences = cleanText.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [cleanText];
        
        return sentences.map(s => {
            const trimmed = s.trim();
            return {
                text: trimmed,
                normalized: this.normalize(trimmed),
                itemIndices: []
            };
        }).filter(s => s.text.length > 1); // Ignore very short fragments
    }

    /**
     * Normalizes a string for comparison (lowercase, alphanumeric only).
     */
    normalize(text) {
        return text.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    /**
     * Calculates which text items (from PDF extraction) belong to which sentence.
     */
    mapSentencesToItems() {
        let currentPos = 0;
        this.sentences.forEach(s => {
            const start = this.fullText.indexOf(s.text, currentPos);
            if (start !== -1) {
                const end = start + s.text.length;
                let runningLength = 0;
                
                for (let i = 0; i < this.allItems.length; i++) {
                    const itemLen = this.allItems[i].str.length;
                    const itemStart = runningLength;
                    const itemEnd = itemStart + itemLen;
                    
                    // Check if item overlaps with the sentence range
                    if (itemEnd > start && itemStart < end) {
                        s.itemIndices.push(i);
                    }
                    runningLength += itemLen + 1; // +1 for the joining space
                }
                currentPos = end;
            }
        });
    }

    /**
     * Renders the PDF pages into the container with highlights.
     * @param {Set} otherDocSentencesSet - Set of normalized sentences from the other document.
     */
    async render(otherDocSentencesSet) {
        this.container.innerHTML = '';
        this.activeSentencesSet = otherDocSentencesSet; // Store for re-renders (zoom)

        // Determine the status of every single text item
        const itemStatus = new Array(this.allItems.length).fill(null);
        const itemSentenceIdx = new Array(this.allItems.length).fill(-1);

        this.sentences.forEach((s, sIdx) => {
            const isMatched = otherDocSentencesSet.has(s.normalized);
            const status = isMatched ? 'match' : (this.role === 'original' ? 'missing' : 'new');
            
            s.itemIndices.forEach(idx => {
                if (itemStatus[idx] !== 'match') {
                    itemStatus[idx] = status;
                    itemSentenceIdx[idx] = sIdx;
                }
            });
        });

        let globalItemIndex = 0;
        for (let i = 0; i < this.pageData.length; i++) {
            const { page, textContent } = this.pageData[i];
            await this.renderPage(page, textContent, itemStatus, itemSentenceIdx, globalItemIndex);
            globalItemIndex += textContent.items.length;
        }
    }

    /**
     * Renders a single page with its text layer.
     */
    async renderPage(page, textContent, itemStatus, itemSentenceIdx, globalOffset) {
        const viewport = page.getViewport({ scale: this.zoomLevel });
        const items = textContent.items;
        
        const pageContainer = document.createElement('div');
        pageContainer.className = 'page-container';
        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.height = `${viewport.height}px`;
        pageContainer.style.setProperty('--scale-factor', viewport.scale);

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        pageContainer.appendChild(canvas);

        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        pageContainer.appendChild(textLayerDiv);

        this.container.appendChild(pageContainer);

        // Render Canvas
        await page.render({
            canvasContext: canvas.getContext('2d'),
            viewport: viewport
        }).promise;

        // Render Text Layer
        await pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport
        }).promise;

        // Apply highlight classes to the generated spans
        const spans = textLayerDiv.querySelectorAll('span');
        spans.forEach((span, i) => {
            const status = itemStatus[globalOffset + i];
            const sIdx = itemSentenceIdx[globalOffset + i];
            if (status) {
                span.classList.add(status);
                span.setAttribute('data-sentence-index', sIdx);
            }
        });
    }
}

/**
 * ChangeNavigator handles jumping between document differences.
 */
class ChangeNavigator {
    constructor(viewer1, viewer2, infoSpan) {
        this.viewer1 = viewer1;
        this.viewer2 = viewer2;
        this.infoSpan = infoSpan;
        this.allChanges = [];
        this.currentIndex = -1;
    }

    collect() {
        this.allChanges = [];
        
        const findChanges = (viewer, selector) => {
            const elements = viewer.container.querySelectorAll(selector);
            const seenSentences = new Set();
            elements.forEach(el => {
                const sIdx = el.getAttribute('data-sentence-index');
                if (sIdx !== null && !seenSentences.has(sIdx)) {
                    this.allChanges.push({ viewer, element: el, sIdx });
                    seenSentences.add(sIdx);
                }
            });
        };

        findChanges(this.viewer1, 'span.missing');
        findChanges(this.viewer2, 'span.new');

        // Note: Changes are already roughly ordered by page/appearance
        if (this.allChanges.length > 0) {
            this.infoSpan.textContent = `${this.allChanges.length} differences found`;
        } else {
            this.infoSpan.textContent = 'Documents match perfectly!';
        }
        this.currentIndex = -1;
    }

    next() {
        if (this.allChanges.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.allChanges.length;
        this.jump();
    }

    prev() {
        if (this.allChanges.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.allChanges.length) % this.allChanges.length;
        this.jump();
    }

    jump() {
        const change = this.allChanges[this.currentIndex];
        change.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Visual feedback on the current item - making it even stronger
        change.element.style.outline = '4px solid white';
        change.element.style.outlineOffset = '2px';
        change.element.style.zIndex = '10';
        
        setTimeout(() => { 
            change.element.style.outline = ''; 
            change.element.style.outlineOffset = '';
            change.element.style.zIndex = '';
        }, 2000);

        this.infoSpan.textContent = `Change ${this.currentIndex + 1} of ${this.allChanges.length}`;
    }
}

/**
 * Main Application Controller
 */
document.addEventListener('DOMContentLoaded', () => {
    const compareBtn = document.getElementById('compareBtn');
    const loadingDiv = document.getElementById('loading');
    const resultsContainer = document.getElementById('results-container');
    const toolbar = document.getElementById('toolbar');
    const colorModeBtn = document.getElementById('colorModeBtn');
    const prevChangeBtn = document.getElementById('prevChangeBtn');
    const nextChangeBtn = document.getElementById('nextChangeBtn');
    const changeCount = document.getElementById('changeCount');
    const zoomSlider = document.getElementById('zoomSlider');
    const zoomVal = document.getElementById('zoomVal');
    const resetBtn = document.getElementById('resetBtn');
    const uploadSection = document.getElementById('uploadSection');

    const viewer1 = new PDFViewer('viewer1', 'original');
    const viewer2 = new PDFViewer('viewer2', 'modified');
    const navigator = new ChangeNavigator(viewer1, viewer2, changeCount);

    const fileName1 = document.getElementById('fileName1');
    const fileName2 = document.getElementById('fileName2');

    // Drag and Drop Setup
    function setupDragAndDrop(zoneId, inputId, nameDisplayId) {
        const zone = document.getElementById(zoneId);
        const input = document.getElementById(inputId);
        const display = document.getElementById(nameDisplayId);

        if (!zone || !input || !display) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            zone.addEventListener(eventName, e => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        zone.addEventListener('dragover', () => zone.classList.add('drag-over'));
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));

        zone.addEventListener('drop', (e) => {
            zone.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type === 'application/pdf') {
                input.files = files;
                display.textContent = files[0].name;
                // Trigger change event manually so other listeners know
                input.dispatchEvent(new Event('change'));
            } else {
                alert('Please upload a valid PDF file.');
            }
        });

        input.addEventListener('change', () => {
            if (input.files.length > 0) {
                display.textContent = input.files[0].name;
                checkAndCompare();
            } else {
                display.textContent = 'No file selected';
            }
        });
    }

    async function checkAndCompare() {
        const file1 = document.getElementById('pdf1').files[0];
        const file2 = document.getElementById('pdf2').files[0];

        if (file1 && file2) {
            console.log("Both files detected. Starting automatic comparison...");
            compareBtn.classList.add('hidden'); // Hide the button
            uploadSection.classList.add('hidden'); // Collapse upload area
            
            compareBtn.disabled = true;
            loadingDiv.classList.remove('hidden');
            resultsContainer.classList.add('hidden');
            toolbar.classList.add('hidden');

            try {
                // Set filenames
                fileName1.textContent = file1.name;
                fileName2.textContent = file2.name;

                await Promise.all([
                    viewer1.load(file1),
                    viewer2.load(file2)
                ]);

                const set1 = new Set(viewer1.sentences.map(s => s.normalized));
                const set2 = new Set(viewer2.sentences.map(s => s.normalized));

                await Promise.all([
                    viewer1.render(set2),
                    viewer2.render(set1)
                ]);

                navigator.collect();

                loadingDiv.classList.add('hidden');
                resultsContainer.classList.remove('hidden');
                toolbar.classList.remove('hidden');
            } catch (error) {
                console.error("Comparison Error:", error);
                alert("An error occurred while comparing the PDFs. Check the console for details.");
                loadingDiv.classList.add('hidden');
                compareBtn.classList.remove('hidden'); // Show it back on error
                uploadSection.classList.remove('hidden');
            } finally {
                compareBtn.disabled = false;
            }
        }
    }

    setupDragAndDrop('drop-zone-1', 'pdf1', 'name-1');
    setupDragAndDrop('drop-zone-2', 'pdf2', 'name-2');

    // Reset Logic
    resetBtn.addEventListener('click', () => {
        // Reset file inputs
        document.getElementById('pdf1').value = '';
        document.getElementById('pdf2').value = '';
        document.getElementById('name-1').textContent = 'No file selected';
        document.getElementById('name-2').textContent = 'No file selected';
        
        // Reset viewers
        viewer1.reset();
        viewer2.reset();
        
        // UI Reset
        uploadSection.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
        toolbar.classList.add('hidden');
        compareBtn.classList.remove('hidden');
        compareBtn.disabled = false;
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Colorblind Mode Toggle
    colorModeBtn.addEventListener('click', () => {
        document.body.classList.toggle('colorblind-mode');
        const isActive = document.body.classList.contains('colorblind-mode');
        colorModeBtn.innerHTML = isActive ? 
            '<img src="eye-icon.svg" class="btn-icon" alt=""> Standard Mode' : 
            '<img src="eye-icon.svg" class="btn-icon" alt=""> Colorblind Mode';
    });

    // Zoom Controls
    zoomSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        zoomVal.textContent = val + 'x';
    });

    zoomSlider.addEventListener('change', async (e) => {
        const val = parseFloat(e.target.value);
        if (viewer1.pdf && viewer2.pdf) {
            loadingDiv.classList.remove('hidden');
            await Promise.all([
                viewer1.setZoom(val, viewer1.activeSentencesSet),
                viewer2.setZoom(val, viewer2.activeSentencesSet)
            ]);
            navigator.collect(); // Recalculate positions
            loadingDiv.classList.add('hidden');
        }
    });

    // Navigation Toggle
    nextChangeBtn.addEventListener('click', () => navigator.next());
    prevChangeBtn.addEventListener('click', () => navigator.prev());

    // Keeping original listener for manual trigger if needed, 
    // but checkAndCompare will handle the auto case.
    compareBtn.addEventListener('click', checkAndCompare);
});