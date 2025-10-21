document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const uploadInput = document.getElementById('image-upload');
    const uploadLabel = document.getElementById('upload-label');
    const imagePreview = document.getElementById('image-preview');
    const svgControlsCard = document.getElementById('svg-controls-card');
    const svgPreviewWrapperLight = document.getElementById('svg-preview-wrapper-light');
    const svgPreviewWrapperDark = document.getElementById('svg-preview-wrapper-dark');
    const bgControls = document.getElementById('bg-controls');
    const colorsSlider = document.getElementById('colors-slider');
    const colorsValue = document.getElementById('colors-value');
    const detailSlider = document.getElementById('detail-slider');
    const detailValue = document.getElementById('detail-value');
    const smoothingSlider = document.getElementById('smoothing-slider');
    const smoothingValue = document.getElementById('smoothing-value');
    const generateBtn = document.getElementById('generate-btn');
    const resultsCard = document.getElementById('results-card');
    const resultsContent = document.getElementById('results-content');
    const generateStatus = document.getElementById('generate-status');

    // --- State Variables ---
    let sourceFile = null;
    let sourceImageData = null;
    let lightSvgString = null;
    let darkSvgString = null;
    let downloadBlob = null;

    // --- Event Listeners ---
    uploadInput.addEventListener('change', e => handleFile(e.target.files[0]));
    uploadLabel.addEventListener('drop', e => { preventDefaults(e); handleFile(e.dataTransfer.files[0]); });
    ['dragenter', 'dragover', 'dragleave'].forEach(eventName => uploadLabel.addEventListener(eventName, preventDefaults));
    ['dragenter', 'dragover'].forEach(() => uploadLabel.classList.add('dragover'));
    ['dragleave', 'drop'].forEach(() => uploadLabel.classList.remove('dragover'));
    bgControls.addEventListener('click', handleBgChange);
    colorsSlider.addEventListener('input', () => handleSliderChange(colorsSlider, colorsValue));
    detailSlider.addEventListener('input', () => handleSliderChange(detailSlider, detailValue, 1));
    smoothingSlider.addEventListener('input', () => handleSliderChange(smoothingSlider, smoothingValue));
    generateBtn.addEventListener('click', handleFinalGeneration);
    resultsContent.addEventListener('click', handleResultsClick);

    // --- Main Functions ---
    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

    async function handleFile(file) {
        if (!file || file.type !== 'image/png') { alert('Please upload a valid PNG file.'); return; }
        sourceFile = file;
        const reader = new FileReader();
        reader.onload = async (e) => {
            imagePreview.src = e.target.result;
            document.getElementById('upload-prompt').classList.add('hidden');
            document.getElementById('image-preview-container').classList.remove('hidden');
            uploadLabel.classList.add('uploaded');
            try {
                sourceImageData = await getImageDataFromSrc(imagePreview.src);
                svgControlsCard.classList.remove('hidden');
                generateBtn.disabled = false;
                await updateSvgPreviews();
            } catch (error) { console.error("Failed to process image:", error); alert("Could not process the image."); }
        };
        reader.readAsDataURL(file);
    }
    
    function handleBgChange(e) {
        const swatch = e.target.closest('.color-swatch');
        if (!swatch) return;
        const color = swatch.dataset.color;
        document.querySelectorAll('.svg-preview-wrapper').forEach(wrapper => {
            wrapper.style.backgroundImage = 'none';
            wrapper.dataset.bg = color;
            wrapper.style.backgroundColor = (color === 'transparent') ? 'transparent' : color;
        });
        bgControls.querySelector('.active').classList.remove('active');
        swatch.classList.add('active');
    }

    const debouncedUpdate = debounce(() => updateSvgPreviews(), 250);
    function handleSliderChange(slider, valueSpan, fixed = 0) { valueSpan.textContent = parseFloat(slider.value).toFixed(fixed); debouncedUpdate(); }
    
    async function updateSvgPreviews() {
        if (!sourceImageData) return;
        svgPreviewWrapperLight.innerHTML = '<span>Updating...</span>';
        svgPreviewWrapperDark.innerHTML = '<span>Updating...</span>';
        const settings = { colors: parseInt(colorsSlider.value), detail: parseFloat(detailSlider.value), smoothing: parseInt(smoothingSlider.value) };
        try {
            const lightPalette = await getSmartPalette(imagePreview.src, settings.colors);
            lightSvgString = traceImageDataToSvg(sourceImageData, lightPalette, settings);
            darkSvgString = generateDarkSvgFromLight(lightSvgString);
            if (lightSvgString) svgPreviewWrapperLight.innerHTML = lightSvgString;
            if (darkSvgString) svgPreviewWrapperDark.innerHTML = darkSvgString;
        } catch(error) {
            console.error("SVG Tracing failed:", error);
            svgPreviewWrapperLight.innerHTML = '<span style="color:red;">Error</span>';
            svgPreviewWrapperDark.innerHTML = '<span style="color:red;">Error</span>';
        }
    }

    // --- Color Science & Smart Inversion ---
    function colorDifference(rgb1, rgb2) { const rDiff = rgb1.r - rgb2.r, gDiff = rgb1.g - rgb2.g, bDiff = rgb1.b - rgb2.b; return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff); }
    function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b); let h, s, l = (max + min) / 2; if (max === min) { h = s = 0; } else { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min); switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; } h /= 6; } return { h, s, l }; }
    function hslToRgb(h, s, l) { let r, g, b; if (s === 0) { r = g = b = l; } else { const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3); } return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }; }
    
    // ==========================================================
    // --- THIS IS THE MODIFIED FUNCTION ---
    // ==========================================================
    function isSkinTone({ h, s, l }) {
        const hue = h * 360;
        // WIDER Hue range (reds through orange-yellows)
        // WIDER Saturation range (allows for paler tones)
        // WIDER Lightness range (allows for highlights and darker tones)
        return (hue >= 0 && hue <= 50) && (s >= 0.15 && s <= 0.95) && (l >= 0.2 && l <= 0.95);
    }
    
    function isGrayscale({ s }) { return s < 0.10; }

    function createDarkModeColor(r, g, b) {
        const hsl = rgbToHsl(r, g, b);
        if (isSkinTone(hsl)) { return `rgb(${r},${g},${b})`; }
        if (isGrayscale(hsl)) { const invertedL = 1.0 - hsl.l; const { r: newR, g: newG, b: newB } = hslToRgb(hsl.h, hsl.s, invertedL); return `rgb(${newR},${newG},${newB})`; }
        const newL = Math.max(0.75, hsl.l + 0.2);
        const { r: newR, g: newG, b: newB } = hslToRgb(hsl.h, hsl.s, Math.min(newL, 0.95));
        return `rgb(${newR},${newG},${newB})`;
    }
    
    function generateDarkSvgFromLight(lightSvgString) {
        if (!lightSvgString) return null;
        const colorRegex = /fill="rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)"/g;
        return lightSvgString.replace(colorRegex, (match, r, g, b) => {
            const newColor = createDarkModeColor(parseInt(r), parseInt(g), parseInt(b));
            return `fill="${newColor}"`;
        });
    }

    async function getSmartPalette(imgSrc, targetColorCount) { return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = "Anonymous"; img.onload = () => { const colorThief = new ColorThief(); const largePalette = colorThief.getPalette(img, 32); const uniqueColors = []; const similarityThreshold = 30; for (const color of largePalette) { const rgb = { r: color[0], g: color[1], b: color[2] }; let isUnique = true; for (const uniqueColor of uniqueColors) { if (colorDifference(rgb, uniqueColor) < similarityThreshold) { isUnique = false; break; } } if (isUnique) uniqueColors.push(rgb); } uniqueColors.sort((a, b) => { const aHsl = rgbToHsl(a.r, a.g, a.b); const bHsl = rgbToHsl(b.r, b.g, b.b); const aScore = aHsl.s + (aHsl.l > 0.05 && aHsl.l < 0.95 ? 0.1 : 0); const bScore = bHsl.s + (bHsl.l > 0.05 && bHsl.l < 0.95 ? 0.1 : 0); return bScore - aScore; }); const finalPalette = uniqueColors.slice(0, targetColorCount).map(c => ({ r: c.r, g: c.g, b: c.b, a: 255 })); resolve(finalPalette); }; img.onerror = reject; img.src = imgSrc; }); }

    // --- Final Generation & Output ---
    async function handleFinalGeneration() {
        if (!sourceFile) return;
        generateBtn.disabled = true; generateBtn.textContent = 'Generating...'; resultsCard.classList.remove('hidden'); updateStatus('Processing PNG icons...');
        try {
            const iconSizes = [16, 32, 180, 192, 512];
            const imageBlobs = {};
            for (const size of iconSizes) {
                const options = { maxSizeMB: 1, maxWidthOrHeight: size, useWebWorker: true };
                const compressedFile = await imageCompression(sourceFile, options);
                imageBlobs[size] = await convertToSquare(compressedFile, size);
            }
            updateStatus('Creating ZIP file...');
            const zip = new JSZip();
            zip.file('apple-touch-icon.png', imageBlobs[180]);
            zip.file('favicon-16x16.png', imageBlobs[16]);
            zip.file('favicon-32x32.png', imageBlobs[32]);
            zip.file('android-chrome-192x192.png', imageBlobs[192]);
            zip.file('android-chrome-512x512.png', imageBlobs[512]);
            zip.file('favicon.ico', imageBlobs[32]);
            if (lightSvgString) zip.file('favicon-light.svg', lightSvgString);
            if (darkSvgString) zip.file('favicon-dark.svg', darkSvgString);
            downloadBlob = await zip.generateAsync({ type: 'blob' });
            updateStatus('Generating HTML code...');
            generateResultsCode(!!lightSvgString);
            updateStatus('Done! Your files are ready.');
        } catch (error) { console.error("Final generation failed:", error); updateStatus(`Error: ${error.message}`);
        } finally { generateBtn.disabled = false; generateBtn.textContent = 'Generate All Files'; }
    }

    function generateResultsCode(hasCustomSvg) {
        const pngCode = `&lt;!-- Fallback PNG icons --&gt;
&lt;link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"&gt;
&lt;link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"&gt;
&lt;link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"&gt;`;

        const svgCode = hasCustomSvg ? `&lt;!-- Theme-aware SVG icons (modern browsers) --&gt;
&lt;link rel="icon" href="/favicon.ico" sizes="any"&gt; &lt;!-- Fallback for older browsers --&gt;
&lt;link rel="icon" href="/favicon-light.svg" type="image/svg+xml" media="(prefers-color-scheme: light)"&gt;
&lt;link rel="icon" href="/favicon-dark.svg" type="image/svg+xml" media="(prefers-color-scheme: dark)"&gt;` : '&lt;link rel="icon" href="/favicon.ico" sizes="any"&gt;';

        const manifestCode = `&lt;!-- Other essential links --&gt;
&lt;link rel="manifest" href="/site.webmanifest"&gt;
&lt;meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"&gt;
&lt;meta name="theme-color" content="#111115" media="(prefers-color-scheme: dark)"&gt;`;

        resultsContent.innerHTML = `
            <div class="result-box">
                <h3>HTML Code for &lt;head&gt;</h3>
                <div class="code-block-wrapper">
                    <button class="copy-btn" title="Copy to clipboard" data-target="code-block-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zM-1 1.5A1.5 1.5 0 0 1 .5 0h3A1.5 1.5 0 0 1 5 1.5v1A1.5 1.5 0 0 1 3.5 4h-3A1.5 1.5 0 0 1-1 2.5v-1z"/></svg>
                    </button>
                    <pre><code id="code-block-1">${svgCode}\n\n${pngCode}\n\n${manifestCode}</code></pre>
                </div>
            </div>
            <div class="result-box">
                <h3>Download Icons</h3>
                <button id="download-zip-btn" class="download-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
                    Download .zip
                </button>
            </div>
        `;
    }

    function handleResultsClick(e) {
        const downloadBtn = e.target.closest('#download-zip-btn');
        if (downloadBtn && downloadBlob) {
            const a = document.createElement('a'); a.href = URL.createObjectURL(downloadBlob); a.download = 'favicons.zip';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            const codeEl = document.getElementById(copyBtn.dataset.target);
            navigator.clipboard.writeText(codeEl.innerText).then(() => {
                copyBtn.innerHTML = 'Copied!';
                setTimeout(() => { copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zM-1 1.5A1.5 1.5 0 0 1 .5 0h3A1.5 1.5 0 0 1 5 1.5v1A1.5 1.5 0 0 1 3.5 4h-3A1.5 1.5 0 0 1-1 2.5v-1z"/></svg>`; }, 2000);
            });
        }
    }

    // --- Utility Functions ---
    function debounce(func, delay) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
    function getImageDataFromSrc(imgSrc) { return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = "Anonymous"; img.onload = () => { const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0); resolve(ctx.getImageData(0, 0, img.width, img.height)); }; img.onerror = reject; img.src = imgSrc; }); }
    function traceImageDataToSvg(imageData, palette, settings) { const options = { pal: palette, numberofcolors: palette.length, ltres: settings.detail, qtres: settings.detail, roundcoords: settings.smoothing }; let svgString = ImageTracer.imagedataToSVG(imageData, options); const viewBox = `viewBox="0 0 ${imageData.width} ${imageData.height}"`; return svgString.replace('<svg ', `<svg ${viewBox} `); }
    function convertToSquare(blob, size) { return new Promise((resolve, reject) => { const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d'); const img = new Image(); img.onload = () => { const scale = Math.min(size / img.width, size / img.height); const newWidth = img.width * scale; const newHeight = img.height * scale; const x = (size - newWidth) / 2; const y = (size - newHeight) / 2; ctx.drawImage(img, x, y, newWidth, newHeight); canvas.toBlob(resolve, 'image/png'); }; img.onerror = reject; img.src = URL.createObjectURL(blob); }); }
    function updateStatus(message) { generateStatus.textContent = message; }
});