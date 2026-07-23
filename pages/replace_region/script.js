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
        // Settings - Mask Tool (Overlay)
        hue: 0,
        saturation: 100,
        lightness: 100,
        blackLevel: 0,
        highlightLevel: 100,
        curvePoints: [
            { x: 0, y: 0 },
            { x: 1, y: 1 }
        ],

        // Settings - Mask Tool (Base)
        baseHue: 0,
        baseSaturation: 100,
        baseLightness: 100,
        baseBlackLevel: 0,
        baseHighlightLevel: 100,
        baseCurvePoints: [
            { x: 0, y: 0 },
            { x: 1, y: 1 }
        ],

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
        isTouchMode: false,

        // Batch Export State
        batchBaseFiles: [],
        batchOverlayFiles: [],

        // Working resolution (interactive canvases are capped for large images)
        workScale: 1,
        workWidth: 0,
        workHeight: 0,
        cropDisplayScale: 1,
        paintWorkScale: 1,

        // Pending base-scale plan when uploaded crop resolution differs
        scalePlan: null,

        // Reused offscreen buffers (avoid allocating full canvases every redraw)
        _revealedEditCanvas: null,
        _overlayCanvas: null,
        _constraintCanvas: null,
        _combinedMaskCanvas: null,

        // Cached 256-entry tone LUTs (black/highlight + curve) — avoid SVG canvas filters
        _overlayToneLut: null,
        _baseToneLut: null
    };

    // Keep interactive layers deliberately small: Step 4 uses several canvases.
    // Export uses one full-size destination plus a small reusable tile.
    const MAX_WORK_DIM = 2048;
    const MAX_EXPORT_DIM = 16384;
    const MAX_CANVAS_AREA = 4_194_304; // ~2048²
    const MAX_EXPORT_AREA = 268_435_456; // Chrome's common 2D canvas area limit
    const EXPORT_TILE_SIZE = 1024;
    const MAX_PREVIEW_DIM = 1200;
    const MAX_MASK_THUMB_DIM = 320;

    // High-res management thresholds (below hard canvas limits)
    const SAFE_MANAGE_DIM = 8192;
    const SAFE_MANAGE_AREA = 67_108_864; // ~8192²
    const HIGH_RES_MP = 16;
    const VERY_HIGH_RES_MP = 36;
    const EXTREME_RES_MP = 64;
    const UPSCALE_CAUTION_FACTOR = 2;
    const UPSCALE_WARNING_FACTOR = 4;

    function getSafeScale(width, height, maxDim = MAX_WORK_DIM, maxArea = MAX_CANVAS_AREA) {
        if (!width || !height) return 1;
        let scale = 1;
        const maxSide = Math.max(width, height);
        if (maxSide > maxDim) scale = maxDim / maxSide;
        const area = width * height * scale * scale;
        if (area > maxArea) {
            scale *= Math.sqrt(maxArea / area);
        }
        return Math.min(1, scale);
    }

    function getExportScale(width, height) {
        return getSafeScale(width, height, MAX_EXPORT_DIM, MAX_EXPORT_AREA);
    }

    function canExportAtFullResolution(width, height) {
        return getExportScale(width, height) === 1;
    }

    function createSafeCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));
        return canvas;
    }

    function ensureCanvasSize(canvas, width, height) {
        const w = Math.max(1, Math.round(width));
        const h = Math.max(1, Math.round(height));
        if (!canvas || canvas.width !== w || canvas.height !== h) {
            const c = canvas || document.createElement('canvas');
            c.width = w;
            c.height = h;
            return c;
        }
        return canvas;
    }

    function loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };
            img.src = url;
        });
    }

    /** Draw img into a canvas sized to targetW×targetH, capped to safe limits. */
    function rasterizeToSafeCanvas(img, targetW, targetH) {
        const scale = getSafeScale(targetW, targetH);
        const canvas = createSafeCanvas(targetW * scale, targetH * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    function formatRes(w, h) {
        return `${Math.round(w)} × ${Math.round(h)}`;
    }

    function formatScale(n) {
        const rounded = Math.round(n * 1000) / 1000;
        return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/\.?0+$/, '');
    }

    function megapixels(w, h) {
        return (w * h) / 1_000_000;
    }

    function formatMP(w, h) {
        const mp = megapixels(w, h);
        return mp >= 10 ? `${mp.toFixed(1)} MP` : `${mp.toFixed(2)} MP`;
    }

    /** Rough RGBA canvas RAM estimate. */
    function formatApproxRAM(w, h, layers = 1) {
        const bytes = w * h * 4 * layers;
        if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
        if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
        return `${(bytes / 1e3).toFixed(0)} KB`;
    }

    function getSafeManageScale(width, height) {
        return getSafeScale(width, height, SAFE_MANAGE_DIM, SAFE_MANAGE_AREA);
    }

    function canManageSafely(width, height) {
        return getSafeManageScale(width, height) === 1;
    }

    function describeImageRisk(width, height, { label = 'Image' } = {}) {
        const warnings = [];
        const mp = megapixels(width, height);
        const exportScale = getExportScale(width, height);
        const manageScale = getSafeManageScale(width, height);

        if (exportScale < 1) {
            const cappedW = Math.max(1, Math.round(width * exportScale));
            const cappedH = Math.max(1, Math.round(height * exportScale));
            warnings.push({
                level: 'danger',
                title: 'Exceeds browser canvas limit',
                body: `${label} at ${formatRes(width, height)} (${formatMP(width, height)}) cannot be held at full size in this browser. Max workable size is about ${formatRes(cappedW, cappedH)}.`
            });
        } else if (manageScale < 1 || mp >= EXTREME_RES_MP) {
            warnings.push({
                level: 'danger',
                title: 'Extreme resolution',
                body: `${label} is ${formatRes(width, height)} (${formatMP(width, height)}). Expect slow masking, high memory use (~${formatApproxRAM(width, height, 3)} for working layers), and possible tab crashes.`
            });
        } else if (mp >= VERY_HIGH_RES_MP) {
            warnings.push({
                level: 'warning',
                title: 'Very high resolution',
                body: `${label} is ${formatMP(width, height)}. Interactive editing will use a downscaled preview; full-res export may be slow or memory-heavy (~${formatApproxRAM(width, height)} per full canvas).`
            });
        } else if (mp >= HIGH_RES_MP) {
            warnings.push({
                level: 'caution',
                title: 'High resolution',
                body: `${label} is ${formatMP(width, height)}. The editor will work on a capped preview and export at full resolution when possible.`
            });
        }

        return warnings;
    }

    function assessScalePlanRisks(plan) {
        const warnings = [];
        const maxFactor = Math.max(plan.scaleX, plan.scaleY);
        const targetW = plan.newBaseW;
        const targetH = plan.newBaseH;
        const appliedW = plan.appliedBaseW;
        const appliedH = plan.appliedBaseH;
        const targetMP = megapixels(targetW, targetH);

        if (plan.direction === 'upscale' || plan.direction === 'rescale') {
            if (maxFactor >= UPSCALE_WARNING_FACTOR) {
                warnings.push({
                    level: 'danger',
                    title: `Large upscale (${formatScale(maxFactor)}×)`,
                    body: 'Bicubic upscaling cannot invent real detail. Results will look soft/blurry, especially past ~4×. Prefer upscaling the crop with a dedicated AI/upscaler tool before uploading when possible.'
                });
            } else if (maxFactor >= UPSCALE_CAUTION_FACTOR) {
                warnings.push({
                    level: 'warning',
                    title: `Upscale quality notice (${formatScale(maxFactor)}×)`,
                    body: 'Upscaling the base to match the crop invents pixels by interpolation. Fine for layout/alignment, but expect some softness versus a native high-res original.'
                });
            } else if (maxFactor > 1.001) {
                warnings.push({
                    level: 'caution',
                    title: `Mild upscale (${formatScale(maxFactor)}×)`,
                    body: 'Small upscales are usually fine. Bicubic keeps edges smoother than nearest-neighbor.'
                });
            }
        }

        if (plan.clamped) {
            warnings.push({
                level: 'danger',
                title: 'Target exceeds browser canvas limit',
                body: `Ideal size ${formatRes(targetW, targetH)} (${formatMP(targetW, targetH)}) is above this browser’s limit. It will be clamped to ${formatRes(appliedW, appliedH)}. The crop and base may no longer match the uploaded crop 1:1.`
            });
        } else {
            warnings.push(...describeImageRisk(appliedW, appliedH, { label: 'Scaled base' }));
        }

        if (!plan.clamped && !canManageSafely(targetW, targetH) && canExportAtFullResolution(targetW, targetH)) {
            warnings.push({
                level: 'warning',
                title: 'Recommended: use a safer working size',
                body: `You can still apply the full ${formatRes(targetW, targetH)} scale, or choose “Scale to Recommended Safe Size” (~${formatRes(plan.safeBaseW, plan.safeBaseH)}) for better stability.`
            });
        }

        if (Math.abs(plan.scaleX - plan.scaleY) > 0.02) {
            warnings.push({
                level: 'warning',
                title: 'Non-uniform scale',
                body: `Width and height scale differently (${formatScale(plan.scaleX)}× vs ${formatScale(plan.scaleY)}×). The base aspect ratio will change.`
            });
        }

        // Deduplicate by title
        const seen = new Set();
        const unique = [];
        for (const w of warnings) {
            if (seen.has(w.title)) continue;
            seen.add(w.title);
            unique.push(w);
        }

        const needsConfirm = unique.some((w) => w.level === 'danger') ||
            maxFactor >= UPSCALE_WARNING_FACTOR ||
            targetMP >= EXTREME_RES_MP ||
            plan.clamped;

        const showSafeOption = plan.safeBaseW !== plan.appliedBaseW || plan.safeBaseH !== plan.appliedBaseH;

        return { warnings: unique, needsConfirm, showSafeOption };
    }

    function renderScaleWarnings(warnings) {
        if (!scaleWarningsEl) return;
        scaleWarningsEl.innerHTML = '';
        if (!warnings.length) {
            scaleWarningsEl.classList.add('hidden');
            return;
        }
        scaleWarningsEl.classList.remove('hidden');
        for (const w of warnings) {
            const el = document.createElement('div');
            el.className = `scale-warning ${w.level}`;
            el.innerHTML = `<strong>${w.title}</strong>${w.body}`;
            scaleWarningsEl.appendChild(el);
        }
    }

    function renderScaleMemoryMeta(plan) {
        if (!scaleMemoryMetaEl) return;
        const w = plan.appliedBaseW;
        const h = plan.appliedBaseH;
        scaleMemoryMetaEl.classList.remove('hidden');
        scaleMemoryMetaEl.innerHTML =
            `Target: <strong>${formatRes(w, h)}</strong> · <strong>${formatMP(w, h)}</strong> · ` +
            `~<strong>${formatApproxRAM(w, h)}</strong> per full RGBA canvas` +
            (plan.showSafeOption
                ? `<br>Recommended safe: <strong>${formatRes(plan.safeBaseW, plan.safeBaseH)}</strong> · <strong>${formatMP(plan.safeBaseW, plan.safeBaseH)}</strong>`
                : '');
    }

    function setImageRiskStatus(statusEl, img, label) {
        if (!statusEl || !img) return;
        const risks = describeImageRisk(img.width, img.height, { label });
        if (!risks.length) {
            statusEl.textContent = `${label} loaded (${formatRes(img.width, img.height)}, ${formatMP(img.width, img.height)}).`;
            statusEl.style.color = '';
            return;
        }
        const top = risks[0];
        statusEl.textContent = `${top.title}: ${top.body}`;
        statusEl.style.color = top.level === 'danger' ? '#fca5a5' : top.level === 'warning' ? '#fde68a' : 'var(--accent-cyan)';
    }

    /** Catmull-Rom / cubic Hermite sample used by bicubic resize. */
    function cubicHermite(a, b, c, d, t) {
        const t2 = t * t;
        const t3 = t2 * t;
        return 0.5 * (
            (2 * b) +
            (-a + c) * t +
            (2 * a - 5 * b + 4 * c - d) * t2 +
            (-a + 3 * b - 3 * c + d) * t3
        );
    }

    function sampleChannelBicubic(data, width, height, x, y, channel) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = x - x0;
        const fy = y - y0;
        const cols = new Array(4);

        for (let j = 0; j < 4; j++) {
            const sy = Math.min(height - 1, Math.max(0, y0 - 1 + j));
            const row = new Array(4);
            for (let i = 0; i < 4; i++) {
                const sx = Math.min(width - 1, Math.max(0, x0 - 1 + i));
                row[i] = data[(sy * width + sx) * 4 + channel];
            }
            cols[j] = cubicHermite(row[0], row[1], row[2], row[3], fx);
        }

        return cubicHermite(cols[0], cols[1], cols[2], cols[3], fy);
    }

    /**
     * Resize an image/canvas with a true bicubic kernel.
     * Falls back to canvas high-quality smoothing if pixel buffers are too large.
     */
    function resizeImageBicubic(source, destW, destH) {
        destW = Math.max(1, Math.round(destW));
        destH = Math.max(1, Math.round(destH));

        const srcW = source.width;
        const srcH = source.height;
        if (srcW === destW && srcH === destH) {
            const copy = createSafeCanvas(destW, destH);
            copy.getContext('2d').drawImage(source, 0, 0);
            return copy;
        }

        const dest = createSafeCanvas(destW, destH);
        const destCtx = dest.getContext('2d');
        if (!destCtx) throw new Error('Could not create destination canvas');

        // Prefer true bicubic when source+dest buffers are manageable.
        const MAX_BICUBIC_PIXELS = 16_777_216; // ~4096²
        const canUseKernel =
            srcW * srcH <= MAX_BICUBIC_PIXELS &&
            destW * destH <= MAX_BICUBIC_PIXELS;

        if (canUseKernel) {
            try {
                const srcCanvas = createSafeCanvas(srcW, srcH);
                const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
                srcCtx.drawImage(source, 0, 0);
                const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;
                const out = destCtx.createImageData(destW, destH);
                const outData = out.data;

                const xRatio = srcW / destW;
                const yRatio = srcH / destH;

                for (let y = 0; y < destH; y++) {
                    const srcY = (y + 0.5) * yRatio - 0.5;
                    for (let x = 0; x < destW; x++) {
                        const srcX = (x + 0.5) * xRatio - 0.5;
                        const idx = (y * destW + x) * 4;
                        outData[idx] = Math.min(255, Math.max(0, sampleChannelBicubic(srcData, srcW, srcH, srcX, srcY, 0)));
                        outData[idx + 1] = Math.min(255, Math.max(0, sampleChannelBicubic(srcData, srcW, srcH, srcX, srcY, 1)));
                        outData[idx + 2] = Math.min(255, Math.max(0, sampleChannelBicubic(srcData, srcW, srcH, srcX, srcY, 2)));
                        outData[idx + 3] = Math.min(255, Math.max(0, sampleChannelBicubic(srcData, srcW, srcH, srcX, srcY, 3)));
                    }
                }

                destCtx.putImageData(out, 0, 0);
                return dest;
            } catch (err) {
                console.warn('Bicubic kernel resize failed, falling back to canvas high-quality:', err);
            }
        }

        destCtx.imageSmoothingEnabled = true;
        destCtx.imageSmoothingQuality = 'high';
        destCtx.drawImage(source, 0, 0, destW, destH);
        return dest;
    }

    function buildScalePlan(editedImg) {
        if (!state.originalImage || !state.cropRect || !editedImg) return null;

        const origCropW = state.cropRect.width;
        const origCropH = state.cropRect.height;
        const newCropW = editedImg.width;
        const newCropH = editedImg.height;

        if (origCropW <= 0 || origCropH <= 0) return null;
        // Ignore 1px rounding differences from external editors.
        if (Math.abs(newCropW - origCropW) <= 1 && Math.abs(newCropH - origCropH) <= 1) return null;

        const scaleX = newCropW / origCropW;
        const scaleY = newCropH / origCropH;
        const origBaseW = state.originalImage.width;
        const origBaseH = state.originalImage.height;
        let newBaseW = Math.max(1, Math.round(origBaseW * scaleX));
        let newBaseH = Math.max(1, Math.round(origBaseH * scaleY));

        const exportScale = getExportScale(newBaseW, newBaseH);
        let clamped = false;
        let appliedBaseW = newBaseW;
        let appliedBaseH = newBaseH;
        if (exportScale < 1) {
            clamped = true;
            appliedBaseW = Math.max(1, Math.round(newBaseW * exportScale));
            appliedBaseH = Math.max(1, Math.round(newBaseH * exportScale));
        }

        const manageScale = getSafeManageScale(newBaseW, newBaseH);
        let safeBaseW = newBaseW;
        let safeBaseH = newBaseH;
        if (manageScale < 1) {
            safeBaseW = Math.max(1, Math.round(newBaseW * manageScale));
            safeBaseH = Math.max(1, Math.round(newBaseH * manageScale));
        }
        // Safe size must also respect hard export clamp.
        const safeExportScale = getExportScale(safeBaseW, safeBaseH);
        if (safeExportScale < 1) {
            safeBaseW = Math.max(1, Math.round(safeBaseW * safeExportScale));
            safeBaseH = Math.max(1, Math.round(safeBaseH * safeExportScale));
        }

        const direction = (scaleX > 1.001 || scaleY > 1.001)
            ? (scaleX < 0.999 || scaleY < 0.999 ? 'rescale' : 'upscale')
            : 'downscale';

        const plan = {
            origCropW, origCropH,
            newCropW, newCropH,
            origBaseW, origBaseH,
            newBaseW, newBaseH,
            appliedBaseW, appliedBaseH,
            safeBaseW, safeBaseH,
            scaleX, scaleY,
            clamped,
            direction
        };

        const risk = assessScalePlanRisks(plan);
        plan.warnings = risk.warnings;
        plan.needsConfirm = risk.needsConfirm;
        plan.showSafeOption = risk.showSafeOption &&
            (safeBaseW !== appliedBaseW || safeBaseH !== appliedBaseH);

        return plan;
    }

    function showScaleBaseStep(plan) {
        state.scalePlan = plan;

        const verb = plan.direction === 'downscale' ? 'downscale' : 'upscale';
        if (scaleBaseIntroEl) {
            scaleBaseIntroEl.textContent =
                `The uploaded crop is a different resolution than the original crop region. ` +
                `Do you want to ${verb} the base image so it matches the new crop scale?`;
        }

        if (scaleOrigCropEl) scaleOrigCropEl.textContent = formatRes(plan.origCropW, plan.origCropH);
        if (scaleNewCropEl) scaleNewCropEl.textContent = formatRes(plan.newCropW, plan.newCropH);
        if (scaleOrigBaseEl) scaleOrigBaseEl.textContent = formatRes(plan.origBaseW, plan.origBaseH);
        if (scaleNewBaseEl) {
            scaleNewBaseEl.textContent = plan.clamped
                ? `${formatRes(plan.appliedBaseW, plan.appliedBaseH)} (clamped)`
                : formatRes(plan.newBaseW, plan.newBaseH);
        }

        if (scaleFormulaEl) {
            scaleFormulaEl.innerHTML =
                `Width: <strong>${plan.newCropW}</strong> ÷ <strong>${plan.origCropW}</strong> = ` +
                `<strong>${formatScale(plan.scaleX)}×</strong> → ` +
                `<strong>${plan.origBaseW}</strong> × ${formatScale(plan.scaleX)} = ` +
                `<strong>${plan.newBaseW}</strong><br>` +
                `Height: <strong>${plan.newCropH}</strong> ÷ <strong>${plan.origCropH}</strong> = ` +
                `<strong>${formatScale(plan.scaleY)}×</strong> → ` +
                `<strong>${plan.origBaseH}</strong> × ${formatScale(plan.scaleY)} = ` +
                `<strong>${plan.newBaseH}</strong>`;
        }

        if (scaleFactorSummaryEl) {
            const same = Math.abs(plan.scaleX - plan.scaleY) < 0.0005;
            scaleFactorSummaryEl.textContent = same
                ? `Uniform scale factor: ${formatScale(plan.scaleX)}× (${verb})`
                : `Scale factors: ${formatScale(plan.scaleX)}× width, ${formatScale(plan.scaleY)}× height (${verb})`;
        }

        renderScaleWarnings(plan.warnings || []);
        renderScaleMemoryMeta(plan);

        if (applyBaseScaleBtn) {
            const label = plan.direction === 'downscale'
                ? 'Downscale Base Image (Bicubic)'
                : plan.direction === 'upscale'
                    ? 'Upscale Base Image (Bicubic)'
                    : 'Rescale Base Image (Bicubic)';
            applyBaseScaleBtn.textContent = plan.clamped
                ? `${label} to Max Allowed`
                : label;
            applyBaseScaleBtn.disabled = false;
        }

        if (applySafeScaleBtn) {
            if (plan.showSafeOption) {
                applySafeScaleBtn.classList.remove('hidden');
                applySafeScaleBtn.textContent =
                    `Scale to Recommended Safe Size (${formatRes(plan.safeBaseW, plan.safeBaseH)})`;
                applySafeScaleBtn.disabled = false;
            } else {
                applySafeScaleBtn.classList.add('hidden');
            }
        }

        if (skipBaseScaleBtn) skipBaseScaleBtn.disabled = false;
        if (cancelBaseScaleBtn) cancelBaseScaleBtn.disabled = false;

        if (scaleBaseStatusEl) {
            scaleBaseStatusEl.textContent = '';
            scaleBaseStatusEl.style.color = '';
        }

        uploadStep.classList.add('hidden');
        cropStep.classList.add('hidden');
        reUploadStep.classList.add('hidden');
        paintEditorStep.classList.add('hidden');
        maskStep.classList.add('hidden');
        if (scaleBaseStep) scaleBaseStep.classList.remove('hidden');
    }

    function proceedWithEditedImage(editedImg, { checkScale = true } = {}) {
        state.editedImage = editedImg;
        if (checkScale) {
            const plan = buildScalePlan(editedImg);
            if (plan) {
                showScaleBaseStep(plan);
                return;
            }
            // Same crop pixel size, but still warn if the overlay itself is huge.
            const risks = describeImageRisk(editedImg.width, editedImg.height, { label: 'Uploaded crop' });
            if (risks.length && reUploadStatus) {
                const top = risks[0];
                reUploadStatus.textContent = `${top.title}: ${top.body}`;
                reUploadStatus.style.color = top.level === 'danger' ? '#fca5a5' : top.level === 'warning' ? '#fde68a' : 'var(--accent-cyan)';
            }
        }
        state.scalePlan = null;
        setupMasking();
    }

    function setScaleActionButtonsDisabled(disabled) {
        if (applyBaseScaleBtn) applyBaseScaleBtn.disabled = disabled;
        if (applySafeScaleBtn) applySafeScaleBtn.disabled = disabled;
        if (skipBaseScaleBtn) skipBaseScaleBtn.disabled = disabled;
        if (cancelBaseScaleBtn) cancelBaseScaleBtn.disabled = disabled;
    }

    async function applyBaseScalePlan({ useSafeSize = false } = {}) {
        const plan = state.scalePlan;
        if (!plan || !state.originalImage || !state.cropRect) {
            setupMasking();
            return;
        }

        const targetW = useSafeSize ? plan.safeBaseW : plan.appliedBaseW;
        const targetH = useSafeSize ? plan.safeBaseH : plan.appliedBaseH;

        const runResize = async () => {
            setScaleActionButtonsDisabled(true);
            if (scaleBaseStatusEl) {
                scaleBaseStatusEl.style.color = '';
                scaleBaseStatusEl.textContent =
                    `Rescaling base image to ${formatRes(targetW, targetH)} with bicubic…`;
            }

            try {
                await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

                const scaledBase = resizeImageBicubic(
                    state.originalImage,
                    targetW,
                    targetH
                );

                const actualScaleX = scaledBase.width / plan.origBaseW;
                const actualScaleY = scaledBase.height / plan.origBaseH;
                const oldCrop = state.cropRect;

                state.originalImage = scaledBase;
                state.cropRect = {
                    x: Math.round(oldCrop.x * actualScaleX),
                    y: Math.round(oldCrop.y * actualScaleY),
                    width: Math.round(oldCrop.width * actualScaleX),
                    height: Math.round(oldCrop.height * actualScaleY)
                };

                state.userPaintLayer = null;
                state.tempStrokeLayer = null;
                state.scalePlan = null;

                if (scaleBaseStatusEl) {
                    scaleBaseStatusEl.textContent =
                        `Base image scaled to ${formatRes(scaledBase.width, scaledBase.height)} (${formatMP(scaledBase.width, scaledBase.height)}).`;
                }

                setupMasking();
            } catch (err) {
                console.error(err);
                if (scaleBaseStatusEl) {
                    scaleBaseStatusEl.style.color = '#fca5a5';
                    scaleBaseStatusEl.textContent =
                        'Failed to rescale base image (likely out of memory). Try the recommended safe size, or keep the current base scale.';
                }
                setScaleActionButtonsDisabled(false);
            }
        };

        const needsConfirm = useSafeSize
            ? megapixels(targetW, targetH) >= VERY_HIGH_RES_MP
            : plan.needsConfirm;

        if (needsConfirm) {
            const title = useSafeSize ? 'Confirm Safe Upscale' : 'Confirm High-Risk Upscale';
            const message = useSafeSize
                ? `Scale the base image to the recommended safe size ${formatRes(targetW, targetH)} (${formatMP(targetW, targetH)})? This still uses significant memory (~${formatApproxRAM(targetW, targetH)} per canvas).`
                : `You are about to scale the base to ${formatRes(targetW, targetH)} (${formatMP(targetW, targetH)}, ~${formatApproxRAM(targetW, targetH)} per canvas). This may be slow or crash the tab. Continue?`;

            showCustomConfirm(title, message, () => {
                runResize();
            });
            return;
        }

        await runResize();
    }

    // --- DOM SELECTORS ---
    const uploadStep = document.getElementById('upload-step');
    const cropStep = document.getElementById('crop-step');
    const reUploadStep = document.getElementById('re-upload-step');
    const scaleBaseStep = document.getElementById('scale-base-step');
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

    // Step 3.6 — Scale base to crop resolution
    const applyBaseScaleBtn = document.getElementById('apply-base-scale-btn');
    const applySafeScaleBtn = document.getElementById('apply-safe-scale-btn');
    const skipBaseScaleBtn = document.getElementById('skip-base-scale-btn');
    const cancelBaseScaleBtn = document.getElementById('cancel-base-scale-btn');
    const scaleOrigCropEl = document.getElementById('scale-orig-crop');
    const scaleNewCropEl = document.getElementById('scale-new-crop');
    const scaleOrigBaseEl = document.getElementById('scale-orig-base');
    const scaleNewBaseEl = document.getElementById('scale-new-base');
    const scaleFormulaEl = document.getElementById('scale-formula');
    const scaleFactorSummaryEl = document.getElementById('scale-factor-summary');
    const scaleWarningsEl = document.getElementById('scale-warnings');
    const scaleMemoryMetaEl = document.getElementById('scale-memory-meta');
    const scaleBaseStatusEl = document.getElementById('scale-base-status');
    const scaleBaseIntroEl = document.getElementById('scale-base-intro');
    const uploadStatus = document.getElementById('upload-status');
    const reUploadStatus = document.getElementById('re-upload-status');

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
    const sendToInpaintingBtn = document.getElementById('send-to-inpainting-btn');
    const sendToCompareBtn = document.getElementById('send-to-compare-btn');
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

    const curveCanvas = document.getElementById('curve-canvas');
    const resetCurveBtn = document.getElementById('reset-curve-btn');

    const hueSlider = document.getElementById('hue-slider');
    const saturationSlider = document.getElementById('saturation-slider');
    const lightnessSlider = document.getElementById('lightness-slider');
    const hueValue = document.getElementById('hue-value');
    const saturationValue = document.getElementById('saturation-value');
    const lightnessValue = document.getElementById('lightness-value');
    const blackLevelSlider = document.getElementById('black-level-slider');
    const highlightLevelSlider = document.getElementById('highlight-level-slider');
    const blackLevelValue = document.getElementById('black-level-value');
    const highlightLevelValue = document.getElementById('highlight-level-value');
    
    const baseHueSlider = document.getElementById('base-hue-slider');
    const baseSaturationSlider = document.getElementById('base-saturation-slider');
    const baseLightnessSlider = document.getElementById('base-lightness-slider');
    const baseHueValue = document.getElementById('base-hue-value');
    const baseSaturationValue = document.getElementById('base-saturation-value');
    const baseLightnessValue = document.getElementById('base-lightness-value');
    const baseBlackLevelSlider = document.getElementById('base-black-level-slider');
    const baseHighlightLevelSlider = document.getElementById('base-highlight-level-slider');
    const baseBlackLevelValue = document.getElementById('base-black-level-value');
    const baseHighlightLevelValue = document.getElementById('base-highlight-level-value');

    const baseCurveCanvas = document.getElementById('base-curve-canvas');
    const resetBaseCurveBtn = document.getElementById('reset-base-curve-btn');

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
    const invertMaskBtn = document.getElementById('invert-mask-btn');

    // Batch Export Elements
    const openBatchModalBtn = document.getElementById('open-batch-modal-btn');
    const batchExportModal = document.getElementById('batch-export-modal');
    const batchBaseUpload = document.getElementById('batch-base-upload');
    const batchOverlayUpload = document.getElementById('batch-overlay-upload');
    const resetBatchBaseBtn = document.getElementById('reset-batch-base-btn');
    const resetBatchOverlayBtn = document.getElementById('reset-batch-overlay-btn');
    const batchBaseCount = document.getElementById('batch-base-count');
    const batchOverlayCount = document.getElementById('batch-overlay-count');
    const batchWarningsContainer = document.getElementById('batch-warnings-container');
    const batchProgressContainer = document.getElementById('batch-progress-container');
    const batchProgressBar = document.getElementById('batch-progress-bar');
    const batchProgressText = document.getElementById('batch-progress-text');
    const batchModalCancel = document.getElementById('batch-modal-cancel');
    const batchModalStart = document.getElementById('batch-modal-start');

    console.log('DEBUG: Script loaded and DOM is ready.');

    // --- EVENT LISTENERS ---

    // 1. ORIGINAL IMAGE UPLOAD
    imageUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        state.originalFilename = file.name;

        try {
            const img = await loadImageFromFile(file);
            state.originalImage = img;
            state.maskCanvas = null;
            state.userPaintLayer = null; // Reset mask for new original image
            state.editedImage = null;
            state.workScale = 1;
            state.scalePlan = null;
            initialUploadContainer.classList.add('hidden');
            step1Actions.classList.remove('hidden');
            setImageRiskStatus(uploadStatus, img, 'Original image');
        } catch (err) {
            console.error(err);
            alert('Failed to load image. The file may be corrupted or unsupported.');
        }
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

            loadImageFromFile(file).then((img) => {
                // Keep the source image intact. Only the interactive canvas is reduced.
                // If overlay resolution differs from the full-frame crop, offer base rescale.
                proceedWithEditedImage(img, { checkScale: true });
            }).catch((err) => {
                console.error(err);
                alert('Failed to load overlay image.');
            });
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
    editedUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!state.cropRect) {
            alert("Error: Crop area missing.");
            return;
        }

        try {
            const img = await loadImageFromFile(file);
            // Keep full source resolution for the tiled final export.
            // If the uploaded crop resolution differs, offer to scale the base first.
            proceedWithEditedImage(img, { checkScale: true });
        } catch (err) {
            console.error(err);
            alert('Failed to load edited image.');
        } finally {
            e.target.value = '';
        }
    });

    // 5.5 SCALE BASE STEP CONTROLS
    if (applyBaseScaleBtn) {
        applyBaseScaleBtn.addEventListener('click', () => {
            applyBaseScalePlan({ useSafeSize: false });
        });
    }
    if (applySafeScaleBtn) {
        applySafeScaleBtn.addEventListener('click', () => {
            applyBaseScalePlan({ useSafeSize: true });
        });
    }
    if (skipBaseScaleBtn) {
        skipBaseScaleBtn.addEventListener('click', () => {
            state.scalePlan = null;
            setScaleActionButtonsDisabled(false);
            setupMasking();
        });
    }
    if (cancelBaseScaleBtn) {
        cancelBaseScaleBtn.addEventListener('click', () => {
            state.scalePlan = null;
            state.editedImage = null;
            if (scaleBaseStep) scaleBaseStep.classList.add('hidden');
            reUploadStep.classList.remove('hidden');
            setScaleActionButtonsDisabled(false);
        });
    }

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
        // Flatten layers to create the Edited Image (capped to safe canvas size)
        const scale = getSafeScale(state.cropRect.width, state.cropRect.height);
        const outW = Math.round(state.cropRect.width * scale);
        const outH = Math.round(state.cropRect.height * scale);
        const finalPaint = createSafeCanvas(outW, outH);
        const ctx = finalPaint.getContext('2d');

        // 1. Draw Original Crop
        ctx.drawImage(state.originalImage,
            state.cropRect.x, state.cropRect.y, state.cropRect.width, state.cropRect.height,
            0, 0, outW, outH
        );
        // 2. Draw User Paint on top (paint layer is at paint-editor work size)
        ctx.drawImage(state.peUserLayer, 0, 0, outW, outH);

        state.editedImage = finalPaint;
        // Paint editor intentionally matches (or safely caps) crop size — skip scale prompt.
        proceedWithEditedImage(finalPaint, { checkScale: false });
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
        if (scaleBaseStep) scaleBaseStep.classList.add('hidden');
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

    // Tab Switching Logic
    document.querySelectorAll('.adj-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            // Update buttons
            document.querySelectorAll('.adj-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update panes
            document.querySelectorAll('.adj-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
        });
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

    blackLevelSlider.addEventListener('input', (e) => {
        state.blackLevel = parseInt(e.target.value, 10);
        blackLevelValue.textContent = state.blackLevel;
        updateSVGFilter('overlay');
        composeMaskAndDraw();
    });

    highlightLevelSlider.addEventListener('input', (e) => {
        state.highlightLevel = parseInt(e.target.value, 10);
        highlightLevelValue.textContent = state.highlightLevel;
        updateSVGFilter('overlay');
        composeMaskAndDraw();
    });

    // Base Adjustments
    baseHueSlider.addEventListener('input', (e) => {
        state.baseHue = parseInt(e.target.value, 10);
        baseHueValue.textContent = state.baseHue;
        composeMaskAndDraw();
    });

    baseSaturationSlider.addEventListener('input', (e) => {
        state.baseSaturation = parseInt(e.target.value, 10);
        baseSaturationValue.textContent = state.baseSaturation;
        composeMaskAndDraw();
    });

    baseLightnessSlider.addEventListener('input', (e) => {
        state.baseLightness = parseInt(e.target.value, 10);
        baseLightnessValue.textContent = state.baseLightness;
        composeMaskAndDraw();
    });

    baseBlackLevelSlider.addEventListener('input', (e) => {
        state.baseBlackLevel = parseInt(e.target.value, 10);
        baseBlackLevelValue.textContent = state.baseBlackLevel;
        updateSVGFilter('base');
        composeMaskAndDraw();
    });

    baseHighlightLevelSlider.addEventListener('input', (e) => {
        state.baseHighlightLevel = parseInt(e.target.value, 10);
        baseHighlightLevelValue.textContent = state.baseHighlightLevel;
        updateSVGFilter('base');
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

    invertMaskBtn.addEventListener('click', () => {
        if (!state.userPaintLayer) return;

        const invertedLayer = createSafeCanvas(
            state.userPaintLayer.width,
            state.userPaintLayer.height
        );
        const invertedCtx = invertedLayer.getContext('2d');
        invertedCtx.fillStyle = '#FFFFFF';
        invertedCtx.fillRect(0, 0, invertedLayer.width, invertedLayer.height);
        invertedCtx.globalCompositeOperation = 'destination-out';
        invertedCtx.drawImage(state.userPaintLayer, 0, 0);

        const maskCtx = state.userPaintLayer.getContext('2d');
        maskCtx.clearRect(0, 0, state.userPaintLayer.width, state.userPaintLayer.height);
        maskCtx.globalCompositeOperation = 'source-over';
        maskCtx.drawImage(invertedLayer, 0, 0);
        composeMaskAndDraw();
    });

    maskUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showCustomConfirm(
            "Upload Mask",
            "Are you sure you want to upload a new mask? This will replace your current blending work.",
            () => {
                loadImageFromFile(file).then((img) => {
                    processUploadedMask(img);
                }).catch((err) => {
                    console.error(err);
                    alert('Failed to load mask image.');
                });
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

    if (sendToInpaintingBtn) {
        sendToInpaintingBtn.addEventListener('click', () => {
            const maskState = state.showMaskOverlay;
            const guideState = state.showCropGuide;
            state.showMaskOverlay = false;
            state.showCropGuide = false;

            const exportCanvas = composeAtResolution('export');
            state.showMaskOverlay = maskState;
            state.showCropGuide = guideState;
            composeMaskAndDraw();

            if (!exportCanvas) {
                alert("Failed to capture image.");
                return;
            }

            exportCanvas.toBlob(async (blob) => {
                if (blob) {
                    try {
                        await ImageTransfer.save(blob);
                        window.location.href = '../inpainting/index.html';
                    } catch (err) {
                        console.error("Failed to transfer image via IndexedDB:", err);
                        alert("Failed to send image to inpainting tool.");
                    }
                } else {
                    alert("Failed to capture image.");
                }
            }, 'image/png');
        });
    }

    if (sendToCompareBtn) {
        sendToCompareBtn.addEventListener('click', () => {
            const maskState = state.showMaskOverlay;
            const guideState = state.showCropGuide;
            state.showMaskOverlay = false;
            state.showCropGuide = false;

            const exportCanvas = composeAtResolution('export');
            state.showMaskOverlay = maskState;
            state.showCropGuide = guideState;
            composeMaskAndDraw();

            if (!exportCanvas) {
                alert("Failed to capture image.");
                return;
            }

            exportCanvas.toBlob(async (finalBlob) => {
                if (finalBlob) {
                    const baseName = getBaseFilename();
                    forceDownload(finalBlob, `${baseName}-final.png`);

                    try {
                        // Release the composed canvas before allocating another
                        // full-resolution canvas for the comparison transfer.
                        exportCanvas.width = 1;
                        exportCanvas.height = 1;
                        const originalWidth = state.originalImage.width;
                        const originalHeight = state.originalImage.height;
                        if (!canExportAtFullResolution(originalWidth, originalHeight)) {
                            throw new Error('Original image exceeds browser canvas limits');
                        }
                        const origCanvas = createSafeCanvas(originalWidth, originalHeight);
                        origCanvas.getContext('2d').drawImage(
                            state.originalImage, 0, 0, originalWidth, originalHeight
                        );

                        origCanvas.toBlob(async (origBlob) => {
                            if (origBlob) {
                                await ImageTransfer.saveMultiple({
                                    'image-0': origBlob,
                                    'image-1': finalBlob
                                });
                                window.location.href = '../Compare_Images/index.html';
                            }
                        }, 'image/png');
                    } catch (err) {
                        console.error("Failed to transfer images via IndexedDB:", err);
                        alert("Failed to send images to compare tool.");
                    }
                } else {
                    alert("Failed to capture image.");
                }
            }, 'image/png');
        });
    }

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
        try {
            canvas.toBlob((blob) => {
                if (!blob) {
                    alert("Error creating image file. The image may be too large for this browser — try a smaller export.");
                    return;
                }
                forceDownload(blob, filename);
            }, 'image/png');
        } catch (err) {
            console.error(err);
            alert("Error creating image file. The image may be too large for this browser.");
        }
    }

    function forceDownload(blob, filename) {
        // IE/Edge specific fallback
        if (window.navigator && window.navigator.msSaveOrOpenBlob) {
            window.navigator.msSaveOrOpenBlob(blob, filename);
            return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        link.style.display = 'none';
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

        const scale = getSafeScale(width, height);
        const outW = Math.round(width * scale);
        const outH = Math.round(height * scale);
        const tempCanvas = createSafeCanvas(outW, outH);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(state.originalImage, x, y, width, height, 0, 0, outW, outH);

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

        const exportCanvas = composeAtResolution('export');
        if (!exportCanvas) {
            state.showMaskOverlay = maskState;
            state.showCropGuide = guideState;
            composeMaskAndDraw();
            alert(
                `A ${state.originalImage.width}×${state.originalImage.height} export exceeds ` +
                'this browser’s full-resolution canvas limit.'
            );
            return;
        }

        const baseName = getBaseFilename();
        handleImageExport(exportCanvas, `${baseName}-final.png`);

        state.showMaskOverlay = maskState;
        state.showCropGuide = guideState;
        composeMaskAndDraw();
    }

    function swapImages() {
        if (!state.originalImage || !state.editedImage) return;

        const oldOriginal = state.originalImage;
        const oldEdited = state.editedImage;
        const oldCropRect = { ...state.cropRect };

        // 1. New overlay = cropped portion of current original (capped to safe size)
        const cropScale = getSafeScale(oldCropRect.width, oldCropRect.height);
        const newEditedDirect = createSafeCanvas(
            Math.round(oldCropRect.width * cropScale),
            Math.round(oldCropRect.height * cropScale)
        );
        newEditedDirect.getContext('2d').drawImage(oldOriginal,
            oldCropRect.x, oldCropRect.y, oldCropRect.width, oldCropRect.height,
            0, 0, newEditedDirect.width, newEditedDirect.height
        );

        // 2. New base = current edited image
        const newBaseW = oldEdited.width || oldCropRect.width;
        const newBaseH = oldEdited.height || oldCropRect.height;

        state.originalImage = oldEdited;
        state.editedImage = newEditedDirect;

        // 3. Reset cropRect to cover the full new base image
        state.cropRect = {
            x: 0,
            y: 0,
            width: newBaseW,
            height: newBaseH
        };

        // 4. Preserve mask for the old crop region (in working-resolution coords)
        if (state.userPaintLayer) {
            const oldMask = state.userPaintLayer;
            const workScale = state.workScale || 1;
            const sx = Math.round(oldCropRect.x * workScale);
            const sy = Math.round(oldCropRect.y * workScale);
            const sw = Math.max(1, Math.round(oldCropRect.width * workScale));
            const sh = Math.max(1, Math.round(oldCropRect.height * workScale));

            const newMask = createSafeCanvas(sw, sh);
            newMask.getContext('2d').drawImage(oldMask, sx, sy, sw, sh, 0, 0, sw, sh);
            state.userPaintLayer = newMask;
        }

        // 6. Swap Adjustments
        const oldBaseAdj = {
            hue: state.baseHue,
            saturation: state.baseSaturation,
            lightness: state.baseLightness,
            blackLevel: state.baseBlackLevel,
            highlightLevel: state.baseHighlightLevel,
            curvePoints: JSON.parse(JSON.stringify(state.baseCurvePoints))
        };
        const oldOverlayAdj = {
            hue: state.hue,
            saturation: state.saturation,
            lightness: state.lightness,
            blackLevel: state.blackLevel,
            highlightLevel: state.highlightLevel,
            curvePoints: JSON.parse(JSON.stringify(state.curvePoints))
        };

        state.baseHue = oldOverlayAdj.hue;
        state.baseSaturation = oldOverlayAdj.saturation;
        state.baseLightness = oldOverlayAdj.lightness;
        state.baseBlackLevel = oldOverlayAdj.blackLevel;
        state.baseHighlightLevel = oldOverlayAdj.highlightLevel;
        state.baseCurvePoints = oldOverlayAdj.curvePoints;

        state.hue = oldBaseAdj.hue;
        state.saturation = oldBaseAdj.saturation;
        state.lightness = oldBaseAdj.lightness;
        state.blackLevel = oldBaseAdj.blackLevel;
        state.highlightLevel = oldBaseAdj.highlightLevel;
        state.curvePoints = oldBaseAdj.curvePoints;

        // 7. Refresh Step 4
        setupMasking();
        syncAdjustmentUI();
    }

    function downloadMask() {
        const width = state.originalImage.width;
        const height = state.originalImage.height;
        if (!canExportAtFullResolution(width, height)) {
            alert(`A ${width}×${height} mask exceeds this browser's canvas limit.`);
            return;
        }

        const workMask = getFinalMaskCanvas();
        const finalExportCanvas = createSafeCanvas(width, height);
        const ctx = finalExportCanvas.getContext('2d');

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(workMask, 0, 0, width, height);
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';

        const baseName = getBaseFilename();
        handleImageExport(finalExportCanvas, `${baseName}-mask.png`);
    }

    function getFinalMaskCanvas() {
        const width = state.workWidth;
        const height = state.workHeight;
        const exportScale = state.workScale;

        const combinedMaskCanvas =
            (state._combinedMaskCanvas = ensureCanvasSize(state._combinedMaskCanvas, width, height));
        const maskCtxLocal = combinedMaskCanvas.getContext('2d');
        maskCtxLocal.clearRect(0, 0, width, height);
        maskCtxLocal.drawImage(state.userPaintLayer, 0, 0);

        if (state.isDrawing && state.tempStrokeLayer) {
            maskCtxLocal.save();
            const blurAmount = (state.brushSize * (state.workScale || 1) * (state.brushSoftness / 100)) / 2;
            if (blurAmount > 0) maskCtxLocal.filter = `blur(${blurAmount}px)`;

            if (state.currentTool === 'brush') {
                maskCtxLocal.globalCompositeOperation = 'source-over';
            } else {
                maskCtxLocal.globalCompositeOperation = 'destination-out';
            }
            maskCtxLocal.drawImage(state.tempStrokeLayer, 0, 0);
            maskCtxLocal.restore();
        }

        // Crop Constraint
        const constraintCanvas =
            (state._constraintCanvas = ensureCanvasSize(state._constraintCanvas, width, height));
        const constraintCtx = constraintCanvas.getContext('2d');
        constraintCtx.clearRect(0, 0, width, height);

        const cr = state.cropRect;
        const cx = Math.round(cr.x * exportScale);
        const cy = Math.round(cr.y * exportScale);
        const cw = Math.round(cr.width * exportScale);
        const ch = Math.round(cr.height * exportScale);

        const feather = Math.round(state.cropFeather * exportScale);
        constraintCtx.save();
        if (feather > 0) {
            const maxFeather = Math.min(cw, ch) / 2;
            const effectiveFeather = Math.min(feather, maxFeather);
            constraintCtx.filter = `blur(${effectiveFeather / 2}px)`;
            constraintCtx.fillStyle = 'white';
            constraintCtx.fillRect(
                cx + effectiveFeather,
                cy + effectiveFeather,
                cw - (effectiveFeather * 2),
                ch - (effectiveFeather * 2)
            );
        } else {
            constraintCtx.fillStyle = 'white';
            constraintCtx.fillRect(cx, cy, cw, ch);
        }
        constraintCtx.restore();

        maskCtxLocal.globalCompositeOperation = 'destination-in';
        maskCtxLocal.drawImage(constraintCanvas, 0, 0);
        maskCtxLocal.globalCompositeOperation = 'source-over';

        return combinedMaskCanvas;
    }

    // --- STEP 2: CROPPING LOGIC ---
    function setupCropping() {
        uploadStep.classList.add('hidden');
        cropStep.classList.remove('hidden');

        const img = state.originalImage;
        state.cropDisplayScale = getSafeScale(img.width, img.height);
        cropCanvas.width = Math.max(1, Math.round(img.width * state.cropDisplayScale));
        cropCanvas.height = Math.max(1, Math.round(img.height * state.cropDisplayScale));
        cropCtx.drawImage(img, 0, 0, cropCanvas.width, cropCanvas.height);

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

        const redrawCrop = (rect) => {
            cropCtx.drawImage(img, 0, 0, cropCanvas.width, cropCanvas.height);
            if (!rect) return;
            cropCtx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
            cropCtx.lineWidth = Math.max(2, cropCanvas.width * 0.002);
            cropCtx.strokeRect(rect.x, rect.y, rect.width, rect.height);
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

            redrawCrop(tempRect);
        };

        const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            if (tempRect) {
                const s = state.cropDisplayScale || 1;
                let finalX = Math.round(tempRect.x / s);
                let finalY = Math.round(tempRect.y / s);
                let finalW = Math.round(tempRect.width / s);
                let finalH = Math.round(tempRect.height / s);

                if (finalX < 0) finalX = 0;
                if (finalY < 0) finalY = 0;
                if (finalX + finalW > img.width) finalW = img.width - finalX;
                if (finalY + finalH > img.height) finalH = img.height - finalY;

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

        // Cap preview resolution to prevent black screens/memory issues
        let scale = getSafeScale(originalImage.width, originalImage.height, MAX_PREVIEW_DIM);

        originalPreviewCanvas.width = Math.max(1, Math.round(originalImage.width * scale));
        originalPreviewCanvas.height = Math.max(1, Math.round(originalImage.height * scale));
        
        // For the cropped preview, we also cap it
        let cropScale = getSafeScale(cropRect.width, cropRect.height, MAX_PREVIEW_DIM);
        croppedPreviewCanvas.width = Math.max(1, Math.round(cropRect.width * cropScale));
        croppedPreviewCanvas.height = Math.max(1, Math.round(cropRect.height * cropScale));

        // Draw original with scale
        originalPreviewCtx.save();
        originalPreviewCtx.drawImage(originalImage, 0, 0, originalPreviewCanvas.width, originalPreviewCanvas.height);
        
        // Draw crop rect (in preview pixel space)
        originalPreviewCtx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
        originalPreviewCtx.lineWidth = Math.max(2, originalPreviewCanvas.width * 0.005);
        originalPreviewCtx.strokeRect(
            cropRect.x * scale, cropRect.y * scale,
            cropRect.width * scale, cropRect.height * scale
        );
        originalPreviewCtx.restore();

        if (cropRect.width > 0 && cropRect.height > 0) {
            croppedPreviewCtx.drawImage(originalImage, 
                cropRect.x, cropRect.y, cropRect.width, cropRect.height, 
                0, 0, croppedPreviewCanvas.width, croppedPreviewCanvas.height
            );
        }
    }

    // --- STEP 3.5: PAINT EDITOR LOGIC ---
    function setupPaintEditor() {
        reUploadStep.classList.add('hidden');
        paintEditorStep.classList.remove('hidden');

        state.paintWorkScale = getSafeScale(state.cropRect.width, state.cropRect.height);
        const pw = Math.max(1, Math.round(state.cropRect.width * state.paintWorkScale));
        const ph = Math.max(1, Math.round(state.cropRect.height * state.paintWorkScale));

        state.paintEditorCanvas = document.getElementById('paint-editor-canvas');
        state.paintEditorCanvas.width = pw;
        state.paintEditorCanvas.height = ph;
        state.paintEditorCtx = state.paintEditorCanvas.getContext('2d');

        // Setup User Paint Layer (Transparent)
        if (!state.peUserLayer) {
            state.peUserLayer = document.createElement('canvas');
        }
        state.peUserLayer.width = pw;
        state.peUserLayer.height = ph;
        // Clear it in case of re-entry
        state.peUserLayer.getContext('2d').clearRect(0, 0, pw, ph);

        // Temp layer for stroke
        if (!state.tempStrokeLayer) {
            state.tempStrokeLayer = document.createElement('canvas');
        }
        state.tempStrokeLayer.width = pw;
        state.tempStrokeLayer.height = ph;

        composePaintEditor();
        attachPaintEditorEvents();
        updateCursorSize();
    }

    function composePaintEditor() {
        const ctx = state.paintEditorCtx;
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;

        // 1. Draw Original Crop (Background)
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(state.originalImage,
            state.cropRect.x, state.cropRect.y, state.cropRect.width, state.cropRect.height,
            0, 0, w, h
        );

        // 2. Prepare Paint Layer Composite
        const paintComposite = createSafeCanvas(w, h);
        const pCtx = paintComposite.getContext('2d');

        // Draw confirmed paint
        pCtx.drawImage(state.peUserLayer, 0, 0);

        // Draw active stroke (Live Preview)
        if (state.isDrawing && state.tempStrokeLayer) {
            pCtx.save();
            const blurAmount = (state.peBrushSize * (state.paintWorkScale || 1) * (state.peBrushSoftness / 100)) / 2;
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
            tmpCtx.lineWidth = state.peBrushSize * (state.paintWorkScale || 1);
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
            tmpCtx.lineWidth = state.peBrushSize * (state.paintWorkScale || 1);
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
            const blurAmount = (state.peBrushSize * (state.paintWorkScale || 1) * (state.peBrushSoftness / 100)) / 2;

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
        uploadStep.classList.add('hidden');
        cropStep.classList.add('hidden');
        reUploadStep.classList.add('hidden');
        paintEditorStep.classList.add('hidden');
        if (scaleBaseStep) scaleBaseStep.classList.add('hidden');
        maskStep.classList.remove('hidden');

        const fullW = state.originalImage.width;
        const fullH = state.originalImage.height;
        state.workScale = getSafeScale(fullW, fullH);
        state.workWidth = Math.max(1, Math.round(fullW * state.workScale));
        state.workHeight = Math.max(1, Math.round(fullH * state.workScale));

        state.maskCanvas = document.getElementById('mask-canvas');
        state.maskCanvas.width = state.workWidth;
        state.maskCanvas.height = state.workHeight;
        state.maskCtx = state.maskCanvas.getContext('2d');

        requestAnimationFrame(updateCursorSize);

        // User Paint Layer (Mask) — at working resolution
        if (!state.userPaintLayer ||
            state.userPaintLayer.width !== state.workWidth ||
            state.userPaintLayer.height !== state.workHeight) {

            const oldMask = state.userPaintLayer;
            state.userPaintLayer = createSafeCanvas(state.workWidth, state.workHeight);
            // Preserve existing mask if resizing (e.g. after swap)
            if (oldMask && oldMask.width > 0 && oldMask.height > 0) {
                state.userPaintLayer.getContext('2d').drawImage(
                    oldMask, 0, 0, state.workWidth, state.workHeight
                );
            }
        }

        // Temp Stroke Layer
        if (!state.tempStrokeLayer) {
            state.tempStrokeLayer = document.createElement('canvas');
        }
        state.tempStrokeLayer.width = state.workWidth;
        state.tempStrokeLayer.height = state.workHeight;

        // Pre-size reusable buffers
        state._revealedEditCanvas = ensureCanvasSize(state._revealedEditCanvas, state.workWidth, state.workHeight);
        state._combinedMaskCanvas = ensureCanvasSize(state._combinedMaskCanvas, state.workWidth, state.workHeight);
        state._constraintCanvas = ensureCanvasSize(state._constraintCanvas, state.workWidth, state.workHeight);
        state._overlayCanvas = ensureCanvasSize(state._overlayCanvas, state.workWidth, state.workHeight);

        syncAdjustmentUI();
        composeMaskAndDraw();
        attachMaskEvents();
    }

    /**
     * Compose base + masked overlay onto a canvas.
     * @param {'work'|'export'} mode
     * @param {HTMLCanvasElement} [targetCanvas] - if omitted, uses maskCanvas for work mode or a new canvas for export
     */
    function isDefaultCurve(points) {
        return points.length === 2 &&
            points[0].x === 0 && points[0].y === 0 &&
            points[1].x === 1 && points[1].y === 1;
    }

    function needsToneCurve(target) {
        const isBase = target === 'base';
        const black = isBase ? state.baseBlackLevel : state.blackLevel;
        const highlight = isBase ? state.baseHighlightLevel : state.highlightLevel;
        const points = isBase ? state.baseCurvePoints : state.curvePoints;
        return black !== 0 || highlight !== 100 || !isDefaultCurve(points);
    }

    /** CSS-only adjustments. SVG url(#…-curves) blanks canvas draws in many browsers. */
    function setAdjustmentFilter(ctx, target) {
        const isBase = target === 'base';
        const hue = isBase ? state.baseHue : state.hue;
        const saturation = isBase ? state.baseSaturation : state.saturation;
        const lightness = isBase ? state.baseLightness : state.lightness;
        ctx.filter = `hue-rotate(${hue || 0}deg) saturate(${saturation ?? 100}%) brightness(${lightness ?? 100}%)`;
    }

    function getToneLut(target) {
        const key = target === 'base' ? '_baseToneLut' : '_overlayToneLut';
        if (!state[key]) updateToneLut(target);
        return state[key];
    }

    /**
     * Apply a 256-entry RGB tone LUT to a canvas region. Alpha is preserved.
     * Skips fully transparent pixels for speed on masked overlays.
     */
    function applyToneLutToCanvas(canvas, lut, x = 0, y = 0, w = canvas.width, h = canvas.height) {
        if (!canvas || !lut) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const sx = Math.max(0, Math.floor(x));
        const sy = Math.max(0, Math.floor(y));
        const sw = Math.max(0, Math.min(Math.ceil(w), canvas.width - sx));
        const sh = Math.max(0, Math.min(Math.ceil(h), canvas.height - sy));
        if (sw <= 0 || sh <= 0) return;

        let imageData;
        try {
            imageData = ctx.getImageData(sx, sy, sw, sh);
        } catch (err) {
            console.warn('Tone LUT getImageData failed:', err);
            return;
        }

        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue;
            data[i] = lut[data[i]];
            data[i + 1] = lut[data[i + 1]];
            data[i + 2] = lut[data[i + 2]];
        }
        ctx.putImageData(imageData, sx, sy);
    }

    function composeFullResolutionExport() {
        const fullW = state.originalImage.width;
        const fullH = state.originalImage.height;
        if (!canExportAtFullResolution(fullW, fullH)) {
            console.error(`Full-resolution export exceeds browser canvas limits: ${fullW}×${fullH}`);
            return null;
        }

        const exportCanvas = createSafeCanvas(fullW, fullH);
        const exportCtx = exportCanvas.getContext('2d');
        if (!exportCtx) return null;

        exportCtx.save();
        setAdjustmentFilter(exportCtx, 'base');
        exportCtx.drawImage(state.originalImage, 0, 0, fullW, fullH);
        exportCtx.restore();
        if (needsToneCurve('base')) {
            applyToneLutToCanvas(exportCanvas, getToneLut('base'));
        }

        if (state.hideEdit) return exportCanvas;

        // Scale the small working mask into each export tile. This keeps memory close
        // to one full-resolution canvas instead of four or five of them.
        const workMask = getFinalMaskCanvas();
        const crop = state.cropRect;
        const cropRight = Math.min(fullW, Math.ceil(crop.x + crop.width));
        const cropBottom = Math.min(fullH, Math.ceil(crop.y + crop.height));
        const startX = Math.max(0, Math.floor(crop.x));
        const startY = Math.max(0, Math.floor(crop.y));
        const tileCanvas = createSafeCanvas(EXPORT_TILE_SIZE, EXPORT_TILE_SIZE);

        for (let y = startY; y < cropBottom; y += EXPORT_TILE_SIZE) {
            const tileH = Math.min(EXPORT_TILE_SIZE, cropBottom - y);
            for (let x = startX; x < cropRight; x += EXPORT_TILE_SIZE) {
                const tileW = Math.min(EXPORT_TILE_SIZE, cropRight - x);
                if (tileCanvas.width !== tileW || tileCanvas.height !== tileH) {
                    tileCanvas.width = tileW;
                    tileCanvas.height = tileH;
                }

                const tileCtx = tileCanvas.getContext('2d');
                tileCtx.clearRect(0, 0, tileW, tileH);

                const sourceX = ((x - crop.x) / crop.width) * state.editedImage.width;
                const sourceY = ((y - crop.y) / crop.height) * state.editedImage.height;
                const sourceW = (tileW / crop.width) * state.editedImage.width;
                const sourceH = (tileH / crop.height) * state.editedImage.height;

                tileCtx.save();
                setAdjustmentFilter(tileCtx, 'overlay');
                tileCtx.drawImage(
                    state.editedImage,
                    sourceX, sourceY, sourceW, sourceH,
                    0, 0, tileW, tileH
                );
                tileCtx.restore();
                if (needsToneCurve('overlay')) {
                    applyToneLutToCanvas(tileCanvas, getToneLut('overlay'), 0, 0, tileW, tileH);
                }

                tileCtx.globalCompositeOperation = 'destination-in';
                tileCtx.drawImage(
                    workMask,
                    (x / fullW) * workMask.width,
                    (y / fullH) * workMask.height,
                    (tileW / fullW) * workMask.width,
                    (tileH / fullH) * workMask.height,
                    0, 0, tileW, tileH
                );
                tileCtx.globalCompositeOperation = 'source-over';
                exportCtx.drawImage(tileCanvas, x, y);
            }
        }

        return exportCanvas;
    }

    function composeAtResolution(mode = 'work', targetCanvas = null) {
        if (!state.originalImage || !state.editedImage || !state.cropRect) return null;
        if (mode === 'export') return composeFullResolutionExport();

        const fullW = state.originalImage.width;
        const fullH = state.originalImage.height;
        const scale = state.workScale;
        const width = Math.max(1, Math.round(fullW * scale));
        const height = Math.max(1, Math.round(fullH * scale));

        const canvas = targetCanvas || state.maskCanvas;
        if (!canvas) return null;

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        const ctx = canvas.getContext('2d');
        const cr = state.cropRect;
        const cx = Math.round(cr.x * scale);
        const cy = Math.round(cr.y * scale);
        const cw = Math.round(cr.width * scale);
        const ch = Math.round(cr.height * scale);

        // 1. Draw Background
        ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        setAdjustmentFilter(ctx, 'base');
        ctx.drawImage(state.originalImage, 0, 0, width, height);
        ctx.restore();
        if (needsToneCurve('base')) {
            applyToneLutToCanvas(canvas, getToneLut('base'));
        }

        // 2. Get Combined Mask
        const combinedMaskCanvas = getFinalMaskCanvas();

        // 3. Draw Edited Image into crop region, then mask
        const revealedEditCanvas =
            (state._revealedEditCanvas = ensureCanvasSize(state._revealedEditCanvas, width, height));
        const revealedEditCtx = revealedEditCanvas.getContext('2d');
        revealedEditCtx.clearRect(0, 0, width, height);

        revealedEditCtx.save();
        setAdjustmentFilter(revealedEditCtx, 'overlay');
        revealedEditCtx.drawImage(state.editedImage, cx, cy, cw, ch);
        revealedEditCtx.restore();
        if (needsToneCurve('overlay')) {
            applyToneLutToCanvas(revealedEditCanvas, getToneLut('overlay'), cx, cy, cw, ch);
        }

        revealedEditCtx.globalCompositeOperation = 'destination-in';
        revealedEditCtx.drawImage(combinedMaskCanvas, 0, 0);
        revealedEditCtx.globalCompositeOperation = 'source-over';

        if (!state.hideEdit) {
            ctx.drawImage(revealedEditCanvas, 0, 0);
        }

        // 5. Overlays (preview only)
        if (state.showMaskOverlay) {
            const overlayCanvas = (state._overlayCanvas = ensureCanvasSize(state._overlayCanvas, width, height));
            const overlayCtx = overlayCanvas.getContext('2d');
            overlayCtx.clearRect(0, 0, width, height);
            overlayCtx.drawImage(combinedMaskCanvas, 0, 0);
            overlayCtx.globalCompositeOperation = 'source-in';
            overlayCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            overlayCtx.fillRect(0, 0, width, height);
            overlayCtx.globalCompositeOperation = 'source-over';

            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(overlayCanvas, 0, 0);
        }

        if (state.showCropGuide) {
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            const guideWidth = Math.max(2, width * 0.003);
            ctx.lineWidth = guideWidth;
            ctx.strokeStyle = '#00ff00';
            ctx.setLineDash([guideWidth * 2, guideWidth]);
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = guideWidth / 2;
            ctx.strokeRect(cx, cy, cw, ch);
            ctx.restore();
        }

        updateMaskPreview(combinedMaskCanvas);

        return canvas;
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
            tmpCtx.lineWidth = state.brushSize * (state.workScale || 1);
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
            tmpCtx.lineWidth = state.brushSize * (state.workScale || 1);
            tmpCtx.strokeStyle = 'white';
            tmpCtx.stroke();

            state.lastPoint = newPoint;
            composeMaskAndDraw();
        };

        const stopPaint = () => {
            if (!state.isDrawing) return;
            state.isDrawing = false;

            const ctx = state.userPaintLayer.getContext('2d');
            const blurAmount = (state.brushSize * (state.workScale || 1) * (state.brushSoftness / 100)) / 2;

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
        composeAtResolution('work', state.maskCanvas);
    }

    function updateMaskPreview(maskSource) {
        if (!maskPreviewCanvas || !maskSource) return;

        const thumbScale = getSafeScale(maskSource.width, maskSource.height, MAX_MASK_THUMB_DIM);
        const tw = Math.max(1, Math.round(maskSource.width * thumbScale));
        const th = Math.max(1, Math.round(maskSource.height * thumbScale));

        if (maskPreviewCanvas.width !== tw || maskPreviewCanvas.height !== th) {
            maskPreviewCanvas.width = tw;
            maskPreviewCanvas.height = th;

            const container = maskPreviewCanvas.closest('.mask-thumb-container');
            if (container) {
                container.style.aspectRatio = `${tw} / ${th}`;
            }
        }

        const pCtx = maskPreviewCanvas.getContext('2d');
        pCtx.clearRect(0, 0, tw, th);

        // Fast B&W conversion using composition at thumbnail size
        pCtx.save();
        pCtx.fillStyle = 'white';
        pCtx.fillRect(0, 0, tw, th);
        pCtx.globalCompositeOperation = 'destination-in';
        pCtx.drawImage(maskSource, 0, 0, tw, th);
        pCtx.globalCompositeOperation = 'destination-over';
        pCtx.fillStyle = 'black';
        pCtx.fillRect(0, 0, tw, th);
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

        const width = state.workWidth || state.userPaintLayer.width;
        const height = state.workHeight || state.userPaintLayer.height;

        // Draw uploaded image scaled to working resolution, convert B&W → alpha via compositing
        const tempCanvas = createSafeCanvas(width, height);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0, width, height);

        // Prefer getImageData when the working buffer is small enough; otherwise approximate with luminance draw
        try {
            const imageData = tempCtx.getImageData(0, 0, width, height);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];
                const brightness = (0.299 * r) + (0.587 * g) + (0.114 * b);
                const finalAlpha = brightness * (a / 255);

                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
                data[i + 3] = finalAlpha;
            }

            const ctx = state.userPaintLayer.getContext('2d');
            ctx.clearRect(0, 0, width, height);
            ctx.putImageData(imageData, 0, 0);
        } catch (err) {
            console.warn('Mask upload fell back to drawImage:', err);
            const ctx = state.userPaintLayer.getContext('2d');
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(tempCanvas, 0, 0);
        }

        composeMaskAndDraw();
    }

    function syncAdjustmentUI() {
        // Overlay sliders
        if (hueSlider) hueSlider.value = state.hue;
        if (hueValue) hueValue.textContent = state.hue;
        if (saturationSlider) saturationSlider.value = state.saturation;
        if (saturationValue) saturationValue.textContent = state.saturation;
        if (lightnessSlider) lightnessSlider.value = state.lightness;
        if (lightnessValue) lightnessValue.textContent = state.lightness;
        if (blackLevelSlider) blackLevelSlider.value = state.blackLevel;
        if (blackLevelValue) blackLevelValue.textContent = state.blackLevel;
        if (highlightLevelSlider) highlightLevelSlider.value = state.highlightLevel;
        if (highlightLevelValue) highlightLevelValue.textContent = state.highlightLevel;

        // Base sliders
        if (baseHueSlider) baseHueSlider.value = state.baseHue;
        if (baseHueValue) baseHueValue.textContent = state.baseHue;
        if (baseSaturationSlider) baseSaturationSlider.value = state.baseSaturation;
        if (baseSaturationValue) baseSaturationValue.textContent = state.baseSaturation;
        if (baseLightnessSlider) baseLightnessSlider.value = state.baseLightness;
        if (baseLightnessValue) baseLightnessValue.textContent = state.baseLightness;
        if (baseBlackLevelSlider) baseBlackLevelSlider.value = state.baseBlackLevel;
        if (baseBlackLevelValue) baseBlackLevelValue.textContent = state.baseBlackLevel;
        if (baseHighlightLevelSlider) baseHighlightLevelSlider.value = state.baseHighlightLevel;
        if (baseHighlightLevelValue) baseHighlightLevelValue.textContent = state.baseHighlightLevel;
        
        // Curves and filters
        drawCurve('overlay');
        drawCurve('base');
        updateSVGFilter('overlay');
        updateSVGFilter('base');
    }

    function updateCursorPosition(e) {
        let size, scale;
        // Check which canvas is active to determine size/scale
        if (!paintEditorStep.classList.contains('hidden')) {
            scale = getCanvasScale(state.paintEditorCanvas);
            size = state.peBrushSize * (state.paintWorkScale || 1) * scale;
        } else {
            scale = getCanvasScale(state.maskCanvas);
            size = state.brushSize * (state.workScale || 1) * scale;
        }

        brushCursor.style.left = `${e.pageX - size / 2}px`;
        brushCursor.style.top = `${e.pageY - size / 2}px`;
    }

    function updateCursorSize() {
        let size, scale;
        if (!paintEditorStep.classList.contains('hidden')) {
            scale = getCanvasScale(state.paintEditorCanvas);
            size = state.peBrushSize * (state.paintWorkScale || 1) * scale;
        } else {
            scale = getCanvasScale(state.maskCanvas);
            size = state.brushSize * (state.workScale || 1) * scale;
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

    // --- MONOTONE CUBIC SPLINE INTERPOLATION ---
    function getSplineFunction(points) {
        const n = points.length;
        if (n === 0) return (x) => x;
        if (n === 1) return (x) => points[0].y;

        // 1. Get secant slopes
        const dx = new Array(n - 1);
        const dy = new Array(n - 1);
        const m = new Array(n - 1);
        for (let i = 0; i < n - 1; i++) {
            dx[i] = points[i+1].x - points[i].x;
            dy[i] = points[i+1].y - points[i].y;
            m[i] = dx[i] === 0 ? 0 : dy[i] / dx[i];
        }

        // 2. Get tangent slopes
        const tangents = new Array(n);
        tangents[0] = m[0];
        for (let i = 1; i < n - 1; i++) {
            tangents[i] = (m[i - 1] + m[i]) / 2;
        }
        tangents[n - 1] = m[n - 2];

        // 3. Force monotonicity (Fritsch-Carlson method)
        for (let i = 0; i < n - 1; i++) {
            if (m[i] === 0) {
                tangents[i] = 0;
                tangents[i+1] = 0;
            } else {
                const alpha = tangents[i] / m[i];
                const beta = tangents[i+1] / m[i];
                const h = Math.sqrt(alpha * alpha + beta * beta);
                if (h > 3) {
                    const r = 3 / h;
                    tangents[i] = alpha * r * m[i];
                    tangents[i+1] = beta * r * m[i];
                }
            }
        }

        // 4. Return interpolation function
        return function(x) {
            if (x <= points[0].x) return points[0].y;
            if (x >= points[n - 1].x) return points[n - 1].y;

            // Binary search to find the interval
            let low = 0;
            let high = n - 2;
            let i = 0;
            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                if (x >= points[mid].x && x <= points[mid+1].x) {
                    i = mid;
                    break;
                }
                if (x < points[mid].x) {
                    high = mid - 1;
                } else {
                    low = mid + 1;
                }
            }

            const hVal = dx[i];
            const t = (x - points[i].x) / hVal;
            const t2 = t * t;
            const t3 = t2 * t;

            const h00 = 2 * t3 - 3 * t2 + 1;
            const h10 = t3 - 2 * t2 + t;
            const h01 = -2 * t3 + 3 * t2;
            const h11 = t3 - t2;

            return h00 * points[i].y + h10 * hVal * tangents[i] + h01 * points[i+1].y + h11 * hVal * tangents[i+1];
        };
    }

    // --- CURVE EDITOR LOGIC ---
    let draggedPointIndex = -1;
    let activeCurveTarget = 'overlay'; // 'overlay' or 'base'

    function initCurveEditor(target = 'overlay') {
        const canvas = target === 'base' ? baseCurveCanvas : curveCanvas;
        const resetBtn = target === 'base' ? resetBaseCurveBtn : resetCurveBtn;
        if (!canvas) return;

        canvas.addEventListener('mousedown', (e) => startDragCurve(e, target));
        window.addEventListener('mousemove', dragCurve);
        window.addEventListener('mouseup', stopDragCurve);

        canvas.addEventListener('touchstart', (e) => {
            if (!state.isTouchMode) return;
            startDragCurve(e.touches[0], target);
        }, { passive: false });
        window.addEventListener('touchmove', (e) => {
            if (!state.isTouchMode || draggedPointIndex === -1 || activeCurveTarget !== target) return;
            e.preventDefault();
            dragCurve(e.touches[0]);
        }, { passive: false });
        window.addEventListener('touchend', stopDragCurve);

        resetBtn.addEventListener('click', () => {
            if (target === 'base') {
                state.baseCurvePoints = [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 }
                ];
            } else {
                state.curvePoints = [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 }
                ];
            }
            drawCurve(target);
            updateSVGFilter(target);
            composeMaskAndDraw();
        });

        drawCurve(target);
    }

    function startDragCurve(e, target) {
        const canvas = target === 'base' ? baseCurveCanvas : curveCanvas;
        const points = target === 'base' ? state.baseCurvePoints : state.curvePoints;
        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) / rect.width;
        const mouseY = 1 - (e.clientY - rect.top) / rect.height;

        activeCurveTarget = target;

        // Find if we are clicking near an existing point
        const threshold = 0.05;
        let foundIndex = -1;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const dist = Math.sqrt(Math.pow(p.x - mouseX, 2) + Math.pow(p.y - mouseY, 2));
            if (dist < threshold) {
                foundIndex = i;
                break;
            }
        }

        if (foundIndex !== -1) {
            draggedPointIndex = foundIndex;
        } else {
            // Add a new point
            const newPoint = { x: mouseX, y: mouseY };
            points.push(newPoint);
            points.sort((a, b) => a.x - b.x);
            draggedPointIndex = points.indexOf(newPoint);
        }
        drawCurve(target);
    }

    function dragCurve(e) {
        if (draggedPointIndex === -1) return;

        const target = activeCurveTarget;
        const canvas = target === 'base' ? baseCurveCanvas : curveCanvas;
        const points = target === 'base' ? state.baseCurvePoints : state.curvePoints;
        const rect = canvas.getBoundingClientRect();
        let mouseX = (e.clientX - rect.left) / rect.width;
        let mouseY = 1 - (e.clientY - rect.top) / rect.height;

        // Constrain
        mouseX = Math.max(0, Math.min(1, mouseX));
        mouseY = Math.max(0, Math.min(1, mouseY));

        // Don't let points cross each other in X
        
        // Edge points can't change X
        if (draggedPointIndex === 0) {
            mouseX = 0;
        } else if (draggedPointIndex === points.length - 1) {
            mouseX = 1;
        } else {
            // Keep X between neighbors
            const prevX = points[draggedPointIndex - 1].x;
            const nextX = points[draggedPointIndex + 1].x;
            mouseX = Math.max(prevX + 0.01, Math.min(nextX - 0.01, mouseX));
        }

        points[draggedPointIndex] = { x: mouseX, y: mouseY };
        
        drawCurve(target);
        updateSVGFilter(target);
        composeMaskAndDraw();
    }

    function stopDragCurve() {
        if (draggedPointIndex !== -1) {
            // If it's a middle point and we dragged it out of bounds (effectively), maybe remove it?
            // For now, just keep it.
        }
        draggedPointIndex = -1;
    }

    function drawCurve(target = 'overlay') {
        const canvas = target === 'base' ? baseCurveCanvas : curveCanvas;
        const points = target === 'base' ? state.baseCurvePoints : state.curvePoints;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Draw grid
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 4; i++) {
            ctx.moveTo(i * w / 4, 0);
            ctx.lineTo(i * w / 4, h);
            ctx.moveTo(0, i * h / 4);
            ctx.lineTo(w, i * h / 4);
        }
        ctx.stroke();

        // Draw curve
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const spline = getSplineFunction(points);
        ctx.moveTo(0, (1 - spline(0)) * h);
        for (let px = 1; px <= w; px++) {
            const xVal = px / w;
            ctx.lineTo(px, (1 - spline(xVal)) * h);
        }
        ctx.stroke();

        // Draw points
        ctx.fillStyle = '#8b5cf6';
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            ctx.beginPath();
            ctx.arc(p.x * w, (1 - p.y) * h, 4, 0, Math.PI * 2);
            ctx.fill();
            if (i === draggedPointIndex && activeCurveTarget === target) {
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
    }

    function updateToneLut(target = 'overlay') {
        const lut = new Uint8ClampedArray(256);
        const points = target === 'base' ? state.baseCurvePoints : state.curvePoints;
        let black = (target === 'base' ? state.baseBlackLevel : state.blackLevel) / 100;
        let highlight = (target === 'base' ? state.baseHighlightLevel : state.highlightLevel) / 100;

        // Avoid divide-by-zero / inverted ranges from slider edge cases.
        if (highlight <= black) {
            highlight = Math.min(1, black + 0.01);
        }

        const spline = getSplineFunction(points);

        for (let i = 0; i < 256; i++) {
            const x = i / 255;
            let val = (x - black) / (highlight - black);
            val = Math.max(0, Math.min(1, val));
            const curveVal = spline(val);
            lut[i] = Math.round(Math.max(0, Math.min(1, curveVal)) * 255);
        }

        if (target === 'base') state._baseToneLut = lut;
        else state._overlayToneLut = lut;

        // Keep SVG tableValues in sync for any external/debug use (not used on canvas).
        const tableValues = Array.from(lut, (v) => (v / 255).toFixed(3)).join(' ');
        const prefix = target === 'base' ? 'base' : 'overlay';
        const r = document.getElementById(`${prefix}CurveR`);
        const g = document.getElementById(`${prefix}CurveG`);
        const b = document.getElementById(`${prefix}CurveB`);
        if (r) r.setAttribute('tableValues', tableValues);
        if (g) g.setAttribute('tableValues', tableValues);
        if (b) b.setAttribute('tableValues', tableValues);
    }

    // Back-compat alias used by existing call sites
    function updateSVGFilter(target = 'overlay') {
        updateToneLut(target);
    }

    // Call init
    initCurveEditor('overlay');
    initCurveEditor('base');
    updateSVGFilter('overlay');
    updateSVGFilter('base');

    // --- BATCH EXPORT LOGIC ---
    if (openBatchModalBtn) {
        openBatchModalBtn.addEventListener('click', () => {
            batchExportModal.classList.remove('hidden');
            checkBatchAspectRatios();
        });
    }

    if (batchModalCancel) {
        batchModalCancel.addEventListener('click', () => {
            batchExportModal.classList.add('hidden');
        });
    }

    if (batchBaseUpload) {
        batchBaseUpload.addEventListener('change', (e) => {
            state.batchBaseFiles = Array.from(e.target.files);
            batchBaseCount.textContent = state.batchBaseFiles.length > 0 
                ? `${state.batchBaseFiles.length} files selected.` 
                : 'Using current base image.';
            checkBatchAspectRatios();
        });
    }

    if (batchOverlayUpload) {
        batchOverlayUpload.addEventListener('change', (e) => {
            state.batchOverlayFiles = Array.from(e.target.files);
            batchOverlayCount.textContent = state.batchOverlayFiles.length > 0 
                ? `${state.batchOverlayFiles.length} files selected.` 
                : 'Using current overlay image.';
            checkBatchAspectRatios();
        });
    }

    if (resetBatchBaseBtn) {
        resetBatchBaseBtn.addEventListener('click', () => {
            batchBaseUpload.value = '';
            state.batchBaseFiles = [];
            batchBaseCount.textContent = 'Using current base image.';
            checkBatchAspectRatios();
        });
    }

    if (resetBatchOverlayBtn) {
        resetBatchOverlayBtn.addEventListener('click', () => {
            batchOverlayUpload.value = '';
            state.batchOverlayFiles = [];
            batchOverlayCount.textContent = 'Using current overlay image.';
            checkBatchAspectRatios();
        });
    }

    function checkBatchAspectRatios() {
        if (!state.originalImage || !state.editedImage) return;

        const origBaseAR = state.originalImage.width / state.originalImage.height;
        const origOverlayAR = state.editedImage.width / state.editedImage.height;

        batchWarningsContainer.innerHTML = '';
        let hasBaseWarning = false;
        let hasOverlayWarning = false;

        const checkFiles = async (files, targetAR) => {
            for (const file of files) {
                const ar = await getFileAspectRatio(file);
                if (Math.abs(ar - targetAR) > 0.05) {
                    return true;
                }
            }
            return false;
        };

        const updateWarnings = () => {
            let html = '';
            if (hasBaseWarning) {
                html += '<p style="color: var(--accent-purple); font-size: 0.9rem; margin-bottom: 5px;">⚠️ Some Base Images have different aspect ratios. They will be stretched to fit the original base size.</p>';
            }
            if (hasOverlayWarning) {
                html += '<p style="color: var(--accent-purple); font-size: 0.9rem;">⚠️ Some Overlay Images have different aspect ratios. They will be stretched to fit the original overlay size.</p>';
            }
            batchWarningsContainer.innerHTML = html;
        };

        // Fire and forget checks
        checkFiles(state.batchBaseFiles, origBaseAR).then(res => {
            hasBaseWarning = res;
            updateWarnings();
        });
        checkFiles(state.batchOverlayFiles, origOverlayAR).then(res => {
            hasOverlayWarning = res;
            updateWarnings();
        });
    }

    function getFileAspectRatio(file) {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                resolve(img.width / img.height);
                URL.revokeObjectURL(url);
            };
            img.src = url;
        });
    }

    if (batchModalStart) {
        batchModalStart.addEventListener('click', async () => {
            const numBases = Math.max(1, state.batchBaseFiles.length);
            const numOverlays = Math.max(1, state.batchOverlayFiles.length);
            const total = numBases * numOverlays;

            if (total > 128) {
                const confirmProceed = confirm(`You are about to generate ${total} combinations. This might take a while and consume significant memory. Continue?`);
                if (!confirmProceed) return;
            }

            batchModalStart.disabled = true;
            batchProgressContainer.classList.remove('hidden');
            batchProgressBar.value = 0;
            batchProgressText.textContent = `0% (0 / ${total})`;

            await processBatch(total);

            batchModalStart.disabled = false;
            batchProgressContainer.classList.add('hidden');
            batchExportModal.classList.add('hidden');
        });
    }

    function loadImageFile(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                resolve(img);
                URL.revokeObjectURL(url);
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    async function processBatch(totalCombinations) {
        if (typeof JSZip === 'undefined') {
            alert("JSZip library failed to load.");
            return;
        }

        const zip = new JSZip();
        let count = 0;

        const baseSources = state.batchBaseFiles.length > 0 ? state.batchBaseFiles : [null];
        const overlaySources = state.batchOverlayFiles.length > 0 ? state.batchOverlayFiles : [null];

        const prevShowMask = state.showMaskOverlay;
        const prevShowGuide = state.showCropGuide;
        state.showMaskOverlay = false;
        state.showCropGuide = false;

        const tempOrigImage = state.originalImage;
        const tempEditedImage = state.editedImage;

        for (let b = 0; b < baseSources.length; b++) {
            let baseImg = tempOrigImage;
            let baseName = getBaseFilename();
            if (baseSources[b]) {
                baseImg = await loadImageFile(baseSources[b]);
                baseImg = rasterizeToSafeCanvas(baseImg, tempOrigImage.width, tempOrigImage.height);
                
                let dotIdx = baseSources[b].name.lastIndexOf('.');
                baseName = dotIdx !== -1 ? baseSources[b].name.substring(0, dotIdx) : baseSources[b].name;
            }
            state.originalImage = baseImg;

            for (let o = 0; o < overlaySources.length; o++) {
                let overlayImg = tempEditedImage;
                let overlayName = "overlay";
                if (overlaySources[o]) {
                    overlayImg = await loadImageFile(overlaySources[o]);
                    overlayImg = rasterizeToSafeCanvas(overlayImg, tempEditedImage.width, tempEditedImage.height);
                    
                    let dotIdx = overlaySources[o].name.lastIndexOf('.');
                    overlayName = dotIdx !== -1 ? overlaySources[o].name.substring(0, dotIdx) : overlaySources[o].name;
                }
                state.editedImage = overlayImg;

                const exportCanvas = composeAtResolution('export');
                const blob = exportCanvas
                    ? await new Promise(resolve => exportCanvas.toBlob(resolve, 'image/png'))
                    : null;

                if (blob) {
                    const filename = `${baseName}_${overlayName}.png`;
                    zip.file(filename, blob);
                }

                count++;
                const percent = Math.round((count / totalCombinations) * 100);
                batchProgressBar.value = percent;
                batchProgressText.textContent = `${percent}% (${count} / ${totalCombinations})`;

                await new Promise(r => setTimeout(r, 10));
            }
        }

        state.originalImage = tempOrigImage;
        state.editedImage = tempEditedImage;
        state.showMaskOverlay = prevShowMask;
        state.showCropGuide = prevShowGuide;
        composeMaskAndDraw();

        batchProgressText.textContent = `Generating Zip...`;
        const zipBlob = await zip.generateAsync({ type: "blob" });
        forceDownload(zipBlob, "Batch_Export.zip");
    }

});