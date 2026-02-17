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

        // Settings - Paint Editor
        peBrushSize: 20,
        peBrushSoftness: 0,
        peColor: '#ff0000',
        peTool: 'brush',

        // Toggles
        isDrawing: false,
        showMaskOverlay: false,
        showCropGuide: false,
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
    const maskCtx = maskCanvas.getContext('2d');
    const saveFinalBtn = document.getElementById('save-final-btn');
    const backToStep3Btn = document.getElementById('back-to-step3-btn');

    // Step 4 Controls
    const brushBtn = document.getElementById('brush-btn');
    const eraserBtn = document.getElementById('eraser-btn');
    const brushSizeSlider = document.getElementById('brush-size-slider');
    const brushSoftnessSlider = document.getElementById('brush-softness-slider');
    const featherSlider = document.getElementById('feather-slider');

    const brushSizeValue = document.getElementById('brush-size-value');
    const brushSoftnessValue = document.getElementById('brush-softness-value');
    const featherValue = document.getElementById('feather-value');

    const showMaskToggle = document.getElementById('show-mask-toggle');
    const showCropGuideToggle = document.getElementById('show-crop-guide-toggle');
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
        if (confirm("Fill entire image with selected color?")) {
            const ctx = state.peUserLayer.getContext('2d');
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = state.peColor;
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            composePaintEditor();
        }
    });

    peClearBtn.addEventListener('click', () => {
        if (confirm("Reset to original cropped image (Clear Paint)?")) {
            const ctx = state.peUserLayer.getContext('2d');
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            composePaintEditor();
        }
    });


    // 8. MASK CONTROLS (Step 4)
    backToStep3Btn.addEventListener('click', () => {
        maskStep.classList.add('hidden');
        reUploadStep.classList.remove('hidden');
        brushCursor.style.opacity = '0';
    });

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

    showCropGuideToggle.addEventListener('change', (e) => {
        state.showCropGuide = e.target.checked;
        composeMaskAndDraw();
    });

    touchModeToggle.addEventListener('change', (e) => {
        state.isTouchMode = e.target.checked;
    });

    fillMaskBtn.addEventListener('click', () => {
        if (!state.userPaintLayer) return;
        if (confirm("Fill brush area (Paint entire image white)?")) {
            const ctx = state.userPaintLayer.getContext('2d');
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, state.userPaintLayer.width, state.userPaintLayer.height);
            composeMaskAndDraw();
        }
    });

    clearMaskBtn.addEventListener('click', () => {
        if (!state.userPaintLayer) return;
        if (confirm("Clear all paint (Hide edited image)?")) {
            const ctx = state.userPaintLayer.getContext('2d');
            ctx.clearRect(0, 0, state.userPaintLayer.width, state.userPaintLayer.height);
            composeMaskAndDraw();
        }
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

        originalPreviewCanvas.width = originalImage.width;
        originalPreviewCanvas.height = originalImage.height;
        croppedPreviewCanvas.width = cropRect.width;
        croppedPreviewCanvas.height = cropRect.height;

        originalPreviewCtx.drawImage(originalImage, 0, 0);
        originalPreviewCtx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
        originalPreviewCtx.lineWidth = Math.max(5, originalImage.width * 0.005);
        originalPreviewCtx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);

        if (cropRect.width > 0 && cropRect.height > 0) {
            croppedPreviewCtx.drawImage(originalImage, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, cropRect.width, cropRect.height);
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
        if (!state.userPaintLayer) {
            state.userPaintLayer = document.createElement('canvas');
        }
        state.userPaintLayer.width = state.originalImage.width;
        state.userPaintLayer.height = state.originalImage.height;
        // Reset mask layer if new edit
        state.userPaintLayer.getContext('2d').clearRect(0, 0, state.userPaintLayer.width, state.userPaintLayer.height);

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

        // 2. Prepare Combined Mask (History + Current Stroke)
        const combinedMaskCanvas = document.createElement('canvas');
        combinedMaskCanvas.width = ctx.canvas.width;
        combinedMaskCanvas.height = ctx.canvas.height;
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

        // 3. Crop Constraint
        const constraintCanvas = document.createElement('canvas');
        constraintCanvas.width = ctx.canvas.width;
        constraintCanvas.height = ctx.canvas.height;
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

        // 4. Draw Edited Image
        const revealedEditCanvas = document.createElement('canvas');
        revealedEditCanvas.width = ctx.canvas.width;
        revealedEditCanvas.height = ctx.canvas.height;
        const revealedEditCtx = revealedEditCanvas.getContext('2d');

        revealedEditCtx.drawImage(state.editedImage, state.cropRect.x, state.cropRect.y, state.cropRect.width, state.cropRect.height);

        revealedEditCtx.globalCompositeOperation = 'destination-in';
        revealedEditCtx.drawImage(combinedMaskCanvas, 0, 0);

        ctx.drawImage(revealedEditCanvas, 0, 0);

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
    }

    function setMaskTool(tool) {
        state.currentTool = tool;
        brushBtn.classList.toggle('active', tool === 'brush');
        eraserBtn.classList.toggle('active', tool === 'eraser');
        brushCursor.style.borderColor = (tool === 'brush') ? 'white' : '#ff4444';
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
});