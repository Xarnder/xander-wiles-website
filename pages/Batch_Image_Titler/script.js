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

    // --- State ---
    let imageFiles = [];
    let imageTitles = [];
    let imageFolders = [];
    let availableFolders = ["(Root)"];
    let currentIndex = 0;

    // --- Event Listeners ---
    directoryUploadInput.addEventListener('change', handleDirectoryUpload);
    exportBtn.addEventListener('click', handleExport);
    
    [titleModeSelect, fontSizeSlider, headerHeightSlider, textColorPicker, bgColorPicker, positionToggle, addTitleToggle, textPositionSlider, textOffsetSlider].forEach(el => {
        el.addEventListener('input', handleControlsChange);
    });

    prevBtn.addEventListener('click', navigatePrev);
    nextBtn.addEventListener('click', navigateNext);
    titleInput.addEventListener('input', handleTitleChange);
    document.addEventListener('keydown', handleKeyPress);
    
    addFolderBtn.addEventListener('click', handleAddFolder);
    folderSelect.addEventListener('change', handleFolderAssignment);

    // --- Functions ---

    function handleDirectoryUpload(e) {
        const files = Array.from(e.target.files);
        
        imageFiles = []; imageTitles = []; imageFolders = [];
        availableFolders = ["(Root)"]; currentIndex = 0;

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

        // Helper to toggle visibility of a control's parent '.control-group'
        const setVisible = (element, isVisible) => {
            element.closest('.control-group').classList.toggle('hidden', !isVisible);
        };

        // "Add Space" & "Bleed" use these
        setVisible(headerHeightSlider, mode === 'add-space' || mode === 'bleed');
        setVisible(bgColorPicker, mode === 'add-space' || mode === 'bleed');
        setVisible(positionToggle, mode === 'add-space' || mode === 'bleed');

        // "Overlay" only
        setVisible(textPositionSlider, mode === 'overlay');
        
        // "Bleed" only
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
        return nameWithoutExt.replace(/_/g, ' ');
    }

    async function drawImageWithTitle(ctx, imageFile, title, options) {
        const { addTitle, mode, fontSize, textColor } = options;

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // If title is disabled, just draw the original image
                if (!addTitle) {
                    ctx.canvas.width = img.width;
                    ctx.canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    return resolve();
                }
                
                // --- Mode-specific drawing ---
                switch(mode) {
                    case 'overlay': {
                        const { textYPercent } = options;
                        // **FIX**: Set canvas size first, which resets the context state
                        ctx.canvas.width = img.width;
                        ctx.canvas.height = img.height;
                        ctx.drawImage(img, 0, 0);
                        
                        // **FIX**: Apply all text styles *after* resizing and *before* drawing
                        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                        ctx.fillStyle = textColor;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                        ctx.shadowBlur = 8;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        
                        const textYOverlay = ctx.canvas.height * (textYPercent / 100);
                        ctx.fillText(title, ctx.canvas.width / 2, textYOverlay);
                        break;
                    }
                    
                    case 'add-space':
                    case 'bleed': {
                        const { headerHeight, bgColor, position, textOffset } = options;
                         // **FIX**: Set canvas size first, which resets the context state
                        ctx.canvas.width = img.width;
                        ctx.canvas.height = img.height + headerHeight;

                        const isBelow = position === 'below';
                        const imageY = isBelow ? 0 : headerHeight;
                        const headerY = isBelow ? img.height : 0;
                        
                        // Draw background and image
                        ctx.fillStyle = bgColor;
                        ctx.fillRect(0, headerY, ctx.canvas.width, headerHeight);
                        ctx.drawImage(img, 0, imageY);
                        
                        let textY;
                        if (mode === 'add-space') {
                            textY = headerY + (headerHeight / 2);
                        } else { // 'bleed' mode
                            const boundaryY = isBelow ? img.height : headerHeight;
                            textY = boundaryY + textOffset;
                        }
                        
                        // **FIX**: Apply all text styles *after* resizing and *before* drawing
                        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                        ctx.fillStyle = textColor;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        if (mode === 'bleed') {
                           ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                           ctx.shadowBlur = 8;
                           ctx.shadowOffsetX = 0;
                           ctx.shadowOffsetY = 0;
                        }

                        ctx.fillText(title, ctx.canvas.width / 2, textY);
                        break;
                    }
                }

                // Reset shadow for subsequent draws to be safe
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

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
        
        const options = {
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
        const options = {
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
                
                let filename = title;
                if (underscoreToggle.checked) {
                    filename = title.replace(/ /g, '_');
                }
                
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
        availableFolders.forEach(folderName => {
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
        if (editorSection.classList.contains('hidden') || 
            document.activeElement === titleInput || 
            document.activeElement === newFolderInput) {
            return;
        }
        if (e.key === 'ArrowLeft') { e.preventDefault(); navigatePrev(); } 
        else if (e.key === 'ArrowRight') { e.preventDefault(); navigateNext(); }
    }

    function showStatus(element, message, isError = false) {
        element.textContent = message;
        element.style.color = isError ? 'var(--accent-orange)' : 'var(--text-secondary)';
        element.classList.remove('hidden');
    }
});