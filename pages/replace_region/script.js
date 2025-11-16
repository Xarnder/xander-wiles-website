document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    const state = {
        originalImage: null,
        editedImage: null,
        cropRect: null, // { x, y, width, height }
        maskCanvas: null, // In-memory canvas for the mask data (transparent with white strokes)
        maskCtx: null,
        currentTool: 'brush', // 'brush' or 'eraser'
        brushSize: 50,
        brushSoftness: 25, // 0-100
        isDrawing: false,
        showMaskOverlay: false
    };

    // --- DOM ELEMENT SELECTORS ---
    const uploadStep = document.getElementById('upload-step');
    const cropStep = document.getElementById('crop-step');
    const reUploadStep = document.getElementById('re-upload-step');
    const maskStep = document.getElementById('mask-step');

    const imageUploadInput = document.getElementById('image-upload');
    const editedUploadInput = document.getElementById('edited-upload');
    const exportCropBtn = document.getElementById('export-crop-btn');
    const saveFinalBtn = document.getElementById('save-final-btn');
    
    const cropCanvas = document.getElementById('crop-canvas');
    const cropCtx = cropCanvas.getContext('2d');
    const aspectRatioSelect = document.getElementById('aspect-ratio-select');

    const maskCanvas = document.getElementById('mask-canvas'); // The visible canvas
    const maskCtx = maskCanvas.getContext('2d');

    const brushBtn = document.getElementById('brush-btn');
    const eraserBtn = document.getElementById('eraser-btn');
    const brushSizeSlider = document.getElementById('brush-size-slider');
    const brushSoftnessSlider = document.getElementById('brush-softness-slider');
    const brushSizeValue = document.getElementById('brush-size-value');
    const brushSoftnessValue = document.getElementById('brush-softness-value');
    const showMaskToggle = document.getElementById('show-mask-toggle');

    console.log('DEBUG: Script loaded and DOM is ready.');

    // --- EVENT LISTENERS ---
    imageUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                state.originalImage = img;
                setupCropping();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    exportCropBtn.addEventListener('click', () => {
        if (!state.cropRect) {
            alert('Please select an area to crop first.');
            return;
        }
        exportCroppedImage();
        cropStep.classList.add('hidden');
        reUploadStep.classList.remove('hidden');
    });

    editedUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // --- NEW: AUTOMATIC RESIZING LOGIC ---
                if (img.width !== state.cropRect.width || img.height !== state.cropRect.height) {
                    console.warn(`DEBUG: Edited image size mismatch detected. Auto-resizing from ${img.width}x${img.height} to target ${state.cropRect.width}x${state.cropRect.height}.`);
                    
                    // Create a canvas with the TARGET dimensions (the original crop size).
                    const resizeCanvas = document.createElement('canvas');
                    resizeCanvas.width = state.cropRect.width;
                    resizeCanvas.height = state.cropRect.height;
                    const resizeCtx = resizeCanvas.getContext('2d');
                    
                    // Draw the uploaded image, forcing it to stretch/shrink into the target dimensions.
                    resizeCtx.drawImage(img, 0, 0, state.cropRect.width, state.cropRect.height);
                    
                    // The canvas itself is now the correctly-sized image source we will use.
                    state.editedImage = resizeCanvas;
                    console.log('DEBUG: Edited image successfully resized.');

                } else {
                    // Dimensions match, so no resizing is needed.
                    console.log('DEBUG: Edited image loaded. Dimensions match.');
                    state.editedImage = img;
                }
                
                // Proceed to the masking step with the correctly-sized image.
                setupMasking();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
    
    brushBtn.addEventListener('click', () => setTool('brush'));
    eraserBtn.addEventListener('click', () => setTool('eraser'));
    brushSizeSlider.addEventListener('input', (e) => {
        state.brushSize = parseInt(e.target.value, 10);
        brushSizeValue.textContent = `${state.brushSize}px`;
    });
    brushSoftnessSlider.addEventListener('input', (e) => {
        state.brushSoftness = parseInt(e.target.value, 10);
        brushSoftnessValue.textContent = `${state.brushSoftness}%`;
    });
    showMaskToggle.addEventListener('change', (e) => {
        state.showMaskOverlay = e.target.checked;
        drawMaskComposite();
    });

    saveFinalBtn.addEventListener('click', saveFinalImage);

    // --- CORE FUNCTIONS ---
    function setupCropping() {
        uploadStep.classList.add('hidden');
        cropStep.classList.remove('hidden');

        cropCanvas.width = state.originalImage.width;
        cropCanvas.height = state.originalImage.height;
        cropCtx.drawImage(state.originalImage, 0, 0);

        let startX, startY, isDragging = false, tempRect = null;

        const getMousePos = (e) => {
            const rect = cropCanvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) * (cropCanvas.width / rect.width),
                y: (e.clientY - rect.top) * (cropCanvas.height / rect.height)
            };
        };

        cropCanvas.onmousedown = (e) => {
            const pos = getMousePos(e);
            startX = pos.x;
            startY = pos.y;
            isDragging = true;
        };

        cropCanvas.onmousemove = (e) => {
            if (!isDragging) return;
            const pos = getMousePos(e);
            const ratio = parseFloat(aspectRatioSelect.value);
            let width = pos.x - startX;
            let height = pos.y - startY;

            if (ratio > 0) {
                height = (width / ratio) * Math.sign(height || 1) * Math.sign(width || 1);
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

        cropCanvas.onmouseup = () => {
            if (!isDragging) return;
            isDragging = false;
            if (tempRect) {
                state.cropRect = {
                    x: Math.round(tempRect.x),
                    y: Math.round(tempRect.y),
                    width: Math.round(tempRect.width),
                    height: Math.round(tempRect.height)
                };
                if(state.cropRect.width > 0 && state.cropRect.height > 0) {
                    exportCropBtn.disabled = false;
                }
            }
        };
    }

    function exportCroppedImage() {
        const { x, y, width, height } = state.cropRect;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(state.originalImage, x, y, width, height, 0, 0, width, height);
        const link = document.createElement('a');
        link.download = 'cropped-area.png';
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    }

    function setupMasking() {
        reUploadStep.classList.add('hidden');
        maskStep.classList.remove('hidden');

        maskCanvas.width = state.originalImage.width;
        maskCanvas.height = state.originalImage.height;

        state.maskCanvas = document.createElement('canvas');
        state.maskCanvas.width = state.originalImage.width;
        state.maskCanvas.height = state.originalImage.height;
        state.maskCtx = state.maskCanvas.getContext('2d');
        
        state.maskCtx.clearRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
        
        drawMaskComposite();

        const getMousePos = (e) => {
            const rect = maskCanvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) * (maskCanvas.width / rect.width),
                y: (e.clientY - rect.top) * (maskCanvas.height / rect.height)
            };
        };

        maskCanvas.onmousedown = (e) => { state.isDrawing = true; paint(getMousePos(e)); };
        maskCanvas.onmousemove = (e) => { if (state.isDrawing) paint(getMousePos(e)); };
        maskCanvas.onmouseup = () => { state.isDrawing = false; };
        maskCanvas.onmouseleave = () => { state.isDrawing = false; };
    }
    
    function drawMaskComposite() {
        const ctx = maskCtx; // The context of the VISIBLE canvas.
        
        // 1. Draw the base original image.
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(state.originalImage, 0, 0);

        // 2. Create a temporary canvas for the revealed edited portion.
        const revealedEditCanvas = document.createElement('canvas');
        revealedEditCanvas.width = ctx.canvas.width;
        revealedEditCanvas.height = ctx.canvas.height;
        const revealedEditCtx = revealedEditCanvas.getContext('2d');

        // 3. Draw the edited image (which may be a canvas or an img) onto this temp canvas.
        revealedEditCtx.drawImage(state.editedImage, state.cropRect.x, state.cropRect.y);

        // 4. Use the in-memory mask to "cut out" the parts of the edited image we want to show.
        revealedEditCtx.globalCompositeOperation = 'destination-in';
        revealedEditCtx.drawImage(state.maskCanvas, 0, 0);

        // 5. Draw the resulting cutout edit on top of the original image on the main canvas.
        ctx.drawImage(revealedEditCanvas, 0, 0);
        
        // 6. (Optional) If the toggle is on, create and draw the overlay.
        if (state.showMaskOverlay) {
            // Create a new, separate temporary canvas just for the overlay.
            const overlayCanvas = document.createElement('canvas');
            overlayCanvas.width = ctx.canvas.width;
            overlayCanvas.height = ctx.canvas.height;
            const overlayCtx = overlayCanvas.getContext('2d');

            // First, draw our mask data (the white strokes) onto this overlay canvas.
            overlayCtx.drawImage(state.maskCanvas, 0, 0);

            // Now, use 'source-in' to colorize ONLY the strokes we just drew.
            overlayCtx.globalCompositeOperation = 'source-in';
            overlayCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

            // Finally, draw the finished, isolated overlay on top of the main canvas.
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(overlayCanvas, 0, 0);
        }

        ctx.globalCompositeOperation = 'source-over'; // Reset for next operation.
    }

    function paint({ x, y }) {
        const ctx = state.maskCtx; // Always paint on the IN-MEMORY mask canvas.
        const softness = state.brushSoftness / 100;
        const radius = state.brushSize / 2;
        const innerRadius = radius * (1 - softness);
        
        const gradient = ctx.createRadialGradient(x, y, innerRadius, x, y, radius);
        
        if (state.currentTool === 'brush') {
            // Brush paints OPAQUE WHITE onto the mask to REVEAL the edited image.
            ctx.globalCompositeOperation = 'source-over';
            gradient.addColorStop(0, 'white');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        } else { // Eraser
            // Eraser PUNCHES A TRANSPARENT HOLE in the mask to HIDE the edited image.
            ctx.globalCompositeOperation = 'destination-out';
            gradient.addColorStop(0, 'rgba(0,0,0,1)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();

        // After updating the mask data, redraw the visible result.
        drawMaskComposite();
    }
    
    function setTool(tool) {
        state.currentTool = tool;
        brushBtn.classList.toggle('active', tool === 'brush');
        eraserBtn.classList.toggle('active', tool === 'eraser');
    }

    function saveFinalImage() {
        const showMaskState = state.showMaskOverlay;
        if (showMaskState) {
            state.showMaskOverlay = false;
            drawMaskComposite(); // Redraw without overlay for a clean save.
        }

        const link = document.createElement('a');
        link.download = 'final-image.png';
        link.href = maskCanvas.toDataURL('image/png');
        link.click();

        if (showMaskState) {
            state.showMaskOverlay = true;
            drawMaskComposite(); // Restore the view.
        }
    }
});