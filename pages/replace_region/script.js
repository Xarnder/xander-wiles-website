document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    const state = {
        originalImage: null,
        editedImage: null,
        cropRect: null, // { x, y, width, height }
        maskCanvas: null, // In-memory canvas for the mask data
        maskCtx: null,
        currentTool: 'brush', // 'brush' or 'eraser'
        brushSize: 50,
        brushSoftness: 25, // 0-100
        isDrawing: false,
        showMaskOverlay: false,
        isTouchMode: false
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
    const touchModeToggle = document.getElementById('touch-mode-toggle');

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
        setupStep3Previews(); // NEW: Call the preview generator
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
                if (img.width !== state.cropRect.width || img.height !== state.cropRect.height) {
                    console.warn(`DEBUG: Edited image size mismatch. Auto-resizing from ${img.width}x${img.height} to ${state.cropRect.width}x${state.cropRect.height}.`);
                    const resizeCanvas = document.createElement('canvas');
                    resizeCanvas.width = state.cropRect.width;
                    resizeCanvas.height = state.cropRect.height;
                    const resizeCtx = resizeCanvas.getContext('2d');
                    resizeCtx.drawImage(img, 0, 0, state.cropRect.width, state.cropRect.height);
                    state.editedImage = resizeCanvas;
                } else {
                    console.log('DEBUG: Edited image loaded. Dimensions match.');
                    state.editedImage = img;
                }
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

    touchModeToggle.addEventListener('change', (e) => {
        state.isTouchMode = e.target.checked;
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

        const getPos = (e) => {
            const rect = cropCanvas.getBoundingClientRect();
            const clientX = e.clientX || e.touches[0].clientX;
            const clientY = e.clientY || e.touches[0].clientY;
            return {
                x: (clientX - rect.left) * (cropCanvas.width / rect.width),
                y: (clientY - rect.top) * (cropCanvas.height / rect.height)
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

        const endDrag = () => {
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

        cropCanvas.onmousedown = startDrag;
        cropCanvas.onmousemove = drag;
        cropCanvas.onmouseup = endDrag;
        cropCanvas.onmouseleave = endDrag;
        cropCanvas.ontouchstart = startDrag;
        cropCanvas.ontouchmove = drag;
        cropCanvas.ontouchend = endDrag;
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

    // --- NEW: Function to set up the previews in Step 3 ---
    function setupStep3Previews() {
        const originalPreviewCanvas = document.getElementById('original-preview-canvas');
        const croppedPreviewCanvas = document.getElementById('cropped-preview-canvas');
        const originalPreviewCtx = originalPreviewCanvas.getContext('2d');
        const croppedPreviewCtx = croppedPreviewCanvas.getContext('2d');

        const { originalImage, cropRect } = state;

        // Draw original image with crop box
        originalPreviewCanvas.width = originalImage.width;
        originalPreviewCanvas.height = originalImage.height;
        originalPreviewCtx.drawImage(originalImage, 0, 0);
        originalPreviewCtx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
        originalPreviewCtx.lineWidth = Math.max(8, originalImage.width * 0.005); // Line width scales slightly
        originalPreviewCtx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);

        // Draw the extracted cropped image
        croppedPreviewCanvas.width = cropRect.width;
        croppedPreviewCanvas.height = cropRect.height;
        croppedPreviewCtx.drawImage(
            originalImage,
            cropRect.x, cropRect.y, cropRect.width, cropRect.height,
            0, 0, cropRect.width, cropRect.height
        );
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

        const getPos = (e) => {
            const rect = maskCanvas.getBoundingClientRect();
            const clientX = e.clientX || e.touches[0].clientX;
            const clientY = e.clientY || e.touches[0].clientY;
            return {
                x: (clientX - rect.left) * (maskCanvas.width / rect.width),
                y: (clientY - rect.top) * (maskCanvas.height / rect.height)
            };
        };
        
        const startPaint = (e) => {
            if (e.type === 'touchstart' && !state.isTouchMode) return;
            e.preventDefault();
            state.isDrawing = true;
            paint(getPos(e));
        };
        
        const doPaint = (e) => {
            if (!state.isDrawing) return;
            if (e.type === 'touchmove' && !state.isTouchMode) return;
            e.preventDefault();
            paint(getPos(e));
        };

        const stopPaint = () => {
            state.isDrawing = false;
        };

        maskCanvas.onmousedown = startPaint;
        maskCanvas.onmousemove = doPaint;
        maskCanvas.onmouseup = stopPaint;
        maskCanvas.onmouseleave = stopPaint;
        maskCanvas.ontouchstart = startPaint;
        maskCanvas.ontouchmove = doPaint;
        maskCanvas.ontouchend = stopPaint;
    }
    
    function drawMaskComposite() {
        const ctx = maskCtx;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(state.originalImage, 0, 0);

        const revealedEditCanvas = document.createElement('canvas');
        revealedEditCanvas.width = ctx.canvas.width;
        revealedEditCanvas.height = ctx.canvas.height;
        const revealedEditCtx = revealedEditCanvas.getContext('2d');
        revealedEditCtx.drawImage(state.editedImage, state.cropRect.x, state.cropRect.y);
        revealedEditCtx.globalCompositeOperation = 'destination-in';
        revealedEditCtx.drawImage(state.maskCanvas, 0, 0);
        ctx.drawImage(revealedEditCanvas, 0, 0);
        
        if (state.showMaskOverlay) {
            const overlayCanvas = document.createElement('canvas');
            overlayCanvas.width = ctx.canvas.width;
            overlayCanvas.height = ctx.canvas.height;
            const overlayCtx = overlayCanvas.getContext('2d');
            overlayCtx.drawImage(state.maskCanvas, 0, 0);
            overlayCtx.globalCompositeOperation = 'source-in';
            overlayCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(overlayCanvas, 0, 0);
        }

        ctx.globalCompositeOperation = 'source-over';
    }

    function paint({ x, y }) {
        const ctx = state.maskCtx;
        const softness = state.brushSoftness / 100;
        const radius = state.brushSize / 2;
        const innerRadius = radius * (1 - softness);
        
        const gradient = ctx.createRadialGradient(x, y, innerRadius, x, y, radius);
        
        if (state.currentTool === 'brush') {
            ctx.globalCompositeOperation = 'source-over';
            gradient.addColorStop(0, 'white');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        } else {
            ctx.globalCompositeOperation = 'destination-out';
            gradient.addColorStop(0, 'rgba(0,0,0,1)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();
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
            drawMaskComposite();
        }
        const link = document.createElement('a');
        link.download = 'final-image.png';
        link.href = maskCanvas.toDataURL('image/png');
        link.click();
        if (showMaskState) {
            state.showMaskOverlay = true;
            drawMaskComposite();
        }
    }
});