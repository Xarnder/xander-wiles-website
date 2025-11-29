document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: App initialized");

    // --- STATE ---
    const state = {
        baseImg: null,
        alignImg: null,
        
        basePoints: [],
        alignPoints: [],
        pointColors: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#00FFFF', '#FF00FF'],
        
        maskCtx: null,
        maskLayer: null,    
        isDrawing: false,
        activeTool: 'brush', 
        alignedImageCanvas: null, 
        lastPoint: null, 
        transformMatrix: null,
        
        showMaskOverlay: false,
        showBorderOverlay: false,
        magnifierEnabled: false,
        magnifierZoom: 2.0
    };

    // --- DOM ELEMENTS ---
    const els = {
        stepUpload: document.getElementById('step-upload'),
        stepAlign: document.getElementById('step-align'),
        stepMask: document.getElementById('step-mask'),
        
        uploadBase: document.getElementById('upload-base'),
        uploadAlign: document.getElementById('upload-overlay'),
        statusBase: document.getElementById('status-base'),
        statusAlign: document.getElementById('status-overlay'),
        btnGotoAlign: document.getElementById('btn-goto-align'),
        
        canvasBase: document.getElementById('canvas-base'),
        canvasAlign: document.getElementById('canvas-align'),
        pointCount: document.getElementById('point-count'),
        btnUndo: document.getElementById('btn-undo-point'),
        btnProcess: document.getElementById('btn-process-align'),
        
        magnifierCanvas: document.getElementById('magnifier'),
        toggleMagnifier: document.getElementById('toggle-magnifier'),
        magnifierZoomInput: document.getElementById('magnifier-zoom'),
        
        canvasComposite: document.getElementById('canvas-composite'),
        brushCursor: document.getElementById('brush-cursor'),
        
        brushSize: document.getElementById('brush-size'),
        brushSoftness: document.getElementById('brush-softness'),
        brushOpacity: document.getElementById('brush-opacity'),
        overlayOpacity: document.getElementById('overlay-opacity'),
        toolBrush: document.getElementById('tool-brush'),
        toolEraser: document.getElementById('tool-eraser'),
        
        toggleMask: document.getElementById('toggle-mask-overlay'),
        toggleBorder: document.getElementById('toggle-border-overlay'),
        
        btnResetMask: document.getElementById('btn-reset-mask'),
        btnDownload: document.getElementById('btn-download'),
        
        ind1: document.getElementById('step1-ind'),
        ind2: document.getElementById('step2-ind'),
        ind3: document.getElementById('step3-ind'),
    };

    // --- STEP 1: UPLOAD HANDLING ---
    function handleImageUpload(e, type) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                if (type === 'base') {
                    state.baseImg = img;
                    els.statusBase.textContent = file.name;
                    els.statusBase.style.color = '#06b6d4';
                } else {
                    state.alignImg = img;
                    els.statusAlign.textContent = file.name;
                    els.statusAlign.style.color = '#06b6d4';
                }
                checkUploadsReady();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    function checkUploadsReady() {
        if (state.baseImg && state.alignImg) {
            els.btnGotoAlign.disabled = false;
        }
    }

    els.uploadBase.addEventListener('change', (e) => handleImageUpload(e, 'base'));
    els.uploadAlign.addEventListener('change', (e) => handleImageUpload(e, 'align'));

    els.btnGotoAlign.addEventListener('click', () => {
        switchStep(2);
        setupAlignmentCanvases();
    });

    // --- STEP 2: ALIGNMENT LOGIC ---
    function setupAlignmentCanvases() {
        els.canvasBase.width = state.baseImg.width;
        els.canvasBase.height = state.baseImg.height;
        els.canvasAlign.width = state.alignImg.width;
        els.canvasAlign.height = state.alignImg.height;
        drawAlignmentState();
    }

    function drawAlignmentState() {
        const ctx1 = els.canvasBase.getContext('2d');
        const ctx2 = els.canvasAlign.getContext('2d');

        ctx1.clearRect(0, 0, els.canvasBase.width, els.canvasBase.height);
        ctx1.drawImage(state.baseImg, 0, 0);
        
        ctx2.clearRect(0, 0, els.canvasAlign.width, els.canvasAlign.height);
        ctx2.drawImage(state.alignImg, 0, 0);

        state.basePoints.forEach((p, i) => drawPoint(ctx1, p, i));
        state.alignPoints.forEach((p, i) => drawPoint(ctx2, p, i));

        els.pointCount.textContent = state.basePoints.length;
        els.btnProcess.disabled = !(state.basePoints.length >= 3 && state.basePoints.length === state.alignPoints.length);
    }

    function drawPoint(ctx, p, index) {
        const color = state.pointColors[index % state.pointColors.length];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(index + 1, p.x + 8, p.y - 8);
    }

    function getCanvasCoordinates(canvas, e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    els.canvasBase.addEventListener('click', (e) => {
        if (state.basePoints.length === state.alignPoints.length) {
            state.basePoints.push(getCanvasCoordinates(els.canvasBase, e));
            drawAlignmentState();
        } else {
            alert("Please click the corresponding point on the second image next.");
        }
    });

    els.canvasAlign.addEventListener('click', (e) => {
        if (state.basePoints.length === state.alignPoints.length + 1) {
            state.alignPoints.push(getCanvasCoordinates(els.canvasAlign, e));
            drawAlignmentState();
        } else {
            alert("Please click a point on the Base Image first.");
        }
    });

    els.btnUndo.addEventListener('click', () => {
        if (state.alignPoints.length < state.basePoints.length) {
            state.basePoints.pop();
        } else if (state.basePoints.length > 0) {
            state.basePoints.pop();
            state.alignPoints.pop();
        }
        drawAlignmentState();
    });

    els.btnProcess.addEventListener('click', () => {
        try {
            const transform = solveAffine(state.alignPoints, state.basePoints);
            state.transformMatrix = transform;
            generateAlignedImage(transform);
            els.magnifierCanvas.classList.remove('active'); // Hide mag
            switchStep(3);
            setupMasking();
        } catch (err) {
            console.error(err);
            alert("Error calculating alignment. Try spreading your points out more.");
        }
    });

    // --- MAGNIFIER LOGIC ---
    els.toggleMagnifier.addEventListener('change', (e) => {
        state.magnifierEnabled = e.target.checked;
        if (!state.magnifierEnabled) els.magnifierCanvas.classList.remove('active');
    });

    els.magnifierZoomInput.addEventListener('input', (e) => state.magnifierZoom = parseFloat(e.target.value));

    function updateMagnifier(e, canvas, image) {
        if (!state.magnifierEnabled || !image) return;

        const magCanvas = els.magnifierCanvas;
        const magCtx = magCanvas.getContext('2d');
        const zoom = state.magnifierZoom;
        const lensSize = magCanvas.width; 

        // Position lens
        magCanvas.style.left = (e.clientX - lensSize / 2) + 'px';
        magCanvas.style.top = (e.clientY - lensSize / 2) + 'px';
        magCanvas.classList.add('active');

        // Calculate Image Source Coordinates
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const imgX = (e.clientX - rect.left) * scaleX;
        const imgY = (e.clientY - rect.top) * scaleY;

        // Source Rect
        const srcW = lensSize / zoom;
        const srcH = lensSize / zoom;
        const srcX = imgX - (srcW / 2);
        const srcY = imgY - (srcH / 2);

        // Draw
        magCtx.fillStyle = '#000';
        magCtx.fillRect(0, 0, lensSize, lensSize);
        magCtx.drawImage(image, srcX, srcY, srcW, srcH, 0, 0, lensSize, lensSize);

        // Crosshair
        magCtx.strokeStyle = '#06b6d4';
        magCtx.lineWidth = 1;
        magCtx.beginPath();
        magCtx.moveTo(lensSize / 2, 0);
        magCtx.lineTo(lensSize / 2, lensSize);
        magCtx.moveTo(0, lensSize / 2);
        magCtx.lineTo(lensSize, lensSize / 2);
        magCtx.stroke();
    }

    els.canvasBase.addEventListener('mousemove', (e) => updateMagnifier(e, els.canvasBase, state.baseImg));
    els.canvasAlign.addEventListener('mousemove', (e) => updateMagnifier(e, els.canvasAlign, state.alignImg));
    
    [els.canvasBase, els.canvasAlign].forEach(c => {
        c.addEventListener('mouseleave', () => els.magnifierCanvas.classList.remove('active'));
    });

    // --- MATH & MASKING (Standard) ---
    function solveAffine(srcPoints, dstPoints) {
        const n = srcPoints.length;
        let sx = 0, sy = 0, dx = 0, dy = 0, sxx = 0, syy = 0, sxy = 0, sdx = 0, sdy = 0, idx = 0, idy = 0;
        for (let i = 0; i < n; i++) {
            const s = srcPoints[i], d = dstPoints[i];
            sx += s.x; sy += s.y; dx += d.x; dy += d.y;
            sxx += s.x*s.x; syy += s.y*s.y; sxy += s.x*s.y;
            sdx += s.x*d.x; sdy += s.y*d.y; idx += s.y*d.x; idy += s.x*d.y;
        }
        const det = (n*sxx*syy) + (2*sx*sy*sxy) - (sxx*sy*sy) - (syy*sx*sx) - (n*sxy*sxy);
        if (Math.abs(det) < 1e-9) throw new Error("Points are collinear.");
        
        const sys1 = solve3x3(sxx, sxy, sx, sdx, sxy, syy, sy, idx, sx, sy, n, dx);
        const sys2 = solve3x3(sxx, sxy, sx, idy, sxy, syy, sy, sdy, sx, sy, n, dy);
        return [sys1[0], sys2[0], sys1[1], sys2[1], sys1[2], sys2[2]];
    }

    function solve3x3(a1, b1, c1, d1, a2, b2, c2, d2, a3, b3, c3, d3) {
        const det = a1*(b2*c3 - b3*c2) - b1*(a2*c3 - a3*c2) + c1*(a2*b3 - a3*b2);
        if (Math.abs(det) < 1e-9) return [1,0,0];
        return [
            (d1*(b2*c3 - b3*c2) - b1*(d2*c3 - d3*c2) + c1*(d2*b3 - d3*b2))/det,
            (a1*(d2*c3 - d3*c2) - d1*(a2*c3 - a3*c2) + c1*(a2*d3 - a3*d2))/det,
            (a1*(b2*d3 - b3*d2) - b1*(a2*d3 - a3*d2) + d1*(a2*b3 - a3*b2))/det
        ];
    }

    function generateAlignedImage(matrix) {
        const canvas = document.createElement('canvas');
        canvas.width = state.baseImg.width;
        canvas.height = state.baseImg.height;
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
        ctx.drawImage(state.alignImg, 0, 0);
        ctx.restore();
        state.alignedImageCanvas = canvas;
    }

    function setupMasking() {
        els.canvasComposite.width = state.baseImg.width;
        els.canvasComposite.height = state.baseImg.height;
        state.maskLayer = document.createElement('canvas');
        state.maskLayer.width = state.baseImg.width;
        state.maskLayer.height = state.baseImg.height;
        requestAnimationFrame(renderComposite);
    }

    function renderComposite() {
        const ctx = els.canvasComposite.getContext('2d');
        const w = els.canvasComposite.width, h = els.canvasComposite.height;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(state.baseImg, 0, 0);

        const temp = document.createElement('canvas');
        temp.width = w; temp.height = h;
        const tempCtx = temp.getContext('2d');
        tempCtx.drawImage(state.alignedImageCanvas, 0, 0);
        tempCtx.globalCompositeOperation = 'destination-in';
        tempCtx.drawImage(state.maskLayer, 0, 0);

        ctx.globalAlpha = parseInt(els.overlayOpacity.value) / 100;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(temp, 0, 0);
        ctx.globalAlpha = 1.0;

        if (state.showMaskOverlay) {
            const overlay = document.createElement('canvas');
            overlay.width = w; overlay.height = h;
            const oCtx = overlay.getContext('2d');
            oCtx.drawImage(state.maskLayer, 0, 0);
            oCtx.globalCompositeOperation = 'source-in';
            oCtx.fillStyle = 'rgba(255, 0, 0, 0.4)';
            oCtx.fillRect(0, 0, w, h);
            ctx.drawImage(overlay, 0, 0);
        }

        if (state.showBorderOverlay && state.transformMatrix) {
            const m = state.transformMatrix;
            const tw = state.alignImg.width, th = state.alignImg.height;
            const tp = (x, y) => ({ x: m[0]*x + m[2]*y + m[4], y: m[1]*x + m[3]*y + m[5] });
            const p1=tp(0,0), p2=tp(tw,0), p3=tp(tw,th), p4=tp(0,th);
            
            ctx.save();
            ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 2; ctx.setLineDash([10, 5]);
            ctx.shadowColor = 'black'; ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
            ctx.closePath(); ctx.stroke(); ctx.restore();
        }
    }

    function paint(currentPoint) {
        if (!state.lastPoint) state.lastPoint = currentPoint;
        const dist = Math.sqrt((currentPoint.x - state.lastPoint.x)**2 + (currentPoint.y - state.lastPoint.y)**2);
        const angle = Math.atan2(currentPoint.y - state.lastPoint.y, currentPoint.x - state.lastPoint.x);
        
        const ctx = state.maskLayer.getContext('2d');
        const size = parseInt(els.brushSize.value);
        const softness = parseInt(els.brushSoftness.value);
        ctx.globalCompositeOperation = state.activeTool === 'brush' ? 'source-over' : 'destination-out';

        const step = Math.max(1, size / 8);
        for (let i = 0; i <= dist; i += step) {
            const x = state.lastPoint.x + (Math.sin(angle) * i);
            const y = state.lastPoint.y + (Math.cos(angle) * i);
            drawBrushStamp(ctx, x, y, size, softness);
        }
        state.lastPoint = currentPoint;
        requestAnimationFrame(renderComposite);
    }

    function drawBrushStamp(ctx, x, y, size, softnessVal) {
        const radius = size / 2;
        const opacity = parseInt(els.brushOpacity.value) / 100;
        const softness = Math.max(0, Math.min(100, softnessVal)) / 100;
        const innerRadius = radius * (1 - softness);
        const gradient = ctx.createRadialGradient(x, y, innerRadius, x, y, radius);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();
    }

    els.canvasComposite.addEventListener('mousedown', (e) => {
        state.isDrawing = true;
        const rect = els.canvasComposite.getBoundingClientRect();
        const scaleX = els.canvasComposite.width / rect.width;
        const scaleY = els.canvasComposite.height / rect.height;
        state.lastPoint = { x: (e.clientX - rect.left)*scaleX, y: (e.clientY - rect.top)*scaleY };
        paint(state.lastPoint);
    });

    els.canvasComposite.addEventListener('mousemove', (e) => {
        const rect = els.canvasComposite.getBoundingClientRect();
        const scaleX = els.canvasComposite.width / rect.width;
        const scaleY = els.canvasComposite.height / rect.height;
        const visualSize = parseInt(els.brushSize.value) * (rect.width / els.canvasComposite.width);
        
        els.brushCursor.style.left = e.clientX + 'px';
        els.brushCursor.style.top = e.clientY + 'px';
        els.brushCursor.style.width = visualSize + 'px';
        els.brushCursor.style.height = visualSize + 'px';
        els.brushCursor.style.display = 'block';

        if (state.isDrawing) paint({ x: (e.clientX - rect.left)*scaleX, y: (e.clientY - rect.top)*scaleY });
    });

    ['mouseup', 'mouseleave'].forEach(evt => els.canvasComposite.addEventListener(evt, () => { state.isDrawing = false; state.lastPoint = null; }));
    els.canvasComposite.addEventListener('mouseenter', () => els.brushCursor.style.display = 'block');
    
    els.toolBrush.addEventListener('click', () => { state.activeTool = 'brush'; els.toolBrush.classList.add('active'); els.toolEraser.classList.remove('active'); els.brushCursor.style.borderColor = 'white'; });
    els.toolEraser.addEventListener('click', () => { state.activeTool = 'eraser'; els.toolEraser.classList.add('active'); els.toolBrush.classList.remove('active'); els.brushCursor.style.borderColor = 'red'; });

    els.toggleMask.addEventListener('change', (e) => { state.showMaskOverlay = e.target.checked; requestAnimationFrame(renderComposite); });
    els.toggleBorder.addEventListener('change', (e) => { state.showBorderOverlay = e.target.checked; requestAnimationFrame(renderComposite); });
    els.overlayOpacity.addEventListener('input', () => requestAnimationFrame(renderComposite));
    els.btnResetMask.addEventListener('click', () => { state.maskLayer.getContext('2d').clearRect(0,0,state.maskLayer.width,state.maskLayer.height); requestAnimationFrame(renderComposite); });

    els.btnDownload.addEventListener('click', () => {
        const oldM = state.showMaskOverlay, oldB = state.showBorderOverlay;
        state.showMaskOverlay = false; state.showBorderOverlay = false;
        renderComposite();
        const link = document.createElement('a');
        link.download = 'aligned-composite.png';
        link.href = els.canvasComposite.toDataURL();
        link.click();
        state.showMaskOverlay = oldM; state.showBorderOverlay = oldB;
        requestAnimationFrame(renderComposite);
    });

    function switchStep(stepNum) {
        [els.stepUpload, els.stepAlign, els.stepMask].forEach(el => el.classList.add('hidden'));
        [els.ind1, els.ind2, els.ind3].forEach(el => el.classList.remove('active'));
        if (stepNum === 1) { els.stepUpload.classList.remove('hidden'); els.ind1.classList.add('active'); }
        else if (stepNum === 2) { els.stepAlign.classList.remove('hidden'); els.ind2.classList.add('active'); }
        else if (stepNum === 3) { els.stepMask.classList.remove('hidden'); els.ind3.classList.add('active'); }
    }
});