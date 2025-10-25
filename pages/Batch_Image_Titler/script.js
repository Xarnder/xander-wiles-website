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
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeValueSpan = document.getElementById('font-size-value');
    const headerHeightSlider = document.getElementById('header-height-slider');
    const headerHeightValueSpan = document.getElementById('header-height-value');
    const textColorPicker = document.getElementById('text-color-picker');
    const bgColorPicker = document.getElementById('bg-color-picker');
    const positionToggle = document.getElementById('position-toggle');

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
    
    // Listen to all controls that should trigger a preview re-render
    [fontSizeSlider, headerHeightSlider, textColorPicker, bgColorPicker, positionToggle, addTitleToggle].forEach(el => {
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
        console.log('Directory selected. Processing files...');
        const files = Array.from(e.target.files);
        
        // Reset all state
        imageFiles = []; imageTitles = []; imageFolders = [];
        availableFolders = ["(Root)"]; currentIndex = 0;

        imageFiles = files.filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) {
            console.error('No valid image files found.');
            showStatus(uploadStatus, 'No valid image files (.jpg, .png, etc.) were found.', true);
            return;
        }

        imageFiles.forEach(file => {
            imageTitles.push(formatTitle(file.name));
            imageFolders.push("(Root)");
        });

        console.log(`Found ${imageFiles.length} images.`);
        showStatus(uploadStatus, `Successfully loaded ${imageFiles.length} images.`, false);

        uploadSection.classList.add('hidden');
        editorSection.classList.remove('hidden');
        previewControls.classList.remove('hidden');

        updateFolderDropdown();
        updateTitleControlState(); // Set initial state of title controls
        updateUIForCurrentIndex();
    }

    function handleControlsChange() {
        fontSizeValueSpan.textContent = fontSizeSlider.value;
        headerHeightValueSpan.textContent = headerHeightSlider.value;
        updateTitleControlState();
        renderPreview();
    }

    function handleTitleChange() {
        if (imageFiles.length > 0) {
            imageTitles[currentIndex] = titleInput.value;
            renderPreview();
        }
    }
    
    /**
     * Toggles the disabled state of title-related options based on the main toggle.
     */
    function updateTitleControlState() {
        const enabled = addTitleToggle.checked;
        if (enabled) {
            titleOptionsWrapper.classList.remove('disabled');
        } else {
            titleOptionsWrapper.classList.add('disabled');
        }
    }

    function formatTitle(filename) {
        const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
        return nameWithoutExt.replace(/_/g, ' ');
    }

    async function drawImageWithTitle(ctx, imageFile, title, options) {
        const { addTitle, fontSize, headerHeight, bgColor, textColor, position } = options;

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // If title is disabled, just draw the original image and exit
                if (!addTitle) {
                    ctx.canvas.width = img.width;
                    ctx.canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    resolve();
                    return;
                }

                // --- Logic for adding title ---
                ctx.canvas.width = img.width;
                ctx.canvas.height = img.height + headerHeight;

                const isBelow = position === 'below';
                const imageY = isBelow ? 0 : headerHeight;
                const headerY = isBelow ? img.height : 0;
                const textY = headerY + (headerHeight / 2);

                ctx.fillStyle = bgColor;
                ctx.fillRect(0, headerY, ctx.canvas.width, headerHeight);

                ctx.fillStyle = textColor;
                ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(title, ctx.canvas.width / 2, textY);
                
                ctx.drawImage(img, 0, imageY);
                resolve();
            };
            img.onerror = () => {
                console.error(`Error loading image: ${imageFile.name}`);
                reject(new Error(`Could not load image: ${imageFile.name}`));
            };
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
            fontSize: parseInt(fontSizeSlider.value, 10),
            headerHeight: parseInt(headerHeightSlider.value, 10),
            bgColor: bgColorPicker.value,
            textColor: textColorPicker.value,
            position: positionToggle.checked ? 'below' : 'above'
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
            fontSize: parseInt(fontSizeSlider.value, 10),
            headerHeight: parseInt(headerHeightSlider.value, 10),
            bgColor: bgColorPicker.value,
            textColor: textColorPicker.value,
            position: positionToggle.checked ? 'below' : 'above'
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
                
                // For 'addTitle: false', this will be a PNG of the original.
                // For 'addTitle: true', it will be a PNG of the modified image.
                const blob = await new Promise(resolve => processCanvas.toBlob(resolve, 'image/png'));
                
                let filename = title;
                if (underscoreToggle.checked) {
                    filename = title.replace(/ /g, '_');
                }
                
                const extension = file.name.slice(file.name.lastIndexOf('.'));
                const newFilename = `${filename}${extension}`;

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

    // Subfolder & Navigation Functions (Unchanged from previous version)
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