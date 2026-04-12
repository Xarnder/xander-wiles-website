document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('imageUpload');
    const canvas = document.getElementById('processingCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const resultsContainer = document.getElementById('resultsContainer');
    const statusText = document.getElementById('status-text');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const visualizerSection = document.getElementById('visualizer-section');
    const visualizerImage = document.getElementById('visualizerImage');
    const gridOverlay = document.getElementById('gridOverlay');
    const overlayCtx = gridOverlay.getContext('2d');
    const sensitivitySlider = document.getElementById('sensitivitySlider');
    const sensitivityValueDisplay = document.getElementById('sensitivityValue');
    const baseFilenameInput = document.getElementById('baseFilenameInput');

    let extractedBlobs = []; // Store division objects: { id, blob, name, x, y, width, height, row, col, originalX, originalY, originalWidth, originalHeight }
    let originalFileName = "extracted_images";
    let currentImage = null; // Store for re-processing on slider change
    let selectedId = null;
    let selectedEdge = 'bottom'; // Default focus

    fileInput.addEventListener('change', handleImageUpload);
    downloadAllBtn.addEventListener('click', downloadAllAsZip);
    baseFilenameInput.addEventListener('input', handleFilenameChange);

    // Global Key Events for Nudging
    window.addEventListener('keydown', (e) => {
        if (!selectedId) return;

        const nudgeAmount = e.shiftKey ? 10 : 1;
        
        switch(e.key) {
            case '1': selectedEdge = 'top'; updateNudgeUI(); break;
            case '2': selectedEdge = 'bottom'; updateNudgeUI(); break;
            case '3': selectedEdge = 'left'; updateNudgeUI(); break;
            case '4': selectedEdge = 'right'; updateNudgeUI(); break;
            
            case 'ArrowUp':
                if (selectedEdge === 'top') nudgeDivision(selectedId, 'top', 'out', nudgeAmount);
                if (selectedEdge === 'bottom') nudgeDivision(selectedId, 'bottom', 'in', nudgeAmount);
                e.preventDefault();
                break;
            case 'ArrowDown':
                if (selectedEdge === 'top') nudgeDivision(selectedId, 'top', 'in', nudgeAmount);
                if (selectedEdge === 'bottom') nudgeDivision(selectedId, 'bottom', 'out', nudgeAmount);
                e.preventDefault();
                break;
            case 'ArrowLeft':
                if (selectedEdge === 'left') nudgeDivision(selectedId, 'left', 'out', nudgeAmount);
                if (selectedEdge === 'right') nudgeDivision(selectedId, 'right', 'in', nudgeAmount);
                e.preventDefault();
                break;
            case 'ArrowRight':
                if (selectedEdge === 'left') nudgeDivision(selectedId, 'left', 'in', nudgeAmount);
                if (selectedEdge === 'right') nudgeDivision(selectedId, 'right', 'out', nudgeAmount);
                e.preventDefault();
                break;
            case 'Escape':
                deselectAll();
                break;
        }
    });
    
    sensitivitySlider.addEventListener('input', (e) => {
        const value = e.target.value;
        sensitivityValueDisplay.textContent = value;
    });

    sensitivitySlider.addEventListener('change', () => {
        if (currentImage) {
            processImage(currentImage);
        }
    });

    function handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        console.log(`[DEBUG] File selected: ${file.name}`);
        originalFileName = file.name.split('.')[0];
        baseFilenameInput.value = originalFileName;
        statusText.textContent = "Processing image...";
        resultsContainer.innerHTML = ''; // Clear previous
        extractedBlobs = []; // Reset blobs
        selectedId = null;
        downloadAllBtn.style.display = 'none';
        visualizerSection.style.display = 'none';

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                currentImage = img;
                processImage(img);
            };
            img.src = e.target.result;
            visualizerImage.src = e.target.result; // Set for visualizer
        };
        reader.readAsDataURL(file);
    }

    async function processImage(img) {
        console.log(`[DEBUG] Image loaded into memory. Resolution: ${img.width}x${img.height}`);
        
        statusText.textContent = "Processing image...";
        resultsContainer.innerHTML = ''; // Clear previous for re-processing
        extractedBlobs = [];
        selectedId = null;

        // Set canvas to exact image dimensions to ensure lossless pixel mapping
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const threshold = parseInt(sensitivitySlider.value);

        console.log(`[DEBUG] Starting grid detection with threshold: ${threshold}`);

        // Detect horizontal and vertical grid lines (gutters)
        const verticalGutters = findGutters(imageData, canvas.width, canvas.height, true, threshold);
        const horizontalGutters = findGutters(imageData, canvas.width, canvas.height, false, threshold);

        console.log(`[DEBUG] Found ${verticalGutters.length} vertical solid lines.`);
        console.log(`[DEBUG] Found ${horizontalGutters.length} horizontal solid lines.`);

        // Group adjacent solid lines into blocks and find the spaces (content areas) between them
        const xBounds = getContentBounds(verticalGutters, canvas.width);
        const yBounds = getContentBounds(horizontalGutters, canvas.height);

        console.log(`[DEBUG] Detected ${xBounds.length} columns and ${yBounds.length} rows of content.`);

        if (xBounds.length === 0 || yBounds.length === 0) {
            console.error("[ERROR] Algorithm failed to detect grid. Image might not have clean solid borders.");
            statusText.textContent = "Error: Could not detect clear grid boundaries. Try adjusting sensitivity.";
            return;
        }

        // Render the visual overlay
        renderGridOverlay(img.width, img.height, verticalGutters, horizontalGutters);

        // Extract each cell
        let extractCount = 0;
        
        for (let rowIndex = 0; rowIndex < yBounds.length; rowIndex++) {
            for (let colIndex = 0; colIndex < xBounds.length; colIndex++) {
                const xBound = xBounds[colIndex];
                const yBound = yBounds[rowIndex];
                const id = `r${rowIndex}_c${colIndex}`;
                await extractRegion(img, id, xBound.start, yBound.start, xBound.end - xBound.start, yBound.end - yBound.start, rowIndex, colIndex);
                extractCount++;
            }
        }

        statusText.textContent = `Successfully extracted ${extractCount} images losslessly.`;
        console.log(`[DEBUG] Processing complete. Click an image to fine-tune its crop.`);
        
        if (extractCount > 0) {
            downloadAllBtn.style.display = 'inline-block';
            visualizerSection.style.display = 'block';
        }
    }

    function renderGridOverlay(width, height, vGutters, hGutters) {
        gridOverlay.width = width;
        gridOverlay.height = height;
        
        overlayCtx.clearRect(0, 0, width, height);
        overlayCtx.strokeStyle = '#00f2ff'; // Cyan for high contrast
        overlayCtx.lineWidth = 1;

        // Draw vertical gutters
        vGutters.forEach(x => {
            overlayCtx.beginPath();
            overlayCtx.moveTo(x, 0);
            overlayCtx.lineTo(x, height);
            overlayCtx.stroke();
        });

        // Draw horizontal gutters
        hGutters.forEach(y => {
            overlayCtx.beginPath();
            overlayCtx.moveTo(0, y);
            overlayCtx.lineTo(width, y);
            overlayCtx.stroke();
        });
    }

    // --- The "Smart Algorithm" Core ---

    // Finds pixel indices that represent a solid color line
    function findGutters(imageData, width, height, isVertical, threshold) {
        const gutters = [];
        const length = isVertical ? height : width;
        const breadth = isVertical ? width : height;

        for (let i = 0; i < breadth; i++) {
            let diffSum = 0;
            let firstPixel = null;

            for (let j = 0; j < length; j++) {
                const x = isVertical ? i : j;
                const y = isVertical ? j : i;
                const idx = (y * width + x) * 4;

                if (j === 0) {
                    firstPixel = [imageData.data[idx], imageData.data[idx + 1], imageData.data[idx + 2]];
                } else {
                    diffSum += Math.abs(imageData.data[idx] - firstPixel[0]) +
                        Math.abs(imageData.data[idx + 1] - firstPixel[1]) +
                        Math.abs(imageData.data[idx + 2] - firstPixel[2]);
                }
            }

            const avgDiff = diffSum / (length * 3); // Average deviation per channel
            if (avgDiff < threshold) {
                gutters.push(i);
            }
        }
        return gutters;
    }

    // Takes a list of solid lines and finds the content blocks BETWEEN them
    function getContentBounds(gutters, totalDimension) {
        if (gutters.length === 0) return [{ start: 0, end: totalDimension }];

        let blocks = [];
        let start = gutters[0];
        let prev = gutters[0];

        // Group continuous solid lines into border blocks
        for (let i = 1; i < gutters.length; i++) {
            if (gutters[i] === prev + 1) {
                prev = gutters[i];
            } else {
                blocks.push({ start, end: prev });
                start = gutters[i];
                prev = gutters[i];
            }
        }
        blocks.push({ start, end: prev });

        // The content is the space between the border blocks
        let bounds = [];
        let currentStart = 0;

        for (let block of blocks) {
            // If there's space between current position and the border block, it's content
            if (block.start > currentStart) {
                // Filter out tiny slivers (less than 50px) that might be artifact errors
                if ((block.start - currentStart) > 50) {
                    bounds.push({ start: currentStart, end: block.start });
                }
            }
            currentStart = block.end + 1;
        }

        // Check for remaining content after the last border
        if (totalDimension - currentStart > 50) {
            bounds.push({ start: currentStart, end: totalDimension });
        }

        return bounds;
    }

    async function extractRegion(sourceImg, id, x, y, width, height, row, col, isNudge = false) {
        return new Promise((resolve) => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');

            tempCtx.drawImage(sourceImg, x, y, width, height, 0, 0, width, height);

            tempCanvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const name = `${originalFileName}_r${row + 1}_c${col + 1}.png`;
                
                if (isNudge) {
                    const index = extractedBlobs.findIndex(b => b.id === id);
                    extractedBlobs[index].blob = blob;
                    extractedBlobs[index].x = x;
                    extractedBlobs[index].y = y;
                    extractedBlobs[index].width = width;
                    extractedBlobs[index].height = height;

                    const card = document.querySelector(`.result-card[data-id="${id}"]`);
                    card.querySelector('img').src = url;
                    card.querySelector('.download-link').href = url;
                } else {
                    extractedBlobs.push({ 
                        id, blob, name, x, y, width, height, row, col,
                        originalX: x, originalY: y, originalWidth: width, originalHeight: height 
                    });

                    const card = document.createElement('div');
                    card.className = 'result-card glass-card';
                    card.dataset.id = id;

                    const imgEl = document.createElement('img');
                    imgEl.src = url;
                    imgEl.addEventListener('click', () => selectCard(id));

                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'card-actions';

                    const downloadBtn = document.createElement('a');
                    downloadBtn.href = url;
                    downloadBtn.download = name;
                    downloadBtn.className = 'action-btn download-link';
                    downloadBtn.textContent = 'Download PNG';

                    actionsDiv.appendChild(downloadBtn);
                    card.appendChild(imgEl);
                    card.appendChild(actionsDiv);

                    resultsContainer.appendChild(card);
                }
                resolve();
            }, 'image/png');
        });
    }

    function downloadAllAsZip() {
        if (extractedBlobs.length === 0) return;

        const zip = new JSZip();
        const zipName = baseFilenameInput.value || originalFileName;
        const folder = zip.folder(zipName);

        extractedBlobs.forEach((item) => {
            folder.file(item.name, item.blob);
        });

        statusText.textContent = "Generating ZIP...";
        
        zip.generateAsync({ type: "blob" }).then((content) => {
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${zipName}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            statusText.textContent = `Downloaded ${extractedBlobs.length} images as ZIP.`;
        });
    }

    function handleFilenameChange() {
        originalFileName = baseFilenameInput.value || "extracted_images";
        
        // Update all existing items in memory
        extractedBlobs.forEach(item => {
            item.name = `${originalFileName}_r${item.row + 1}_c${item.col + 1}.png`;
            
            // Update individual download link in the grid
            const card = document.querySelector(`.result-card[data-id="${item.id}"]`);
            if (card) {
                const downloadBtn = card.querySelector('.download-link');
                if (downloadBtn) {
                    downloadBtn.download = item.name;
                }
            }
        });

        console.log(`[DEBUG] Updated prefix to: ${originalFileName}`);
    }

    function selectCard(id) {
        if (selectedId === id) {
            deselectAll();
            return;
        }

        deselectAll();
        selectedId = id;
        const card = document.querySelector(`.result-card[data-id="${id}"]`);
        card.classList.add('selected');
        
        // Inject Nudge UI
        const nudgeUI = document.createElement('div');
        nudgeUI.className = 'nudge-controls';
        nudgeUI.innerHTML = `
            <span class="nudge-title">Tune Crop</span>
            <div class="nudge-buttons">
                <div class="edge-selector">
                    <button class="nudge-btn top" data-edge="top" title="Focus Top Edge (Key: 1)">T</button>
                    <button class="nudge-btn bottom" data-edge="bottom" title="Focus Bottom Edge (Key: 2)">B</button>
                    <button class="nudge-btn left" data-edge="left" title="Focus Left Edge (Key: 3)">L</button>
                    <button class="nudge-btn right" data-edge="right" title="Focus Right Edge (Key: 4)">R</button>
                    <button class="nudge-btn reset" title="Reset to Grid">R</button>
                </div>
                <div class="action-buttons">
                    <button class="action-btn-large nudge-out">Push Out</button>
                    <button class="action-btn-large nudge-in">Pull In</button>
                </div>
            </div>
        `;

        nudgeUI.querySelectorAll('.edge-selector .nudge-btn[data-edge]').forEach(btn => {
            btn.onclick = (e) => {
                selectedEdge = btn.dataset.edge;
                updateNudgeUI();
                e.stopPropagation();
            };
        });

        nudgeUI.querySelector('.nudge-out').onclick = (e) => { nudgeDivision(id, selectedEdge, 'out', 1); e.stopPropagation(); };
        nudgeUI.querySelector('.nudge-in').onclick = (e) => { nudgeDivision(id, selectedEdge, 'in', 1); e.stopPropagation(); };
        nudgeUI.querySelector('.reset').onclick = (e) => { resetDivision(id); e.stopPropagation(); };

        card.appendChild(nudgeUI);
        updateNudgeUI();
    }

    function updateNudgeUI() {
        if (!selectedId) return;
        document.querySelectorAll('.nudge-btn[data-edge]').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.edge === selectedEdge);
        });
    }

    function deselectAll() {
        selectedId = null;
        document.querySelectorAll('.result-card').forEach(c => {
            c.classList.remove('selected');
            const controls = c.querySelector('.nudge-controls');
            if (controls) controls.remove();
        });
    }

    async function nudgeDivision(id, edge, direction, amount = 1) {
        const division = extractedBlobs.find(b => b.id === id);
        if (!division) return;

        let { x, y, width, height } = division;

        if (edge === 'top') {
            if (direction === 'out') { y -= amount; height += amount; }
            else { y += amount; height -= amount; }
        } else if (edge === 'bottom') {
            if (direction === 'out') { height += amount; }
            else { height -= amount; }
        } else if (edge === 'left') {
            if (direction === 'out') { x -= amount; width += amount; }
            else { x += amount; width -= amount; }
        } else if (edge === 'right') {
            if (direction === 'out') { width += amount; }
            else { width -= amount; }
        }

        // Clamp values to image bounds
        x = Math.max(0, x);
        y = Math.max(0, y);
        width = Math.max(1, width);
        height = Math.max(1, height);

        await extractRegion(currentImage, id, x, y, width, height, division.row, division.col, true);
    }

    async function resetDivision(id) {
        const div = extractedBlobs.find(b => b.id === id);
        if (!div) return;
        await extractRegion(currentImage, id, div.originalX, div.originalY, div.originalWidth, div.originalHeight, div.row, div.col, true);
    }
});