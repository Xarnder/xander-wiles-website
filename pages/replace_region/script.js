document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    const state = {
        originalImage: null,
        originalFilename: 'image',
        editedImage: null,
        cropRect: null, // { x, y, width, height }
        
        // Layers
        maskCanvas: null,   // The Visible DOM Canvas
        maskCtx: null,
        
        userPaintLayer: null, // Offscreen: Stores confirmed strokes
        tempStrokeLayer: null, // Offscreen: Stores the stroke currently being drawn
        
        // Drawing State
        lastPoint: null, 
        currentTool: 'brush', // 'brush' or 'eraser'
        brushSize: 50,
        brushSoftness: 25, // 0-100
        cropFeather: 0,    // 0-500px
        
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
    const maskStep = document.getElementById('mask-step');
    
    // Step 1
    const initialUploadContainer = document.getElementById('initial-upload-container');
    const step1Actions = document.getElementById('step1-actions');
    const startNewCropBtn = document.getElementById('start-new-crop-btn');
    const imageUploadInput = document.getElementById('image-upload');
    const jsonUploadInput = document.getElementById('json-upload');
    
    // Step 2 Selectors
    const cropCanvas = document.getElementById('crop-canvas');
    const cropCtx = cropCanvas.getContext('2d');
    const aspectRatioSelect = document.getElementById('aspect-ratio-select');
    const step2DlImg = document.getElementById('step2-dl-img');
    const step2DlJson = document.getElementById('step2-dl-json');
    const step2Next = document.getElementById('step2-next');

    // Step 3 Selectors
    const editedUploadInput = document.getElementById('edited-upload');
    const backToStep3Btn = document.getElementById('back-to-step3-btn');
    const step3DlImg = document.getElementById('step3-dl-img');
    const step3DlJson = document.getElementById('step3-dl-json');

    // Step 4 Selectors
    const maskCanvas = document.getElementById('mask-canvas'); 
    const maskCtx = maskCanvas.getContext('2d');
    const saveFinalBtn = document.getElementById('save-final-btn');

    // Controls
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

    // 4. STEP 2 & 3: EXPORT BUTTONS
    
    if(step2DlImg) step2DlImg.addEventListener('click', () => downloadCropImage());
    if(step2DlJson) step2DlJson.addEventListener('click', () => downloadCropJSON());
    if(step2Next) step2Next.addEventListener('click', () => {
        if (!state.cropRect) return;
        cropStep.classList.add('hidden');
        reUploadStep.classList.remove('hidden');
        setupStep3Previews();
    });

    if(step3DlImg) step3DlImg.addEventListener('click', () => downloadCropImage());
    if(step3DlJson) step3DlJson.addEventListener('click', () => downloadCropJSON());

    // 5. EDITED IMAGE UPLOAD
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

    backToStep3Btn.addEventListener('click', () => {
        maskStep.classList.add('hidden');
        reUploadStep.classList.remove('hidden');
        brushCursor.style.opacity = '0';
    });

    // --- TOOL CONTROLS ---
    brushBtn.addEventListener('click', () => setTool('brush'));
    eraserBtn.addEventListener('click', () => setTool('eraser'));
    
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
        if(!state.userPaintLayer) return;
        if(confirm("Fill brush area (Paint entire image white)?")) {
            const ctx = state.userPaintLayer.getContext('2d');
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, state.userPaintLayer.width, state.userPaintLayer.height);
            composeMaskAndDraw();
        }
    });

    clearMaskBtn.addEventListener('click', () => {
        if(!state.userPaintLayer) return;
        if(confirm("Clear all paint (Hide edited image)?")) {
            const ctx = state.userPaintLayer.getContext('2d');
            ctx.clearRect(0, 0, state.userPaintLayer.width, state.userPaintLayer.height);
            composeMaskAndDraw();
        }
    });

    saveFinalBtn.addEventListener('click', saveFinalImage);

    // --- CURSOR TRACKING ---
    maskCanvas.addEventListener('mouseenter', () => {
        if (!state.isTouchMode) brushCursor.style.opacity = '1';
        updateCursorSize(); 
    });
    maskCanvas.addEventListener('mouseleave', () => {
        brushCursor.style.opacity = '0';
    });
    maskCanvas.addEventListener('mousemove', (e) => {
        if (state.isTouchMode) return;
        updateCursorPosition(e);
    });

    // --- CORE LOGIC FUNCTIONS ---

    function getBaseFilename() {
        if (!state.originalFilename) return 'image';
        const lastDot = state.originalFilename.lastIndexOf('.');
        return lastDot !== -1 ? state.originalFilename.substring(0, lastDot) : state.originalFilename;
    }

    function downloadCropImage() {
        if (!state.cropRect) {
            alert('No crop selected.');
            return;
        }
        const { x, y, width, height } = state.cropRect;
        const baseName = getBaseFilename();
        
        if (width <= 0 || height <= 0) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(state.originalImage, x, y, width, height, 0, 0, width, height);
        
        const imgLink = document.createElement('a');
        imgLink.download = `${baseName}-cropped.png`;
        imgLink.href = tempCanvas.toDataURL('image/png');
        document.body.appendChild(imgLink);
        imgLink.click();
        document.body.removeChild(imgLink);
    }

    function downloadCropJSON() {
        if (!state.cropRect) {
            alert('No crop selected.');
            return;
        }
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

                if(state.cropRect.width > 0 && state.cropRect.height > 0) {
                    if(step2DlImg) step2DlImg.disabled = false;
                    if(step2DlJson) step2DlJson.disabled = false;
                    if(step2Next) step2Next.disabled = false;
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
        if(!originalPreviewCanvas || !croppedPreviewCanvas) return;
        
        const originalPreviewCtx = originalPreviewCanvas.getContext('2d');
        const croppedPreviewCtx = croppedPreviewCanvas.getContext('2d');
        const { originalImage, cropRect } = state;

        if(!originalImage || !cropRect) return;

        originalPreviewCanvas.width = originalImage.width;
        originalPreviewCanvas.height = originalImage.height;
        croppedPreviewCanvas.width = cropRect.width;
        croppedPreviewCanvas.height = cropRect.height;

        originalPreviewCtx.drawImage(originalImage, 0, 0);
        originalPreviewCtx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
        originalPreviewCtx.lineWidth = Math.max(5, originalImage.width * 0.005);
        originalPreviewCtx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);

        if(cropRect.width > 0 && cropRect.height > 0) {
            croppedPreviewCtx.drawImage(originalImage, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, cropRect.width, cropRect.height);
        }
    }

    function setupMasking() {
        reUploadStep.classList.add('hidden');
        maskStep.classList.remove('hidden');

        state.maskCanvas = document.getElementById('mask-canvas');
        state.maskCanvas.width = state.originalImage.width;
        state.maskCanvas.height = state.originalImage.height;
        state.maskCtx = state.maskCanvas.getContext('2d');
        
        requestAnimationFrame(updateCursorSize);

        // Initialize User Paint Layer (Persistent)
        if (!state.userPaintLayer) {
            state.userPaintLayer = document.createElement('canvas');
            state.userPaintLayer.width = state.originalImage.width;
            state.userPaintLayer.height = state.originalImage.height;
        } else {
            const ctx = state.userPaintLayer.getContext('2d');
            ctx.clearRect(0,0, state.userPaintLayer.width, state.userPaintLayer.height);
        }

        // Initialize Temp Stroke Layer (Transient - for current drag only)
        if (!state.tempStrokeLayer) {
            state.tempStrokeLayer = document.createElement('canvas');
            state.tempStrokeLayer.width = state.originalImage.width;
            state.tempStrokeLayer.height = state.originalImage.height;
        }

        composeMaskAndDraw();

        const getPos = (e) => {
            const rect = maskCanvas.getBoundingClientRect();
            const cx = e.clientX || e.touches[0].clientX;
            const cy = e.clientY || e.touches[0].clientY;
            return {
                x: (cx - rect.left) * (maskCanvas.width / rect.width),
                y: (cy - rect.top) * (maskCanvas.height / rect.height)
            };
        };
        
        const startPaint = (e) => {
            if (e.type === 'touchstart' && !state.isTouchMode) return;
            e.preventDefault();
            state.isDrawing = true;
            
            // Clear the temp layer for the new stroke
            const tmpCtx = state.tempStrokeLayer.getContext('2d');
            tmpCtx.clearRect(0, 0, state.tempStrokeLayer.width, state.tempStrokeLayer.height);
            
            // Start the path
            const pos = getPos(e);
            state.lastPoint = pos;
            
            tmpCtx.beginPath();
            tmpCtx.moveTo(pos.x, pos.y);
            // Draw a single dot in case they just click without dragging
            tmpCtx.lineCap = 'round';
            tmpCtx.lineJoin = 'round';
            tmpCtx.lineWidth = state.brushSize;
            tmpCtx.strokeStyle = 'white';
            tmpCtx.lineTo(pos.x + 0.01, pos.y); // tiny line to force a dot
            tmpCtx.stroke();

            composeMaskAndDraw(); // Update preview
        };
        
        const doPaint = (e) => {
            if (!state.isDrawing) return;
            if (e.type === 'touchmove' && !state.isTouchMode) return;
            e.preventDefault();
            
            const newPoint = getPos(e);
            const tmpCtx = state.tempStrokeLayer.getContext('2d');
            
            // Continue the path on the Temp Layer (Solid White)
            tmpCtx.beginPath();
            tmpCtx.moveTo(state.lastPoint.x, state.lastPoint.y);
            tmpCtx.lineTo(newPoint.x, newPoint.y);
            tmpCtx.lineCap = 'round';
            tmpCtx.lineJoin = 'round';
            tmpCtx.lineWidth = state.brushSize;
            tmpCtx.strokeStyle = 'white';
            tmpCtx.stroke();
            
            state.lastPoint = newPoint;
            composeMaskAndDraw(); // Update preview
        };

        const stopPaint = () => {
            if (!state.isDrawing) return;
            state.isDrawing = false;
            state.lastPoint = null;

            // COMMIT: Bake the temp layer (with blur) into the main layer
            const ctx = state.userPaintLayer.getContext('2d');
            const blurAmount = (state.brushSize * (state.brushSoftness / 100)) / 2;
            
            ctx.save();
            if (blurAmount > 0) {
                ctx.filter = `blur(${blurAmount}px)`;
            }
            
            if (state.currentTool === 'brush') {
                ctx.globalCompositeOperation = 'source-over';
            } else {
                ctx.globalCompositeOperation = 'destination-out';
            }
            
            // Draw the completed stroke
            ctx.drawImage(state.tempStrokeLayer, 0, 0);
            ctx.restore();

            // Clear temp layer
            const tmpCtx = state.tempStrokeLayer.getContext('2d');
            tmpCtx.clearRect(0, 0, state.tempStrokeLayer.width, state.tempStrokeLayer.height);
            
            composeMaskAndDraw();
        };

        maskCanvas.onmousedown = startPaint;
        maskCanvas.onmousemove = doPaint;
        maskCanvas.onmouseup = stopPaint;
        maskCanvas.onmouseleave = stopPaint;
        maskCanvas.ontouchstart = startPaint;
        maskCanvas.ontouchmove = doPaint;
        maskCanvas.ontouchend = stopPaint;
        
        window.addEventListener('resize', updateCursorSize);
    }
    
    function composeMaskAndDraw() {
        const ctx = state.maskCtx;
        
        // 1. Draw Background (Original)
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(state.originalImage, 0, 0);

        // 2. Prepare the Combined Mask
        // We need a buffer that combines the User Paint + The Current Stroke (if drawing)
        const combinedMaskCanvas = document.createElement('canvas');
        combinedMaskCanvas.width = ctx.canvas.width;
        combinedMaskCanvas.height = ctx.canvas.height;
        const maskCtx = combinedMaskCanvas.getContext('2d');

        // A. Draw existing committed strokes
        maskCtx.drawImage(state.userPaintLayer, 0, 0);

        // B. Draw current active stroke (Live Preview)
        // We apply the blur here to the live stroke so the user sees exactly what they will get
        if (state.isDrawing && state.tempStrokeLayer) {
            maskCtx.save();
            const blurAmount = (state.brushSize * (state.brushSoftness / 100)) / 2;
            if (blurAmount > 0) {
                maskCtx.filter = `blur(${blurAmount}px)`;
            }
            
            if (state.currentTool === 'brush') {
                maskCtx.globalCompositeOperation = 'source-over';
            } else {
                // For live erasing, we need to cut out from the existing paint
                maskCtx.globalCompositeOperation = 'destination-out';
            }
            
            maskCtx.drawImage(state.tempStrokeLayer, 0, 0);
            maskCtx.restore();
        }

        // C. Apply Crop Constraints (Feathered Box)
        // This ensures paint doesn't appear outside the crop box
        const constraintCanvas = document.createElement('canvas');
        constraintCanvas.width = ctx.canvas.width;
        constraintCanvas.height = ctx.canvas.height;
        const constraintCtx = constraintCanvas.getContext('2d');

        const feather = state.cropFeather;
        constraintCtx.save();
        if (feather > 0) {
            constraintCtx.filter = `blur(${feather}px)`;
        }
        constraintCtx.fillStyle = 'white';
        constraintCtx.fillRect(state.cropRect.x, state.cropRect.y, state.cropRect.width, state.cropRect.height);
        constraintCtx.restore();

        // CLIP: combined mask intersected with crop area
        maskCtx.globalCompositeOperation = 'destination-in';
        maskCtx.drawImage(constraintCanvas, 0, 0);

        // 3. Draw Edited Image masked by the Combined Mask
        const revealedEditCanvas = document.createElement('canvas');
        revealedEditCanvas.width = ctx.canvas.width;
        revealedEditCanvas.height = ctx.canvas.height;
        const revealedEditCtx = revealedEditCanvas.getContext('2d');
        
        revealedEditCtx.drawImage(state.editedImage, state.cropRect.x, state.cropRect.y, state.cropRect.width, state.cropRect.height);
        
        revealedEditCtx.globalCompositeOperation = 'destination-in';
        revealedEditCtx.drawImage(combinedMaskCanvas, 0, 0);
        
        // 4. Combine Final Result
        ctx.drawImage(revealedEditCanvas, 0, 0);
        
        // 5. Overlays (Red Mask / Green Border)
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
    
    function setTool(tool) {
        state.currentTool = tool;
        brushBtn.classList.toggle('active', tool === 'brush');
        eraserBtn.classList.toggle('active', tool === 'eraser');
        brushCursor.style.borderColor = (tool === 'brush') ? 'white' : '#ff4444';
    }

    function updateCursorPosition(e) {
        const scale = getCanvasScale();
        const visualSize = state.brushSize * scale;
        brushCursor.style.left = `${e.pageX - visualSize / 2}px`;
        brushCursor.style.top = `${e.pageY - visualSize / 2}px`;
    }

    function updateCursorSize() {
        const scale = getCanvasScale();
        const visualSize = state.brushSize * scale;
        brushCursor.style.width = `${visualSize}px`;
        brushCursor.style.height = `${visualSize}px`;
    }
    
    function getCanvasScale() {
        const canvas = document.getElementById('mask-canvas');
        if (!canvas || canvas.width === 0) return 1;
        const rect = canvas.getBoundingClientRect();
        return rect.width / canvas.width;
    }

    function saveFinalImage() {
        const maskState = state.showMaskOverlay;
        const guideState = state.showCropGuide;
        state.showMaskOverlay = false;
        state.showCropGuide = false;
        composeMaskAndDraw();

        const link = document.createElement('a');
        const baseName = getBaseFilename();
        link.download = `${baseName}-final.png`;
        link.href = maskCanvas.toDataURL('image/png');
        link.click();

        state.showMaskOverlay = maskState;
        state.showCropGuide = guideState;
        composeMaskAndDraw();
    }
});