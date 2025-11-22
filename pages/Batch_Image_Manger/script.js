document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: App Initialized");

    // --- DOM Elements ---
    const directoryUploadInput = document.getElementById('directory-upload');
    const uploadSection = document.getElementById('upload-section');
    const editorSection = document.getElementById('editor-section');
    const previewCanvas = document.getElementById('preview-canvas');
    const exportBtn = document.getElementById('export-btn');
    const uploadStatus = document.getElementById('upload-status');
    const exportStatus = document.getElementById('export-status');
    const previewCtx = previewCanvas.getContext('2d');

    // Main Customization Controls
    const addTitleToggle = document.getElementById('add-title-toggle');
    const underscoreToggle = document.getElementById('underscore-toggle');
    const titleOptionsWrapper = document.getElementById('title-options-wrapper');
    const titleModeSelect = document.getElementById('title-mode-select');
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeValueSpan = document.getElementById('font-size-value');
    const textColorPicker = document.getElementById('text-color-picker');
    const autoScaleToggle = document.getElementById('auto-scale-toggle');
    
    // New Main Export Controls (Format, Quality, Prefix/Suffix)
    const exportFormatSelect = document.getElementById('export-format-select');
    const mainQualityWrapper = document.getElementById('main-quality-wrapper');
    const mainQualitySlider = document.getElementById('main-quality-slider');
    const mainQualityValue = document.getElementById('main-quality-value');
    const filenamePrefixInput = document.getElementById('filename-prefix');
    const filenameSuffixInput = document.getElementById('filename-suffix');

    // Height/Pos Controls
    const headerHeightSlider = document.getElementById('header-height-slider');
    const headerHeightValueSpan = document.getElementById('header-height-value');
    const bgColorPicker = document.getElementById('bg-color-picker');
    const positionToggle = document.getElementById('position-toggle'); // Bottom toggle
    const textPositionSlider = document.getElementById('text-position-slider'); // Overlay Y
    const textPositionValueSpan = document.getElementById('text-position-value');
    const textOffsetSlider = document.getElementById('text-offset-slider'); // Bleed offset
    const textOffsetValueSpan = document.getElementById('text-offset-value');

    // Groups for visibility toggling
    const headerHeightGroup = document.getElementById('header-height-group');
    const textOffsetGroup = document.getElementById('text-offset-group');
    const textPosGroup = document.getElementById('text-pos-group');
    const bgColorGroup = document.getElementById('bg-color-group');

    // Nav Controls
    const previewControls = document.getElementById('preview-controls');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const titleInput = document.getElementById('title-input');
    const imageCounter = document.getElementById('image-counter');
    const newFolderInput = document.getElementById('new-folder-input');
    const addFolderBtn = document.getElementById('add-folder-btn');
    const folderSelect = document.getElementById('folder-select');

    // Grid DOM
    const openGridModalBtn = document.getElementById('open-grid-modal-btn');
    const gridPopup = document.getElementById('grid-popup');
    const closeGridPopupBtn = gridPopup.querySelector('.popup-close-btn');
    const gridSourceSelect = document.getElementById('grid-source-select');
    const gridColumnsInput = document.getElementById('grid-columns-input');
    const gridAddTitlesToggle = document.getElementById('grid-add-titles-toggle');
    const gridMatchSmallestToggle = document.getElementById('grid-match-smallest-toggle'); // New
    const gridWarningBox = document.getElementById('grid-warning-box');
    const gridDownscaleToggle = document.getElementById('grid-downscale-toggle');
    const gridOutputSize = document.getElementById('grid-output-size');
    const gridOutputMegapixels = document.getElementById('grid-output-megapixels');
    const gridPreviewCanvas = document.getElementById('grid-preview-canvas');
    const gridPreviewCtx = gridPreviewCanvas.getContext('2d');
    const generateGridBtn = document.getElementById('generate-grid-btn');
    const gridStatus = document.getElementById('grid-status');

    // Downscale DOM
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
    const downscalePrefixInput = document.getElementById('downscale-prefix');
    const downscaleSuffixInput = document.getElementById('downscale-suffix');
    const downscaleGenerateBtn = document.getElementById('downscale-generate-btn');
    const downscaleStatus = document.getElementById('downscale-status');
    const downscaleErrorMessage = document.getElementById('downscale-error-message');
    const downscaleOriginalResolution = document.getElementById('downscale-original-resolution');
    const downscaleApplyTitlesToggle = document.getElementById('downscale-apply-titles-toggle');
    const downscaleUseSubfoldersToggle = document.getElementById('downscale-use-subfolders-toggle');

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

    // Main Control Listeners
    const allControls = [
        titleModeSelect, fontSizeSlider, headerHeightSlider, textColorPicker, 
        bgColorPicker, positionToggle, addTitleToggle, underscoreToggle, 
        textPositionSlider, textOffsetSlider, autoScaleToggle
    ];
    allControls.forEach(el => el.addEventListener('input', handleControlsChange));

    // New Format Listeners
    exportFormatSelect.addEventListener('change', () => {
        const isPng = exportFormatSelect.value === 'image/png';
        mainQualityWrapper.classList.toggle('hidden', isPng);
    });
    mainQualitySlider.addEventListener('input', () => {
        mainQualityValue.textContent = mainQualitySlider.value;
    });

    // Navigation
    prevBtn.addEventListener('click', navigatePrev);
    nextBtn.addEventListener('click', navigateNext);
    titleInput.addEventListener('input', handleTitleChange);
    document.addEventListener('keydown', handleKeyPress);
    
    // Folders
    addFolderBtn.addEventListener('click', handleAddFolder);
    folderSelect.addEventListener('change', handleFolderAssignment);

    // Grid Listeners
    openGridModalBtn.addEventListener('click', openGridModal);
    closeGridPopupBtn.addEventListener('click', closeGridModal);
    gridPopup.addEventListener('click', (e) => { if (e.target === gridPopup) closeGridModal(); });
    gridSourceSelect.addEventListener('change', updateGridPreview);
    gridColumnsInput.addEventListener('input', updateGridPreview);
    gridAddTitlesToggle.addEventListener('change', updateGridPreview);
    gridMatchSmallestToggle.addEventListener('change', updateGridPreview); // New listener
    generateGridBtn.addEventListener('click', handleGenerateGrid);

    // Downscale Listeners
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
        console.log(`DEBUG: Upload started. Found ${files.length} files.`);
        
        imageFiles = []; imageTitles = []; imageFolders = [];
        availableFolders = ["(Root)"]; currentIndex = 0;

        const imageRegex = /\.(jpe?g|png|gif|webp|bmp|svg|avif)$/i;
        imageFiles = files.filter(file => file.type.startsWith('image/') || imageRegex.test(file.name));
        
        console.log(`DEBUG: Filtered to ${imageFiles.length} images.`);

        if (imageFiles.length === 0) {
            showStatus(uploadStatus, 'No valid image files found.', true);
            return;
        }

        imageFiles.sort((a, b) => a.name.localeCompare(b.name));

        imageFiles.forEach(file => {
            imageTitles.push(formatTitle(file.name));
            imageFolders.push("(Root)");
        });

        showStatus(uploadStatus, `Loaded ${imageFiles.length} images.`, false);

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

        updateControlVisibility();
        updateTitleControlState();
        renderPreview();
    }
    
    function updateControlVisibility() {
        const mode = titleModeSelect.value;
        headerHeightGroup.classList.toggle('hidden', mode === 'overlay');
        bgColorGroup.classList.toggle('hidden', mode === 'overlay');
        textPosGroup.classList.toggle('hidden', mode !== 'overlay');
        textOffsetGroup.classList.toggle('hidden', mode !== 'bleed');
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

    function getFileExtension(mimeType) {
        switch(mimeType) {
            case 'image/jpeg': return '.jpg';
            case 'image/webp': return '.webp';
            case 'image/avif': return '.avif';
            default: return '.png';
        }
    }

    async function drawImageWithTitle(ctx, imageFile, title, options) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                if (!options.addTitle) {
                    ctx.canvas.width = img.width;
                    ctx.canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    return resolve();
                }

                let headerHeight = 0;
                if (options.mode === 'add-space' || options.mode === 'bleed') {
                    headerHeight = options.headerHeight;
                }
                
                // Canvas resizing logic
                ctx.canvas.width = img.width;
                ctx.canvas.height = (options.mode === 'add-space') ? img.height + headerHeight : img.height;

                if (options.mode === 'add-space') {
                    const isBelow = options.position === 'below';
                    const imageY = isBelow ? 0 : headerHeight;
                    const headerY = isBelow ? img.height : 0;
                    
                    // Draw BG
                    ctx.fillStyle = options.bgColor;
                    ctx.fillRect(0, headerY, ctx.canvas.width, headerHeight);
                    // Draw Img
                    ctx.drawImage(img, 0, imageY);
                } else {
                    // Draw Img first
                    ctx.drawImage(img, 0, 0);
                    // Draw BG for bleed
                    if (options.mode === 'bleed') {
                         const isBelow = options.position === 'below';
                         const rectY = isBelow ? img.height - headerHeight : 0;
                         ctx.fillStyle = options.bgColor;
                         ctx.fillRect(0, rectY, ctx.canvas.width, headerHeight);
                    }
                }

                // Font Scaling
                let finalFontSize = options.fontSize;
                if (options.autoScale) {
                    // Simple heuristic for auto-scale: max 90% width
                    const maxW = ctx.canvas.width * 0.9;
                    let testSize = options.fontSize;
                    ctx.font = `bold ${testSize}px Inter, sans-serif`;
                    while (ctx.measureText(title).width > maxW && testSize > 10) {
                        testSize -= 2;
                        ctx.font = `bold ${testSize}px Inter, sans-serif`;
                    }
                    finalFontSize = testSize;
                }

                ctx.font = `bold ${finalFontSize}px Inter, sans-serif`;
                ctx.fillStyle = options.textColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                if (options.mode === 'overlay') {
                   ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                   ctx.shadowBlur = 8;
                }

                let textY;
                if (options.mode === 'overlay') {
                    textY = ctx.canvas.height * (options.textYPercent / 100);
                } else if (options.mode === 'add-space') {
                    const isBelow = options.position === 'below';
                    const headerY = isBelow ? img.height : 0;
                    textY = headerY + (headerHeight / 2);
                } else { // bleed
                    const isBelow = options.position === 'below';
                    const rectY = isBelow ? img.height - headerHeight : 0;
                    textY = rectY + (headerHeight / 2) + options.textOffset;
                }

                ctx.fillText(title, ctx.canvas.width / 2, textY);
                
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                resolve();
            };
            img.onerror = (e) => {
                console.error("DEBUG: Image load failed", e);
                reject(new Error(`Could not load image: ${imageFile.name}`));
            };
            img.src = URL.createObjectURL(imageFile);
        });
    }

    function updateUIForCurrentIndex() {
        if (imageFiles.length === 0) return;
        imageCounter.textContent = `${currentIndex + 1} / ${imageFiles.length}`;
        titleInput.value = imageTitles[currentIndex];
        folderSelect.value = imageFolders[currentIndex];
        renderPreview();
    }
    
    async function renderPreview() {
        if (imageFiles.length === 0) return;
        try {
            await drawImageWithTitle(previewCtx, imageFiles[currentIndex], imageTitles[currentIndex], getTitleOptionsFromUI());
        } catch (error) {
            showStatus(exportStatus, `Error: ${error.message}`, true);
        }
    }

    // --- Main Export Function ---
    async function handleExport() {
        if (imageFiles.length === 0) return;
        
        exportBtn.disabled = true; 
        exportBtn.textContent = 'Processing...';
        showStatus(exportStatus, `Processing ${imageFiles.length} images...`, false);

        const zip = new JSZip();
        const options = getTitleOptionsFromUI();
        const processCanvas = document.createElement('canvas');
        const processCtx = processCanvas.getContext('2d');

        // Format Settings
        const format = exportFormatSelect.value; // e.g., image/png
        const quality = parseInt(mainQualitySlider.value, 10) / 100;
        const ext = getFileExtension(format);
        const prefix = filenamePrefixInput.value || "";
        const suffix = filenameSuffixInput.value || "";

        console.log(`DEBUG: Starting Export. Format: ${format}, Quality: ${quality}, Ext: ${ext}`);

        try {
            for (let i = 0; i < imageFiles.length; i++) {
                showStatus(exportStatus, `Processing ${i + 1}/${imageFiles.length}...`, false);
                
                // Draw to canvas
                await drawImageWithTitle(processCtx, imageFiles[i], imageTitles[i], options);
                
                // Create Blob with correct format
                const blob = await new Promise(resolve => processCanvas.toBlob(resolve, format, quality));
                
                if (!blob) throw new Error(`Failed to create blob for image ${i}`);

                // Build Filename
                let baseName = imageTitles[i];
                if (underscoreToggle.checked) baseName = baseName.replace(/ /g, '_');
                const finalName = `${prefix}${baseName}${suffix}${ext}`;

                // Add to Zip
                if (imageFolders[i] !== "(Root)") { 
                    zip.folder(imageFolders[i]).file(finalName, blob); 
                } else { 
                    zip.file(finalName, blob); 
                }
            }

            console.log("DEBUG: Zipping files...");
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = 'processed_images.zip';
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            
            showStatus(exportStatus, `Download Started!`, false);
        } catch (error) {
            console.error("DEBUG: Export Error", error);
            showStatus(exportStatus, `Error: ${error.message}`, true);
        } finally {
            exportBtn.disabled = false; 
            exportBtn.textContent = 'Export All as .ZIP';
        }
    }

    // --- Subfolder Logic ---
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
        availableFolders.forEach(folderName => {
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
        if (editorSection.classList.contains('hidden') || document.activeElement.tagName === 'INPUT' || !gridPopup.classList.contains('hidden') || !downscalePopup.classList.contains('hidden')) { return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); navigatePrev(); } 
        else if (e.key === 'ArrowRight') { e.preventDefault(); navigateNext(); }
    }

    function showStatus(element, message, isError = false) {
        element.textContent = message;
        element.style.color = isError ? 'var(--accent-orange)' : 'var(--text-secondary)';
        element.classList.remove('hidden');
    }

    // --- Grid Feature ---
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
        const matchSmallest = gridMatchSmallestToggle.checked;
        const filteredIndices = getFilteredImageIndices(source);

        if (filteredIndices.length === 0) return;

        try {
            const titleOptions = getTitleOptionsFromUI();
            titleOptions.addTitle = addTitles;

            const processedImages = await Promise.all(
                filteredIndices.map(i => getProcessedImage(imageFiles[i], imageTitles[i], titleOptions))
            );
            
            // Grid calc logic (Updated for Match Smallest)
            let cellWidth, cellHeight;
            
            if (matchSmallest) {
                cellWidth = Math.min(...processedImages.map(img => img.width));
                cellHeight = Math.min(...processedImages.map(img => img.height));
            } else {
                cellWidth = Math.max(...processedImages.map(img => img.width));
                cellHeight = Math.max(...processedImages.map(img => img.height));
            }

            const rows = Math.ceil(processedImages.length / columns);
            const totalWidth = cellWidth * columns;
            const totalHeight = cellHeight * rows;
            const totalPixels = totalWidth * totalHeight;
            const megapixels = (totalPixels / 1000000).toFixed(1);

            gridOutputSize.textContent = `${totalWidth} x ${totalHeight} px`;
            gridOutputMegapixels.textContent = `${megapixels} MP`;
            gridWarningBox.classList.toggle('hidden', totalPixels <= MEGAPixel_limit);

            // Render small preview
            const previewWidth = gridPreviewCanvas.clientWidth || 800;
            const scale = previewWidth / totalWidth;
            gridPreviewCanvas.width = previewWidth;
            gridPreviewCanvas.height = totalHeight * scale;
            
            gridPreviewCtx.fillStyle = '#111115';
            gridPreviewCtx.fillRect(0,0, gridPreviewCanvas.width, gridPreviewCanvas.height);

            const scaledCellW = cellWidth * scale;
            const scaledCellH = cellHeight * scale;

            processedImages.forEach((img, i) => {
                const row = Math.floor(i / columns);
                const col = i % columns;
                const x = col * scaledCellW;
                const y = row * scaledCellH;
                
                // Center image in cell (Scale Logic updated)
                const aspect = img.width / img.height;
                let dw = scaledCellW;
                let dh = scaledCellW / aspect;

                if (dh > scaledCellH) {
                    dh = scaledCellH;
                    dw = scaledCellH * aspect;
                }

                const dx = x + (scaledCellW - dw) / 2;
                const dy = y + (scaledCellH - dh) / 2;
                
                gridPreviewCtx.drawImage(img, dx, dy, dw, dh);
            });
        } catch (error) {
            console.error("DEBUG: Grid Preview Error", error);
        }
    }

    async function handleGenerateGrid() {
        generateGridBtn.disabled = true; generateGridBtn.textContent = 'Processing...';
        showStatus(gridStatus, 'Generating Grid...', false);

        const source = gridSourceSelect.value;
        const columns = parseInt(gridColumnsInput.value, 10) || 1;
        const addTitles = gridAddTitlesToggle.checked;
        const matchSmallest = gridMatchSmallestToggle.checked;
        const shouldDownscale = gridDownscaleToggle.checked;
        const filteredIndices = getFilteredImageIndices(source);

        try {
            const titleOptions = getTitleOptionsFromUI();
            titleOptions.addTitle = addTitles;

            const processedImages = await Promise.all(
                filteredIndices.map(i => getProcessedImage(imageFiles[i], imageTitles[i], titleOptions))
            );

            // Grid dimensions (Updated for Match Smallest)
            let cellWidth, cellHeight;
            if (matchSmallest) {
                cellWidth = Math.min(...processedImages.map(img => img.width));
                cellHeight = Math.min(...processedImages.map(img => img.height));
            } else {
                cellWidth = Math.max(...processedImages.map(img => img.width));
                cellHeight = Math.max(...processedImages.map(img => img.height));
            }

            const rows = Math.ceil(processedImages.length / columns);
            let finalWidth = cellWidth * columns;
            let finalHeight = cellHeight * rows;
            let totalPixels = finalWidth * finalHeight;

            let scaleFactor = 1;
            if (shouldDownscale && totalPixels > MEGAPixel_limit) {
                scaleFactor = Math.sqrt(MEGAPixel_limit / totalPixels);
                finalWidth = Math.floor(finalWidth * scaleFactor);
                finalHeight = Math.floor(finalHeight * scaleFactor);
            }

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = finalWidth; finalCanvas.height = finalHeight;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.fillStyle = '#000000';
            finalCtx.fillRect(0, 0, finalWidth, finalHeight);
            
            // Recalculate cell size after potential downscaling
            const finalCellWidth = finalWidth / columns;
            const finalCellHeight = finalHeight / rows;

            processedImages.forEach((img, i) => {
                const row = Math.floor(i / columns);
                const col = i % columns;
                const aspect = img.width / img.height;
                
                // Calculate fit dimensions
                let dw = finalCellWidth, dh = finalCellWidth / aspect;
                if (dh > finalCellHeight) { dh = finalCellHeight; dw = finalCellHeight * aspect; }
                
                const x = col * finalCellWidth + (finalCellWidth - dw) / 2;
                const y = row * finalCellHeight + (finalCellHeight - dh) / 2;
                finalCtx.drawImage(img, x, y, dw, dh);
            });

            finalCanvas.toBlob(blob => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `grid_${source.replace(/\s/g, '_')}.png`;
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
                showStatus(gridStatus, `Downloaded!`, false);
            }, 'image/png');

        } catch (error) {
            console.error("DEBUG: Grid Gen Error", error);
            showStatus(gridStatus, 'Error occurred.', true);
        } finally {
            generateGridBtn.disabled = false; generateGridBtn.textContent = 'Download Grid (PNG)';
        }
    }

    // --- Downscale Feature ---

    async function openDownscaleModal() {
        downscaleStatus.textContent = '';
        downscaleErrorMessage.textContent = '';

        if (imageFiles.length > 0) {
            const img = await loadImage(imageFiles[currentIndex]);
            downscaleOriginalResolution.textContent = `Current Image: ${img.width} x ${img.height} px`;
        }

        document.body.classList.add('popup-open');
        downscalePopup.classList.remove('hidden');
        updateDownscaleUI();
        handleAspectRatioInputChange();
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
        downscaleQualityWrapper.classList.toggle('hidden', format === 'image/png');
        downscaleQualityValue.textContent = downscaleQualitySlider.value;
    }

    async function handleAspectRatioInputChange(source) {
        if (!downscaleAspectLockToggle.checked || imageFiles.length === 0) return;
        const img = await loadImage(imageFiles[currentIndex]);
        const aspectRatio = img.width / img.height;
        const w = parseInt(downscaleWidthInput.value, 10);
        const h = parseInt(downscaleHeightInput.value, 10);

        if (source === 'width' && w > 0) downscaleHeightInput.value = Math.round(w / aspectRatio);
        else if (source === 'height' && h > 0) downscaleWidthInput.value = Math.round(h * aspectRatio);
        else if (w > 0) downscaleHeightInput.value = Math.round(w / aspectRatio);
    }

    async function handleDownscaleGeneration() {
        if (imageFiles.length === 0) return;

        downscaleGenerateBtn.disabled = true;
        downscaleGenerateBtn.textContent = 'Processing...';
        showStatus(downscaleStatus, `Starting batch process...`, false);
        downscaleErrorMessage.textContent = '';

        const zip = new JSZip();
        const processCanvas = document.createElement('canvas');
        const processCtx = processCanvas.getContext('2d');
        
        const format = downscaleFormatSelect.value;
        const quality = parseInt(downscaleQualitySlider.value, 10) / 100;
        const ext = getFileExtension(format);
        const prefix = downscalePrefixInput.value || "";
        const suffix = downscaleSuffixInput.value || "";
        const applyTitles = downscaleApplyTitlesToggle.checked;
        const useSubfolders = downscaleUseSubfoldersToggle.checked;
        const resizeMode = downscaleModeSelect.value;

        console.log(`DEBUG: Downscale Start. Mode: ${resizeMode}, Format: ${format}`);

        try {
            for (let i = 0; i < imageFiles.length; i++) {
                showStatus(downscaleStatus, `Converting ${i + 1}/${imageFiles.length}...`, false);
                
                // 1. Get Source Image (with or without titles)
                const sourceImage = applyTitles 
                    ? await getProcessedImage(imageFiles[i], imageTitles[i], getTitleOptionsFromUI())
                    : await loadImage(imageFiles[i]);
                
                // 2. Calculate Targets
                let targetWidth, targetHeight;
                if (resizeMode === 'megapixels') {
                    const targetMP = parseFloat(downscaleMpInput.value) * 1000000;
                    const aspectRatio = sourceImage.width / sourceImage.height;
                    targetHeight = Math.sqrt(targetMP / aspectRatio);
                    targetWidth = targetHeight * aspectRatio;
                } else {
                    targetWidth = parseInt(downscaleWidthInput.value, 10);
                    targetHeight = parseInt(downscaleHeightInput.value, 10);
                }

                // 3. Setup Canvas
                processCanvas.width = Math.round(targetWidth);
                processCanvas.height = Math.round(targetHeight);
                const fitMode = downscaleAspectLockToggle.checked ? 'stretch' : downscaleFitSelect.value;
                
                // Fill BG if padding
                if (fitMode === 'pad') {
                    processCtx.fillStyle = document.getElementById('downscale-pad-color-picker').value;
                    processCtx.fillRect(0, 0, processCanvas.width, processCanvas.height);
                }

                // 4. Draw Image
                const imgAspectRatio = sourceImage.width / sourceImage.height;
                const canvasAspectRatio = processCanvas.width / processCanvas.height;
                let drawWidth, drawHeight, offsetX, offsetY;
                
                if (fitMode === 'stretch') {
                    drawWidth = processCanvas.width; drawHeight = processCanvas.height;
                    offsetX = 0; offsetY = 0;
                } else { // Pad
                    if (imgAspectRatio > canvasAspectRatio) {
                        drawWidth = processCanvas.width; drawHeight = drawWidth / imgAspectRatio;
                    } else {
                        drawHeight = processCanvas.height; drawWidth = drawHeight * imgAspectRatio;
                    }
                    offsetX = (processCanvas.width - drawWidth) / 2;
                    offsetY = (processCanvas.height - drawHeight) / 2;
                }

                processCtx.drawImage(sourceImage, offsetX, offsetY, drawWidth, drawHeight);

                // 5. Save Blob
                const blob = await new Promise(resolve => processCanvas.toBlob(resolve, format, quality));
                
                // 6. Filename
                let baseName = imageTitles[i];
                if (underscoreToggle.checked) baseName = baseName.replace(/ /g, '_');
                const finalName = `${prefix}${baseName}${suffix}${ext}`;

                if (useSubfolders && imageFolders[i] !== "(Root)") {
                    zip.folder(imageFolders[i]).file(finalName, blob);
                } else {
                    zip.file(finalName, blob);
                }
            }

            console.log("DEBUG: Downscale Zip generation...");
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = 'batch_converted_images.zip';
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            showStatus(downscaleStatus, `Download Started!`, false);

        } catch (error) {
            console.error('DEBUG: Downscale Error', error);
            showStatus(downscaleErrorMessage, error.message, true);
        } finally {
            downscaleGenerateBtn.disabled = false;
            downscaleGenerateBtn.textContent = 'Generate & Download ZIP';
        }
    }

    // --- Helpers ---

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
            autoScale: autoScaleToggle.checked
        };
    }

    async function getProcessedImage(file, title, options) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        await drawImageWithTitle(tempCtx, file, title, options);
        const finalImage = new Image();
        finalImage.src = tempCanvas.toDataURL();
        await new Promise(r => finalImage.onload = r);
        return finalImage;
    }

    function getFilteredImageIndices(source) {
        if (source === "All Images") return imageFiles.map((_, index) => index);
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