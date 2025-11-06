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
    const gridAddTitlesToggle = document.getElementById('grid-add-titles-toggle'); // New
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
    gridAddTitlesToggle.addEventListener('change', updateGridPreview); // New
    generateGridBtn.addEventListener('click', handleGenerateGrid);

    // --- Functions ---

    function handleDirectoryUpload(e) {
        const files = Array.from(e.target.files);
        imageFiles = []; imageTitles = []; imageFolders = []; availableFolders = ["(Root)"]; currentIndex = 0;
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
        handleControlsChange();
        updateUIForCurrentIndex();
    }

    function handleControlsChange() {
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
        titleOptionsWrapper.classList.toggle('disabled', !addTitleToggle.checked);
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
                        if (mode === 'add-space') { textY = headerY + (headerHeight / 2); } 
                        else { const boundaryY = isBelow ? img.height : headerHeight; textY = boundaryY + textOffset; }
                        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                        ctx.fillStyle = textColor;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        if (mode === 'bleed') { ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'; ctx.shadowBlur = 8; }
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
        try {
            await drawImageWithTitle(previewCtx, imageFiles[currentIndex], imageTitles[currentIndex], getTitleOptionsFromUI());
        } catch (error) {
            console.error('Failed to render preview:', error);
            showStatus(exportStatus, `Error rendering preview: ${error.message}`, true);
        }
    }

    async function handleExport() {
        if (imageFiles.length === 0) return;
        exportBtn.disabled = true; exportBtn.textContent = 'Processing...';
        showStatus(exportStatus, `Processing ${imageFiles.length} images...`, false);
        const zip = new JSZip();
        const options = getTitleOptionsFromUI();
        const processCanvas = document.createElement('canvas');
        const processCtx = processCanvas.getContext('2d');
        try {
            for (let i = 0; i < imageFiles.length; i++) {
                showStatus(exportStatus, `Processing ${i + 1}/${imageFiles.length}: ${imageTitles[i]}`, false);
                await drawImageWithTitle(processCtx, imageFiles[i], imageTitles[i], options);
                const blob = await new Promise(resolve => processCanvas.toBlob(resolve, 'image/png'));
                let filename = underscoreToggle.checked ? imageTitles[i].replace(/ /g, '_') : imageTitles[i];
                if (imageFolders[i] !== "(Root)") { zip.folder(imageFolders[i]).file(`${filename}.png`, blob); } 
                else { zip.file(`${filename}.png`, blob); }
            }
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = 'titled_images.zip';
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            showStatus(exportStatus, `Success! Your ZIP file is downloading.`, false);
        } catch (error) {
            console.error('An error occurred during export:', error);
            showStatus(exportStatus, `An error occurred: ${error.message}`, true);
        } finally {
            exportBtn.disabled = false; exportBtn.textContent = 'Export All as .ZIP';
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
        if (imageFiles.length > 0) imageFolders[currentIndex] = folderSelect.value;
    }
    
    function updateFolderDropdown() {
        folderSelect.innerHTML = '';
        const foldersForDropdown = availableFolders.filter(f => f !== "All Images");
        foldersForDropdown.forEach(folderName => {
            const option = document.createElement('option');
            option.value = folderName; option.textContent = folderName;
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
    // --- IMAGE GRID FEATURE ---
    // =======================================================

    function openGridModal() {
        console.log("Debug: Opening grid modal.");
        gridStatus.textContent = ''; gridStatus.classList.add('hidden');
        gridSourceSelect.innerHTML = '';
        ["All Images", ...new Set(imageFolders)].forEach(folder => {
            const option = document.createElement('option');
            option.value = folder; option.textContent = folder;
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
        const addTitles = gridAddTitlesToggle.checked;
        const filteredIndices = getFilteredImageIndices(source);

        if (filteredIndices.length === 0) {
            console.warn("Debug: No images to process for grid preview.");
            gridPreviewCtx.clearRect(0, 0, gridPreviewCanvas.width, gridPreviewCanvas.height);
            gridOutputSize.textContent = `Dimensions: 0 x 0 px`;
            gridOutputMegapixels.textContent = `Total: 0.0 MP`;
            gridWarningBox.classList.add('hidden');
            return;
        }

        console.log(`Debug: Updating grid preview. Source: "${source}", Columns: ${columns}, Add Titles: ${addTitles}`);

        try {
            const titleOptions = getTitleOptionsFromUI();
            titleOptions.addTitle = addTitles; // Override with the grid's own toggle state

            // Process all images first (applies titles if checked) to get final dimensions
            const processedImages = await Promise.all(
                filteredIndices.map(i => getProcessedImage(imageFiles[i], imageTitles[i], titleOptions))
            );
            
            const maxWidth = Math.max(...processedImages.map(img => img.width));
            const maxHeight = Math.max(...processedImages.map(img => img.height));
            const rows = Math.ceil(processedImages.length / columns);
            const totalWidth = maxWidth * columns;
            const totalHeight = maxHeight * rows;
            const totalPixels = totalWidth * totalHeight;
            const megapixels = (totalPixels / 1000000).toFixed(1);

            gridOutputSize.textContent = `Dimensions: ${totalWidth} x ${totalHeight} px`;
            gridOutputMegapixels.textContent = `Total: ${megapixels} MP`;
            gridWarningBox.classList.toggle('hidden', totalPixels <= MEGAPixel_limit);

            const previewWidth = gridPreviewCanvas.clientWidth || 800; // Fallback width
            const scale = previewWidth / totalWidth;
            gridPreviewCanvas.width = previewWidth;
            gridPreviewCanvas.height = totalHeight * scale;
            gridPreviewCtx.fillStyle = 'var(--bg-primary)';
            gridPreviewCtx.fillRect(0,0, gridPreviewCanvas.width, gridPreviewCanvas.height);

            const cellWidth = maxWidth * scale;
            const cellHeight = maxHeight * scale;

            processedImages.forEach((img, i) => {
                const row = Math.floor(i / columns);
                const col = i % columns;
                const x = col * cellWidth, y = row * cellHeight;
                const w = img.width * scale, h = img.height * scale;
                const dx = x + (cellWidth - w) / 2, dy = y + (cellHeight - h) / 2;
                gridPreviewCtx.drawImage(img, dx, dy, w, h);
            });
        } catch (error) {
            console.error("Error updating grid preview:", error);
            showStatus(gridStatus, 'Error generating preview.', true);
        }
    }

    async function handleGenerateGrid() {
        console.log("Debug: Starting high-resolution grid generation.");
        generateGridBtn.disabled = true; generateGridBtn.textContent = 'Processing...';
        showStatus(gridStatus, 'Preparing images...', false);

        const source = gridSourceSelect.value;
        const columns = parseInt(gridColumnsInput.value, 10) || 1;
        const addTitles = gridAddTitlesToggle.checked;
        const shouldDownscale = gridDownscaleToggle.checked;
        const filteredIndices = getFilteredImageIndices(source);

        if (filteredIndices.length === 0) {
            showStatus(gridStatus, 'No images selected.', true);
            generateGridBtn.disabled = false; generateGridBtn.textContent = 'Generate & Download Grid';
            return;
        }

        try {
            const titleOptions = getTitleOptionsFromUI();
            titleOptions.addTitle = addTitles;

            showStatus(gridStatus, `Processing ${filteredIndices.length} images...`, false);
            const processedImages = await Promise.all(
                filteredIndices.map(i => getProcessedImage(imageFiles[i], imageTitles[i], titleOptions))
            );

            const maxWidth = Math.max(...processedImages.map(img => img.width));
            const maxHeight = Math.max(...processedImages.map(img => img.height));
            const rows = Math.ceil(processedImages.length / columns);
            let finalWidth = maxWidth * columns;
            let finalHeight = maxHeight * rows;
            let totalPixels = finalWidth * finalHeight;

            console.log(`Debug: Full resolution is ${finalWidth}x${finalHeight} (${(totalPixels/1e6).toFixed(1)}MP).`);
            if (shouldDownscale && totalPixels > MEGAPixel_limit) {
                const scaleFactor = Math.sqrt(MEGAPixel_limit / totalPixels);
                finalWidth = Math.floor(finalWidth * scaleFactor);
                finalHeight = Math.floor(finalHeight * scaleFactor);
                console.log(`Debug: Downscaling to ${finalWidth}x${finalHeight}.`);
                showStatus(gridStatus, 'Downscaling image...', false);
            }

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = finalWidth; finalCanvas.height = finalHeight;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.fillStyle = '#000000';
            finalCtx.fillRect(0, 0, finalWidth, finalHeight);
            const cellWidth = finalWidth / columns, cellHeight = finalHeight / rows;

            showStatus(gridStatus, 'Compositing final grid...', false);
            processedImages.forEach((img, i) => {
                const row = Math.floor(i / columns);
                const col = i % columns;
                const aspect = img.width / img.height;
                let dw = cellWidth, dh = cellWidth / aspect;
                if (dh > cellHeight) { dh = cellHeight; dw = cellHeight * aspect; }
                const x = col * cellWidth + (cellWidth - dw) / 2;
                const y = row * cellHeight + (cellHeight - dh) / 2;
                finalCtx.drawImage(img, x, y, dw, dh);
            });

            finalCanvas.toBlob(blob => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `image_grid_${source.replace(/\s/g, '_')}.png`;
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
                showStatus(gridStatus, `Success! Your grid is downloading.`, false);
            }, 'image/png');
        } catch (error) {
            console.error("Error generating final grid:", error);
            showStatus(gridStatus, 'An error occurred during generation.', true);
        } finally {
            generateGridBtn.disabled = false; generateGridBtn.textContent = 'Generate & Download Grid';
        }
    }

    // --- Helper Functions ---

    function getTitleOptionsFromUI() {
        return {
            addTitle: addTitleToggle.checked,
            mode: titleModeSelect.value,
            fontSize: parseInt(fontSizeSlider.value, 10),
            textColor: textColorPicker.value,
            headerHeight: parseInt(headerHeightSlider.value, 10),
            bgColor: bgColorPicker.value,
            position: positionToggle.checked ? 'below' : 'above',
            textYPercent: parseInt(textPositionSlider.value, 10),
            textOffset: parseInt(textOffsetSlider.value, 10),
        };
    }

    async function getProcessedImage(file, title, options) {
        if (!options.addTitle) {
            return loadImage(file); // Return original image if titles are off
        }
        // If titles are on, draw to a temporary canvas and return that as an image
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        await drawImageWithTitle(tempCtx, file, title, options);
        
        const finalImage = new Image();
        const dataUrl = tempCanvas.toDataURL();
        finalImage.src = dataUrl;
        await new Promise((resolve, reject) => {
            finalImage.onload = resolve;
            finalImage.onerror = reject;
        });
        return finalImage;
    }

    function getFilteredImageIndices(source) {
        if (source === "All Images") {
            return imageFiles.map((_, index) => index);
        }
        return imageFolders.map((folder, index) => (folder === source ? index : -1)).filter(index => index !== -1);
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