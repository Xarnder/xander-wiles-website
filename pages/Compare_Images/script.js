document.addEventListener('DOMContentLoaded', () => {
    // --- GLOBAL STATE ---
    let numImages = 2;
    let imagesData = [];
    let activeSlider = null;
    let lastMagnifyEvent = null;

    const BLEND_MODES = [ 'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity' ];
    const VALID_IMG_REGEX = /\.(jpe?g|png|gif|webp|heic|heif)$/i;

    // --- ELEMENT SELECTORS ---
    const imageCountInput = document.getElementById('image-count');
    const setupBtn = document.getElementById('setup-btn');
    const directoryUploadInput = document.getElementById('directory-upload');
    const uploadArea = document.getElementById('upload-area-dynamic');
    const comparisonContainer = document.getElementById('comparison-container');
    const navLinks = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.view');
    const splitViewContainer = document.getElementById('split-view-container');
    const magnifySourceContainer = document.getElementById('magnify-source');
    const magnifyPreviewContainer = document.getElementById('magnify-preview-container');
    const fadeContainer = document.getElementById('fade-container');
    const heatmapCanvas = document.getElementById('heatmap-canvas');
    const zoomLevelSlider = document.getElementById('zoom-level');
    const zoomValueSpan = document.getElementById('zoom-value');
    const fadeSelect1 = document.getElementById('fade-select-1');
    const fadeSelect2 = document.getElementById('fade-select-2');
    const fadeLevelSlider = document.getElementById('fade-level');
    const blendModeSelect = document.getElementById('blend-mode-select');
    const heatmapSelect1 = document.getElementById('heatmap-select-1');
    const heatmapSelect2 = document.getElementById('heatmap-select-2');
    const generateHeatmapBtn = document.getElementById('generate-heatmap-btn');
    const heatmapStatus = document.getElementById('heatmap-status');

    // --- SETUP UI ---
    const setupUI = () => {
        numImages = parseInt(imageCountInput.value);
        imagesData = Array(numImages).fill(null);
        [uploadArea, splitViewContainer, magnifySourceContainer, magnifyPreviewContainer, fadeContainer].forEach(el => el.innerHTML = '');
        comparisonContainer.classList.add('hidden');
        const placeholderBase = "https://via.placeholder.com/800x600";
        for (let i = 0; i < numImages; i++) {
            const box = document.createElement('div');
            box.className = 'upload-box';
            box.innerHTML = `<label for="img-upload-${i}">Image ${i + 1}</label><input type="file" id="img-upload-${i}" data-index="${i}" accept="image/*,.heic,.heif">`;
            uploadArea.appendChild(box);
            document.getElementById(`img-upload-${i}`).addEventListener('change', handleIndividualImageUpload);
        }
        const placeholderSrc = (i) => `${placeholderBase}/555/FFF?text=Image+${i + 1}`;
        magnifySourceContainer.innerHTML = `<img id="magnify-img-base" src="${placeholderBase}/555/FFF?text=Upload+Image+1" alt="Source Image"><div class="magnify-loupe" id="magnify-loupe"></div>`;
        fadeContainer.innerHTML = `<img id="fade-sizer" src="${placeholderBase}/555/FFF?text=Base"><img id="fade-layer-1" src="${placeholderBase}/555/FFF?text=Select+Base"><img id="fade-layer-2" src="${placeholderBase}/888/FFF?text=Select+Overlay">`;
        blendModeSelect.innerHTML = '';
        BLEND_MODES.forEach(mode => { const option = document.createElement('option'); option.value = mode; option.textContent = mode.charAt(0).toUpperCase() + mode.slice(1).replace('-', ' '); blendModeSelect.appendChild(option); });
        for (let i = 0; i < numImages; i++) {
            const isBase = i === 0;
            const splitWrapperClass = isBase ? 'img-wrapper-dynamic base-image' : 'img-wrapper-dynamic';
            const magnifyWrapperClass = 'img-wrapper-dynamic';
            const splitWrapper = document.createElement('div');
            splitWrapper.className = splitWrapperClass; splitWrapper.id = `split-wrapper-${i}`; splitWrapper.style.zIndex = i + 1;
            splitWrapper.innerHTML = `<img id="split-img-${i}" src="${placeholderSrc(i)}" alt="Image ${i + 1}">`;
            splitViewContainer.appendChild(splitWrapper);
            const magnifyWrapper = document.createElement('div');
            magnifyWrapper.className = magnifyWrapperClass; magnifyWrapper.id = `magnify-wrapper-${i}`; magnifyWrapper.style.zIndex = i + 1;
            magnifyWrapper.style.backgroundImage = `url(${placeholderSrc(i)})`;
            magnifyPreviewContainer.appendChild(magnifyWrapper);
            if (!isBase) {
                const sliderIndex = i - 1;
                ['split', 'magnify'].forEach(type => { const slider = document.createElement('div'); slider.className = 'slider-handle-dynamic'; slider.id = `${type}-slider-${sliderIndex}`; slider.dataset.index = sliderIndex; slider.style.zIndex = numImages + 1; (type === 'split' ? splitViewContainer : magnifyPreviewContainer).appendChild(slider); });
            }
        }
        if (numImages > 2) {
            const splitResetBtn = document.createElement('button'); splitResetBtn.textContent = 'Reset Sliders'; splitResetBtn.className = 'reset-sliders-btn'; splitResetBtn.onclick = () => resetSliders('split'); splitViewContainer.appendChild(splitResetBtn);
            const magnifyResetBtn = document.createElement('button'); magnifyResetBtn.textContent = 'Reset Sliders'; magnifyResetBtn.className = 'reset-sliders-btn'; magnifyResetBtn.onclick = () => resetSliders('magnify'); magnifyPreviewContainer.appendChild(magnifyResetBtn);
        }
        resetSliders('split');
        resetSliders('magnify');
        initSliders();
    };

    // --- DIRECTORY UPLOAD HANDLER ---
    const handleDirectoryUpload = (event) => {
        const files = Array.from(event.target.files);
        const imageFiles = files.filter(file => VALID_IMG_REGEX.test(file.name));
        if (imageFiles.length < 2 || imageFiles.length > 5) {
            showErrorPopup("Invalid Number of Images", `Directories must contain between 2 and 5 images. You selected a directory with ${imageFiles.length} valid images.`);
            return;
        }
        imageCountInput.value = imageFiles.length;
        setupUI();
        imageFiles.forEach((file, index) => {
            processAndLoadImage(file, index);
        });
    };
    
    // --- INDIVIDUAL IMAGE UPLOAD HANDLER ---
    const handleIndividualImageUpload = (event) => {
        const index = parseInt(event.target.dataset.index);
        const file = event.target.files[0];
        if (file) {
            processAndLoadImage(file, index);
        }
    };
    
    // --- CORE IMAGE PROCESSING LOGIC (with HEIC) ---
    const processAndLoadImage = (file, index) => {
        const label = document.querySelector(`label[for="img-upload-${index}"]`);
        const processFileBlob = (fileBlob) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageUrl = e.target.result;
                const tempImg = new Image();
                tempImg.onload = () => {
                    imagesData[index] = { src: imageUrl, naturalWidth: tempImg.naturalWidth, naturalHeight: tempImg.naturalHeight, element: tempImg };
                    label.textContent = `✓ ${file.name.substring(0,10)}...`;
                    label.classList.add('uploaded');
                    document.getElementById(`split-img-${index}`).src = imageUrl;
                    document.getElementById(`magnify-wrapper-${index}`).style.backgroundImage = `url(${imageUrl})`;
                    if (index === 0) document.getElementById('magnify-img-base').src = imageUrl;
                    comparisonContainer.classList.remove('hidden');
                    const loadedImages = imagesData.filter(Boolean);
                    if (loadedImages.length >= 2) { updateFadeSelectors(); updateHeatmapSelectors(); checkForAspectRatioMismatch(); }
                };
                tempImg.src = imageUrl;
            };
            reader.readAsDataURL(fileBlob);
        };
        const fileType = file.type.toLowerCase() || file.name.split('.').pop().toLowerCase();
        if (fileType === 'heic' || fileType === 'heif') {
            label.textContent = 'Converting HEIC...';
            heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 })
                .then(conversionResult => { processFileBlob(conversionResult); })
                .catch(err => { console.error("HEIC Conversion Error:", err); label.textContent = 'Conversion Failed!'; showErrorPopup('HEIC Conversion Failed', 'There was an error converting the HEIC file. It may be corrupted or in an unsupported format.'); });
        } else {
            processFileBlob(file);
        }
    };

    // --- POPUP LOGIC ---
    const showErrorPopup = (title, message) => {
        closePopup();
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        overlay.innerHTML = `<div class="popup-card glass-card"><button class="popup-close-btn">&times;</button><h3>${title}</h3><p>${message}</p></div>`;
        document.body.appendChild(overlay);
        document.body.classList.add('popup-open');
        overlay.querySelector('.popup-close-btn').addEventListener('click', closePopup);
    };
    const checkForAspectRatioMismatch = () => {
        const loadedImages = imagesData.map((data, index) => ({ ...data, index })).filter(data => data && data.naturalWidth);
        if (loadedImages.length < 2) return;
        const groups = {};
        loadedImages.forEach(img => {
            const ratio = (img.naturalWidth / img.naturalHeight).toFixed(3);
            if (!groups[ratio]) { groups[ratio] = []; }
            groups[ratio].push(`Image ${img.index + 1}`);
        });
        if (Object.keys(groups).length > 1) { showAspectRatioWarning(groups); }
    };
    const showAspectRatioWarning = (groups) => {
        closePopup();
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        let listHtml = '<ul>';
        for (const ratio in groups) { listHtml += `<li><strong>Group (Ratio ~${ratio}):</strong> ${groups[ratio].join(', ')}</li>`; }
        listHtml += '</ul>';
        overlay.innerHTML = `<div class="popup-card glass-card"><button class="popup-close-btn">&times;</button><h3>Aspect Ratio Mismatch</h3><p>The following images have different aspect ratios. Comparison tools will still work, but results may not be perfectly aligned for pixel-level analysis like Heatmap.</p>${listHtml}</div>`;
        document.body.appendChild(overlay);
        document.body.classList.add('popup-open');
        overlay.querySelector('.popup-close-btn').addEventListener('click', closePopup);
    };
    const closePopup = () => {
        const overlay = document.querySelector('.popup-overlay');
        if (overlay) { overlay.remove(); }
        document.body.classList.remove('popup-open');
    };
    
    // --- SLIDER LOGIC ---
    const resetSliders = (type) => {
        const numSliders = numImages - 1;
        if (numSliders <= 0) return;
        for (let i = 0; i < numSliders; i++) {
            const defaultLeft = (100 / numImages) * (i + 1);
            const slider = document.getElementById(`${type}-slider-${i}`);
            const wrapper = document.getElementById(`${type}-wrapper-${i + 1}`);
            if (slider) slider.style.left = `${defaultLeft}%`;
            if (wrapper) wrapper.style.clipPath = `inset(0 0 0 ${defaultLeft}%)`;
        }
    };
    const initSliders = () => {
        document.querySelectorAll('.slider-handle-dynamic').forEach(slider => {
            slider.addEventListener('mousedown', (e) => {
                activeSlider = { element: e.currentTarget, type: e.currentTarget.id.split('-')[0] };
            });
        });
    };
    document.addEventListener('mouseup', () => activeSlider = null);
    document.addEventListener('mousemove', (e) => {
        if (!activeSlider) return;
        const container = activeSlider.element.parentElement;
        const rect = container.getBoundingClientRect(); let x = e.clientX - rect.left;
        const index = parseInt(activeSlider.element.dataset.index);
        const prevSlider = document.getElementById(`${activeSlider.type}-slider-${index - 1}`); const nextSlider = document.getElementById(`${activeSlider.type}-slider-${index + 1}`);
        const minX = prevSlider ? prevSlider.offsetLeft : 0; const maxX = nextSlider ? nextSlider.offsetLeft : rect.width;
        x = Math.max(minX, Math.min(x, maxX)); const percent = (x / rect.width) * 100;
        document.getElementById(`split-slider-${index}`).style.left = `${percent}%`; document.getElementById(`magnify-slider-${index}`).style.left = `${percent}%`;
        document.getElementById(`split-wrapper-${index + 1}`).style.clipPath = `inset(0 0 0 ${percent}%)`; document.getElementById(`magnify-wrapper-${index + 1}`).style.clipPath = `inset(0 0 0 ${percent}%)`;
    });
    
    // --- MAGNIFY LOGIC ---
    const updateMagnifier = (e) => {
        if (e) lastMagnifyEvent = e;
        const eventForCalc = e || lastMagnifyEvent; const baseImage = imagesData[0];
        if (!baseImage || !eventForCalc) return;
        const sourceRect = magnifySourceContainer.getBoundingClientRect(); const previewRect = magnifyPreviewContainer.getBoundingClientRect();
        const containerW = sourceRect.width, containerH = sourceRect.height; const imageW = baseImage.naturalWidth, imageH = baseImage.naturalHeight;
        const containerRatio = containerW / containerH, imageRatio = imageW / imageH;
        let renderedW, renderedH, offsetX, offsetY;
        if (imageRatio > containerRatio) { renderedW = containerW; renderedH = containerW / imageRatio; offsetX = 0; offsetY = (containerH - renderedH) / 2; } 
        else { renderedH = containerH; renderedW = containerH * imageRatio; offsetY = 0; offsetX = (containerW - renderedW) / 2; }
        const rawX = eventForCalc.clientX - sourceRect.left, rawY = eventForCalc.clientY - sourceRect.top; const correctedX = rawX - offsetX, correctedY = rawY - offsetY;
        let fracX = Math.max(0, Math.min(1, correctedX / renderedW)), fracY = Math.max(0, Math.min(1, correctedY / renderedH));
        const loupe = document.getElementById('magnify-loupe'); loupe.style.left = `${rawX - loupe.offsetWidth / 2}px`; loupe.style.top = `${rawY - loupe.offsetHeight / 2}px`;
        const zoom = parseFloat(zoomLevelSlider.value); const bgWidth = renderedW * zoom, bgHeight = renderedH * zoom;
        const bgX = -(fracX * (bgWidth - previewRect.width)), bgY = -(fracY * (bgHeight - previewRect.height));
        for (let i = 0; i < numImages; i++) {
            if (imagesData[i]) { const wrapper = document.getElementById(`magnify-wrapper-${i}`); wrapper.style.backgroundSize = `${bgWidth}px ${bgHeight}px`; wrapper.style.backgroundPosition = `${bgX}px ${bgY}px`; }
        }
    };
    magnifySourceContainer.addEventListener('mousemove', updateMagnifier);
    magnifySourceContainer.addEventListener('mouseenter', () => document.getElementById('magnify-loupe').style.display = 'block');
    magnifySourceContainer.addEventListener('mouseleave', () => document.getElementById('magnify-loupe').style.display = 'none');
    zoomLevelSlider.addEventListener('input', () => {
        const zoom = parseFloat(zoomLevelSlider.value);
        zoomValueSpan.textContent = zoom.toFixed(1); const baseImage = imagesData[0]; if (!baseImage) return;
        const sourceRect = magnifySourceContainer.getBoundingClientRect(); const containerW = sourceRect.width, containerH = sourceRect.height;
        const imageW = baseImage.naturalWidth, imageH = baseImage.naturalHeight; const containerRatio = containerW / containerH, imageRatio = imageW / imageH; let renderedW;
        if (imageRatio > containerRatio) { renderedW = containerW; } else { renderedW = containerH * imageRatio; }
        document.getElementById('magnify-loupe').style.width = `${renderedW / zoom}px`; document.getElementById('magnify-loupe').style.height = `${renderedW / zoom}px`;
        updateMagnifier();
    });

    // --- FADE LOGIC ---
    const updateFadeSelectors = () => {
        fadeSelect1.innerHTML = ''; fadeSelect2.innerHTML = '';
        imagesData.forEach((img, i) => { if (img) { fadeSelect1.innerHTML += `<option value="${i}">Image ${i + 1}</option>`; fadeSelect2.innerHTML += `<option value="${i}">Image ${i + 1}</option>`; } });
        fadeSelect1.value = 0; fadeSelect2.value = (imagesData.filter(Boolean).length > 1) ? 1 : 0;
        updateFadeImages();
    };
    const updateFadeImages = () => {
        const sizer = document.getElementById('fade-sizer'); const layer1 = document.getElementById('fade-layer-1'); const layer2 = document.getElementById('fade-layer-2');
        const idx1 = parseInt(fadeSelect1.value); const idx2 = parseInt(fadeSelect2.value);
        if (imagesData[idx1]) { sizer.src = imagesData[idx1].src; layer1.src = imagesData[idx1].src; }
        if (imagesData[idx2]) { layer2.src = imagesData[idx2].src; }
    };
    fadeSelect1.addEventListener('change', updateFadeImages);
    fadeSelect2.addEventListener('change', updateFadeImages);
    fadeLevelSlider.addEventListener('input', (e) => document.getElementById('fade-layer-2').style.opacity = e.target.value);
    blendModeSelect.addEventListener('change', (e) => document.getElementById('fade-layer-2').style.mixBlendMode = e.target.value);

    // --- HEATMAP LOGIC ---
    const updateHeatmapSelectors = () => {
        heatmapSelect1.innerHTML = ''; heatmapSelect2.innerHTML = '';
        imagesData.forEach((img, i) => { if (img) { heatmapSelect1.innerHTML += `<option value="${i}">Image ${i + 1}</option>`; heatmapSelect2.innerHTML += `<option value="${i}">Image ${i + 1}</option>`; } });
        heatmapSelect1.value = 0; heatmapSelect2.value = (imagesData.filter(Boolean).length > 1) ? 1 : 0;
    };
    const generateHeatmap = () => {
        const idx1 = parseInt(heatmapSelect1.value); const idx2 = parseInt(heatmapSelect2.value);
        const img1Data = imagesData[idx1]; const img2Data = imagesData[idx2];
        if (!img1Data || !img2Data) { showErrorPopup("Error", "Please select two loaded images for heatmap generation."); return; }
        if (idx1 === idx2) { showErrorPopup("Error", "Please select two different images to compare."); return; }
        heatmapStatus.textContent = 'Generating heatmap... This may take a moment.';
        heatmapStatus.classList.remove('hidden');
        setTimeout(() => {
            const W = Math.max(img1Data.naturalWidth, img2Data.naturalWidth); const H = Math.max(img1Data.naturalHeight, img2Data.naturalHeight);
            const canvas1 = document.createElement('canvas'); const canvas2 = document.createElement('canvas');
            canvas1.width = canvas2.width = W; canvas1.height = canvas2.height = H;
            const ctx1 = canvas1.getContext('2d'); const ctx2 = canvas2.getContext('2d');
            ctx1.imageSmoothingEnabled = false; ctx2.imageSmoothingEnabled = false;
            ctx1.drawImage(img1Data.element, 0, 0, W, H); ctx2.drawImage(img2Data.element, 0, 0, W, H);
            const pixels1 = ctx1.getImageData(0, 0, W, H).data; const pixels2 = ctx2.getImageData(0, 0, W, H).data;
            const diffs = []; let maxDiff = 0;
            for (let i = 0; i < pixels1.length; i += 4) {
                const gray1 = pixels1[i] * 0.299 + pixels1[i + 1] * 0.587 + pixels1[i + 2] * 0.114;
                const gray2 = pixels2[i] * 0.299 + pixels2[i + 1] * 0.587 + pixels2[i + 2] * 0.114;
                const diff = Math.abs(gray1 - gray2); diffs.push(diff);
                if (diff > maxDiff) maxDiff = diff;
            }
            heatmapCanvas.width = W; heatmapCanvas.height = H;
            const heatmapCtx = heatmapCanvas.getContext('2d'); const heatmapImageData = heatmapCtx.createImageData(W, H);
            for (let i = 0; i < diffs.length; i++) {
                const normDiff = maxDiff > 0 ? diffs[i] / maxDiff : 0; const color = applyColormap(normDiff);
                heatmapImageData.data[i * 4] = color.r; heatmapImageData.data[i * 4 + 1] = color.g; heatmapImageData.data[i * 4 + 2] = color.b; heatmapImageData.data[i * 4 + 3] = 255;
            }
            heatmapCtx.putImageData(heatmapImageData, 0, 0);
            heatmapStatus.classList.add('hidden');
        }, 50);
    };
    const applyColormap = (value) => {
        const r = Math.min(255, Math.max(0, 255 * (1.5 - Math.abs(2.0 * value - 1.0) * 3.0)));
        const g = Math.min(255, Math.max(0, 255 * (1.5 - Math.abs(2.0 * value - 0.5) * 3.0)));
        const b = Math.min(255, Math.max(0, 255 * (1.5 - Math.abs(2.0 * value - 0.0) * 3.0)));
        return { r, g, b };
    };
    generateHeatmapBtn.addEventListener('click', generateHeatmap);
    
    // --- NAVIGATION LOGIC ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetView = e.target.dataset.view;
            navLinks.forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');
            views.forEach(view => view.classList.toggle('hidden', view.id !== targetView));
        });
    });
    
    // --- INITIALIZATION ---
    setupBtn.addEventListener('click', setupUI);
    directoryUploadInput.addEventListener('change', handleDirectoryUpload);
    setupUI();
});