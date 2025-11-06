document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const directoryUploadInput = document.getElementById('directory-upload');
    const uploadSection = document.getElementById('upload-section');
    const editorSection = document.getElementById('editor-section');
    const previewCanvas = document.getElementById('preview-canvas');
    const exportBtn = document.getElementById('export-btn');
    const uploadStatus = document.getElementById('upload-status');
    const exportStatus = document.getElementById('export-status');
    const previewCtx = previewCanvas.getContext('2d');

    // Customization Controls
    const addTitleToggle = document.getElementById('add-title-toggle');
    const underscoreToggle = document.getElementById('underscore-toggle');
    const titleOptionsWrapper = document.getElementById('title-options-wrapper');
    const titleModeSelect = document.getElementById('title-mode-select');
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeValueSpan = document.getElementById('font-size-value');
    const textColorPicker = document.getElementById('text-color-picker');

    // "Add Space" & "Bleed" Controls
    const headerHeightSlider = document.getElementById('header-height-slider');
    const headerHeightValueSpan = document.getElementById('header-height-value');
    const bgColorPicker = document.getElementById('bg-color-picker');
    const positionToggle = document.getElementById('position-toggle');

    // "Overlay" Mode Control
    const textPositionSlider = document.getElementById('text-position-slider');
    const textPositionValueSpan = document.getElementById('text-position-value');
    
    // "Bleed" Mode Control
    const textOffsetSlider = document.getElementById('text-offset-slider');
    const textOffsetValueSpan = document.getElementById('text-offset-value');

    // Navigation and Renaming Controls
    const previewControls = document.getElementById('preview-controls');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const titleInput = document.getElementById('title-input');
    const imageCounter = document.getElementById('image-counter');

    // Subfolder Controls
    const newFolderInput = document.getElementById('new-folder-input');
    const addFolderBtn = document.getElementById('add-folder-btn');
    const folderSelect = document.getElementById('folder-select');

    // --- NEW: Grid Feature DOM Elements ---
    const openGridModalBtn = document.getElementById('open-grid-modal-btn');
    const gridPopup = document.getElementById('grid-popup');
    const closeGridPopupBtn = gridPopup.querySelector('.popup-close-btn');
    const gridSourceSelect = document.getElementById('grid-source-select');
    const gridColumnsInput = document.getElementById('grid-columns-input');
    const gridWarningBox = document.getElementById('grid-warning-box');
    const gridDownscaleToggle = document.getElementById('grid-downscale-toggle');
    const gridOutputSize = document.getElementById('grid-output-size');
    const gridOutputMegapixels = document.getElementById('grid-output-megapixels');
    const gridPreviewCanvas = document.getElementById('grid-preview-canvas');
    const gridPreviewCtx = gridPreviewCanvas.getContext('2d');
    const generateGridBtn = document.getElementById('generate-grid-btn');
    const gridStatus = document.getElementById('grid-status');
    
    // --- State ---
    let imageFiles = [];
    let imageTitles = [];
    let imageFolders = [];
    let availableFolders = ["(Root)"];
    let currentIndex = 0;
    const MEGAPixel_limit = 24 * 1000 * 1000; // 24 million pixels

    // --- Event Listeners ---
    directoryUploadInput.addEventListener('change', handleDirectoryUpload);
    exportBtn.addEventListener('click', handleExport);
    
    [titleModeSelect, fontSizeSlider, headerHeightSlider, textColorPicker, bgColorPicker, positionToggle, addTitleToggle, underscoreToggle, textPositionSlider, textOffsetSlider].forEach(el => {
        el.addEventListener('input', handleControlsChange);
    });

    prevBtn.addEventListener('click', navigatePrev);
    nextBtn.addEventListener('click', navigateNext);
    titleInput.addEventListener('input', handleTitleChange);
    document.addEventListener('keydown', handleKeyPress);
    
    addFolderBtn.addEventListener('click', handleAddFolder);
    folderSelect.addEventListener('change', handleFolderAssignment);

    // --- NEW: Grid Feature Event Listeners ---
    openGridModalBtn.addEventListener('click', openGridModal);
    closeGridPopupBtn.addEventListener('click', closeGridModal);
    gridPopup.addEventListener('click', (e) => { if (e.target === gridPopup) closeGridModal(); });
    gridSourceSelect.addEventListener('change', updateGridPreview);
    gridColumnsInput.addEventListener('input', updateGridPreview);
    generateGridBtn.addEventListener('click', handleGenerateGrid);

    // --- Functions ---

    function handleDirectoryUpload(e) {
        const files = Array.from(e.target.files);
        
        imageFiles = []; imageTitles = []; imageFolders = [];
        availableFolders = ["(Root)", "All Images"]; currentIndex = 0;

        imageFiles = files.filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) {
            showStatus(uploadStatus, 'No valid image files (.jpg, .png, etc.) were found.', true);
            return;
        }

        imageFiles.forEach(file => {
            imageTitles.push(formatTitle(file.name));
            imageFolders.push("(Root)");
        });

        showStatus(uploadStatus, `Successfully loaded ${imageFiles.length} images.`, false);

        uploadSection.classList.add('hidden');
        editorSection.classList.remove('hidden');
        previewControls.classList.remove('hidden');

        updateFolderDropdown();
        handleControlsChange(); // Set initial control state and render preview
        updateUIForCurrentIndex();
    }

    function handleControlsChange() {
        // Update slider value displays
        fontSizeValueSpan.textContent = fontSizeSlider.value;
        headerHeightValueSpan.textContent = headerHeightSlider.value;
        textPositionValueSpan.textContent = textPositionSlider.value;
        textOffsetValueSpan.textContent = textOffsetSlider.value;
        
        updateTitleControlState();
        updateControlVisibility();
        renderPreview();
    }
    
    function updateControlVisibility() {
        const mode = titleModeSelect.value;
        const setVisible = (element, isVisible) => {
            element.closest('.control-group').classList.toggle('hidden', !isVisible);
        };
        setVisible(headerHeightSlider, mode === 'add-space' || mode === 'bleed');
        setVisible(bgColorPicker, mode === 'add-space' || mode === 'bleed');
        setVisible(positionToggle, mode === 'add-space' || mode === 'bleed');
        setVisible(textPositionSlider, mode === 'overlay');
        setVisible(textOffsetSlider, mode === 'bleed');
    }

    function handleTitleChange() {
        if (imageFiles.length > 0) {
            imageTitles[currentIndex] = titleInput.value;
            renderPreview();
        }
    }
    
    function updateTitleControlState() {
        const enabled = addTitleToggle.checked;
        titleOptionsWrapper.classList.toggle('disabled', !enabled);
    }

    function formatTitle(filename) {
        const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
        return nameWithoutExt.replace(/_/g, ' ').replace(/-/g, ' ');
    }

    async function drawImageWithTitle(ctx, imageFile, title, options) {
        const { addTitle, mode, fontSize, textColor } = options;
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                if (!addTitle) {
                    ctx.canvas.width = img.width;
                    ctx.canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    return resolve();
                }
                switch(mode) {
                    case 'overlay': {
                        const { textYPercent } = options;
                        ctx.canvas.width = img.width;
                        ctx.canvas.height = img.height;
                        ctx.drawImage(img, 0, 0);
                        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                        ctx.fillStyle = textColor;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                        ctx.shadowBlur = 8;
                        const textYOverlay = ctx.canvas.height * (textYPercent / 100);
                        ctx.fillText(title, ctx.canvas.width / 2, textYOverlay);
                        break;
                    }
                    case 'add-space':
                    case 'bleed': {
                        const { headerHeight, bgColor, position, textOffset } = options;
                        ctx.canvas.width = img.width;
                        ctx.canvas.height = img.height + headerHeight;
                        const isBelow = position === 'below';
                        const imageY = isBelow ? 0 : headerHeight;
                        const headerY = isBelow ? img.height : 0;
                        ctx.fillStyle = bgColor;
                        ctx.fillRect(0, headerY, ctx.canvas.width, headerHeight);
                        ctx.drawImage(img, 0, imageY);
                        let textY;
                        if (mode === 'add-space') {
                            textY = headerY + (headerHeight / 2);
                        } else {
                            const boundaryY = isBelow ? img.height : headerHeight;
                            textY = boundaryY + textOffset;
                        }
                        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                        ctx.fillStyle = textColor;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        if (mode === 'bleed') {
                           ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                           ctx.shadowBlur = 8;
                        }
                        ctx.fillText(title, ctx.canvas.width / 2, textY);
                        break;
                    }
                }
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                resolve();
            };
            img.onerror = () => reject(new Error(`Could not load image: ${imageFile.name}`));
            img.src = URL.createObjectURL(imageFile);
        });
    }

    function updateUIForCurrentIndex() {
        if (imageFiles.length === 0) return;
        imageCounter.textContent = `Image ${currentIndex + 1} / ${imageFiles.length}`;
        titleInput.value = imageTitles[currentIndex];
        folderSelect.value = imageFolders[currentIndex];
        renderPreview();
    }
    
    async function renderPreview() {
        if (imageFiles.length === 0) return;
        const options = { addTitle: addTitleToggle.checked, mode: titleModeSelect.value, fontSize: parseInt(fontSizeSlider.value, 10), textColor: textColorPicker.value, headerHeight: parseInt(headerHeightSlider.value, 10), bgColor: bgColorPicker.value, position: positionToggle.checked ? 'below' : 'above', textYPercent: parseInt(textPositionSlider.value, 10), textOffset: parseInt(textOffsetSlider.value, 10), };
        try {
            await drawImageWithTitle(previewCtx, imageFiles[currentIndex], imageTitles[currentIndex], options);
        } catch (error) {
            console.error('Failed to render preview:', error);
            showStatus(exportStatus, `Error rendering preview: ${error.message}`, true);
        }
    }

    async function handleExport() {
        if (imageFiles.length === 0) return;
        exportBtn.disabled = true;
        exportBtn.textContent = 'Processing...';
        showStatus(exportStatus, `Processing ${imageFiles.length} images...`, false);
        const zip = new JSZip();
        const options = { addTitle: addTitleToggle.checked, mode: titleModeSelect.value, fontSize: parseInt(fontSizeSlider.value, 10), textColor: textColorPicker.value, headerHeight: parseInt(headerHeightSlider.value, 10), bgColor: bgColorPicker.value, position: positionToggle.checked ? 'below' : 'above', textYPercent: parseInt(textPositionSlider.value, 10), textOffset: parseInt(textOffsetSlider.value, 10), };
        const processCanvas = document.createElement('canvas');
        const processCtx = processCanvas.getContext('2d');
        try {
            for (let i = 0; i < imageFiles.length; i++) {
                const file = imageFiles[i];
                const title = imageTitles[i];
                const folderName = imageFolders[i];
                showStatus(exportStatus, `Processing ${i + 1}/${imageFiles.length}: ${title}`, false);
                await drawImageWithTitle(processCtx, file, title, options);
                const blob = await new Promise(resolve => processCanvas.toBlob(resolve, 'image/png'));
                let filename = underscoreToggle.checked ? title.replace(/ /g, '_') : title;
                const newFilename = `${filename}.png`;
                if (folderName !== "(Root)") {
                    zip.folder(folderName).file(newFilename, blob);
                } else {
                    zip.file(newFilename, blob);
                }
            }
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = 'titled_images.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showStatus(exportStatus, `Success! Your ZIP file is downloading.`, false);
        } catch (error) {
            console.error('An error occurred during export:', error);
            showStatus(exportStatus, `An error occurred: ${error.message}`, true);
        } finally {
            exportBtn.disabled = false;
            exportBtn.textContent = 'Export All as .ZIP';
        }
    }

    function handleAddFolder() {
        const newFolderName = newFolderInput.value.trim();
        if (newFolderName && !availableFolders.includes(newFolderName)) {
            availableFolders.push(newFolderName);
            updateFolderDropdown();
            folderSelect.value = newFolderName;
            handleFolderAssignment();
            newFolderInput.value = '';
        }
    }

    function handleFolderAssignment() {
        if (imageFiles.length > 0) {
            imageFolders[currentIndex] = folderSelect.value;
        }
    }
    
    function updateFolderDropdown() {
        folderSelect.innerHTML = '';
        const foldersForDropdown = availableFolders.filter(f => f !== "All Images");
        foldersForDropdown.forEach(folderName => {
            const option = document.createElement('option');
            option.value = folderName;
            option.textContent = folderName;
            folderSelect.appendChild(option);
        });
    }

    function navigatePrev() {
        if (imageFiles.length === 0) return;
        currentIndex = (currentIndex - 1 + imageFiles.length) % imageFiles.length;
        updateUIForCurrentIndex();
    }

    function navigateNext() {
        if (imageFiles.length === 0) return;
        currentIndex = (currentIndex + 1) % imageFiles.length;
        updateUIForCurrentIndex();
    }

    function handleKeyPress(e) {
        if (editorSection.classList.contains('hidden') || document.activeElement === titleInput || document.activeElement === newFolderInput || !gridPopup.classList.contains('hidden')) { return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); navigatePrev(); } 
        else if (e.key === 'ArrowRight') { e.preventDefault(); navigateNext(); }
    }

    function showStatus(element, message, isError = false) {
        element.textContent = message;
        element.style.color = isError ? 'var(--accent-orange)' : 'var(--text-secondary)';
        element.classList.remove('hidden');
    }

    // =======================================================
    // --- NEW: IMAGE GRID FEATURE ---
    // =======================================================

    function openGridModal() {
        console.log("Debug: Opening grid modal.");
        gridStatus.textContent = '';
        gridStatus.classList.add('hidden');
        
        // Populate the source dropdown
        gridSourceSelect.innerHTML = '';
        const uniqueFolders = ["All Images", ...new Set(imageFolders)];
        uniqueFolders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder;
            option.textContent = folder;
            gridSourceSelect.appendChild(option);
        });

        document.body.classList.add('popup-open');
        gridPopup.classList.remove('hidden');
        updateGridPreview();
    }

    function closeGridModal() {
        console.log("Debug: Closing grid modal.");
        document.body.classList.remove('popup-open');
        gridPopup.classList.add('hidden');
    }

    async function updateGridPreview() {
        const source = gridSourceSelect.value;
        const columns = parseInt(gridColumnsInput.value, 10) || 1;
        
        const filteredIndices = getFilteredImageIndices(source);
        const imagesToProcess = filteredIndices.map(i => imageFiles[i]);

        if (imagesToProcess.length === 0) {
            console.warn("Debug: No images to process for grid preview.");
            gridPreviewCtx.clearRect(0, 0, gridPreviewCanvas.width, gridPreviewCanvas.height);
            gridOutputSize.textContent = `Dimensions: 0 x 0 px`;
            gridOutputMegapixels.textContent = `Total: 0.0 MP`;
            gridWarningBox.classList.add('hidden');
            return;
        }

        console.log(`Debug: Updating grid preview for ${imagesToProcess.length} images from source "${source}" with ${columns} columns.`);

        try {
            // Find max dimensions for uniform grid cells
            const dimensions = await Promise.all(imagesToProcess.map(getImageDimensions));
            const maxWidth = Math.max(...dimensions.map(d => d.width));
            const maxHeight = Math.max(...dimensions.map(d => d.height));

            const rows = Math.ceil(imagesToProcess.length / columns);
            const totalWidth = maxWidth * columns;
            const totalHeight = maxHeight * rows;
            const totalPixels = totalWidth * totalHeight;
            const megapixels = (totalPixels / 1000000).toFixed(1);

            // Update info box
            gridOutputSize.textContent = `Dimensions: ${totalWidth} x ${totalHeight} px`;
            gridOutputMegapixels.textContent = `Total: ${megapixels} MP`;

            if (totalPixels > MEGAPixel_limit) {
                gridWarningBox.classList.remove('hidden');
            } else {
                gridWarningBox.classList.add('hidden');
            }

            // Render low-res preview
            const previewWidth = gridPreviewCanvas.clientWidth;
            const scale = previewWidth / totalWidth;
            gridPreviewCanvas.width = previewWidth;
            gridPreviewCanvas.height = totalHeight * scale;

            gridPreviewCtx.fillStyle = 'var(--bg-primary)';
            gridPreviewCtx.fillRect(0,0, gridPreviewCanvas.width, gridPreviewCanvas.height);

            const cellWidth = maxWidth * scale;
            const cellHeight = maxHeight * scale;

            for (let i = 0; i < imagesToProcess.length; i++) {
                const img = await loadImage(imagesToProcess[i]);
                const row = Math.floor(i / columns);
                const col = i % columns;
                const x = col * cellWidth;
                const y = row * cellHeight;
                // Draw image centered in its cell
                const w = img.width * scale;
                const h = img.height * scale;
                const dx = x + (cellWidth - w) / 2;
                const dy = y + (cellHeight - h) / 2;
                gridPreviewCtx.drawImage(img, dx, dy, w, h);
            }

        } catch (error) {
            console.error("Error updating grid preview:", error);
            showStatus(gridStatus, 'Error generating preview.', true);
        }
    }

    async function handleGenerateGrid() {
        console.log("Debug: Starting high-resolution grid generation.");
        generateGridBtn.disabled = true;
        generateGridBtn.textContent = 'Processing...';
        showStatus(gridStatus, 'Loading images...', false);

        const source = gridSourceSelect.value;
        const columns = parseInt(gridColumnsInput.value, 10) || 1;
        const shouldDownscale = gridDownscaleToggle.checked;

        const filteredIndices = getFilteredImageIndices(source);
        const imagesToProcess = filteredIndices.map(i => imageFiles[i]);

        if (imagesToProcess.length === 0) {
            showStatus(gridStatus, 'No images selected to generate a grid.', true);
            generateGridBtn.disabled = false;
            generateGridBtn.textContent = 'Generate & Download Grid';
            return;
        }

        try {
            showStatus(gridStatus, `Loading ${imagesToProcess.length} full-resolution images...`, false);
            const loadedImages = await Promise.all(imagesToProcess.map(loadImage));

            const maxWidth = Math.max(...loadedImages.map(img => img.width));
            const maxHeight = Math.max(...loadedImages.map(img => img.height));
            
            const rows = Math.ceil(loadedImages.length / columns);
            let finalWidth = maxWidth * columns;
            let finalHeight = maxHeight * rows;
            let totalPixels = finalWidth * finalHeight;

            console.log(`Debug: Full resolution is ${finalWidth}x${finalHeight} (${(totalPixels/1e6).toFixed(1)}MP).`);

            if (shouldDownscale && totalPixels > MEGAPixel_limit) {
                const scaleFactor = Math.sqrt(MEGAPixel_limit / totalPixels);
                finalWidth = Math.floor(finalWidth * scaleFactor);
                finalHeight = Math.floor(finalHeight * scaleFactor);
                console.log(`Debug: Downscaling to ${finalWidth}x${finalHeight} with scale factor ${scaleFactor.toFixed(3)}.`);
                showStatus(gridStatus, 'Downscaling image...', false);
            }

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = finalWidth;
            finalCanvas.height = finalHeight;
            const finalCtx = finalCanvas.getContext('2d');
            
            finalCtx.fillStyle = '#000000'; // Black background for the grid
            finalCtx.fillRect(0, 0, finalWidth, finalHeight);

            const cellWidth = finalWidth / columns;
            const cellHeight = finalHeight / rows;

            showStatus(gridStatus, 'Compositing final grid...', false);

            for (let i = 0; i < loadedImages.length; i++) {
                const img = loadedImages[i];
                const row = Math.floor(i / columns);
                const col = i % columns;
                
                const aspectRatio = img.width / img.height;
                let drawWidth = cellWidth;
                let drawHeight = cellWidth / aspectRatio;

                if (drawHeight > cellHeight) {
                    drawHeight = cellHeight;
                    drawWidth = cellHeight * aspectRatio;
                }

                const x = col * cellWidth + (cellWidth - drawWidth) / 2;
                const y = row * cellHeight + (cellHeight - drawHeight) / 2;

                finalCtx.drawImage(img, x, y, drawWidth, drawHeight);
            }

            finalCanvas.toBlob(blob => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `image_grid_${source.replace(/\s/g, '_')}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showStatus(gridStatus, `Success! Your grid is downloading.`, false);
            }, 'image/png');

        } catch (error) {
            console.error("Error generating final grid:", error);
            showStatus(gridStatus, 'An error occurred during generation.', true);
        } finally {
            generateGridBtn.disabled = false;
            generateGridBtn.textContent = 'Generate & Download Grid';
        }
    }

    function getFilteredImageIndices(source) {
        if (source === "All Images") {
            return imageFiles.map((_, index) => index);
        }
        const indices = [];
        imageFolders.forEach((folder, index) => {
            if (folder === source) {
                indices.push(index);
            }
        });
        return indices;
    }

    function getImageDimensions(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = () => reject(new Error(`Could not get dimensions for ${file.name}`));
            img.src = URL.createObjectURL(file);
        });
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Could not load image ${file.name}`));
            img.src = URL.createObjectURL(file);
        });
    }

});