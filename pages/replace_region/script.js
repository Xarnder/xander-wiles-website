document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    const state = {
        originalImage: null,
        originalFilename: 'image',
        editedImage: null,
        cropRect: null, // { x, y, width, height }

        // Layers for Step 4 (Masking)
        maskCanvas: null,
        maskCtx: null,
        userPaintLayer: null,
        tempStrokeLayer: null,

        // Layers for Step 3.5 (Paint Editor)
        paintEditorCanvas: null,
        paintEditorCtx: null,
        peUserLayer: null, // NEW: Holds the paint separately from the image

        // Drawing State (Shared)
        lastPoint: null,
        currentTool: 'brush', // 'brush' or 'eraser'

        // Settings - Mask Tool
        brushSize: 50,
        brushSoftness: 25,
        cropFeather: 0,
        hue: 0,
        saturation: 100,
        lightness: 100,

        // Settings - Paint Editor
        peBrushSize: 20,
        peBrushSoftness: 0,
        peColor: '#ff0000',
        peTool: 'brush',

        // Toggles
        isDrawing: false,
        showMaskOverlay: false,
        showCropGuide: false,
        hideEdit: false,
        isTouchMode: false
    };

    // --- DOM SELECTORS ---
    const uploadStep = document.getElementById('upload-step');
    const cropStep = document.getElementById('crop-step');
    const reUploadStep = document.getElementById('re-upload-step');
    const paintEditorStep = document.getElementById('paint-editor-step'); // Step 3.5
    const maskStep = document.getElementById('mask-step'); // Step 4

    // Step 1
    const initialUploadContainer = document.getElementById('initial-upload-container');
    const step1Actions = document.getElementById('step1-actions');
    const startNewCropBtn = document.getElementById('start-new-crop-btn');
    const imageUploadInput = document.getElementById('image-upload');
    const jsonUploadInput = document.getElementById('json-upload');

    // Step 2
    const cropCanvas = document.getElementById('crop-canvas');
    const cropCtx = cropCanvas.getContext('2d');
    const aspectRatioSelect = document.getElementById('aspect-ratio-select');
    const step2DlImg = document.getElementById('step2-dl-img');
    const step2DlJson = document.getElementById('step2-dl-json');
    const step2Next = document.getElementById('step2-next');

    // Step 3
    const editedUploadInput = document.getElementById('edited-upload');
    const goToPaintEditorBtn = document.getElementById('go-to-paint-editor-btn');
    const step3DlImg = document.getElementById('step3-dl-img');
    const step3DlJson = document.getElementById('step3-dl-json');

    // Step 3.5 (Paint Editor)
    const paintEditorCanvas = document.getElementById('paint-editor-canvas');
    const paintEditorCtx = paintEditorCanvas.getContext('2d');
    const peBrushBtn = document.getElementById('pe-brush-btn');
    const peEraserBtn = document.getElementById('pe-eraser-btn');
    const peColorPicker = document.getElementById('pe-color-picker');
    const peSizeSlider = document.getElementById('pe-size-slider');
    const peSoftnessSlider = document.getElementById('pe-softness-slider');
    const peSizeValue = document.getElementById('pe-size-value');
    const peSoftnessValue = document.getElementById('pe-softness-value');
    const peFillBtn = document.getElementById('pe-fill-btn');
    const peClearBtn = document.getElementById('pe-clear-btn');
    const cancelPaintBtn = document.getElementById('cancel-paint-btn');
    const savePaintBtn = document.getElementById('save-paint-btn');

    // Step 4
    const maskCanvas = document.getElementById('mask-canvas');
    const maskPreviewCanvas = document.getElementById('mask-preview-canvas');
    const maskCtx = maskCanvas.getContext('2d');
    const saveFinalBtn = document.getElementById('save-final-btn');
    const saveMaskBtn = document.getElementById('save-mask-btn');
    const backToStep3Btn = document.getElementById('back-to-step3-btn');
    const swapImagesBtn = document.getElementById('swap-images-btn');

    // Step 4 Controls
    const brushBtn = document.getElementById('brush-btn');
    const eraserBtn = document.getElementById('eraser-btn');
    const brushSizeSlider = document.getElementById('brush-size-slider');
    const brushSoftnessSlider = document.getElementById('brush-softness-slider');
    const featherSlider = document.getElementById('feather-slider');

    const brushSizeValue = document.getElementById('brush-size-value');
    const brushSoftnessValue = document.getElementById('brush-softness-value');
    const featherValue = document.getElementById('feather-value');

    const hueSlider = document.getElementById('hue-slider');
    const saturationSlider = document.getElementById('saturation-slider');
    const lightnessSlider = document.getElementById('lightness-slider');
    const hueValue = document.getElementById('hue-value');
    const saturationValue = document.getElementById('saturation-value');
    const lightnessValue = document.getElementById('lightness-value');
    const maskUploadInput = document.getElementById('mask-upload');

    // Custom Modal Elements
    const customModal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalCancel = document.getElementById('modal-cancel');
    const modalConfirm = document.getElementById('modal-confirm');

    const showMaskToggle = document.getElementById('show-mask-toggle');
    const showCropGuideToggle = document.getElementById('show-crop-guide-toggle');
    const hideOverlayToggle = document.getElementById('hide-overlay-toggle');
    const touchModeToggle = document.getElementById('touch-mode-toggle');
    const brushCursor = document.getElementById('brush-cursor');

    const fillMaskBtn = document.getElementById('fill-mask-btn');
    const clearMaskBtn = document.getElementById('clear-mask-btn');

    console.log('DEBUG: Script loaded and DOM is ready.');

    // --- EVENT LISTENERS ---

    // 1. ORIGINAL IMAGE UPLOAD
    imageUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        state.originalFilename = file.name;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                state.originalImage = img;
                state.maskCanvas = null;
                state.userPaintLayer = null; // Reset mask for new original image
                initialUploadContainer.classList.add('hidden');
                step1Actions.classList.remove('hidden');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // 2. ACTION: START NEW CROP
    startNewCropBtn.addEventListener('click', () => {
        if (state.originalImage) setupCropping();
    });

    // 3. ACTION: JSON RESTORE UPLOAD
    jsonUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!state.originalImage) {
            alert("Unexpected Error: Image not loaded.");
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.cropRect && typeof data.cropRect.x === 'number') {
                    state.cropRect = data.cropRect;

                    if (state.cropRect.width <= 0 || state.cropRect.height <= 0) {
                        throw new Error("Invalid crop dimensions in JSON");
                    }

                    setupStep3Previews();
                    uploadStep.classList.add('hidden');
                    cropStep.classList.add('hidden');
                    reUploadStep.classList.remove('hidden');
                } else {
                    alert("Invalid JSON file format.");
                }
            } catch (err) {
                console.error(err);
                alert("Error reading JSON file.");
            }
        };
        reader.readAsText(file);
    });

    // 3.5 ACTION: SKIP CROP & UPLOAD OVERLAY
    const overlayUploadSkipInput = document.getElementById('overlay-upload-skip');
    if (overlayUploadSkipInput) {
        overlayUploadSkipInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!state.originalImage) {
                alert("Please upload an original image first.");
                return;
            }

            // 1. Set Crop Rect to Full Image
            state.cropRect = {
                x: 0,
                y: 0,
                width: state.originalImage.width,
                height: state.originalImage.height
            };

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    // 2. Create Edited Image (resized to fit original)
                    const resizeCanvas = document.createElement('canvas');
                    resizeCanvas.width = state.cropRect.width;
                    resizeCanvas.height = state.cropRect.height;
                    const resizeCtx = resizeCanvas.getContext('2d');
                    resizeCtx.drawImage(img, 0, 0, state.cropRect.width, state.cropRect.height);

                    state.editedImage = resizeCanvas;

                    // 3. Skip to Masking Step
                    uploadStep.classList.add('hidden');
                    // Ensure other steps are hidden just in case
                    cropStep.classList.add('hidden');
                    reUploadStep.classList.add('hidden');

                    setupMasking();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // 4. STEP 2 & 3: EXPORT BUTTONS
    if (step2DlImg) step2DlImg.addEventListener('click', () => downloadCropImage());
    if (step2DlJson) step2DlJson.addEventListener('click', () => downloadCropJSON());
    if (step2Next) step2Next.addEventListener('click', () => {
        if (!state.cropRect) return;
        cropStep.classList.add('hidden');
        reUploadStep.classList.remove('hidden');
        setupStep3Previews();
    });

    if (step3DlImg) step3DlImg.addEventListener('click', () => downloadCropImage());
    if (step3DlJson) step3DlJson.addEventListener('click', () => downloadCropJSON());

    // 5. EDITED IMAGE UPLOAD (External)
    editedUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!state.cropRect) {
            alert("Error: Crop area missing.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const resizeCanvas = document.createElement('canvas');
                resizeCanvas.width = state.cropRect.width;
                resizeCanvas.height = state.cropRect.height;
                const resizeCtx = resizeCanvas.getContext('2d');
                resizeCtx.drawImage(img, 0, 0, state.cropRect.width, state.cropRect.height);
                state.editedImage = resizeCanvas;

                setupMasking();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // 6. GO TO PAINT EDITOR (Step 3 -> Step 3.5)
    goToPaintEditorBtn.addEventListener('click', () => {
        setupPaintEditor();
    });

    // 7. PAINT EDITOR CONTROLS (Step 3.5)
    cancelPaintBtn.addEventListener('click', () => {
        paintEditorStep.classList.add('hidden');
        reUploadStep.classList.remove('hidden');
    });

    savePaintBtn.addEventListener('click', () => {
        // Flatten layers to create the Edited Image
        const finalPaint = document.createElement('canvas');
        finalPaint.width = state.cropRect.width;
        finalPaint.height = state.cropRect.height;
        const ctx = finalPaint.getContext('2d');

        // 1. Draw Original Crop
        ctx.drawImage(state.originalImage,
            state.cropRect.x, state.cropRect.y, state.cropRect.width, state.cropRect.height,
            0, 0, state.cropRect.width, state.cropRect.height
        );
        // 2. Draw User Paint on top
        ctx.drawImage(state.peUserLayer, 0, 0);

        state.editedImage = finalPaint;
        setupMasking(); // Go to Step 4
    });

    peBrushBtn.addEventListener('click', () => {
        state.peTool = 'brush';
        peBrushBtn.classList.add('active');
        peEraserBtn.classList.remove('active');
        brushCursor.style.borderColor = state.peColor;
    });

    peEraserBtn.addEventListener('click', () => {
        state.peTool = 'eraser';
        peEraserBtn.classList.add('active');
        peBrushBtn.classList.remove('active');
        brushCursor.style.borderColor = '#ff4444';
    });

    peColorPicker.addEventListener('input', (e) => {
        state.peColor = e.target.value;
        if (state.peTool === 'brush') brushCursor.style.borderColor = state.peColor;
    });

    peSizeSlider.addEventListener('input', (e) => {
        state.peBrushSize = parseInt(e.target.value, 10);
        peSizeValue.textContent = state.peBrushSize;
        updateCursorSize();
    });

    peSoftnessSlider.addEventListener('input', (e) => {
        state.peBrushSoftness = parseInt(e.target.value, 10);
        peSoftnessValue.textContent = state.peBrushSoftness;
    });

    peFillBtn.addEventListener('click', () => {
        showCustomConfirm(
            "Fill Image",
            "Are you sure you want to fill the entire image with the selected color?",
            () => {
                const ctx = state.peUserLayer.getContext('2d');
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = state.peColor;
                ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                composePaintEditor();
            }
        );
    });

    peClearBtn.addEventListener('click', () => {
        showCustomConfirm(
            "Reset Paint",
            "Are you sure you want to reset to the original cropped image? This will clear all your current paint.",
            () => {
                const ctx = state.peUserLayer.getContext('2d');
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                composePaintEditor();
            }
        );
    });


    // 8. MASK CONTROLS (Step 4)
    backToStep3Btn.addEventListener('click', () => {
        maskStep.classList.add('hidden');
        reUploadStep.classList.remove('hidden');
        brushCursor.style.opacity = '0';
    });

    if (swapImagesBtn) {
        swapImagesBtn.addEventListener('click', () => {
            showCustomConfirm(
                "Swap Images",
                "This will swap the base image and the overlay image. Your current mask will be preserved. Proceed?",
                () => swapImages()
            );
        });
    }

    brushBtn.addEventListener('click', () => setMaskTool('brush'));
    eraserBtn.addEventListener('click', () => setMaskTool('eraser'));

    brushSizeSlider.addEventListener('input', (e) => {
        state.brushSize = parseInt(e.target.value, 10);
        brushSizeValue.textContent = state.brushSize;
        updateCursorSize();
    });

    brushSoftnessSlider.addEventListener('input', (e) => {
        state.brushSoftness = parseInt(e.target.value, 10);
        brushSoftnessValue.textContent = state.brushSoftness;
    });

    featherSlider.addEventListener('input', (e) => {
        state.cropFeather = parseInt(e.target.value, 10);
        featherValue.textContent = state.cropFeather;
        composeMaskAndDraw();
    });

    showMaskToggle.addEventListener('change', (e) => {
        state.showMaskOverlay = e.target.checked;
        composeMaskAndDraw();
    });

    hueSlider.addEventListener('input', (e) => {
        state.hue = parseInt(e.target.value, 10);
        hueValue.textContent = state.hue;
        composeMaskAndDraw();
    });

    saturationSlider.addEventListener('input', (e) => {
        state.saturation = parseInt(e.target.value, 10);
        saturationValue.textContent = state.saturation;
        composeMaskAndDraw();
    });

    lightnessSlider.addEventListener('input', (e) => {
        state.lightness = parseInt(e.target.value, 10);
        lightnessValue.textContent = state.lightness;
        composeMaskAndDraw();
    });

    showCropGuideToggle.addEventListener('change', (e) => {
        state.showCropGuide = e.target.checked;
        composeMaskAndDraw();
    });
    
    if (hideOverlayToggle) {
        hideOverlayToggle.addEventListener('change', (e) => {
            state.hideEdit = e.target.checked;
            composeMaskAndDraw();
        });
    }

    touchModeToggle.addEventListener('change', (e) => {
        state.isTouchMode = e.target.checked;
    });

    // Reset Button Logic
    document.querySelectorAll('.reset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetId = btn.getAttribute('data-target');
            const defaultValue = btn.getAttribute('data-default');
            const input = document.getElementById(targetId);
            if (input) {
                input.value = defaultValue;
                // Trigger input event to update state and UI
                input.dispatchEvent(new Event('input'));
            }
        });
    });

    fillMaskBtn.addEventListener('click', () => {
        if (!state.userPaintLayer) return;
        showCustomConfirm(
            "Fill Mask",
            "Are you sure you want to fill the brush area? This will reveal the entire edited image.",
            () => {
                const ctx = state.userPaintLayer.getContext('2d');
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, state.userPaintLayer.width, state.userPaintLayer.height);
                composeMaskAndDraw();
            }
        );
    });

    clearMaskBtn.addEventListener('click', () => {
        if (!state.userPaintLayer) return;
        showCustomConfirm(
            "Clear Mask",
            "Are you sure you want to clear all paint? This will hide the edited image.",
            () => {
                const ctx = state.userPaintLayer.getContext('2d');
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                composeMaskAndDraw();
            }
        );
    });

    maskUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showCustomConfirm(
            "Upload Mask",
            "Are you sure you want to upload a new mask? This will replace your current blending work.",
            () => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        processUploadedMask(img);
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        );
        // Reset input so the same file can be uploaded again
        e.target.value = '';
    });

    saveMaskBtn.addEventListener('click', () => {
        if (!state.userPaintLayer) return;
        downloadMask();
    });

    saveFinalBtn.addEventListener('click', saveFinalImage);

    // --- GLOBAL CURSOR TRACKING ---
    const handleCursorEnter = () => { if (!state.isTouchMode) brushCursor.style.opacity = '1'; updateCursorSize(); };
    const handleCursorLeave = () => { brushCursor.style.opacity = '0'; };
    const handleCursorMove = (e) => { if (state.isTouchMode) return; updateCursorPosition(e); };

    maskCanvas.addEventListener('mouseenter', handleCursorEnter);
    maskCanvas.addEventListener('mouseleave', handleCursorLeave);
    maskCanvas.addEventListener('mousemove', handleCursorMove);

    paintEditorCanvas.addEventListener('mouseenter', handleCursorEnter);
    paintEditorCanvas.addEventListener('mouseleave', handleCursorLeave);
    paintEditorCanvas.addEventListener('mousemove', handleCursorMove);

    // --- CORE LOGIC FUNCTIONS ---

    function getBaseFilename() {
        if (!state.originalFilename) return 'image';
        const lastDot = state.originalFilename.lastIndexOf('.');
        return lastDot !== -1 ? state.originalFilename.substring(0, lastDot) : state.originalFilename;
    }

    function handleImageExport(canvas, filename) {
        canvas.toBlob((blob) => {
            if (!blob) {
                alert("Error creating image file.");
                return;
            }
            const file = new File([blob], filename, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({
                    files: [file],
                    title: 'Save Image',
                    text: 'Here is your image.'
                }).catch((err) => {
                    forceDownload(blob, filename);
                });
            } else {
                forceDownload(blob, filename);
            }
        }, 'image/png');
    }

    function forceDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function downloadCropImage() {
        if (!state.cropRect) { alert('No crop selected.'); return; }
        const { x, y, width, height } = state.cropRect;
        const baseName = getBaseFilename();
        if (width <= 0 || height <= 0) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(state.originalImage, x, y, width, height, 0, 0, width, height);

        handleImageExport(tempCanvas, `${baseName}-cropped.png`);
    }

    function downloadCropJSON() {
        if (!state.cropRect) { alert('No crop selected.'); return; }
        const baseName = getBaseFilename();
        const projectData = {
            cropRect: state.cropRect,
            timestamp: new Date().toISOString(),
            originalDimensions: { width: state.originalImage.width, height: state.originalImage.height }
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData, null, 2));
        const jsonLink = document.createElement('a');
        jsonLink.setAttribute("href", dataStr);
        jsonLink.setAttribute("download", `${baseName}-project.json`);
        document.body.appendChild(jsonLink);
        jsonLink.click();
        document.body.removeChild(jsonLink);
    }

    function saveFinalImage() {
        const maskState = state.showMaskOverlay;
        const guideState = state.showCropGuide;
        state.showMaskOverlay = false;
        state.showCropGuide = false;
        composeMaskAndDraw();

        const baseName = getBaseFilename();
        handleImageExport(maskCanvas, `${baseName}-final.png`);

        state.showMaskOverlay = maskState;
        state.showCropGuide = guideState;
        composeMaskAndDraw();
    }

    function swapImages() {
        if (!state.originalImage || !state.editedImage) return;

        const oldOriginal = state.originalImage;
        const oldEdited = state.editedImage;
        const oldCropRect = { ...state.cropRect };

        // 1. Create the new overlay image (the portion of the current original that was being edited)
        const newEditedCanvas = document.createElement('canvas');
        newEditedCanvas.width = oldCropRect.width;
        newEditedCanvas.height = oldCropRect.height;
        const newEditedCtx = newEditedCanvas.getContext('2d');
        newEditedCtx.drawImage(oldOriginal,
            oldCropRect.x, oldCropRect.y, oldCropRect.width, oldCropRect.height,
            0, 0, oldCropRect.width, oldCropRect.height
        );

        // 2. Set the new original (base) image to the current edited image
        state.originalImage = oldEdited;
        state.editedImage = newEditedCanvas;

        // 3. Reset cropRect to cover the full new base image
        state.cropRect = {
            x: 0,
            y: 0,
            width: oldEdited.width,
            height: oldEdited.height
        };

        // 4. Update mask (preserve it by cropping/matching the new dimensions)
        if (state.userPaintLayer) {
            const oldMask = state.userPaintLayer;
            const newMask = document.createElement('canvas');
            newMask.width = oldEdited.width;
            newMask.height = oldEdited.height;
            const nmCtx = newMask.getContext('2d');
            
            // Take the portion of the old mask that corresponds to the old crop area
            nmCtx.drawImage(oldMask, 
                oldCropRect.x, oldCropRect.y, oldCropRect.width, oldCropRect.height,
                0, 0, oldCropRect.width, oldCropRect.height
            );
            
            state.userPaintLayer = newMask;
        }

        // 5. Refresh Step 4
        setupMasking();
    }

    function downloadMask() {
        const maskCanvas = getFinalMaskCanvas();
        const width = maskCanvas.width;
        const height = maskCanvas.height;

        // Create a black-and-white version (not just transparency)
        const finalExportCanvas = document.createElement('canvas');
        finalExportCanvas.width = width;
        finalExportCanvas.height = height;
        const ctx = finalExportCanvas.getContext('2d');

        // Draw the mask directly (white pixels with alpha)
        ctx.drawImage(maskCanvas, 0, 0);
        
        // Final pass: convert alpha channel to RGB brightness
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3]; // The mask intensity
            data[i] = alpha;     // R
            data[i+1] = alpha;   // G
            data[i+2] = alpha;   // B
            data[i+3] = 255;     // Opaque
        }
        ctx.putImageData(imgData, 0, 0);

        const baseName = getBaseFilename();
        handleImageExport(finalExportCanvas, `${baseName}-mask.png`);
    }

    function getFinalMaskCanvas() {
        const width = state.originalImage.width;
        const height = state.originalImage.height;

        const combinedMaskCanvas = document.createElement('canvas');
        combinedMaskCanvas.width = width;
        combinedMaskCanvas.height = height;
        const maskCtx = combinedMaskCanvas.getContext('2d');

        maskCtx.drawImage(state.userPaintLayer, 0, 0);

        if (state.isDrawing && state.tempStrokeLayer) {
            maskCtx.save();
            const blurAmount = (state.brushSize * (state.brushSoftness / 100)) / 2;
            if (blurAmount > 0) maskCtx.filter = `blur(${blurAmount}px)`;

            if (state.currentTool === 'brush') {
                maskCtx.globalCompositeOperation = 'source-over';
            } else {
                maskCtx.globalCompositeOperation = 'destination-out';
            }
            maskCtx.drawImage(state.tempStrokeLayer, 0, 0);
            maskCtx.restore();
        }

        // Crop Constraint
        const constraintCanvas = document.createElement('canvas');
        constraintCanvas.width = width;
        constraintCanvas.height = height;
        const constraintCtx = constraintCanvas.getContext('2d');

        const feather = state.cropFeather;
        constraintCtx.save();
        if (feather > 0) {
            const maxFeather = Math.min(state.cropRect.width, state.cropRect.height) / 2;
            const effectiveFeather = Math.min(feather, maxFeather);
            constraintCtx.filter = `blur(${effectiveFeather / 2}px)`;
            constraintCtx.fillStyle = 'white';
            constraintCtx.fillRect(
                state.cropRect.x + effectiveFeather,
                state.cropRect.y + effectiveFeather,
                state.cropRect.width - (effectiveFeather * 2),
                state.cropRect.height - (effectiveFeather * 2)
            );
        } else {
            constraintCtx.fillStyle = 'white';
            constraintCtx.fillRect(state.cropRect.x, state.cropRect.y, state.cropRect.width, state.cropRect.height);
        }
        constraintCtx.restore();

        maskCtx.globalCompositeOperation = 'destination-in';
        maskCtx.drawImage(constraintCanvas, 0, 0);

        return combinedMaskCanvas;
    }

    // --- STEP 2: CROPPING LOGIC ---
    function setupCropping() {
        uploadStep.classList.add('hidden');
        cropStep.classList.remove('hidden');

        cropCanvas.width = state.originalImage.width;
        cropCanvas.height = state.originalImage.height;
        cropCtx.drawImage(state.originalImage, 0, 0);

        let startX, startY, isDragging = false, tempRect = null;

        const getPos = (e) => {
            const rect = cropCanvas.getBoundingClientRect();
            const cx = e.clientX || e.touches[0].clientX;
            const cy = e.clientY || e.touches[0].clientY;
            return {
                x: (cx - rect.left) * (cropCanvas.width / rect.width),
                y: (cy - rect.top) * (cropCanvas.height / rect.height)
            };
        };

        const startDrag = (e) => {
            if (e.type === 'touchstart' && !state.isTouchMode) return;
            e.preventDefault();
            const pos = getPos(e);
            startX = pos.x;
            startY = pos.y;
            isDragging = true;
        };

        const drag = (e) => {
            if (!isDragging) return;
            if (e.type === 'touchmove' && !state.isTouchMode) return;
            e.preventDefault();
            const pos = getPos(e);
            const ratio = parseFloat(aspectRatioSelect.value);
            let width = pos.x - startX;
            let height = pos.y - startY;

            if (ratio > 0) {
                const signY = Math.sign(height || 1);
                height = (Math.abs(width) / ratio) * signY;
            }

            tempRect = {
                x: width > 0 ? startX : startX + width,
                y: height > 0 ? startY : startY + height,
                width: Math.abs(width),
                height: Math.abs(height)
            };

            cropCtx.drawImage(state.originalImage, 0, 0);
            cropCtx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
            cropCtx.lineWidth = 4;
            cropCtx.strokeRect(tempRect.x, tempRect.y, tempRect.width, tempRect.height);
        };

        const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            if (tempRect) {
                let finalX = Math.round(tempRect.x);
                let finalY = Math.round(tempRect.y);
                let finalW = Math.round(tempRect.width);
                let finalH = Math.round(tempRect.height);

                if (finalX < 0) finalX = 0;
                if (finalY < 0) finalY = 0;
                if (finalX + finalW > state.originalImage.width) finalW = state.originalImage.width - finalX;
                if (finalY + finalH > state.originalImage.height) finalH = state.originalImage.height - finalY;

                state.cropRect = { x: finalX, y: finalY, width: finalW, height: finalH };

                if (state.cropRect.width > 0 && state.cropRect.height > 0) {
                    if (step2DlImg) step2DlImg.disabled = false;
                    if (step2DlJson) step2DlJson.disabled = false;
                    if (step2Next) step2Next.disabled = false;
                }
            }
        };

        cropCanvas.onmousedown = startDrag;
        cropCanvas.onmousemove = drag;
        cropCanvas.onmouseup = endDrag;
        cropCanvas.onmouseleave = endDrag;
        cropCanvas.ontouchstart = startDrag;
        cropCanvas.ontouchmove = drag;
        cropCanvas.ontouchend = endDrag;
    }

    function setupStep3Previews() {
        const originalPreviewCanvas = document.getElementById('original-preview-canvas');
        const croppedPreviewCanvas = document.getElementById('cropped-preview-canvas');
        if (!originalPreviewCanvas || !croppedPreviewCanvas) return;

        const originalPreviewCtx = originalPreviewCanvas.getContext('2d');
        const croppedPreviewCtx = croppedPreviewCanvas.getContext('2d');
        const { originalImage, cropRect } = state;

        if (!originalImage || !cropRect) return;

        // NEW: Cap preview resolution to prevent black screens/memory issues
        const MAX_PREVIEW_DIM = 1200;
        let scale = 1;
        if (originalImage.width > MAX_PREVIEW_DIM || originalImage.height > MAX_PREVIEW_DIM) {
            scale = MAX_PREVIEW_DIM / Math.max(originalImage.width, originalImage.height);
        }

        originalPreviewCanvas.width = originalImage.width * scale;
        originalPreviewCanvas.height = originalImage.height * scale;
        
        // For the cropped preview, we also cap it
        let cropScale = 1;
        if (cropRect.width > MAX_PREVIEW_DIM || cropRect.height > MAX_PREVIEW_DIM) {
            cropScale = MAX_PREVIEW_DIM / Math.max(cropRect.width, cropRect.height);
        }
        croppedPreviewCanvas.width = cropRect.width * cropScale;
        croppedPreviewCanvas.height = cropRect.height * cropScale;

        // Draw original with scale
        originalPreviewCtx.save();
        originalPreviewCtx.scale(scale, scale);
        originalPreviewCtx.drawImage(originalImage, 0, 0);
        
        // Draw crop rect
        originalPreviewCtx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
        originalPreviewCtx.lineWidth = Math.max(5, originalImage.width * 0.005);
        originalPreviewCtx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
        originalPreviewCtx.restore();

        if (cropRect.width > 0 && cropRect.height > 0) {
            croppedPreviewCtx.save();
            croppedPreviewCtx.scale(cropScale, cropScale);
            croppedPreviewCtx.drawImage(originalImage, 
                cropRect.x, cropRect.y, cropRect.width, cropRect.height, 
                0, 0, cropRect.width, cropRect.height
            );
            croppedPreviewCtx.restore();
        }
    }

    // --- STEP 3.5: PAINT EDITOR LOGIC ---
    function setupPaintEditor() {
        reUploadStep.classList.add('hidden');
        paintEditorStep.classList.remove('hidden');

        state.paintEditorCanvas = document.getElementById('paint-editor-canvas');
        state.paintEditorCanvas.width = state.cropRect.width;
        state.paintEditorCanvas.height = state.cropRect.height;
        state.paintEditorCtx = state.paintEditorCanvas.getContext('2d');

        // Setup User Paint Layer (Transparent)
        if (!state.peUserLayer) {
            state.peUserLayer = document.createElement('canvas');
        }
        state.peUserLayer.width = state.cropRect.width;
        state.peUserLayer.height = state.cropRect.height;
        // Clear it in case of re-entry
        state.peUserLayer.getContext('2d').clearRect(0, 0, state.peUserLayer.width, state.peUserLayer.height);

        // Temp layer for stroke
        if (!state.tempStrokeLayer) {
            state.tempStrokeLayer = document.createElement('canvas');
        }
        state.tempStrokeLayer.width = state.cropRect.width;
        state.tempStrokeLayer.height = state.cropRect.height;

        composePaintEditor();
        attachPaintEditorEvents();
        updateCursorSize();
    }

    function composePaintEditor() {
        const ctx = state.paintEditorCtx;

        // 1. Draw Original Crop (Background)
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(state.originalImage,
            state.cropRect.x, state.cropRect.y, state.cropRect.width, state.cropRect.height,
            0, 0, state.cropRect.width, state.cropRect.height
        );

        // 2. Prepare Paint Layer Composite
        const paintComposite = document.createElement('canvas');
        paintComposite.width = ctx.canvas.width;
        paintComposite.height = ctx.canvas.height;
        const pCtx = paintComposite.getContext('2d');

        // Draw confirmed paint
        pCtx.drawImage(state.peUserLayer, 0, 0);

        // Draw active stroke (Live Preview)
        if (state.isDrawing && state.tempStrokeLayer) {
            pCtx.save();
            const blurAmount = (state.peBrushSize * (state.peBrushSoftness / 100)) / 2;
            if (blurAmount > 0) pCtx.filter = `blur(${blurAmount}px)`;

            if (state.peTool === 'brush') {
                pCtx.globalCompositeOperation = 'source-over';
            } else {
                pCtx.globalCompositeOperation = 'destination-out';
            }
            pCtx.drawImage(state.tempStrokeLayer, 0, 0);
            pCtx.restore();
        }

        // 3. Draw Paint on Top
        ctx.drawImage(paintComposite, 0, 0);
    }

    function attachPaintEditorEvents() {
        const canvas = state.paintEditorCanvas;

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const cx = e.clientX || e.touches[0].clientX;
            const cy = e.clientY || e.touches[0].clientY;
            return {
                x: (cx - rect.left) * (canvas.width / rect.width),
                y: (cy - rect.top) * (canvas.height / rect.height)
            };
        };

        const startPaint = (e) => {
            if (e.type === 'touchstart' && !state.isTouchMode) return;
            e.preventDefault();
            state.isDrawing = true;

            const tmpCtx = state.tempStrokeLayer.getContext('2d');
            tmpCtx.clearRect(0, 0, state.tempStrokeLayer.width, state.tempStrokeLayer.height);

            const pos = getPos(e);
            state.lastPoint = pos;

            tmpCtx.beginPath();
            tmpCtx.moveTo(pos.x, pos.y);
            tmpCtx.lineCap = 'round';
            tmpCtx.lineJoin = 'round';
            tmpCtx.lineWidth = state.peBrushSize;
            tmpCtx.strokeStyle = state.peTool === 'brush' ? state.peColor : '#ffffff';
            tmpCtx.lineTo(pos.x + 0.01, pos.y);
            tmpCtx.stroke();

            composePaintEditor();
        };

        const doPaint = (e) => {
            if (!state.isDrawing) return;
            if (e.type === 'touchmove' && !state.isTouchMode) return;
            e.preventDefault();

            const newPoint = getPos(e);
            const tmpCtx = state.tempStrokeLayer.getContext('2d');

            tmpCtx.beginPath();
            tmpCtx.moveTo(state.lastPoint.x, state.lastPoint.y);
            tmpCtx.lineTo(newPoint.x, newPoint.y);
            tmpCtx.lineCap = 'round';
            tmpCtx.lineJoin = 'round';
            tmpCtx.lineWidth = state.peBrushSize;
            tmpCtx.strokeStyle = state.peTool === 'brush' ? state.peColor : '#ffffff';
            tmpCtx.stroke();

            state.lastPoint = newPoint;
            composePaintEditor();
        };

        const stopPaint = () => {
            if (!state.isDrawing) return;
            state.isDrawing = false;

            // Commit stroke to peUserLayer
            const ctx = state.peUserLayer.getContext('2d');
            const blurAmount = (state.peBrushSize * (state.peBrushSoftness / 100)) / 2;

            ctx.save();
            if (blurAmount > 0) ctx.filter = `blur(${blurAmount}px)`;

            if (state.peTool === 'brush') {
                ctx.globalCompositeOperation = 'source-over';
            } else {
                ctx.globalCompositeOperation = 'destination-out';
            }
            ctx.drawImage(state.tempStrokeLayer, 0, 0);
            ctx.restore();

            // Clear temp
            state.tempStrokeLayer.getContext('2d').clearRect(0, 0, state.tempStrokeLayer.width, state.tempStrokeLayer.height);
            composePaintEditor();
        };

        canvas.onmousedown = startPaint;
        canvas.onmousemove = doPaint;
        canvas.onmouseup = stopPaint;
        canvas.onmouseleave = stopPaint;
        canvas.ontouchstart = startPaint;
        canvas.ontouchmove = doPaint;
        canvas.ontouchend = stopPaint;
    }


    // --- STEP 4: MASKING LOGIC ---
    function setupMasking() {
        reUploadStep.classList.add('hidden');
        paintEditorStep.classList.add('hidden');
        maskStep.classList.remove('hidden');

        state.maskCanvas = document.getElementById('mask-canvas');
        state.maskCanvas.width = state.originalImage.width;
        state.maskCanvas.height = state.originalImage.height;
        state.maskCtx = state.maskCanvas.getContext('2d');

        requestAnimationFrame(updateCursorSize);

        // User Paint Layer (Mask)
        if (!state.userPaintLayer ||
            state.userPaintLayer.width !== state.originalImage.width ||
            state.userPaintLayer.height !== state.originalImage.height) {

            state.userPaintLayer = document.createElement('canvas');
            state.userPaintLayer.width = state.originalImage.width;
            state.userPaintLayer.height = state.originalImage.height;
            // Note: Setting canvas dimensions automatically clears it.
        }

        // Temp Stroke Layer
        if (!state.tempStrokeLayer) {
            state.tempStrokeLayer = document.createElement('canvas');
        }
        state.tempStrokeLayer.width = state.originalImage.width;
        state.tempStrokeLayer.height = state.originalImage.height;

        composeMaskAndDraw();
        attachMaskEvents();
    }

    function attachMaskEvents() {
        const canvas = state.maskCanvas;
        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const cx = e.clientX || e.touches[0].clientX;
            const cy = e.clientY || e.touches[0].clientY;
            return {
                x: (cx - rect.left) * (canvas.width / rect.width),
                y: (cy - rect.top) * (canvas.height / rect.height)
            };
        };

        const startPaint = (e) => {
            if (e.type === 'touchstart' && !state.isTouchMode) return;
            e.preventDefault();
            state.isDrawing = true;

            const tmpCtx = state.tempStrokeLayer.getContext('2d');
            tmpCtx.clearRect(0, 0, state.tempStrokeLayer.width, state.tempStrokeLayer.height);

            const pos = getPos(e);
            state.lastPoint = pos;

            tmpCtx.beginPath();
            tmpCtx.moveTo(pos.x, pos.y);
            tmpCtx.lineCap = 'round';
            tmpCtx.lineJoin = 'round';
            tmpCtx.lineWidth = state.brushSize;
            tmpCtx.strokeStyle = 'white';
            tmpCtx.lineTo(pos.x + 0.01, pos.y);
            tmpCtx.stroke();

            composeMaskAndDraw();
        };

        const doPaint = (e) => {
            if (!state.isDrawing) return;
            if (e.type === 'touchmove' && !state.isTouchMode) return;
            e.preventDefault();

            const newPoint = getPos(e);
            const tmpCtx = state.tempStrokeLayer.getContext('2d');

            tmpCtx.beginPath();
            tmpCtx.moveTo(state.lastPoint.x, state.lastPoint.y);
            tmpCtx.lineTo(newPoint.x, newPoint.y);
            tmpCtx.lineCap = 'round';
            tmpCtx.lineJoin = 'round';
            tmpCtx.lineWidth = state.brushSize;
            tmpCtx.strokeStyle = 'white';
            tmpCtx.stroke();

            state.lastPoint = newPoint;
            composeMaskAndDraw();
        };

        const stopPaint = () => {
            if (!state.isDrawing) return;
            state.isDrawing = false;

            const ctx = state.userPaintLayer.getContext('2d');
            const blurAmount = (state.brushSize * (state.brushSoftness / 100)) / 2;

            ctx.save();
            if (blurAmount > 0) ctx.filter = `blur(${blurAmount}px)`;

            if (state.currentTool === 'brush') {
                ctx.globalCompositeOperation = 'source-over';
            } else {
                ctx.globalCompositeOperation = 'destination-out';
            }
            ctx.drawImage(state.tempStrokeLayer, 0, 0);
            ctx.restore();

            state.tempStrokeLayer.getContext('2d').clearRect(0, 0, state.tempStrokeLayer.width, state.tempStrokeLayer.height);
            composeMaskAndDraw();
        };

        canvas.onmousedown = startPaint;
        canvas.onmousemove = doPaint;
        canvas.onmouseup = stopPaint;
        canvas.onmouseleave = stopPaint;
        canvas.ontouchstart = startPaint;
        canvas.ontouchmove = doPaint;
        canvas.ontouchend = stopPaint;
    }

    function composeMaskAndDraw() {
        const ctx = state.maskCtx;

        // 1. Draw Background
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(state.originalImage, 0, 0);

        // 2. Get Combined Mask
        const combinedMaskCanvas = getFinalMaskCanvas();

        // 3. Draw Edited Image
        const revealedEditCanvas = document.createElement('canvas');
        revealedEditCanvas.width = ctx.canvas.width;
        revealedEditCanvas.height = ctx.canvas.height;
        const revealedEditCtx = revealedEditCanvas.getContext('2d');

        revealedEditCtx.save();
        const h = state.hue !== undefined ? state.hue : 0;
        const s = state.saturation !== undefined ? state.saturation : 100;
        const l = state.lightness !== undefined ? state.lightness : 100;
        revealedEditCtx.filter = `hue-rotate(${h}deg) saturate(${s}%) brightness(${l}%)`;
        revealedEditCtx.drawImage(state.editedImage, state.cropRect.x, state.cropRect.y, state.cropRect.width, state.cropRect.height);
        revealedEditCtx.restore();

        revealedEditCtx.globalCompositeOperation = 'destination-in';
        revealedEditCtx.drawImage(combinedMaskCanvas, 0, 0);

        if (!state.hideEdit) {
            ctx.drawImage(revealedEditCanvas, 0, 0);
        }

        // 5. Overlays
        if (state.showMaskOverlay) {
            const overlayCanvas = document.createElement('canvas');
            overlayCanvas.width = ctx.canvas.width;
            overlayCanvas.height = ctx.canvas.height;
            const overlayCtx = overlayCanvas.getContext('2d');
            overlayCtx.drawImage(combinedMaskCanvas, 0, 0);
            overlayCtx.globalCompositeOperation = 'source-in';
            overlayCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(overlayCanvas, 0, 0);
        }

        if (state.showCropGuide) {
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            const guideWidth = Math.max(4, state.originalImage.width * 0.003);
            ctx.lineWidth = guideWidth;
            ctx.strokeStyle = '#00ff00';
            ctx.setLineDash([guideWidth * 2, guideWidth]);
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = guideWidth / 2;
            ctx.strokeRect(state.cropRect.x, state.cropRect.y, state.cropRect.width, state.cropRect.height);
            ctx.restore();
        }

        // 6. Update Small Mask Preview
        updateMaskPreview(combinedMaskCanvas);
    }

    function updateMaskPreview(maskSource) {
        if (!maskPreviewCanvas) return;
        
        // Match aspect ratio
        if (maskPreviewCanvas.width !== maskSource.width || maskPreviewCanvas.height !== maskSource.height) {
            maskPreviewCanvas.width = maskSource.width;
            maskPreviewCanvas.height = maskSource.height;
            
            // Update container aspect ratio to prevent layout shift
            const container = maskPreviewCanvas.closest('.mask-thumb-container');
            if (container) {
                container.style.aspectRatio = `${maskSource.width} / ${maskSource.height}`;
            }
        }

        const pCtx = maskPreviewCanvas.getContext('2d');
        pCtx.clearRect(0, 0, pCtx.canvas.width, pCtx.canvas.height);

        // Fast B&W conversion using composition
        pCtx.save();
        // 1. Draw solid white
        pCtx.fillStyle = 'white';
        pCtx.fillRect(0, 0, pCtx.canvas.width, pCtx.canvas.height);
        
        // 2. Use mask alpha to trim the white
        pCtx.globalCompositeOperation = 'destination-in';
        pCtx.drawImage(maskSource, 0, 0);
        
        // 3. Draw black behind everything
        pCtx.globalCompositeOperation = 'destination-over';
        pCtx.fillStyle = 'black';
        pCtx.fillRect(0, 0, pCtx.canvas.width, pCtx.canvas.height);
        pCtx.restore();
    }

    function setMaskTool(tool) {
        state.currentTool = tool;
        brushBtn.classList.toggle('active', tool === 'brush');
        eraserBtn.classList.toggle('active', tool === 'eraser');
        brushCursor.style.borderColor = (tool === 'brush') ? 'white' : '#ff4444';
    }

    function processUploadedMask(img) {
        if (!state.userPaintLayer) return;

        const width = state.originalImage.width;
        const height = state.originalImage.height;

        // 1. Draw uploaded image to temporary canvas (stretched to fit)
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0, width, height);

        // 2. Get image data to convert B&W to Alpha
        const imageData = tempCtx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // Use brightness/intensity as the new alpha channel
            // Formula: 0.299R + 0.587G + 0.114B (Standard grayscale)
            const brightness = (0.299 * r) + (0.587 * g) + (0.114 * b);
            
            // If the image already has transparency, we respect it, 
            // but we also apply the brightness as alpha.
            const alphaFactor = a / 255;
            const finalAlpha = brightness * alphaFactor;

            // Set pixel to semi-transparent white (since state.userPaintLayer uses white for revealing)
            data[i] = 255;     // R
            data[i + 1] = 255; // G
            data[i + 2] = 255; // B
            data[i + 3] = finalAlpha; // A
        }

        // 3. Put processed data back into state.userPaintLayer
        const ctx = state.userPaintLayer.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.putImageData(imageData, 0, 0);

        composeMaskAndDraw();
    }

    function updateCursorPosition(e) {
        let size, scale;
        // Check which canvas is active to determine size/scale
        if (!paintEditorStep.classList.contains('hidden')) {
            scale = getCanvasScale(state.paintEditorCanvas);
            size = state.peBrushSize * scale;
        } else {
            scale = getCanvasScale(state.maskCanvas);
            size = state.brushSize * scale;
        }

        brushCursor.style.left = `${e.pageX - size / 2}px`;
        brushCursor.style.top = `${e.pageY - size / 2}px`;
    }

    function updateCursorSize() {
        let size, scale;
        if (!paintEditorStep.classList.contains('hidden')) {
            scale = getCanvasScale(state.paintEditorCanvas);
            size = state.peBrushSize * scale;
        } else {
            scale = getCanvasScale(state.maskCanvas);
            size = state.brushSize * scale;
        }
        brushCursor.style.width = `${size}px`;
        brushCursor.style.height = `${size}px`;
    }

    function getCanvasScale(canvas) {
        if (!canvas || canvas.width === 0) return 1;
        const rect = canvas.getBoundingClientRect();
        return rect.width / canvas.width;
    }

    function showCustomConfirm(title, message, onConfirm) {
        const currentConfirm = document.getElementById('modal-confirm');
        const currentCancel = document.getElementById('modal-cancel');

        modalTitle.textContent = title;
        modalMessage.textContent = message;
        customModal.classList.remove('hidden');

        // Remove old listeners (to prevent memory leaks/multiple triggers)
        const newConfirm = currentConfirm.cloneNode(true);
        const newCancel = currentCancel.cloneNode(true);
        currentConfirm.parentNode.replaceChild(newConfirm, currentConfirm);
        currentCancel.parentNode.replaceChild(newCancel, currentCancel);

        // Add fresh listeners
        newConfirm.addEventListener('click', () => {
            customModal.classList.add('hidden');
            if (onConfirm) onConfirm();
        });

        newCancel.addEventListener('click', () => {
            customModal.classList.add('hidden');
        });

        // Close on background click
        customModal.addEventListener('click', (e) => {
            if (e.target === customModal) {
                customModal.classList.add('hidden');
            }
        });
    }
});