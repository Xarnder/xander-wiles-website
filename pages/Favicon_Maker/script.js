document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const uploadInput = document.getElementById('image-upload');
    const uploadLabel = document.getElementById('upload-label');
    const imagePreview = document.getElementById('image-preview');
    const imageFilename = document.getElementById('image-filename');

    const svgControlsCard = document.getElementById('svg-controls-card');
    const rasterControls = document.getElementById('raster-controls');

    const svgPreviewWrapperLight = document.getElementById('svg-preview-wrapper-light');
    const svgPreviewWrapperDark = document.getElementById('svg-preview-wrapper-dark');
    const swapBtn = document.getElementById('swap-themes-btn');

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
    let isVectorMode = false;
    let sourceImageData = null; // For PNGs
    let sourceSvgText = null;   // For SVGs

    let lightSvgString = null;
    let darkSvgString = null;
    let downloadBlob = null;

    // --- Helper: Canvas for Color Parsing ---
    // This allows us to convert "black", "red", "rgba(0,0,0,1)" to readable standard formats
    const ctxParser = document.createElement('canvas').getContext('2d');

    // --- Event Listeners ---
    uploadInput.addEventListener('change', e => handleFile(e.target.files[0]));
    uploadLabel.addEventListener('drop', e => { preventDefaults(e); handleFile(e.dataTransfer.files[0]); });
    ['dragenter', 'dragover', 'dragleave'].forEach(eventName => uploadLabel.addEventListener(eventName, preventDefaults));
    ['dragenter', 'dragover'].forEach(() => uploadLabel.classList.add('dragover'));
    ['dragleave', 'drop'].forEach(() => uploadLabel.classList.remove('dragover'));

    bgControls.addEventListener('click', handleBgChange);
    swapBtn.addEventListener('click', handleSwapThemes);

    // Sliders only affect PNG tracing
    colorsSlider.addEventListener('input', () => handleSliderChange(colorsSlider, colorsValue));
    detailSlider.addEventListener('input', () => handleSliderChange(detailSlider, detailValue, 1));
    smoothingSlider.addEventListener('input', () => handleSliderChange(smoothingSlider, smoothingValue));

    generateBtn.addEventListener('click', handleFinalGeneration);
    resultsContent.addEventListener('click', handleResultsClick);

    // --- Main Functions ---
    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

    async function handleFile(file) {
        if (!file) return;

        // Reset state
        sourceFile = file;
        uploadLabel.classList.add('uploaded');
        document.getElementById('upload-prompt').classList.add('hidden');
        document.getElementById('image-preview-container').classList.remove('hidden');
        imageFilename.textContent = file.name;

        // Detect Type
        isVectorMode = file.type.includes('svg');

        const reader = new FileReader();
        reader.onload = async (e) => {
            imagePreview.src = e.target.result;

            if (isVectorMode) {
                // Handle SVG Input
                rasterControls.classList.add('hidden'); // Hide tracing sliders

                // Read content as text for manipulation
                const textReader = new FileReader();
                textReader.onload = async (textEvent) => {
                    sourceSvgText = textEvent.target.result;
                    svgControlsCard.classList.remove('hidden');
                    generateBtn.disabled = false;
                    await updateSvgPreviews();
                };
                textReader.readAsText(file);

            } else {
                // Handle PNG Input
                if (file.type !== 'image/png') { alert('Please upload a PNG or SVG.'); return; }
                rasterControls.classList.remove('hidden'); // Show tracing sliders
                try {
                    sourceImageData = await getImageDataFromSrc(imagePreview.src);
                    svgControlsCard.classList.remove('hidden');
                    generateBtn.disabled = false;
                    await updateSvgPreviews();
                } catch (error) { console.error(error); alert("Could not process image."); }
            }
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

    function handleSwapThemes() {
        if (!lightSvgString || !darkSvgString) return;
        // Swap strings
        const temp = lightSvgString;
        lightSvgString = darkSvgString;
        darkSvgString = temp;
        // Update DOM
        renderPreviewsInDOM();
    }

    const debouncedUpdate = debounce(() => updateSvgPreviews(), 250);
    function handleSliderChange(slider, valueSpan, fixed = 0) {
        valueSpan.textContent = parseFloat(slider.value).toFixed(fixed);
        debouncedUpdate();
    }

    async function updateSvgPreviews() {
        svgPreviewWrapperLight.innerHTML = '<span>Processing...</span>';
        svgPreviewWrapperDark.innerHTML = '<span>Processing...</span>';

        try {
            if (isVectorMode) {
                // --- VECTOR PATH: Clean & Recoloring ---
                lightSvgString = cleanSvg(sourceSvgText);
                darkSvgString = generateDarkSvg(lightSvgString);
            } else {
                // --- RASTER PATH: Tracing ---
                const settings = { colors: parseInt(colorsSlider.value), detail: parseFloat(detailSlider.value), smoothing: parseInt(smoothingSlider.value) };
                const lightPalette = await getSmartPalette(imagePreview.src, settings.colors);

                // 1. Trace PNG to create Light SVG
                lightSvgString = traceImageDataToSvg(sourceImageData, lightPalette, settings);
                // 2. Invert Traced SVG to create Dark SVG
                darkSvgString = generateDarkSvg(lightSvgString);
            }

            renderPreviewsInDOM();

        } catch (error) {
            console.error("SVG Processing failed:", error);
            svgPreviewWrapperLight.innerHTML = '<span style="color:red;">Error</span>';
        }
    }

    function renderPreviewsInDOM() {
        if (lightSvgString) svgPreviewWrapperLight.innerHTML = lightSvgString;
        if (darkSvgString) svgPreviewWrapperDark.innerHTML = darkSvgString;
    }

    // --- Core Logic: Cleaning & Coloring ---

    function cleanSvg(svgStr) {
        // Ensure SVG has viewBox and remove strict width/height
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgStr, "image/svg+xml");
        const svgEl = doc.querySelector('svg');
        if (!svgEl) return svgStr;

        if (!svgEl.hasAttribute('viewBox') && svgEl.hasAttribute('width') && svgEl.hasAttribute('height')) {
            const w = parseFloat(svgEl.getAttribute('width'));
            const h = parseFloat(svgEl.getAttribute('height'));
            svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
        }
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');
        return new XMLSerializer().serializeToString(doc);
    }

    function generateDarkSvg(inputSvgStr) {
        if (!inputSvgStr) return null;

        const parser = new DOMParser();
        const doc = parser.parseFromString(inputSvgStr, "image/svg+xml");

        // Helper to process color
        const processColor = (colorStr) => {
            if (!colorStr || colorStr === 'none' || colorStr === 'transparent') return colorStr;
            const rgba = parseColorToRgb(colorStr);
            if (!rgba) return colorStr; // return original if parse fails
            return createDarkModeColor(rgba.r, rgba.g, rgba.b, rgba.a);
        };

        // Select shapes
        const elements = doc.querySelectorAll('path, circle, rect, polygon, polyline, ellipse, line, text, g');

        elements.forEach(el => {
            const fill = el.getAttribute('fill');
            const stroke = el.getAttribute('stroke');
            const style = el.getAttribute('style');

            // 1. Handle Explicit Fills
            if (fill && fill !== 'none') {
                el.setAttribute('fill', processColor(fill));
            }
            // 2. Handle Implicit Black Fills (No fill attribute = Black)
            else if (!fill && !style?.includes('fill') && el.tagName !== 'g') {
                // If it has no fill, SVG defaults to black.
                // We must force it to white for Dark Mode, UNLESS it's a stroked line.
                // If it has no stroke, or stroke is none, it's likely a filled shape.
                const hasStroke = stroke && stroke !== 'none';
                if (!hasStroke) {
                    el.setAttribute('fill', '#ffffff'); // Force white invert
                }
            }

            // 3. Handle Strokes
            if (stroke && stroke !== 'none') el.setAttribute('stroke', processColor(stroke));

            // 4. Handle Inline Styles
            if (style) {
                let newStyle = style.replace(/fill:\s*([^;"]+)/g, (m, c) => `fill:${processColor(c)}`);
                newStyle = newStyle.replace(/stroke:\s*([^;"]+)/g, (m, c) => `stroke:${processColor(c)}`);
                el.setAttribute('style', newStyle);
            }
        });

        return new XMLSerializer().serializeToString(doc);
    }

    // --- Color Math Helpers ---
    function parseColorToRgb(str) {
        str = str.trim();
        // Use browser's internal parser via Canvas
        ctxParser.fillStyle = str;
        let computed = ctxParser.fillStyle; // returns #rrggbb or rgba()

        let r = 0, g = 0, b = 0, a = 1;

        // Handle Hex #rrggbb
        if (computed.startsWith('#')) {
            const bigint = parseInt(computed.slice(1), 16);
            r = (bigint >> 16) & 255;
            g = (bigint >> 8) & 255;
            b = bigint & 255;
        }
        // Handle rgba() / rgb()
        else if (computed.startsWith('rgb')) {
            const parts = computed.match(/[\d.]+/g);
            if (parts && parts.length >= 3) {
                r = parseFloat(parts[0]);
                g = parseFloat(parts[1]);
                b = parseFloat(parts[2]);
                if (parts.length >= 4) {
                    a = parseFloat(parts[3]);
                }
            }
        }
        return { r, g, b, a };
    }

    function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b); let h, s, l = (max + min) / 2; if (max === min) { h = s = 0; } else { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min); switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; } h /= 6; } return { h, s, l }; }
    function hslToRgb(h, s, l) { let r, g, b; if (s === 0) { r = g = b = l; } else { const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3); } return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }; }

    function isSkinTone({ h, s, l }) {
        const hue = h * 360;
        // Expanded range for oranges/browns (0-50 covers reds to yellow-oranges)
        // Ensure saturation is high enough to not be grey, but not necessarily neon
        return (hue >= 0 && hue <= 50) && (s >= 0.15 && s <= 1.0) && (l >= 0.15 && l <= 0.95);
    }
    function isGrayscale({ s }) { return s < 0.10; }

    function createDarkModeColor(r, g, b, a = 1) {
        // If fully transparent, remain fully transparent
        if (a === 0) return `rgba(0,0,0,0)`;

        const hsl = rgbToHsl(r, g, b);

        // 1. Preserve Skin Tones & Warm Colors (don't invert brown/orange to blue)
        if (isSkinTone(hsl)) {
            return `rgba(${r},${g},${b},${a})`;
        }

        // 2. Invert Grayscale (Black text -> White text)
        if (isGrayscale(hsl)) {
            const invertedL = 1.0 - hsl.l;
            const { r: newR, g: newG, b: newB } = hslToRgb(hsl.h, hsl.s, invertedL);
            return `rgba(${newR},${newG},${newB},${a})`;
        }

        // 3. Brighten other colors for Dark Backgrounds
        // (Slightly increase lightness to ensure visibility against dark bg)
        const newL = Math.max(0.70, hsl.l + 0.15);
        const { r: newR, g: newG, b: newB } = hslToRgb(hsl.h, hsl.s, Math.min(newL, 0.95));
        return `rgba(${newR},${newG},${newB},${a})`;
    }

    async function getSmartPalette(imgSrc, targetColorCount) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                // 1. Check for transparency first manually
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const data = ctx.getImageData(0, 0, img.width, img.height).data;

                let hasTransparency = false;
                for (let i = 3; i < data.length; i += 4) {
                    if (data[i] < 250) { // Tolerance for semi-transparent
                        hasTransparency = true;
                        break;
                    }
                }

                const colorThief = new ColorThief();
                // ColorThief might fail on mostly transparent images, so wrap in try/catch or fallback
                let largePalette = [];
                try {
                    largePalette = colorThief.getPalette(img, 32);
                } catch (e) {
                    // If ColorThief fails (e.g. single color image), fallback to center pixel
                    largePalette = [[data[0], data[1], data[2]]];
                }

                if (!largePalette) largePalette = [];

                const uniqueColors = [];
                // If transparent, ensure we have a transparent color in palette
                if (hasTransparency) {
                    uniqueColors.push({ r: 0, g: 0, b: 0, a: 0 });
                }

                const similarityThreshold = 30;
                for (const color of largePalette) {
                    const rgb = { r: color[0], g: color[1], b: color[2], a: 255 };
                    let isUnique = true;
                    for (const uniqueColor of uniqueColors) {
                        if (colorDifference(rgb, uniqueColor) < similarityThreshold) {
                            isUnique = false;
                            break;
                        }
                    }
                    if (isUnique) uniqueColors.push(rgb);
                }

                // Sort by "interest" (saturation/lightness)
                // Filter out the transparent one from sort so it stays first? Or just sort everything.
                // ImageTracer expects palette to include the colors to map to.

                // We actually want to KEEP transparent at index 0 if possible for consistency, 
                // but ImageTracer just tries to match closest RGBA.

                const finalPalette = uniqueColors.slice(0, targetColorCount + (hasTransparency ? 1 : 0));

                // Ensure all have 4 components for ImageTracer
                // (Existing logic: map c => ... a:255 was bad)
                resolve(finalPalette);
            };
            img.onerror = reject;
            img.src = imgSrc;
        });
    }
    function colorDifference(c1, c2) {
        // Simple Euclidean distance including Alpha
        const rAvg = (c1.r + c2.r) / 2;
        const rDiff = c1.r - c2.r;
        const gDiff = c1.g - c2.g;
        const bDiff = c1.b - c2.b;
        const aDiff = (c1.a - c2.a);
        // Weight alpha heavily so transparent != black
        return Math.sqrt(2 * rDiff * rDiff + 4 * gDiff * gDiff + 3 * bDiff * bDiff + aDiff * aDiff * 10);
    }

    // --- Final Generation & Output ---
    async function handleFinalGeneration() {
        if (!sourceFile) return;
        generateBtn.disabled = true; generateBtn.textContent = 'Generating...'; resultsCard.classList.remove('hidden'); updateStatus('Processing icons...');
        try {
            const iconSizes = [16, 32, 180, 192, 512];
            const imageBlobs = {};

            // If we are in Vector Mode, we need to rasterize the SVG to PNGs first
            let pngSourceBlob = sourceFile;

            if (isVectorMode) {
                updateStatus('Rasterizing SVG...');
                // We use the Light SVG (Original) for the PNG fallbacks
                pngSourceBlob = await svgToPngBlob(lightSvgString, 1024);
            }

            for (const size of iconSizes) {
                const options = { maxSizeMB: 1, maxWidthOrHeight: size, useWebWorker: true };
                const compressedFile = await imageCompression(pngSourceBlob, options);
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

            // Add the SVGs currently displayed in preview
            if (lightSvgString) zip.file('favicon-light.svg', lightSvgString);
            if (darkSvgString) zip.file('favicon-dark.svg', darkSvgString);

            downloadBlob = await zip.generateAsync({ type: 'blob' });

            updateStatus('Generating HTML code...');
            generateResultsCode(!!lightSvgString);
            updateStatus('Done! Your files are ready.');

        } catch (error) {
            console.error("Final generation failed:", error); updateStatus(`Error: ${error.message}`);
        } finally { generateBtn.disabled = false; generateBtn.textContent = 'Generate All Files'; }
    }

    function generateResultsCode(hasCustomSvg) {
        const pngCode = `&lt;!-- Fallback PNG icons --&gt;
&lt;link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png"&gt;
&lt;link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png"&gt;
&lt;link rel="icon" type="image/png" sizes="16x16" href="favicon-16x16.png"&gt;`;

        const svgCode = hasCustomSvg ? `&lt;!-- Theme-aware SVG icons (modern browsers) --&gt;
&lt;link rel="icon" href="favicon.ico" sizes="any"&gt; &lt;!-- Fallback for older browsers --&gt;
&lt;link rel="icon" href="favicon-light.svg" type="image/svg+xml" media="(prefers-color-scheme: light)"&gt;
&lt;link rel="icon" href="favicon-dark.svg" type="image/svg+xml" media="(prefers-color-scheme: dark)"&gt;` : '&lt;link rel="icon" href="favicon.ico" sizes="any"&gt;';

        const manifestCode = `&lt;!-- Other essential links --&gt;
&lt;link rel="manifest" href="site.webmanifest"&gt;
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
    function debounce(func, delay) { let timeout; return function (...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
    function getImageDataFromSrc(imgSrc) { return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = "Anonymous"; img.onload = () => { const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0); resolve(ctx.getImageData(0, 0, img.width, img.height)); }; img.onerror = reject; img.src = imgSrc; }); }
    function traceImageDataToSvg(imageData, palette, settings) { const options = { pal: palette, numberofcolors: palette.length, ltres: settings.detail, qtres: settings.detail, roundcoords: settings.smoothing }; let svgString = ImageTracer.imagedataToSVG(imageData, options); const viewBox = `viewBox="0 0 ${imageData.width} ${imageData.height}"`; return svgString.replace('<svg ', `<svg ${viewBox} `); }
    function convertToSquare(blob, size) { return new Promise((resolve, reject) => { const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d'); const img = new Image(); img.onload = () => { const scale = Math.min(size / img.width, size / img.height); const newWidth = img.width * scale; const newHeight = img.height * scale; const x = (size - newWidth) / 2; const y = (size - newHeight) / 2; ctx.drawImage(img, x, y, newWidth, newHeight); canvas.toBlob(resolve, 'image/png'); }; img.onerror = reject; img.src = URL.createObjectURL(blob); }); }
    function updateStatus(message) { generateStatus.textContent = message; }

    // New: Rasterize SVG to a PNG blob
    function svgToPngBlob(svgStr, size) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const img = new Image();
            // Encode SVG to Base64 to load into Image
            const svg64 = btoa(unescape(encodeURIComponent(svgStr)));
            const b64Start = 'data:image/svg+xml;base64,';
            img.onload = () => {
                ctx.drawImage(img, 0, 0, size, size);
                canvas.toBlob(resolve, 'image/png');
            };
            img.onerror = reject;
            img.src = b64Start + svg64;
        });
    }
});