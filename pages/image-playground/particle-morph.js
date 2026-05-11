(function () {
    "use strict";

    const DEBUG_PREFIX = "[ParticleMorph]";

    const log = (...args) => console.log(DEBUG_PREFIX, ...args);
    const warn = (...args) => console.warn(DEBUG_PREFIX, ...args);
    const error = (...args) => console.error(DEBUG_PREFIX, ...args);

    let resizeObserverNoticeShown = false;

    function isResizeObserverLoopMessage(message) {
        return /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i.test(String(message || ""));
    }

    function suppressResizeObserverLoopMessage(message) {
        if (!isResizeObserverLoopMessage(message)) {
            return false;
        }

        if (!resizeObserverNoticeShown) {
            resizeObserverNoticeShown = true;
            console.info(
                DEBUG_PREFIX,
                "Ignored a harmless browser ResizeObserver notification. Canvas resizing is now deferred to avoid the loop."
            );
        }

        return true;
    }

    const previousWindowOnError = window.onerror;

    window.onerror = function (message, source, line, column, err) {
        if (suppressResizeObserverLoopMessage(message)) {
            return true;
        }

        if (typeof previousWindowOnError === "function") {
            return previousWindowOnError.call(window, message, source, line, column, err);
        }

        return false;
    };

    window.addEventListener(
        "error",
        function (event) {
            if (suppressResizeObserverLoopMessage(event.message)) {
                event.preventDefault();
                return;
            }

            error("Browser error caught:", {
                message: event.message,
                file: event.filename,
                line: event.lineno,
                column: event.colno
            });
        },
        true
    );

    window.addEventListener("unhandledrejection", function (event) {
        error("Unhandled promise rejection:", event.reason);
    });

    const els = {
        canvas: document.getElementById("particleCanvas"),
        canvasWrap: document.getElementById("canvasWrap"),
        emptyState: document.getElementById("emptyState"),

        imageA: document.getElementById("imageA"),
        imageB: document.getElementById("imageB"),
        fileNameA: document.getElementById("fileNameA"),
        fileNameB: document.getElementById("fileNameB"),
        previewA: document.getElementById("previewA"),
        previewB: document.getElementById("previewB"),

        particleCount: document.getElementById("particleCount"),
        particleCountValue: document.getElementById("particleCountValue"),
        flowStrength: document.getElementById("flowStrength"),
        flowStrengthValue: document.getElementById("flowStrengthValue"),
        particleSize: document.getElementById("particleSize"),
        particleSizeValue: document.getElementById("particleSizeValue"),

        morphButton: document.getElementById("morphButton"),
        burstButton: document.getElementById("burstButton"),
        resetButton: document.getElementById("resetButton"),

        statusPill: document.getElementById("statusPill"),
        perfText: document.getElementById("perfText")
    };

    const missingElements = Object.entries(els)
        .filter(function (entry) {
            return !entry[1];
        })
        .map(function (entry) {
            return entry[0];
        });

    if (missingElements.length > 0) {
        error("Cannot start. Missing HTML elements:", missingElements);
        return;
    }

    const ctx = els.canvas.getContext("2d", { alpha: true });

    if (!ctx) {
        error("Could not create a 2D canvas context. Your browser may not support canvas.");
        setStatus("Canvas is not supported in this browser.", "bad");
        return;
    }

    const state = {
        w: 0,
        h: 0,
        dpr: 1,

        imgA: null,
        imgB: null,
        urlA: null,
        urlB: null,

        particles: null,
        particleCount: 0,
        requestedCount: 6000,

        targetSide: 0,
        targetMix: 0,

        flow: 1,
        particleSizeBase: 3.5,
        isBuilding: false,
        pendingBuild: null,
        rebuildTimer: null,

        resizeRaf: 0,
        resizeReason: "Initial layout",

        forceClear: true,
        lastFrameTime: performance.now(),
        frameCounter: 0,
        fpsLastTime: performance.now(),
        lowFpsWarned: false,

        lastBuildW: 0,
        lastBuildH: 0,

        pointer: {
            x: 0,
            y: 0,
            active: false,
            down: false
        },

        grid: {
            cellSize: 22,
            cols: 0,
            rows: 0,
            counts: null
        }
    };

    function init() {
        const recommended = getRecommendedParticleCount();

        state.requestedCount = recommended;
        els.particleCount.value = String(recommended);
        els.particleSize.value = String(state.particleSizeBase);

        updateControlLabels();
        bindEvents();
        performCanvasResize("Initial layout");

        if ("ResizeObserver" in window) {
            const observer = new ResizeObserver(function () {
                scheduleCanvasResize("ResizeObserver update");
            });

            observer.observe(els.canvasWrap);
        } else {
            window.addEventListener("resize", function () {
                scheduleCanvasResize("Window resize");
            });
            warn("ResizeObserver is not available. Falling back to window resize events.");
        }

        window.addEventListener("orientationchange", function () {
            scheduleCanvasResize("Orientation change");
        });

        requestAnimationFrame(animate);

        log("Started successfully.", {
            liveServerTip: "Use VS Code Live Server from the project root so /assets/... paths resolve correctly.",
            devicePixelRatio: window.devicePixelRatio,
            recommendedParticles: recommended
        });
    }

    function bindEvents() {
        els.imageA.addEventListener("change", function (event) {
            handleImageInput(event, "A");
        });

        els.imageB.addEventListener("change", function (event) {
            handleImageInput(event, "B");
        });

        els.particleCount.addEventListener("input", function () {
            state.requestedCount = getRequestedParticleCount();
            updateControlLabels();
            scheduleBuild("Particle count changed", true, 300);
        });

        els.flowStrength.addEventListener("input", function () {
            state.flow = Number(els.flowStrength.value);
            updateControlLabels();
            log("Fluid energy changed:", state.flow);
        });

        els.particleSize.addEventListener("input", function () {
            state.particleSizeBase = Number(els.particleSize.value);
            updateControlLabels();
            log("Particle size changed:", state.particleSizeBase);
        });

        els.morphButton.addEventListener("click", function () {
            if (!state.particles) {
                warn("Morph button pressed before particles were ready.");
                setStatus("Upload both images first.", "bad");
                return;
            }

            state.targetSide = state.targetSide === 0 ? 1 : 0;
            els.morphButton.textContent = state.targetSide === 0
                ? "Morph to image B"
                : "Morph to image A";

            addFluidBurst(0.85);
            setStatus(
                state.targetSide === 0 ? "Morphing back to image A." : "Morphing to image B.",
                "good"
            );

            log("Morph target switched.", {
                targetSide: state.targetSide === 0 ? "A" : "B"
            });
        });

        els.burstButton.addEventListener("click", function () {
            addFluidBurst(1.45);
        });

        els.resetButton.addEventListener("click", function () {
            resetParticlesToCurrentTarget();
        });

        els.canvas.addEventListener("pointermove", updatePointer);

        els.canvas.addEventListener("pointerdown", function (event) {
            updatePointer(event);
            state.pointer.down = true;
            state.pointer.active = true;

            try {
                els.canvas.setPointerCapture(event.pointerId);
            } catch (captureError) {
                warn("Could not capture pointer:", captureError);
            }
        });

        els.canvas.addEventListener("pointerup", function () {
            state.pointer.down = false;
        });

        els.canvas.addEventListener("pointerleave", function () {
            state.pointer.active = false;
            state.pointer.down = false;
        });
    }

    function updatePointer(event) {
        const rect = els.canvas.getBoundingClientRect();

        state.pointer.x = event.clientX - rect.left;
        state.pointer.y = event.clientY - rect.top;
        state.pointer.active = true;
    }

    function scheduleCanvasResize(reason) {
        state.resizeReason = reason || "Unknown resize";

        if (state.resizeRaf) {
            return;
        }

        state.resizeRaf = requestAnimationFrame(function () {
            state.resizeRaf = 0;
            performCanvasResize(state.resizeReason);
        });
    }

    function performCanvasResize(reason) {
        const rect = els.canvasWrap.getBoundingClientRect();

        const nextW = Math.max(260, Math.round(rect.width));
        const nextH = Math.max(280, Math.round(rect.height));
        const nextDpr = Math.min(window.devicePixelRatio || 1, 2);

        if (state.w === nextW && state.h === nextH && state.dpr === nextDpr) {
            return;
        }

        state.w = nextW;
        state.h = nextH;
        state.dpr = nextDpr;

        els.canvas.width = Math.round(state.w * state.dpr);
        els.canvas.height = Math.round(state.h * state.dpr);

        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        state.forceClear = true;

        log("Canvas resized.", {
            reason: reason,
            width: state.w,
            height: state.h,
            dpr: state.dpr
        });

        if (state.imgA && state.imgB) {
            scheduleBuild("Canvas resized", true, 240);
        }
    }

    async function handleImageInput(event, side) {
        const input = event.target;
        const file = input.files && input.files[0];

        if (!file) {
            warn("No file selected for image " + side + ".");
            return;
        }

        if (!file.type || !file.type.startsWith("image/")) {
            error("The selected file is not an image:", file);
            setStatus("That file is not an image. Choose a PNG, JPG, WebP, GIF, or SVG.", "bad");
            return;
        }

        setStatus("Loading image " + side + "...", "busy");
        log("Loading image " + side + ".", {
            name: file.name,
            type: file.type,
            sizeBytes: file.size
        });

        try {
            const loaded = await loadImageFromFile(file);

            if (side === "A") {
                if (state.urlA) {
                    URL.revokeObjectURL(state.urlA);
                }

                state.imgA = loaded.image;
                state.urlA = loaded.url;
                els.previewA.src = loaded.url;
                els.previewA.hidden = false;
                els.fileNameA.textContent = file.name + " • " + loaded.image.naturalWidth + "×" + loaded.image.naturalHeight;
            } else {
                if (state.urlB) {
                    URL.revokeObjectURL(state.urlB);
                }

                state.imgB = loaded.image;
                state.urlB = loaded.url;
                els.previewB.src = loaded.url;
                els.previewB.hidden = false;
                els.fileNameB.textContent = file.name + " • " + loaded.image.naturalWidth + "×" + loaded.image.naturalHeight;
            }

            log("Image " + side + " loaded.", {
                width: loaded.image.naturalWidth,
                height: loaded.image.naturalHeight
            });

            if (state.imgA && state.imgB) {
                buildParticleSystem(false, "Both images are loaded");
            } else {
                setStatus("Image " + side + " loaded. Upload the other image.", "neutral");
            }
        } catch (loadError) {
            error("Could not load image " + side + ":", loadError);
            setStatus("Could not load image " + side + ". Check the console for details.", "bad");
        }
    }

    function loadImageFromFile(file) {
        return new Promise(function (resolve, reject) {
            const url = URL.createObjectURL(file);
            const image = new Image();

            image.onload = function () {
                resolve({
                    image: image,
                    url: url
                });
            };

            image.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error("The browser could not decode this image file."));
            };

            image.src = url;
        });
    }

    function scheduleBuild(reason, preservePositions, delay) {
        if (!state.imgA || !state.imgB) {
            return;
        }

        clearTimeout(state.rebuildTimer);

        state.rebuildTimer = setTimeout(function () {
            buildParticleSystem(preservePositions, reason);
        }, delay);
    }

    function buildParticleSystem(preservePositions, reason) {
        if (!state.imgA || !state.imgB) {
            warn("Build requested before both images were available.");
            setStatus("Upload both images first.", "bad");
            return;
        }

        if (state.isBuilding) {
            state.pendingBuild = {
                preservePositions: preservePositions,
                reason: reason
            };

            warn("Build already in progress. Queued another build.", reason);
            return;
        }

        state.isBuilding = true;
        state.lowFpsWarned = false;

        const count = getRequestedParticleCount();

        setStatus("Building " + formatNumber(count) + " particles...", "busy");
        log("Building particle system.", {
            reason: reason,
            count: count,
            preservePositions: preservePositions,
            canvas: {
                width: state.w,
                height: state.h
            }
        });

        try {
            const pointsA = extractImagePoints(state.imgA, count, "A");
            const pointsB = extractImagePoints(state.imgB, count, "B");

            state.particles = createParticleData(count, pointsA, pointsB, preservePositions);
            state.particleCount = count;
            state.lastBuildW = state.w;
            state.lastBuildH = state.h;
            state.forceClear = true;

            els.emptyState.classList.add("is-hidden");
            els.morphButton.disabled = false;

            setStatus("Ready. Press Morph, or drag inside the canvas.", "good");

            log("Particle system ready.", {
                particles: count,
                pointsA: pointsA.length,
                pointsB: pointsB.length
            });
        } catch (buildError) {
            error("Failed to build particle system:", buildError);
            setStatus("Could not build particles. Check the console.", "bad");
        } finally {
            state.isBuilding = false;

            if (state.pendingBuild) {
                const pending = state.pendingBuild;
                state.pendingBuild = null;
                scheduleBuild(pending.reason, pending.preservePositions, 50);
            }
        }
    }

    function extractImagePoints(image, count, label) {
        const maxSampleEdge = state.w < 700 ? 620 : 920;
        const sampleScale = Math.min(1, maxSampleEdge / Math.max(state.w, state.h));

        const sw = Math.max(120, Math.round(state.w * sampleScale));
        const sh = Math.max(120, Math.round(state.h * sampleScale));

        const offscreen = document.createElement("canvas");
        offscreen.width = sw;
        offscreen.height = sh;

        const offCtx = offscreen.getContext("2d");

        if (!offCtx) {
            throw new Error("Could not create offscreen canvas for image " + label + ".");
        }

        offCtx.clearRect(0, 0, sw, sh);

        const padding = Math.max(12, Math.min(state.w, state.h) * 0.055);
        const fit = getContainRect(
            image.naturalWidth,
            image.naturalHeight,
            padding,
            padding,
            state.w - padding * 2,
            state.h - padding * 2
        );

        offCtx.drawImage(
            image,
            fit.x * sampleScale,
            fit.y * sampleScale,
            fit.w * sampleScale,
            fit.h * sampleScale
        );

        let imageData;

        try {
            imageData = offCtx.getImageData(0, 0, sw, sh);
        } catch (readError) {
            error("Could not read image pixels. This usually means the image is blocked by canvas security rules.", readError);
            throw readError;
        }

        const data = imageData.data;
        const targetCandidateCount = Math.max(count * 5, count + 1000);
        const stride = Math.max(1, Math.floor(Math.sqrt((sw * sh) / targetCandidateCount)));
        const candidates = [];

        for (let y = 0; y < sh; y += stride) {
            for (let x = 0; x < sw; x += stride) {
                const index = (y * sw + x) * 4;
                const alpha = data[index + 3];

                if (alpha < 18) {
                    continue;
                }

                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];

                if (alpha < 245 && Math.random() > alpha / 255) {
                    continue;
                }

                candidates.push({
                    x: x / sampleScale,
                    y: y / sampleScale,
                    r: r,
                    g: g,
                    b: b,
                    a: alpha
                });
            }
        }

        if (candidates.length === 0) {
            warn("No visible pixels found in image " + label + ". Using fallback points.");
            return createFallbackPoints(count, label);
        }

        sortPointsForMorph(candidates);

        const picked = new Array(count);
        const step = candidates.length / count;
        const jitter = Math.max(0.35, stride / sampleScale);

        for (let i = 0; i < count; i += 1) {
            const sourceIndex = Math.min(
                candidates.length - 1,
                Math.floor((i + 0.5) * step)
            );

            const source = candidates[sourceIndex];

            picked[i] = {
                x: source.x + (Math.random() - 0.5) * jitter,
                y: source.y + (Math.random() - 0.5) * jitter,
                r: source.r,
                g: source.g,
                b: source.b,
                a: source.a
            };
        }

        log("Extracted image " + label + " points.", {
            candidates: candidates.length,
            picked: picked.length,
            stride: stride,
            sampleCanvas: {
                width: sw,
                height: sh
            }
        });

        return picked;
    }

    function getContainRect(sourceW, sourceH, x, y, maxW, maxH) {
        const ratio = Math.min(maxW / sourceW, maxH / sourceH);
        const w = sourceW * ratio;
        const h = sourceH * ratio;

        return {
            x: x + (maxW - w) / 2,
            y: y + (maxH - h) / 2,
            w: w,
            h: h
        };
    }

    function sortPointsForMorph(points) {
        const cx = state.w / 2;
        const cy = state.h / 2;
        const ringSize = Math.max(12, Math.min(state.w, state.h) / 34);

        points.sort(function (a, b) {
            const ar = Math.floor(Math.hypot(a.x - cx, a.y - cy) / ringSize);
            const br = Math.floor(Math.hypot(b.x - cx, b.y - cy) / ringSize);

            if (ar !== br) {
                return ar - br;
            }

            const aa = Math.atan2(a.y - cy, a.x - cx);
            const ba = Math.atan2(b.y - cy, b.x - cx);

            return aa - ba;
        });
    }

    function createFallbackPoints(count, label) {
        const points = new Array(count);
        const cx = state.w / 2;
        const cy = state.h / 2;
        const radius = Math.min(state.w, state.h) * 0.28;

        for (let i = 0; i < count; i += 1) {
            const t = i / count;
            const angle = t * Math.PI * 2 * 8;
            const wave = label === "A" ? Math.sin(t * Math.PI * 14) : Math.cos(t * Math.PI * 18);
            const r = radius * (0.25 + 0.75 * t) + wave * 22;

            points[i] = {
                x: cx + Math.cos(angle) * r,
                y: cy + Math.sin(angle) * r,
                r: label === "A" ? 120 : 255,
                g: label === "A" ? 220 : 130,
                b: label === "A" ? 255 : 210,
                a: 230
            };
        }

        return points;
    }

    function createParticleData(count, pointsA, pointsB, preservePositions) {
        const old = state.particles;

        const p = {
            count: count,

            x: new Float32Array(count),
            y: new Float32Array(count),
            vx: new Float32Array(count),
            vy: new Float32Array(count),

            ax: new Float32Array(count),
            ay: new Float32Array(count),
            bx: new Float32Array(count),
            by: new Float32Array(count),

            ar: new Uint8ClampedArray(count),
            ag: new Uint8ClampedArray(count),
            ab: new Uint8ClampedArray(count),
            aa: new Uint8ClampedArray(count),

            br: new Uint8ClampedArray(count),
            bg: new Uint8ClampedArray(count),
            bb: new Uint8ClampedArray(count),
            ba: new Uint8ClampedArray(count),

            size: new Float32Array(count)
        };

        const sx = state.lastBuildW > 0 ? state.w / state.lastBuildW : 1;
        const sy = state.lastBuildH > 0 ? state.h / state.lastBuildH : 1;

        for (let i = 0; i < count; i += 1) {
            const a = pointsA[i % pointsA.length];
            const b = pointsB[i % pointsB.length];

            p.ax[i] = a.x;
            p.ay[i] = a.y;
            p.bx[i] = b.x;
            p.by[i] = b.y;

            p.ar[i] = a.r;
            p.ag[i] = a.g;
            p.ab[i] = a.b;
            p.aa[i] = a.a;

            p.br[i] = b.r;
            p.bg[i] = b.g;
            p.bb[i] = b.b;
            p.ba[i] = b.a;

            p.size[i] = 0.75 + Math.random() * 1.35;

            if (preservePositions && old && old.count > 0) {
                const j = i % old.count;

                p.x[i] = clamp(old.x[j] * sx, -80, state.w + 80);
                p.y[i] = clamp(old.y[j] * sy, -80, state.h + 80);
                p.vx[i] = old.vx[j] || 0;
                p.vy[i] = old.vy[j] || 0;
            } else {
                p.x[i] = a.x + (Math.random() - 0.5) * state.w * 0.16;
                p.y[i] = a.y + (Math.random() - 0.5) * state.h * 0.16;
                p.vx[i] = (Math.random() - 0.5) * 5;
                p.vy[i] = (Math.random() - 0.5) * 5;
            }
        }

        return p;
    }

    function animate(now) {
        requestAnimationFrame(animate);

        const dt = Math.min(0.04, Math.max(0.001, (now - state.lastFrameTime) / 1000));
        state.lastFrameTime = now;

        if (!state.particles) {
            drawIdleBackground();
            updateFps(now);
            return;
        }

        stepPhysics(dt, now / 1000);
        drawParticles();
        updateFps(now);
    }

    function stepPhysics(dt, time) {
        const p = state.particles;
        const frame = Math.min(2.2, dt * 60);
        const flow = state.flow;

        state.targetMix += (state.targetSide - state.targetMix) * Math.min(1, 0.022 * frame);
        const mix = smoothstep(state.targetMix);

        fillDensityGrid(p);

        const counts = state.grid.counts;
        const cols = state.grid.cols;
        const rows = state.grid.rows;
        const cellSize = state.grid.cellSize;

        const drag = Math.pow(0.89, frame);
        const attract = 0.032 * frame;
        const pressure = 0.012 * flow * frame;
        const turbulence = 0.23 * flow * frame;

        const pointerRadius = state.pointer.down ? 180 : 115;
        const pointerRadiusSq = pointerRadius * pointerRadius;

        for (let i = 0; i < p.count; i += 1) {
            const tx = p.ax[i] + (p.bx[i] - p.ax[i]) * mix;
            const ty = p.ay[i] + (p.by[i] - p.ay[i]) * mix;

            let x = p.x[i];
            let y = p.y[i];
            let vx = p.vx[i];
            let vy = p.vy[i];

            const dx = tx - x;
            const dy = ty - y;

            vx += dx * attract;
            vy += dy * attract;

            const cx = clampInt(1 + Math.floor(x / cellSize), 1, cols - 2);
            const cy = clampInt(1 + Math.floor(y / cellSize), 1, rows - 2);
            const gridIndex = cy * cols + cx;

            const densityLeft = counts[gridIndex - 1];
            const densityRight = counts[gridIndex + 1];
            const densityUp = counts[gridIndex - cols];
            const densityDown = counts[gridIndex + cols];

            vx += (densityLeft - densityRight) * pressure;
            vy += (densityUp - densityDown) * pressure;

            const noise =
                Math.sin(x * 0.013 + time * 1.7) +
                Math.cos(y * 0.017 - time * 1.35) +
                Math.sin((x + y) * 0.006 + time * 0.8);

            const angle = noise * Math.PI;

            vx += Math.cos(angle) * turbulence;
            vy += Math.sin(angle) * turbulence;

            if (state.pointer.active) {
                const pdx = x - state.pointer.x;
                const pdy = y - state.pointer.y;
                const d2 = pdx * pdx + pdy * pdy;

                if (d2 < pointerRadiusSq && d2 > 0.001) {
                    const d = Math.sqrt(d2);
                    const strength = (1 - d / pointerRadius) * (state.pointer.down ? 3.2 : 0.95) * frame;
                    vx += (pdx / d) * strength;
                    vy += (pdy / d) * strength;
                }
            }

            vx *= drag;
            vy *= drag;

            x += vx * frame;
            y += vy * frame;

            if (x < -30) {
                x = -30;
                vx *= -0.36;
            } else if (x > state.w + 30) {
                x = state.w + 30;
                vx *= -0.36;
            }

            if (y < -30) {
                y = -30;
                vy *= -0.36;
            } else if (y > state.h + 30) {
                y = state.h + 30;
                vy *= -0.36;
            }

            p.x[i] = x;
            p.y[i] = y;
            p.vx[i] = vx;
            p.vy[i] = vy;
        }
    }

    function fillDensityGrid(p) {
        const cellSize = state.grid.cellSize;
        const cols = Math.ceil(state.w / cellSize) + 2;
        const rows = Math.ceil(state.h / cellSize) + 2;
        const length = cols * rows;

        if (!state.grid.counts || state.grid.counts.length !== length) {
            state.grid.counts = new Uint16Array(length);
            state.grid.cols = cols;
            state.grid.rows = rows;

            log("Density grid rebuilt.", {
                cols: cols,
                rows: rows,
                cellSize: cellSize
            });
        }

        const counts = state.grid.counts;
        counts.fill(0);

        state.grid.cols = cols;
        state.grid.rows = rows;

        for (let i = 0; i < p.count; i += 1) {
            const cx = clampInt(1 + Math.floor(p.x[i] / cellSize), 1, cols - 2);
            const cy = clampInt(1 + Math.floor(p.y[i] / cellSize), 1, rows - 2);
            counts[cy * cols + cx] += 1;
        }
    }

    function drawIdleBackground() {
        if (state.w <= 0 || state.h <= 0) {
            return;
        }

        if (state.forceClear) {
            ctx.clearRect(0, 0, state.w, state.h);
            state.forceClear = false;
        }

        ctx.fillStyle = "rgba(4, 6, 16, 0.18)";
        ctx.fillRect(0, 0, state.w, state.h);
    }

    function drawParticles() {
        const p = state.particles;

        if (state.forceClear) {
            ctx.clearRect(0, 0, state.w, state.h);
            state.forceClear = false;
        }

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(3, 5, 14, 0.30)";
        ctx.fillRect(0, 0, state.w, state.h);

        const mix = smoothstep(state.targetMix);
        const renderSize = getRenderParticleSize();

        ctx.globalCompositeOperation = "lighter";

        for (let i = 0; i < p.count; i += 1) {
            const r = Math.round(p.ar[i] + (p.br[i] - p.ar[i]) * mix);
            const g = Math.round(p.ag[i] + (p.bg[i] - p.ag[i]) * mix);
            const b = Math.round(p.ab[i] + (p.bb[i] - p.ab[i]) * mix);
            const a = (p.aa[i] + (p.ba[i] - p.aa[i]) * mix) / 255;

            const size = p.size[i] * renderSize;
            const alpha = Math.min(0.88, Math.max(0.38, a * 0.76));

            ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + alpha.toFixed(3) + ")";
            ctx.fillRect(p.x[i] - size * 0.5, p.y[i] - size * 0.5, size, size);
        }

        ctx.globalCompositeOperation = "source-over";
    }

    function getRenderParticleSize() {
        const densityScale = Math.sqrt(5600 / Math.max(1, state.particleCount));
        return clamp(state.particleSizeBase * densityScale, 0.5, 20);
    }

    function addFluidBurst(multiplier) {
        const p = state.particles;

        if (!p) {
            warn("Fluid burst requested before particles exist.");
            return;
        }

        const cx = state.pointer.active ? state.pointer.x : state.w / 2;
        const cy = state.pointer.active ? state.pointer.y : state.h / 2;
        const radius = Math.min(state.w, state.h) * 0.42;
        const radiusSq = radius * radius;

        for (let i = 0; i < p.count; i += 1) {
            const dx = p.x[i] - cx;
            const dy = p.y[i] - cy;
            const d2 = dx * dx + dy * dy;

            if (d2 > radiusSq || d2 < 0.001) {
                continue;
            }

            const d = Math.sqrt(d2);
            const force = (1 - d / radius) * 10 * multiplier;

            p.vx[i] += (dx / d) * force + (Math.random() - 0.5) * 2.5;
            p.vy[i] += (dy / d) * force + (Math.random() - 0.5) * 2.5;
        }

        log("Fluid burst applied.", {
            x: Math.round(cx),
            y: Math.round(cy),
            multiplier: multiplier
        });
    }

    function resetParticlesToCurrentTarget() {
        const p = state.particles;

        if (!p) {
            warn("Reset requested before particles exist.");
            setStatus("Upload both images first.", "bad");
            return;
        }

        const mix = smoothstep(state.targetMix);

        for (let i = 0; i < p.count; i += 1) {
            const tx = p.ax[i] + (p.bx[i] - p.ax[i]) * mix;
            const ty = p.ay[i] + (p.by[i] - p.ay[i]) * mix;

            p.x[i] = tx + (Math.random() - 0.5) * 8;
            p.y[i] = ty + (Math.random() - 0.5) * 8;
            p.vx[i] = (Math.random() - 0.5) * 1.5;
            p.vy[i] = (Math.random() - 0.5) * 1.5;
        }

        state.forceClear = true;
        setStatus("Particles reset to the current image.", "good");
        log("Particles reset.");
    }

    function updateFps(now) {
        state.frameCounter += 1;

        const elapsed = now - state.fpsLastTime;

        if (elapsed < 650) {
            return;
        }

        const fps = Math.round((state.frameCounter * 1000) / elapsed);
        state.frameCounter = 0;
        state.fpsLastTime = now;

        if (state.particles) {
            els.perfText.textContent = fps + " fps • " + formatNumber(state.particleCount) + " particles";

            if (fps < 24 && state.particleCount > 3500 && !state.lowFpsWarned) {
                state.lowFpsWarned = true;

                warn("Low FPS detected. Reduce the particle count or fluid energy if animation feels slow.", {
                    fps: fps,
                    particles: state.particleCount,
                    flow: state.flow
                });
            }
        } else {
            els.perfText.textContent = fps + " fps";
        }
    }

    function updateControlLabels() {
        els.particleCountValue.textContent = formatNumber(getRequestedParticleCount());
        els.flowStrengthValue.textContent = Number(els.flowStrength.value).toFixed(2);
        els.particleSizeValue.textContent = Number(els.particleSize.value).toFixed(2);
    }

    function getRequestedParticleCount() {
        return clampInt(Number(els.particleCount.value) || 6000, 800, 12000);
    }

    function getRecommendedParticleCount() {
        const narrow = window.matchMedia("(max-width: 700px)").matches;
        const cores = navigator.hardwareConcurrency || 4;

        if (narrow) {
            return cores >= 8 ? 3600 : 2600;
        }

        if (cores >= 10) {
            return 7600;
        }

        if (cores >= 6) {
            return 6200;
        }

        return 4400;
    }

    function setStatus(message, tone) {
        els.statusPill.textContent = message;
        els.statusPill.dataset.tone = tone || "neutral";
    }

    function smoothstep(t) {
        const x = clamp(t, 0, 1);
        return x * x * (3 - 2 * x);
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function clampInt(value, min, max) {
        return Math.min(max, Math.max(min, Math.floor(value)));
    }

    function formatNumber(value) {
        return Number(value).toLocaleString();
    }

    init();
})();