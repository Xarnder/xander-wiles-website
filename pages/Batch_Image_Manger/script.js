document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: App Initialized");

    // --- DOM Elements ---
    const directoryUploadInput = document.getElementById('directory-upload');
    const csvUploadInput = document.getElementById('csv-upload');
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
    const gridMatchSmallestToggle = document.getElementById('grid-match-smallest-toggle');
    const gridGroupFolderToggle = document.getElementById('grid-group-folder-toggle');
    const gridDrawBordersToggle = document.getElementById('grid-draw-borders-toggle');
    const gridWarningBox = document.getElementById('grid-warning-box');
    const gridDownscaleToggle = document.getElementById('grid-downscale-toggle');
    const gridOutputSize = document.getElementById('grid-output-size');
    const gridOutputMegapixels = document.getElementById('grid-output-megapixels');
    const gridPreviewCanvas = document.getElementById('grid-preview-canvas');
    const gridPreviewCtx = gridPreviewCanvas.getContext('2d');
    const generateGridBtn = document.getElementById('generate-grid-btn');
    const gridStatus = document.getElementById('grid-status');
    const gridProgressContainer = document.getElementById('grid-progress-container');
    const gridProgressBar = document.getElementById('grid-progress-bar');
    const gridProgressText = document.getElementById('grid-progress-text');

    // Grid Visual Controls
    const gridShowPreviewToggle = document.getElementById('grid-show-preview-toggle');
    const gridBorderWidthInput = document.getElementById('grid-border-width-input');
    const gridBorderColorInput = document.getElementById('grid-border-color-input');
    const gridBgColorInput = document.getElementById('grid-bg-color-input');

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

    // Reorder DOM
    const openReorderModalBtn = document.getElementById('open-reorder-modal-btn');
    const reorderPopup = document.getElementById('reorder-popup');
    const closeReorderPopupBtn = reorderPopup.querySelector('.popup-close-btn');
    const reorderList = document.getElementById('reorder-list');
    const saveReorderBtn = document.getElementById('save-reorder-btn');

    // PDF DOM
    const pdfConversionPopup = document.getElementById('pdf-conversion-popup');
    const pdfCountDisplay = document.getElementById('pdf-count-display');
    const startPdfConversionBtn = document.getElementById('start-pdf-conversion-btn');
    const skipPdfBtn = document.getElementById('skip-pdf-btn');
    const pdfProgressContainer = document.getElementById('pdf-progress-container');
    const pdfProgressBar = document.getElementById('pdf-progress-bar');
    const pdfProgressStatus = document.getElementById('pdf-progress-status');
    const pdfProgressPercent = document.getElementById('pdf-progress-percent');

    // --- State ---
    let imageFiles = [];
    let pdfFiles = []; // [NEW] Store PDFs temporarily
    let imageTitles = [];

    let imageFolders = [];
    let availableFolders = ["(Root)"];
    let currentIndex = 0;
    const MEGAPixel_limit = 24 * 1000 * 1000;

    // --- Event Listeners ---
    directoryUploadInput.addEventListener('change', handleDirectoryUpload);
    csvUploadInput.addEventListener('change', handleCSVUpload);
    exportBtn.addEventListener('click', handleExport);

    // PDF Listeners
    startPdfConversionBtn.addEventListener('click', handlePdfConversion);
    skipPdfBtn.addEventListener('click', () => {
        pdfConversionPopup.classList.add('hidden');
        if (imageFiles.length > 0) {
            setupEditor();
        } else {
            showStatus(uploadStatus, 'No images to edit. Please upload images or convert PDFs.', true);
        }
    });

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
    gridMatchSmallestToggle.addEventListener('change', updateGridPreview);
    gridGroupFolderToggle.addEventListener('change', updateGridPreview);
    gridDrawBordersToggle.addEventListener('change', updateGridPreview);

    // Grid Visual Listeners
    gridShowPreviewToggle.addEventListener('change', updateGridPreview);
    gridBorderWidthInput.addEventListener('input', updateGridPreview);
    gridBorderColorInput.addEventListener('input', updateGridPreview);
    gridBgColorInput.addEventListener('input', updateGridPreview);

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

    // Reorder Listeners
    openReorderModalBtn.addEventListener('click', openReorderModal);
    closeReorderPopupBtn.addEventListener('click', closeReorderModal);
    reorderPopup.addEventListener('click', (e) => { if (e.target === reorderPopup) closeReorderModal(); });
    saveReorderBtn.addEventListener('click', saveReorder);

    // --- Functions ---

    function handleDirectoryUpload(e) {
        const files = Array.from(e.target.files);
        console.log(`DEBUG: Upload started. Found ${files.length} files.`);

        imageFiles = []; imageTitles = []; imageFolders = []; pdfFiles = [];
        availableFolders = ["(Root)"]; currentIndex = 0;

        const imageRegex = /\.(jpe?g|png|gif|webp|bmp|svg|avif)$/i;
        const pdfRegex = /\.pdf$/i;

        // Separate Images and PDFs
        imageFiles = files.filter(file => file.type.startsWith('image/') || imageRegex.test(file.name));
        pdfFiles = files.filter(file => file.type === 'application/pdf' || pdfRegex.test(file.name));

        console.log(`DEBUG: Found ${imageFiles.length} images and ${pdfFiles.length} PDFs.`);

        // 1. If we have PDFs, interrupt flow
        if (pdfFiles.length > 0) {
            pdfCountDisplay.textContent = pdfFiles.length;
            pdfConversionPopup.classList.remove('hidden');
            // If we also have images, we can prep them in background, but don't show editor yet
            if (imageFiles.length > 0) {
                prepImages(false); // Prep but don't show
            }
            return;
        }

        // 2. If only images
        if (imageFiles.length > 0) {
            prepImages(true);
        } else {
            showStatus(uploadStatus, 'No valid image or PDF files found.', true);
        }
    }

    function prepImages(showEditor = true) {
        imageFiles.sort((a, b) => a.name.localeCompare(b.name));
        imageFiles.forEach(file => {
            // Only add if not already added (check logic later, for now we reset on upload so it's fine)
            // But wait, if we are appending converted PDFs, we need to be careful?
            // Actually handleDirectoryUpload resets arrays.
            imageTitles.push(formatTitle(file.name));
            imageFolders.push("(Root)");
        });

        if (showEditor) setupEditor();
    }

    function setupEditor() {
        showStatus(uploadStatus, `Loaded ${imageFiles.length} images. You can now Upload a CSV or scroll down to customize.`, false);
        editorSection.classList.remove('hidden');
        previewControls.classList.remove('hidden');
        updateFolderDropdown();
        handleControlsChange();
        updateUIForCurrentIndex();
    }

    async function handlePdfConversion() {
        if (typeof pdfjsLib === 'undefined') {
            alert("PDF.js library not loaded. Please check your internet connection.");
            return;
        }

        startPdfConversionBtn.disabled = true;
        skipPdfBtn.classList.add('hidden');
        pdfProgressContainer.classList.remove('hidden');

        let totalPagesConverted = 0;

        try {
            for (let i = 0; i < pdfFiles.length; i++) {
                const file = pdfFiles[i];
                const arrayBuffer = await file.arrayBuffer();

                // Load PDF
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                console.log(`Processing PDF: ${file.name} with ${pdf.numPages} pages.`);

                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    // Status
                    const percent = Math.round(((i) / pdfFiles.length) * 100); // Rough file progress
                    pdfProgressStatus.textContent = `${file.name} (Page ${pageNum}/${pdf.numPages})`;
                    pdfProgressBar.style.width = `${percent}%`;
                    pdfProgressPercent.textContent = `${percent}%`;

                    const page = await pdf.getPage(pageNum);
                    const viewport = page.getViewport({ scale: 2.0 }); // High quality render

                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;

                    // Convert to Blob/File
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    const pageName = `${file.name.replace('.pdf', '')}_page_${pageNum}.png`;
                    const imageFile = new File([blob], pageName, { type: 'image/png' });

                    // Add to main arrays
                    imageFiles.push(imageFile);
                    imageTitles.push(formatTitle(pageName));
                    imageFolders.push("(Root)");

                    totalPagesConverted++;
                }
            }

            // Done
            pdfProgressBar.style.width = '100%';
            pdfProgressPercent.textContent = '100%';
            pdfProgressStatus.textContent = "Conversion Complete!";

            setTimeout(() => {
                pdfConversionPopup.classList.add('hidden');
                setupEditor(); // Now load the editor with everything
            }, 800);

        } catch (error) {
            console.error("PDF Conversion Error:", error);
            alert(`Error converting PDF: ${error.message}`);
            startPdfConversionBtn.disabled = false;
            skipPdfBtn.classList.remove('hidden');
        }
    }

    // --- CSV PARSING LOGIC ---
    function handleCSVUpload(e) {
        if (imageFiles.length === 0) {
            showStatus(uploadStatus, "Please upload images first.", true);
            e.target.value = '';
            return;
        }

        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            const text = event.target.result;
            processCSV(text);
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    function processCSV(csvText) {
        const lines = csvText.split(/\r\n|\n/);
        let matchCount = 0;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = line.split(',');
            if (cols.length < 3) continue;

            const itemName = cols[1].trim();
            const category = cols[2].trim();

            if (itemName && category) {
                const index = imageTitles.findIndex(t => t.toLowerCase() === itemName.toLowerCase());

                if (index !== -1) {
                    imageFolders[index] = category;
                    if (!availableFolders.includes(category)) {
                        availableFolders.push(category);
                    }
                    matchCount++;
                }
            }
        }

        updateFolderDropdown();
        updateUIForCurrentIndex();
        showStatus(uploadStatus, `CSV Map Applied! Matched ${matchCount} images to categories.`, false);
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
        switch (mimeType) {
            case 'image/jpeg': return '.jpg';
            case 'image/webp': return '.webp';
            case 'image/avif': return '.avif';
            default: return '.png';
        }
    }

    async function drawImageWithTitle(ctx, imageFile, title, options) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            // Use object URL
            const url = URL.createObjectURL(imageFile);

            img.onload = () => {
                if (!options.addTitle) {
                    ctx.canvas.width = img.width;
                    ctx.canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(url); // Clean up
                    return resolve();
                }

                let headerHeight = 0;
                if (options.mode === 'add-space' || options.mode === 'bleed') {
                    headerHeight = options.headerHeight;
                }

                ctx.canvas.width = img.width;
                ctx.canvas.height = (options.mode === 'add-space') ? img.height + headerHeight : img.height;

                if (options.mode === 'add-space') {
                    const isBelow = options.position === 'below';
                    const imageY = isBelow ? 0 : headerHeight;
                    const headerY = isBelow ? img.height : 0;
                    ctx.fillStyle = options.bgColor;
                    ctx.fillRect(0, headerY, ctx.canvas.width, headerHeight);
                    ctx.drawImage(img, 0, imageY);
                } else {
                    ctx.drawImage(img, 0, 0);
                    if (options.mode === 'bleed') {
                        const isBelow = options.position === 'below';
                        const rectY = isBelow ? img.height - headerHeight : 0;
                        ctx.fillStyle = options.bgColor;
                        ctx.fillRect(0, rectY, ctx.canvas.width, headerHeight);
                    }
                }

                let finalFontSize = options.fontSize;
                if (options.autoScale) {
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

                URL.revokeObjectURL(url); // Clean up memory
                resolve();
            };

            img.onerror = (e) => {
                console.error("DEBUG: Image load failed", e);
                URL.revokeObjectURL(url); // Clean up memory
                reject(new Error(`Could not load image: ${imageFile.name}`));
            };

            img.src = url;
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

    async function handleExport() {
        if (imageFiles.length === 0) return;

        exportBtn.disabled = true;
        exportBtn.textContent = 'Processing...';
        showStatus(exportStatus, `Processing ${imageFiles.length} images...`, false);

        // Show Progress Bar
        // Re-using the grid progress container for the main export to provide feedback
        // We move it or clone it? Let's just grab the elements.
        const progressBarContainer = document.getElementById('grid-progress-container');
        const progressBar = document.getElementById('grid-progress-bar');
        const progressText = document.getElementById('grid-progress-text');

        // Use inline style to show it near the export button if we can, 
        // or just rely on the one in the popup? 
        // Actually, the user might not see it if it's inside the hidden grid popup.
        // But the previous request asked to fix the grid progress.
        // Let's rely on status text for now, but make the status updates frequent.

        const zip = new JSZip();
        const options = getTitleOptionsFromUI();
        const processCanvas = document.createElement('canvas');
        const processCtx = processCanvas.getContext('2d');
        const format = exportFormatSelect.value;
        const quality = parseInt(mainQualitySlider.value, 10) / 100;
        const ext = getFileExtension(format);
        const prefix = filenamePrefixInput.value || "";
        const suffix = filenameSuffixInput.value || "";

        let successCount = 0;

        try {
            for (let i = 0; i < imageFiles.length; i++) {
                // Update status every image so user knows it's moving
                const pct = Math.round(((i + 1) / imageFiles.length) * 100);
                showStatus(exportStatus, `Processing ${i + 1}/${imageFiles.length} (${pct}%)`, false);
                exportBtn.textContent = `Processing ${pct}%...`;

                try {
                    // Wrapped in TRY/CATCH so one bad image doesn't kill the batch
                    await drawImageWithTitle(processCtx, imageFiles[i], imageTitles[i], options);
                    const blob = await new Promise(resolve => processCanvas.toBlob(resolve, format, quality));
                    if (!blob) throw new Error(`Failed to create blob for image ${i}`);

                    let baseName = imageTitles[i];
                    if (underscoreToggle.checked) baseName = baseName.replace(/ /g, '_');
                    const finalName = `${prefix}${baseName}${suffix}${ext}`;

                    if (imageFolders[i] !== "(Root)") {
                        zip.folder(imageFolders[i]).file(finalName, blob);
                    } else {
                        zip.file(finalName, blob);
                    }
                    successCount++;

                    // Explicitly clear canvas to help memory
                    processCtx.clearRect(0, 0, processCanvas.width, processCanvas.height);

                } catch (imgError) {
                    console.error(`Error processing image ${imageFiles[i].name}:`, imgError);
                    // Continue to next image
                }
            }

            showStatus(exportStatus, `Zipping ${successCount} images...`, false);
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
        gridProgressContainer.classList.add('hidden'); // Hide progress bar on open

        // Ensure preview toggle is unchecked by default to prevent immediate freeze
        gridShowPreviewToggle.checked = false;

        // Reset/Clear canvas for clean slate
        const w = gridPreviewCanvas.clientWidth || 800;
        gridPreviewCanvas.width = w;
        gridPreviewCanvas.height = 300;
        gridPreviewCtx.fillStyle = '#111115';
        gridPreviewCtx.fillRect(0, 0, w, 300);
        gridPreviewCtx.fillStyle = '#71717a';
        gridPreviewCtx.textAlign = 'center';
        gridPreviewCtx.font = '20px Inter';
        gridPreviewCtx.fillText("Preview Paused", w / 2, 150);

        gridSourceSelect.innerHTML = '';
        ["All Images", ...new Set(imageFolders)].forEach(folder => {
            const option = document.createElement('option');
            option.value = folder; option.textContent = folder;
            gridSourceSelect.appendChild(option);
        });
        document.body.classList.add('popup-open');
        gridPopup.classList.remove('hidden');

        // We do NOT call updateGridPreview() here because toggle is off. 
        // User must toggle ON to see it.
    }

    function closeGridModal() {
        document.body.classList.remove('popup-open');
        gridPopup.classList.add('hidden');
    }

    // --- Reorder Feature ---
    let dragStartIndex;

    function openReorderModal() {
        if (imageFiles.length === 0) {
            alert("No images loaded to reorder.");
            return;
        }

        reorderList.innerHTML = '';
        imageFiles.forEach((file, index) => {
            const li = document.createElement('li');
            li.setAttribute('data-index', index); // Current visual index
            li.setAttribute('data-original-index', index); // Track origin for saving
            li.classList.add('reorder-item');
            li.draggable = true;

            li.innerHTML = `
                <span style="pointer-events:none;">${file.name}</span>
                <span style="color:var(--text-secondary); pointer-events:none;">☰</span>
            `;

            addDragEvents(li);
            reorderList.appendChild(li);
        });

        document.body.classList.add('popup-open');
        reorderPopup.classList.remove('hidden');
    }

    function closeReorderModal() {
        document.body.classList.remove('popup-open');
        reorderPopup.classList.add('hidden');
    }

    function addDragEvents(item) {
        item.addEventListener('dragstart', dragStart);
        item.addEventListener('dragenter', dragEnter);
        item.addEventListener('dragover', dragOver);
        item.addEventListener('dragleave', dragLeave);
        item.addEventListener('drop', dragDrop);
    }

    function dragStart() {
        dragStartIndex = +this.getAttribute('data-index');
        this.classList.add('dragging');
    }

    function dragEnter() {
        this.classList.add('drag-over');
    }

    function dragLeave() {
        this.classList.remove('drag-over');
    }

    function dragOver(e) {
        e.preventDefault();
    }

    function dragDrop() {
        const dragEndIndex = +this.getAttribute('data-index');
        swapItems(dragStartIndex, dragEndIndex);
        this.classList.remove('drag-over');
        document.querySelector('.dragging') && document.querySelector('.dragging').classList.remove('dragging');
    }

    function swapItems(fromIndex, toIndex) {
        const items = Array.from(reorderList.querySelectorAll('.reorder-item'));
        const itemOne = items[fromIndex];
        const itemTwo = items[toIndex];

        if (fromIndex < toIndex) {
            itemTwo.parentNode.insertBefore(itemOne, itemTwo.nextSibling);
        } else {
            itemTwo.parentNode.insertBefore(itemOne, itemTwo);
        }

        // Re-index attributes after swap
        const newItems = Array.from(reorderList.querySelectorAll('.reorder-item'));
        newItems.forEach((item, index) => {
            item.setAttribute('data-index', index);
        });
    }

    function saveReorder() {
        const listItems = Array.from(reorderList.querySelectorAll('.reorder-item'));

        // Rebuild arrays based on the original indices
        const newImageFiles = [];
        const newImageTitles = [];
        const newImageFolders = [];

        listItems.forEach(item => {
            const oldIndex = parseInt(item.getAttribute('data-original-index'), 10);
            newImageFiles.push(imageFiles[oldIndex]);
            newImageTitles.push(imageTitles[oldIndex]);
            newImageFolders.push(imageFolders[oldIndex]);
        });

        // Update Global State
        imageFiles = newImageFiles;
        imageTitles = newImageTitles;
        imageFolders = newImageFolders;

        // Reset View
        currentIndex = 0;
        updateUIForCurrentIndex();

        // Feedback
        showStatus(uploadStatus, "Images reordered successfully!", false);
        closeReorderModal();
    }

    // Helper: Draw borders for "Tetris" style grouping
    function drawTetrisBorders(ctx, layoutData, columns, finalWidth, finalHeight, scale, lineWidth, color) {
        // Create a 2D map of the grid to check neighbors
        const gridMap = {};
        const cellW = layoutData[0].w;
        const cellH = layoutData[0].h;

        layoutData.forEach(item => {
            const col = Math.round(item.x / cellW);
            const row = Math.round(item.y / cellH);
            if (!gridMap[row]) gridMap[row] = {};
            gridMap[row][col] = item.folder;
        });

        // 2. Draw Borders
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth * scale;
        ctx.lineCap = 'round';

        layoutData.forEach(item => {
            const col = Math.round(item.x / cellW);
            const row = Math.round(item.y / cellH);
            const currentFolder = item.folder;

            // Coords for this cell scaled
            const x = item.x * scale;
            const y = item.y * scale;
            const w = item.w * scale;
            const h = item.h * scale;

            ctx.beginPath();

            // Check Top
            if (row === 0 || !gridMap[row - 1] || gridMap[row - 1][col] !== currentFolder) {
                ctx.moveTo(x, y);
                ctx.lineTo(x + w, y);
            }
            // Check Bottom
            if (!gridMap[row + 1] || gridMap[row + 1][col] !== currentFolder) {
                ctx.moveTo(x, y + h);
                ctx.lineTo(x + w, y + h);
            }
            // Check Left
            if (col === 0 || gridMap[row][col - 1] !== currentFolder) {
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + h);
            }
            // Check Right
            if (gridMap[row][col + 1] !== currentFolder) {
                ctx.moveTo(x + w, y);
                ctx.lineTo(x + w, y + h);
            }
            ctx.stroke();
        });
    }

    async function updateGridPreview() {
        // CHECK TOGGLE FIRST
        if (!gridShowPreviewToggle.checked) {
            // Clear canvas to indicate paused state
            const w = gridPreviewCanvas.clientWidth || 800;
            gridPreviewCanvas.width = w;
            gridPreviewCanvas.height = 300;
            gridPreviewCtx.fillStyle = '#111115';
            gridPreviewCtx.fillRect(0, 0, w, 300);
            gridPreviewCtx.fillStyle = '#71717a';
            gridPreviewCtx.textAlign = 'center';
            gridPreviewCtx.font = '20px Inter';
            gridPreviewCtx.fillText("Preview Paused", w / 2, 150);

            gridProgressContainer.classList.add('hidden');
            gridOutputSize.textContent = "0 x 0 px";
            gridOutputMegapixels.textContent = "0.0 MP";
            return;
        }

        const source = gridSourceSelect.value;
        const columns = parseInt(gridColumnsInput.value, 10) || 1;
        const matchSmallest = gridMatchSmallestToggle.checked;
        const isGrouped = gridGroupFolderToggle.checked && source === "All Images";
        const drawBorders = gridDrawBordersToggle.checked;

        // Visuals
        const borderWidth = parseInt(gridBorderWidthInput.value, 10) || 4;
        const borderColor = gridBorderColorInput.value;
        const bgColor = gridBgColorInput.value;

        // Toggle visibility of group border option
        gridDrawBordersToggle.closest('.control-group').classList.toggle('hidden', !isGrouped);
        gridBorderWidthInput.closest('.control-group').classList.toggle('hidden', !isGrouped || !drawBorders);

        let filteredIndices = getFilteredImageIndices(source);
        if (filteredIndices.length === 0) return;

        // Show Progress Bar
        gridProgressContainer.classList.remove('hidden');
        gridProgressBar.style.width = '0%';
        gridProgressText.textContent = '0%';

        // If grouped, sort the indices by folder name
        if (isGrouped) {
            filteredIndices.sort((a, b) => imageFolders[a].localeCompare(imageFolders[b]));
        }

        try {
            const titleOptions = getTitleOptionsFromUI();
            titleOptions.addTitle = gridAddTitlesToggle.checked;

            // Prepare images
            let completedCount = 0;
            const totalImages = filteredIndices.length;

            const processedImages = await Promise.all(
                filteredIndices.map(async i => {
                    const img = await getProcessedImage(imageFiles[i], imageTitles[i], titleOptions);

                    // Update Progress
                    completedCount++;
                    const percent = Math.round((completedCount / totalImages) * 100);
                    gridProgressBar.style.width = `${percent}%`;
                    gridProgressText.textContent = `${percent}%`;

                    return { img, folder: imageFolders[i] };
                })
            );

            // 1. Determine Cell Size
            let cellWidth, cellHeight;
            const rawImgs = processedImages.map(p => p.img);
            if (matchSmallest) {
                cellWidth = Math.min(...rawImgs.map(img => img.width));
                cellHeight = Math.min(...rawImgs.map(img => img.height));
            } else {
                cellWidth = Math.max(...rawImgs.map(img => img.width));
                cellHeight = Math.max(...rawImgs.map(img => img.height));
            }

            // 2. Calculate Layout (Continuous Flow)
            const rows = Math.ceil(processedImages.length / columns);
            const finalWidth = cellWidth * columns;
            const finalHeight = rows * cellHeight;
            let layoutData = [];

            processedImages.forEach((item, index) => {
                const row = Math.floor(index / columns);
                const col = index % columns;
                layoutData.push({
                    img: item.img,
                    folder: item.folder,
                    x: col * cellWidth,
                    y: row * cellHeight,
                    w: cellWidth,
                    h: cellHeight
                });
            });

            // Stats
            const totalPixels = finalWidth * finalHeight;
            const megapixels = (totalPixels / 1000000).toFixed(1);
            gridOutputSize.textContent = `${finalWidth} x ${finalHeight} px`;
            gridOutputMegapixels.textContent = `${megapixels} MP`;
            gridWarningBox.classList.toggle('hidden', totalPixels <= MEGAPixel_limit);

            // Render to Preview Canvas
            const previewWidth = gridPreviewCanvas.clientWidth || 800;
            const scale = previewWidth / finalWidth;
            gridPreviewCanvas.width = previewWidth;
            gridPreviewCanvas.height = finalHeight * scale;

            gridPreviewCtx.fillStyle = bgColor;
            gridPreviewCtx.fillRect(0, 0, gridPreviewCanvas.width, gridPreviewCanvas.height);

            // Draw Images
            layoutData.forEach(item => {
                const aspect = item.img.width / item.img.height;
                let dw = item.w * scale;
                let dh = (item.w / aspect) * scale;
                const cellH = item.h * scale;

                if (dh > cellH) {
                    dh = cellH;
                    dw = (item.h * aspect) * scale;
                }

                const dx = (item.x * scale) + (item.w * scale - dw) / 2;
                const dy = (item.y * scale) + (cellH - dh) / 2;

                gridPreviewCtx.drawImage(item.img, dx, dy, dw, dh);
            });

            // Draw Group Borders (Tetris Style)
            if (isGrouped && drawBorders) {
                drawTetrisBorders(gridPreviewCtx, layoutData, columns, finalWidth, finalHeight, scale, borderWidth, borderColor);
            }

            // Hide Progress
            setTimeout(() => { gridProgressContainer.classList.add('hidden'); }, 500);

        } catch (error) {
            console.error("DEBUG: Grid Preview Error", error);
            gridProgressContainer.classList.add('hidden');
        }
    }

    async function handleGenerateGrid() {
        generateGridBtn.disabled = true; generateGridBtn.textContent = 'Generating...';
        showStatus(gridStatus, 'Preparing Grid...', false);

        // Show Progress Bar
        gridProgressContainer.classList.remove('hidden');
        gridProgressBar.style.width = '0%';
        gridProgressText.textContent = '0%';

        const source = gridSourceSelect.value;
        const columns = parseInt(gridColumnsInput.value, 10) || 1;
        const matchSmallest = gridMatchSmallestToggle.checked;
        const isGrouped = gridGroupFolderToggle.checked && source === "All Images";
        const drawBorders = gridDrawBordersToggle.checked;
        const shouldDownscale = gridDownscaleToggle.checked;

        // Visuals
        const borderWidth = parseInt(gridBorderWidthInput.value, 10) || 4;
        const borderColor = gridBorderColorInput.value;
        const bgColor = gridBgColorInput.value;

        let filteredIndices = getFilteredImageIndices(source);

        if (isGrouped) {
            filteredIndices.sort((a, b) => imageFolders[a].localeCompare(imageFolders[b]));
        }

        try {
            const titleOptions = getTitleOptionsFromUI();
            titleOptions.addTitle = gridAddTitlesToggle.checked;

            // PROCESS IMAGES WITH PROGRESS BAR
            let completedCount = 0;
            const totalImages = filteredIndices.length;

            const processedImages = await Promise.all(
                filteredIndices.map(async i => {
                    const img = await getProcessedImage(imageFiles[i], imageTitles[i], titleOptions);

                    // Update Progress
                    completedCount++;
                    const percent = Math.round((completedCount / totalImages) * 100);
                    gridProgressBar.style.width = `${percent}%`;
                    gridProgressText.textContent = `${percent}%`;

                    return { img, folder: imageFolders[i] };
                })
            );

            showStatus(gridStatus, 'Assembling Layout...', false);

            // 1. Determine Cell Size
            let cellWidth, cellHeight;
            const rawImgs = processedImages.map(p => p.img);
            if (matchSmallest) {
                cellWidth = Math.min(...rawImgs.map(img => img.width));
                cellHeight = Math.min(...rawImgs.map(img => img.height));
            } else {
                cellWidth = Math.max(...rawImgs.map(img => img.width));
                cellHeight = Math.max(...rawImgs.map(img => img.height));
            }

            // 2. Calculate Layout
            const rows = Math.ceil(processedImages.length / columns);
            let finalWidth = cellWidth * columns;
            let finalHeight = rows * cellHeight;
            let layoutData = [];

            processedImages.forEach((item, index) => {
                const row = Math.floor(index / columns);
                const col = index % columns;
                layoutData.push({
                    img: item.img,
                    folder: item.folder,
                    x: col * cellWidth,
                    y: row * cellHeight,
                    w: cellWidth,
                    h: cellHeight
                });
            });

            // Check Downscale
            let scaleFactor = 1;
            const totalPixels = finalWidth * finalHeight;
            if (shouldDownscale && totalPixels > MEGAPixel_limit) {
                scaleFactor = Math.sqrt(MEGAPixel_limit / totalPixels);
                finalWidth = Math.floor(finalWidth * scaleFactor);
                finalHeight = Math.floor(finalHeight * scaleFactor);
            }

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = finalWidth; finalCanvas.height = finalHeight;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.fillStyle = bgColor;
            finalCtx.fillRect(0, 0, finalWidth, finalHeight);

            // Draw Images
            layoutData.forEach(item => {
                const aspect = item.img.width / item.img.height;
                const targetW = item.w * scaleFactor;
                const targetH = item.h * scaleFactor;
                let dw = targetW, dh = targetW / aspect;

                if (dh > targetH) { dh = targetH; dw = targetH * aspect; }

                const x = (item.x * scaleFactor) + (targetW - dw) / 2;
                const y = (item.y * scaleFactor) + (targetH - dh) / 2;
                finalCtx.drawImage(item.img, x, y, dw, dh);
            });

            // Draw Borders
            if (isGrouped && drawBorders) {
                drawTetrisBorders(finalCtx, layoutData, columns, finalWidth, finalHeight, scaleFactor, borderWidth, borderColor);
            }

            finalCanvas.toBlob(blob => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `grid_${source.replace(/\s/g, '_')}.png`;
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
                showStatus(gridStatus, `Downloaded!`, false);
                // Hide progress bar after short delay
                setTimeout(() => { gridProgressContainer.classList.add('hidden'); }, 2000);
            }, 'image/png');

        } catch (error) {
            console.error("DEBUG: Grid Gen Error", error);
            showStatus(gridStatus, 'Error occurred.', true);
            gridProgressContainer.classList.add('hidden');
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

                const sourceImage = applyTitles
                    ? await getProcessedImage(imageFiles[i], imageTitles[i], getTitleOptionsFromUI())
                    : await loadImage(imageFiles[i]);

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

                processCanvas.width = Math.round(targetWidth);
                processCanvas.height = Math.round(targetHeight);
                const fitMode = downscaleAspectLockToggle.checked ? 'stretch' : downscaleFitSelect.value;

                if (fitMode === 'pad') {
                    processCtx.fillStyle = document.getElementById('downscale-pad-color-picker').value;
                    processCtx.fillRect(0, 0, processCanvas.width, processCanvas.height);
                }

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

                const blob = await new Promise(resolve => processCanvas.toBlob(resolve, format, quality));

                let baseName = imageTitles[i];
                if (underscoreToggle.checked) baseName = baseName.replace(/ /g, '_');
                const finalName = `${prefix}${baseName}${suffix}${ext}`;

                if (useSubfolders && imageFolders[i] !== "(Root)") {
                    zip.folder(imageFolders[i]).file(finalName, blob);
                } else {
                    zip.file(finalName, blob);
                }
            }

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