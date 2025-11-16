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
    const fontSizeLabel = document.getElementById('font-size-label');
    const textColorPicker = document.getElementById('text-color-picker');
    const autoScaleToggle = document.getElementById('auto-scale-toggle');
    const paddingInput = document.getElementById('padding-input');
    const paddingControlGroup = document.getElementById('padding-control-group');


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

    // Grid Feature DOM Elements
    const openGridModalBtn = document.getElementById('open-grid-modal-btn');
    const gridPopup = document.getElementById('grid-popup');
    const closeGridPopupBtn = gridPopup.querySelector('.popup-close-btn');
    const gridSourceSelect = document.getElementById('grid-source-select');
    const gridColumnsInput = document.getElementById('grid-columns-input');
    const gridAddTitlesToggle = document.getElementById('grid-add-titles-toggle');
    const gridWarningBox = document.getElementById('grid-warning-box');
    const gridDownscaleToggle = document.getElementById('grid-downscale-toggle');
    const gridOutputSize = document.getElementById('grid-output-size');
    const gridOutputMegapixels = document.getElementById('grid-output-megapixels');
    const gridPreviewCanvas = document.getElementById('grid-preview-canvas');
    const gridPreviewCtx = gridPreviewCanvas.getContext('2d');
    const generateGridBtn = document.getElementById('generate-grid-btn');
    const gridStatus = document.getElementById('grid-status');
    
    // --- NEW: Downscale Feature DOM Elements ---
    const openDownscaleModalBtn = document.getElementById('open-downscale-modal-btn');
    const downscalePopup = document.getElementById('downscale-popup');
    const closeDownscalePopupBtn = downscalePopup.querySelector('.popup-close-btn');
    const downscaleModeSelect = document.getElementById('downscale-mode-select');
    const downscaleDimensionsControls = document.getElementById('downscale-dimensions-controls');
    const downscaleMpControls = document.getElementById('downscale-mp-controls');
    const downscaleAspectLockToggle = document.getElementById('downscale-aspect-lock-toggle');
    const downscaleWidthInput = document.getElementById('downscale-width-input');
    const downscaleHeightInput = document.getElementById('downscale-height-input');
    const downscaleFitControls = document.getElementById('downscale-fit-controls');
    const downscaleFitSelect = document.getElementById('downscale-fit-select');
    const downscalePadColorWrapper = document.getElementById('downscale-pad-color-wrapper');
    const downscaleMpInput = document.getElementById('downscale-mp-input');
    const downscaleFormatSelect = document.getElementById('downscale-format-select');
    const downscaleQualityWrapper = document.getElementById('downscale-quality-wrapper');
    const downscaleQualitySlider = document.getElementById('downscale-quality-slider');
    const downscaleQualityValue = document.getElementById('downscale-quality-value');
    const downscaleGenerateBtn = document.getElementById('downscale-generate-btn');
    const downscaleStatus = document.getElementById('downscale-status');
    const downscaleErrorMessage = document.getElementById('downscale-error-message');


    // --- State ---
    let imageFiles = [];
    let imageTitles = [];
    let imageFolders = [];
    let availableFolders = ["(Root)"];
    let currentIndex = 0;
    const MEGAPixel_limit = 24 * 1000 * 1000;

    // --- Event Listeners ---
    directoryUploadInput.addEventListener('change', handleDirectoryUpload);
    exportBtn.addEventListener('click', handleExport);
    
    const allControls = [
        titleModeSelect, fontSizeSlider, headerHeightSlider, textColorPicker, 
        bgColorPicker, positionToggle, addTitleToggle, underscoreToggle, 
        textPositionSlider, textOffsetSlider, autoScaleToggle, paddingInput
    ];
    allControls.forEach(el => el.addEventListener('input', handleControlsChange));

    prevBtn.addEventListener('click', navigatePrev);
    nextBtn.addEventListener('click', navigateNext);
    titleInput.addEventListener('input', handleTitleChange);
    document.addEventListener('keydown', handleKeyPress);
    
    addFolderBtn.addEventListener('click', handleAddFolder);
    folderSelect.addEventListener('change', handleFolderAssignment);

    // Grid Feature Event Listeners
    openGridModalBtn.addEventListener('click', openGridModal);
    closeGridPopupBtn.addEventListener('click', closeGridModal);
    gridPopup.addEventListener('click', (e) => { if (e.target === gridPopup) closeGridModal(); });
    gridSourceSelect.addEventListener('change', updateGridPreview);
    gridColumnsInput.addEventListener('input', updateGridPreview);
    gridAddTitlesToggle.addEventListener('change', updateGridPreview);
    generateGridBtn.addEventListener('click', handleGenerateGrid);

    // --- NEW: Downscale Feature Event Listeners ---
    openDownscaleModalBtn.addEventListener('click', openDownscaleModal);
    closeDownscalePopupBtn.addEventListener('click', closeDownscaleModal);
    downscalePopup.addEventListener('click', (e) => { if (e.target === downscalePopup) closeDownscaleModal(); });
    downscaleModeSelect.addEventListener('input', updateDownscaleUI);
    downscaleAspectLockToggle.addEventListener('input', handleAspectRatioInputChange);
    downscaleWidthInput.addEventListener('input', () => handleAspectRatioInputChange('width'));
    downscaleHeightInput.addEventListener('input', () => handleAspectRatioInputChange('height'));
    downscaleFitSelect.addEventListener('input', updateDownscaleUI);
    downscaleFormatSelect.addEventListener('input', updateDownscaleUI);
    downscaleQualitySlider.addEventListener('input', () => {
        downscaleQualityValue.textContent = downscaleQualitySlider.value;
    });
    downscaleGenerateBtn.addEventListener('click', handleDownscaleGeneration);


    // --- Functions ---

    function handleDirectoryUpload(e) {
        const files = Array.from(e.target.files);
        console.log(`Debug: Found ${files.length} total files in directory.`);
        
        imageFiles = []; imageTitles = []; imageFolders = [];
        availableFolders = ["(Root)"]; currentIndex = 0;

        // --- THIS IS THE CORRECTED LINE ---
        // It now checks the file type OR the file extension.
        const imageRegex = /\.(jpe?g|png|gif|webp|bmp|svg)$/i;
        imageFiles = files.filter(file => file.type.startsWith('image/') || imageRegex.test(file.name));
        // --- END OF CORRECTION ---
        
        console.log(`Debug: Filtered down to ${imageFiles.length} image files.`);

        if (imageFiles.length === 0) {
            showStatus(uploadStatus, 'No valid image files (.jpg, .png, etc.) were found in the selected directory.', true);
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
        updateAutoScaleUI();
        renderPreview();
    }

    function updateAutoScaleUI() {
        const isAutoScale = autoScaleToggle.checked;
        paddingControlGroup.classList.toggle('hidden', !isAutoScale);
        if (isAutoScale) {
            fontSizeLabel.innerHTML = `Max Font Size: <span id="font-size-value">${fontSizeSlider.value}</span>px`;
        } else {
            fontSizeLabel.innerHTML = `Font Size: <span id="font-size-value">${fontSizeSlider.value}</span>px`;
        }
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
    
    function calculateAutoScaleFontSize(ctx, text, targetWidth, maxFontSize) {
        let currentSize = maxFontSize;
        const minSize = 8;
        while (currentSize > minSize) {
            ctx.font = `bold ${currentSize}px Inter, sans-serif`;
            const textMetrics = ctx.measureText(text);
            if (textMetrics.width <= targetWidth) {
                return currentSize;
            }
            currentSize--;
        }
        return minSize;
    }

    async function drawImageWithTitle(ctx, imageFile, title, options) {
        const { addTitle, mode, textColor } = options;
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                if (!addTitle) {
                    ctx.canvas.width = img.width;
                    ctx.canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    return resolve();
                }

                let headerHeight = 0;
                if (mode === 'add-space' || mode === 'bleed') {
                    headerHeight = options.headerHeight;
                }
                
                ctx.canvas.width = img.width;
                ctx.canvas.height = img.height + headerHeight;

                if (headerHeight > 0) {
                    const isBelow = options.position === 'below';
                    const imageY = isBelow ? 0 : headerHeight;
                    const headerY = isBelow ? img.height : 0;
                    ctx.fillStyle = options.bgColor;
                    ctx.fillRect(0, headerY, ctx.canvas.width, headerHeight);
                    ctx.drawImage(img, 0, imageY);
                } else {
                    ctx.drawImage(img, 0, 0);
                }

                let finalFontSize = options.fontSize;
                if (options.autoScale) {
                    const targetWidth = ctx.canvas.width - (options.padding * 2);
                    finalFontSize = calculateAutoScaleFontSize(ctx, title, targetWidth, options.fontSize);
                }

                ctx.font = `bold ${finalFontSize}px Inter, sans-serif`;
                ctx.fillStyle = textColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                if (mode === 'overlay' || mode === 'bleed') {
                   ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                   ctx.shadowBlur = 8;
                }

                let textY;
                if (mode === 'overlay') {
                    textY = ctx.canvas.height * (options.textYPercent / 100);
                } else if (mode === 'add-space') {
                    const isBelow = options.position === 'below';
                    const headerY = isBelow ? img.height : 0;
                    textY = headerY + (headerHeight / 2);
                } else { // bleed
                    const isBelow = options.position === 'below';
                    const boundaryY = isBelow ? img.height : headerHeight;
                    textY = boundaryY + options.textOffset;
                }

                ctx.fillText(title, ctx.canvas.width / 2, textY);
                
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
        if (editorSection.classList.contains('hidden') || document.activeElement === titleInput || document.activeElement === newFolderInput || !gridPopup.classList.contains('hidden') || !downscalePopup.classList.contains('hidden')) { return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); navigatePrev(); } 
        else if (e.key === 'ArrowRight') { e.preventDefault(); navigateNext(); }
    }

    function showStatus(element, message, isError = false) {
        element.textContent = message;
        element.style.color = isError ? 'var(--accent-orange)' : 'var(--text-secondary)';
        element.classList.remove('hidden');
    }

    function openGridModal() {
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
        document.body.classList.remove('popup-open');
        gridPopup.classList.add('hidden');
    }

    async function updateGridPreview() {
        const source = gridSourceSelect.value;
        const columns = parseInt(gridColumnsInput.value, 10) || 1;
        const addTitles = gridAddTitlesToggle.checked;
        const filteredIndices = getFilteredImageIndices(source);

        if (filteredIndices.length === 0) {
            gridPreviewCtx.clearRect(0, 0, gridPreviewCanvas.width, gridPreviewCanvas.height);
            gridOutputSize.textContent = `Dimensions: 0 x 0 px`;
            gridOutputMegapixels.textContent = `Total: 0.0 MP`;
            gridWarningBox.classList.add('hidden');
            return;
        }

        try {
            const titleOptions = getTitleOptionsFromUI();
            titleOptions.addTitle = addTitles;

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

            const previewWidth = gridPreviewCanvas.clientWidth || 800;
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

            if (shouldDownscale && totalPixels > MEGAPixel_limit) {
                const scaleFactor = Math.sqrt(MEGAPixel_limit / totalPixels);
                finalWidth = Math.floor(finalWidth * scaleFactor);
                finalHeight = Math.floor(finalHeight * scaleFactor);
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

    // --- NEW: Downscale Feature Functions ---

    function openDownscaleModal() {
        downscaleStatus.textContent = '';
        downscaleErrorMessage.textContent = '';
        document.body.classList.add('popup-open');
        downscalePopup.classList.remove('hidden');
        updateDownscaleUI();
        handleAspectRatioInputChange(); // Initialize values
    }

    function closeDownscaleModal() {
        document.body.classList.remove('popup-open');
        downscalePopup.classList.add('hidden');
    }

    function updateDownscaleUI() {
        const mode = downscaleModeSelect.value;
        const isDimensions = mode === 'dimensions';
        downscaleDimensionsControls.classList.toggle('hidden', !isDimensions);
        downscaleMpControls.classList.toggle('hidden', isDimensions);

        const isLocked = downscaleAspectLockToggle.checked;
        downscaleFitControls.classList.toggle('hidden', isLocked || !isDimensions);

        const isPad = downscaleFitSelect.value === 'pad';
        downscalePadColorWrapper.classList.toggle('hidden', !isPad || isLocked || !isDimensions);
        
        const format = downscaleFormatSelect.value;
        downscaleQualityWrapper.classList.toggle('hidden', format !== 'image/jpeg');
        downscaleQualityValue.textContent = downscaleQualitySlider.value;
    }

    async function handleAspectRatioInputChange(source) {
        if (!downscaleAspectLockToggle.checked || imageFiles.length === 0) return;

        const img = await loadImage(imageFiles[currentIndex]);
        const aspectRatio = img.width / img.height;
        
        const width = parseInt(downscaleWidthInput.value, 10);
        const height = parseInt(downscaleHeightInput.value, 10);

        if (source === 'width' && width > 0) {
            downscaleHeightInput.value = Math.round(width / aspectRatio);
        } else if (source === 'height' && height > 0) {
            downscaleWidthInput.value = Math.round(height * aspectRatio);
        } else if (width > 0) { // Default on open
             downscaleHeightInput.value = Math.round(width / aspectRatio);
        }
    }

    async function handleDownscaleGeneration() {
        if (imageFiles.length === 0) return;

        downscaleGenerateBtn.disabled = true;
        downscaleGenerateBtn.textContent = 'Processing...';
        showStatus(downscaleStatus, `Preparing ${imageFiles.length} images...`, false);
        downscaleErrorMessage.textContent = '';

        const zip = new JSZip();
        const processCanvas = document.createElement('canvas');
        const processCtx = processCanvas.getContext('2d');
        const mode = downscaleModeSelect.value;
        const format = downscaleFormatSelect.value;
        const quality = parseInt(downscaleQualitySlider.value, 10) / 100;
        const fileExtension = format === 'image/jpeg' ? 'jpg' : 'png';

        try {
            for (let i = 0; i < imageFiles.length; i++) {
                showStatus(downscaleStatus, `Processing ${i + 1}/${imageFiles.length}: ${imageTitles[i]}`, false);
                const img = await loadImage(imageFiles[i]);
                
                let targetWidth, targetHeight;

                if (mode === 'megapixels') {
                    const targetMP = parseFloat(downscaleMpInput.value) * 1000000;
                    if (targetMP > (img.width * img.height)) {
                        throw new Error(`Target megapixels for "${imageTitles[i]}" is larger than its original size. Upscaling is not supported.`);
                    }
                    const aspectRatio = img.width / img.height;
                    targetHeight = Math.sqrt(targetMP / aspectRatio);
                    targetWidth = targetHeight * aspectRatio;
                } else { // Dimensions
                    targetWidth = parseInt(downscaleWidthInput.value, 10);
                    targetHeight = parseInt(downscaleHeightInput.value, 10);
                    if ((targetWidth * targetHeight) > (img.width * img.height)) {
                        throw new Error(`Target dimensions for "${imageTitles[i]}" are larger than its original size. Upscaling is not supported.`);
                    }
                }

                processCanvas.width = Math.round(targetWidth);
                processCanvas.height = Math.round(targetHeight);

                const fitMode = downscaleAspectLockToggle.checked ? 'stretch' : downscaleFitSelect.value;
                
                if (fitMode === 'pad') {
                    const padColor = document.getElementById('downscale-pad-color-picker').value;
                    processCtx.fillStyle = padColor;
                    processCtx.fillRect(0, 0, processCanvas.width, processCanvas.height);
                }

                const imgAspectRatio = img.width / img.height;
                const canvasAspectRatio = processCanvas.width / processCanvas.height;
                let drawWidth, drawHeight, offsetX, offsetY;
                
                if (fitMode === 'stretch') {
                    drawWidth = processCanvas.width;
                    drawHeight = processCanvas.height;
                    offsetX = 0;
                    offsetY = 0;
                } else { // Pad
                    if (imgAspectRatio > canvasAspectRatio) {
                        drawWidth = processCanvas.width;
                        drawHeight = drawWidth / imgAspectRatio;
                    } else {
                        drawHeight = processCanvas.height;
                        drawWidth = drawHeight * imgAspectRatio;
                    }
                    offsetX = (processCanvas.width - drawWidth) / 2;
                    offsetY = (processCanvas.height - drawHeight) / 2;
                }

                processCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

                const blob = await new Promise(resolve => processCanvas.toBlob(resolve, format, quality));
                const filename = `${imageTitles[i]}.${fileExtension}`;
                zip.file(filename, blob);
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = 'downscaled_images.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showStatus(downscaleStatus, `Success! Your ZIP file is downloading.`, false);

        } catch (error) {
            console.error('An error occurred during downscale export:', error);
            showStatus(downscaleErrorMessage, error.message, true);
            showStatus(downscaleStatus, `An error occurred. Please check the message above.`, true);
        } finally {
            downscaleGenerateBtn.disabled = false;
            downscaleGenerateBtn.textContent = 'Generate & Download ZIP';
        }
    }


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
            autoScale: autoScaleToggle.checked,
            padding: parseInt(paddingInput.value, 10) || 0,
        };
    }

    async function getProcessedImage(file, title, options) {
        if (!options.addTitle) {
            return loadImage(file);
        }
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        await drawImageWithTitle(tempCtx, file, title, options);
        
        const finalImage = new Image();
        finalImage.src = tempCanvas.toDataURL();
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

    // Initialize UI on load
    handleControlsChange();
});