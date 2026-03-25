import { createApp, ref, computed, watch, onMounted, nextTick } from 'https://unpkg.com/vue@3.3.4/dist/vue.esm-browser.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Color from "https://colorjs.io/dist/color.js";
import { generateHarmonies, arrangePalette } from './colorMath.js';

const App = {
    setup() {
        // State
        const lightness = ref(0.65);
        const chroma = ref(0.15);
        const hue = ref(210);
        const harmonyType = ref('split-complementary');
        const proportionRule = ref('60-30-10');
        const palette = ref([]);
        const textInputColor = ref('');
        const textInputFineTune = ref('');
        const copiedIndex = ref(null);
        const isDarkMode = ref(true);
        const selectedSwatchIndex = ref(null);
        const colorOverrides = ref({});

        // Image extraction state
        const isImageLoaded = ref(false);
        const imageSrc = ref('');
        const isImageExpanded = ref(false);
        const isDragging = ref(false);
        const isGraphDragging = ref(false);
        const isHarmonyConnected = ref(true);
        const isGrayscaleMode = ref(false);
        const grayscaleImageSrc = ref('');
        const startX = ref(0);
        const startY = ref(0);
        const currentX = ref(0);
        const currentY = ref(0);

        // Computed
        const baseColorBase = computed(() => {
            return new Color(`oklch(${lightness.value} ${chroma.value} ${hue.value})`);
        });

        const baseCssColor = computed(() => {
            return baseColorBase.value.toString({ format: "oklch" });
        });

        const baseHex = computed(() => {
            return baseColorBase.value.to("srgb").toString({ format: "hex" }).toUpperCase();
        });

        const selectionBoxStyle = computed(() => {
            if (!isDragging.value && startX.value === currentX.value) return { display: 'none' };
            const left = Math.min(startX.value, currentX.value);
            const top = Math.min(startY.value, currentY.value);
            const width = Math.abs(currentX.value - startX.value);
            const height = Math.abs(currentY.value - startY.value);
            return {
                left: left + 'px',
                top: top + 'px',
                width: width + 'px',
                height: height + 'px',
                display: 'block'
            };
        });
 
        const aiPrompt = computed(() => {
            if (!palette.value || palette.value.length === 0) return "";
            let prompt = "Create a cinematic close up shot that uses these colours ";
            const parts = palette.value.map(item => `${item.hex} ${Math.round(item.proportion)}% of the composition`);
            
            if (parts.length > 1) {
                const last = parts.pop();
                prompt += parts.join(", ") + " and " + last;
            } else {
                prompt += parts[0];
            }
            return prompt;
        });
 
        const isPromptCopied = ref(false);
 
        function copyPrompt() {
            const success = () => {
                isPromptCopied.value = true;
                setTimeout(() => { isPromptCopied.value = false; }, 2000);
            };
 
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(aiPrompt.value).then(success).catch(() => fallbackCopy(aiPrompt.value, success));
            } else {
                fallbackCopy(aiPrompt.value, success);
            }
        }

        // Watchers
        // Clear overrides when the underlying mathematical rules change
        watch([lightness, chroma, hue, harmonyType, proportionRule], () => {
            colorOverrides.value = {}; 
            updatePalette();
        }, { immediate: true });

        watch(isDarkMode, (newVal) => {
            if (newVal) {
                document.body.classList.remove('light-theme');
            } else {
                document.body.classList.add('light-theme');
            }
            nextTick(() => {
                if(typeof drawThreeGraph !== 'undefined') drawThreeGraph();
            });
        }, { immediate: true });

        watch(baseHex, (newHex) => {
            if (document.activeElement?.id !== 'hexInput') {
                textInputColor.value = newHex;
            }
        }, { immediate: true });

        // Sync fine-tune text input when selection changes or color updates
        watch([selectedSwatchIndex, palette], () => {
            if (selectedSwatchIndex.value !== null && palette.value[selectedSwatchIndex.value]) {
                if (document.activeElement?.id !== 'fineTuneInput') {
                    textInputFineTune.value = palette.value[selectedSwatchIndex.value].hex;
                }
            }
        }, { deep: true });

        // Scroll to analyzer when loaded or expanded
        watch([isImageLoaded, isImageExpanded], ([loaded, expanded]) => {
            if (loaded) {
                nextTick(() => {
                    const el = document.getElementById('extraction-card');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
            }
        });

        function parseTextInput() {
            try {
                // Parse using Color.js
                const parsed = new Color(textInputColor.value).to("oklch");
                // Update L, C, H
                const l = parsed.coords[0], c = parsed.coords[1], h = parsed.coords[2];
                lightness.value = (typeof l !== 'number' || isNaN(l)) ? 0 : l;
                chroma.value = (typeof c !== 'number' || isNaN(c)) ? 0 : c;
                hue.value = (typeof h !== 'number' || isNaN(h)) ? 0 : h; 
            } catch (e) {
                // Invalid color format, just revert to current baseHex
                textInputColor.value = baseHex.value;
            }
        }

        function copyHex(hex, index) {
            const success = () => {
                copiedIndex.value = index;
                setTimeout(() => {
                    if (copiedIndex.value === index) {
                        copiedIndex.value = null;
                    }
                }, 2000);
            };

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(hex).then(success).catch(err => {
                    console.error('Modern clipboard copy failed:', err);
                    fallbackCopy(hex, success);
                });
            } else {
                fallbackCopy(hex, success);
            }
        }

        function fallbackCopy(text, callback) {
            try {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                textArea.style.top = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (successful) callback();
            } catch (err) {
                console.error('Fallback copy failed:', err);
            }
        }

        function toggleTheme() {
            isDarkMode.value = !isDarkMode.value;
        }

        function selectSwatch(index) {
            if (selectedSwatchIndex.value === index) {
                selectedSwatchIndex.value = null;
            } else {
                selectedSwatchIndex.value = index;
            }
        }

        function resetSelectedColor() {
            if (selectedSwatchIndex.value !== null) {
                delete colorOverrides.value[selectedSwatchIndex.value];
                updatePalette();
            }
        }

        const hasOverride = computed(() => {
            if (selectedSwatchIndex.value === null) return false;
            return !!colorOverrides.value[selectedSwatchIndex.value];
        });

        const fineTuneL = computed({
            get() {
                if (selectedSwatchIndex.value === null) return 0;
                let c = colorOverrides.value[selectedSwatchIndex.value] || palette.value[selectedSwatchIndex.value].colorObj;
                let l = c.coords[0];
                return (typeof l !== 'number' || isNaN(l)) ? 0 : l;
            },
            set(val) { applyOverride(0, val); }
        });

        const fineTuneC = computed({
            get() {
                if (selectedSwatchIndex.value === null) return 0;
                let c = colorOverrides.value[selectedSwatchIndex.value] || palette.value[selectedSwatchIndex.value].colorObj;
                let ch = c.coords[1];
                return (typeof ch !== 'number' || isNaN(ch)) ? 0 : ch;
            },
            set(val) { applyOverride(1, val); }
        });

        const fineTuneH = computed({
            get() {
                if (selectedSwatchIndex.value === null) return 0;
                let c = colorOverrides.value[selectedSwatchIndex.value] || palette.value[selectedSwatchIndex.value].colorObj;
                let h = c.coords[2];
                return (typeof h !== 'number' || isNaN(h)) ? 0 : h;
            },
            set(val) { applyOverride(2, val); }
        });

        function applyOverride(coordIndex, val) {
            let idx = selectedSwatchIndex.value;
            if (idx === null) return;
            if (!colorOverrides.value[idx]) {
                // Clone the underlying mathematically correct color
                colorOverrides.value[idx] = new Color(palette.value[idx].colorObj.toString({format: "oklch"}));
            }
            colorOverrides.value[idx].coords[coordIndex] = val;
            updatePalette();
        }

        function parseFineTuneInput() {
            if (selectedSwatchIndex.value === null) return;
            try {
                const newCol = new Color(textInputFineTune.value);
                const oklchCol = newCol.to("oklch");
                colorOverrides.value[selectedSwatchIndex.value] = oklchCol;
                updatePalette();
            } catch (e) {
                console.error("Invalid fine-tune color format:", e);
                // Reset to current hex on error
                textInputFineTune.value = palette.value[selectedSwatchIndex.value].hex;
            }
        }

        // --- Image Extraction Methods ---
        function triggerFileUpload() {
            document.getElementById('camera-input').click();
        }

        function handleImageUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                imageSrc.value = e.target.result;
                isImageLoaded.value = true;
                isGrayscaleMode.value = false;
                grayscaleImageSrc.value = ''; // reset, will be generated lazily
                startX.value = currentX.value = startY.value = currentY.value = 0;
                // Pre-generate the greyscale image after the img element renders
                nextTick(() => generateOklchGrayscale());
            };
            reader.readAsDataURL(file);
        }

        /**
         * Converts the loaded image to perceptual greyscale using the OKLab L channel.
         * Each pixel's sRGB values are gamma-decoded → converted to LMS cone space → 
         * cube-rooted → projected to OKLab L, which equals OKLCH Lightness.
         * This is the gold standard for luminance-preserving greyscale conversion.
         */
        function generateOklchGrayscale() {
            const img = document.getElementById('source-image-sidebar') ||
                        document.getElementById('source-image-expanded');
            if (!img || !img.naturalWidth) return;

            const w = img.naturalWidth;
            const h = img.naturalHeight;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;

            // OKLab M1: linear sRGB → LMS
            const M1 = [
                [0.4122214708, 0.5363325363, 0.0514459929],
                [0.2119034982, 0.6806995451, 0.1073969566],
                [0.0883024619, 0.2817188376, 0.6299787005]
            ];
            // OKLab M2 row 0 only (we just need L)
            const M2L = [0.2104542553, 0.7936177850, -0.0040720468];

            // sRGB gamma decode (IEC 61966-2-1)
            function toLinear(v) {
                const c = v / 255;
                return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            }

            // sRGB gamma encode (linear → sRGB byte)
            function toSrgb(linear) {
                const c = Math.max(0, Math.min(1, linear));
                const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
                return Math.round(s * 255);
            }

            for (let i = 0; i < data.length; i += 4) {
                const rL = toLinear(data[i]);
                const gL = toLinear(data[i + 1]);
                const bL = toLinear(data[i + 2]);

                // Linear RGB → LMS
                const l = M1[0][0]*rL + M1[0][1]*gL + M1[0][2]*bL;
                const m = M1[1][0]*rL + M1[1][1]*gL + M1[1][2]*bL;
                const s = M1[2][0]*rL + M1[2][1]*gL + M1[2][2]*bL;

                // Cube root (non-linear compression)
                const lR = Math.cbrt(l);
                const mR = Math.cbrt(m);
                const sR = Math.cbrt(s);

                // OKLab L (= OKLCH Lightness, range 0–1)
                const L = M2L[0]*lR + M2L[1]*mR + M2L[2]*sR;

                // For a neutral grey, M1 row sums ≈ 1.0 and M2L sum ≈ 1.0,
                // so L ≈ cbrt(linearGrey), therefore linearGrey = L³
                const linearGrey = L * L * L;

                // Gamma-encode back to sRGB so the displayed pixel
                // has the SAME perceived lightness as the original color
                const grey = toSrgb(linearGrey);
                data[i] = grey;
                data[i + 1] = grey;
                data[i + 2] = grey;
                // alpha unchanged
            }

            ctx.putImageData(imageData, 0, 0);
            grayscaleImageSrc.value = canvas.toDataURL('image/png');
        }

        function toggleGrayscale() {
            if (!grayscaleImageSrc.value) generateOklchGrayscale();
            isGrayscaleMode.value = !isGrayscaleMode.value;
        }

        function downloadGrayscaleImage() {
            if (!grayscaleImageSrc.value) return;
            const link = document.createElement('a');
            link.download = `chromamath-oklch-grayscale-${Date.now()}.png`;
            link.href = grayscaleImageSrc.value;
            link.click();
        }

        // Computed src to display in the image workspace
        const displayImageSrc = computed(() =>
            isGrayscaleMode.value ? grayscaleImageSrc.value : imageSrc.value
        );

        function getCoords(e) {
            const container = e.currentTarget;
            const rect = container.getBoundingClientRect();
            let clientX = e.clientX;
            let clientY = e.clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            }
            let x = clientX - rect.left;
            let y = clientY - rect.top;
            return {
                x: Math.max(0, Math.min(x, rect.width)),
                y: Math.max(0, Math.min(y, rect.height))
            };
        }

        const activeImgId = computed(() => isImageExpanded.value ? 'source-image-expanded' : 'source-image-sidebar');

        function onDragStart(e) {
            isDragging.value = true;
            const coords = getCoords(e);
            startX.value = currentX.value = coords.x;
            startY.value = currentY.value = coords.y;
        }

        function onDragMove(e) {
            if (!isDragging.value) return;
            const coords = getCoords(e);
            currentX.value = coords.x;
            currentY.value = coords.y;
        }

        function onDragEnd() {
            if (!isDragging.value) return;
            isDragging.value = false;

            const left = Math.min(startX.value, currentX.value);
            const top = Math.min(startY.value, currentY.value);
            let width = Math.abs(currentX.value - startX.value);
            let height = Math.abs(currentY.value - startY.value);

            if (width < 2 && height < 2) {
                width = 10; height = 10;
            }
            processArea(left, top, width, height);
        }

        function processArea(left, top, width, height) {
            const img = document.getElementById(activeImgId.value);
            if (!img) return;

            // Robust guards for tiny or zero selections
            if (width < 1) width = 1;
            if (height < 1) height = 1;

            const rect = img.getBoundingClientRect();
            const scaleX = img.naturalWidth / rect.width;
            const scaleY = img.naturalHeight / rect.height;

            const finalWidth = Math.max(1, Math.round(width * scaleX));
            const finalHeight = Math.max(1, Math.round(height * scaleY));

            const canvas = document.createElement('canvas');
            canvas.width = finalWidth;
            canvas.height = finalHeight;
            const ctx = canvas.getContext('2d');

            ctx.drawImage(img, left * scaleX, top * scaleY, width * scaleX, height * scaleY, 0, 0, canvas.width, canvas.height);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

            let r = 0, g = 0, b = 0;
            for (let i = 0; i < data.length; i += 4) {
                r += data[i]; g += data[i+1]; b += data[i+2];
            }
            const count = data.length / 4;
            const avgR = Math.round(r / count);
            const avgG = Math.round(g / count);
            const avgB = Math.round(b / count);

            const rgbStr = `rgb(${avgR}, ${avgG}, ${avgB})`;

            // In connected mode, set the base color (all harmony colors will re-derive from it)
            if (isHarmonyConnected.value) {
                try {
                    const extracted = new Color(rgbStr).to("oklch");
                    let l = extracted.coords[0];
                    let c = extracted.coords[1];
                    let h = extracted.coords[2];

                    // If a specific swatch is selected, back-calculate base hue
                    // so the extracted color lands on that harmony position
                    if (selectedSwatchIndex.value !== null && selectedSwatchIndex.value > 0) {
                        const harmonyOffsets = {
                            'complementary':      [0, 180],
                            'split-complementary':[0, 150, 210],
                            'triadic':            [0, 120, 240],
                            'analogous':          [0, 30, -30],
                        };
                        const offsets = harmonyOffsets[harmonyType.value] || [0];
                        const offset = offsets[selectedSwatchIndex.value] || 0;
                        // Back-calculate: base_hue = extracted_hue - offset
                        h = ((h - offset) % 360 + 360) % 360;
                    }

                    const isNum = v => typeof v === 'number' && !isNaN(v);
                    lightness.value = isNum(l) ? l : lightness.value;
                    chroma.value    = isNum(c) ? c : chroma.value;
                    hue.value       = isNum(h) ? h : hue.value;
                    textInputColor.value = rgbStr;
                } catch(e) {
                    console.error("Could not parse extracted color:", e);
                }
            } else if (selectedSwatchIndex.value !== null) {
                // Detached mode, swatch selected: override just that swatch
                textInputFineTune.value = rgbStr;
                parseFineTuneInput();
            } else {
                // Detached mode, no swatch: update base
                textInputColor.value = rgbStr;
                parseTextInput();
            }
        }

        function updatePalette() {
            let colors = generateHarmonies(lightness.value, chroma.value, hue.value, harmonyType.value);
            
            // Apply Manual Overrides
            colors = colors.map((col, i) => {
                if (colorOverrides.value[i]) {
                    return colorOverrides.value[i]; 
                }
                return col;
            });

            // 2. Map metrics, APCA, proportions, focal focus
            palette.value = arrangePalette(colors, proportionRule.value);
            
            // 3. Update Graphics
            nextTick(() => {
                drawTreemap();
                drawTonalGraph();
                drawThreeGraph();
            });
        }

        // Helpers
        const apcaClass = (value) => {
            if (value >= 75) return 'apca-high';
            if (value >= 45) return 'apca-mid';
            return 'apca-low';
        };

        function exportPalette() {
            const pal = palette.value;
            if (!pal || pal.length === 0) return;

            const W = 1440, H = 560;
            const HEADER = 80, SWATCH_H = 280, INFO_H = 200;
            const PAD = 24;

            const canvas = document.createElement('canvas');
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d');

            // Background
            ctx.fillStyle = '#0d0d1a';
            ctx.fillRect(0, 0, W, H);

            // Subtle grid lines
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 1;
            for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
            for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

            // Title
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = 'bold 26px Inter, -apple-system, sans-serif';
            ctx.fillText('ChromaMath  ·  Generated Palette', PAD, 52);

            const HarmonyLabel = harmonyType.value.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            ctx.font = '16px Inter, -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.textAlign = 'right';
            ctx.fillText(`${HarmonyLabel}  ·  ${proportionRule.value}  ·  ${now}`, W - PAD, 52);
            ctx.textAlign = 'left';

            // Compute total proportion for swatch widths
            const totalProp = pal.reduce((s, p) => s + p.proportion, 0);
            let curX = 0;
            const INNER_W = W;

            pal.forEach((item, idx) => {
                const colW = Math.round((item.proportion / totalProp) * INNER_W);

                // Color swatch
                ctx.fillStyle = item.css;
                ctx.fillRect(curX, HEADER, colW, SWATCH_H);

                // Proportion label centered in bar
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(curX + colW * 0.3, HEADER + SWATCH_H - 52, colW * 0.4, 36);

                ctx.fillStyle = '#fff';
                ctx.font = 'bold 20px Inter, -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${Math.round(item.proportion)}%`, curX + colW / 2, HEADER + SWATCH_H - 26);
                ctx.textAlign = 'left';

                // Info panel per color
                const infoTop = HEADER + SWATCH_H + 24;
                const infoCX = curX + PAD;

                // Color label
                ctx.fillStyle = item.css;
                ctx.fillRect(infoCX, infoTop, 14, 14);
                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.lineWidth = 1;
                ctx.strokeRect(infoCX, infoTop, 14, 14);

                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.font = 'bold 18px Inter, -apple-system, sans-serif';
                ctx.fillText(idx === 0 ? 'Base' : `Color ${idx + 1}`, infoCX + 22, infoTop + 12);

                // Hex
                ctx.fillStyle = 'rgba(0,255,204,0.9)';
                ctx.font = 'bold 16px "Courier New", monospace';
                ctx.fillText(item.hex.toUpperCase(), infoCX, infoTop + 44);

                // RGB
                const rgbCol = new Color(item.css).to('srgb');
                const rVal = Math.round(rgbCol.coords[0] * 255);
                const gVal = Math.round(rgbCol.coords[1] * 255);
                const bVal = Math.round(rgbCol.coords[2] * 255);
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.font = '14px "Courier New", monospace';
                ctx.fillText(`rgb(${rVal}, ${gVal}, ${bVal})`, infoCX, infoTop + 68);

                // L·C·H
                const l = item.colorObj.coords[0].toFixed(2);
                const c = item.colorObj.coords[1].toFixed(3);
                const h = (item.colorObj.coords[2] || 0).toFixed(1);
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fillText(`oklch(${l}  ${c}  ${h}°)`, infoCX, infoTop + 90);

                curX += colW;
            });

            // Divider between swatch and info
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(0, HEADER + SWATCH_H, W, 1);

            // Bottom border
            ctx.fillStyle = 'rgba(0,255,204,0.25)';
            ctx.fillRect(0, H - 3, W, 3);

            // Download
            const link = document.createElement('a');
            link.download = `chromamath-palette-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }

        // Graphing Context (D3)
        const initSvg = (selector, clear = true) => {
            const container = document.querySelector(selector);
            if (!container) return null;
            
            const width = container.clientWidth;
            const height = container.clientHeight;
            
            let svg = d3.select(selector).select('svg');
            if (svg.empty()) {
                svg = d3.select(selector).append('svg')
                    .attr('width', '100%')
                    .attr('height', '100%');
            } else if (clear) {
                svg.selectAll('*').remove();
            }
            
            svg.attr('viewBox', `0 0 ${width} ${height}`)
               .attr('preserveAspectRatio', 'xMidYMid meet');
                
            return { svg, width, height };
        };

        function drawTreemap() {
            const ctx = initSvg('#treemap-chart');
            if(!ctx) return;
            const { svg, width, height } = ctx;

            // Prepare hierarchy data for D3 Treemap
            const data = {
                name: "palette",
                children: palette.value.map((p, i) => ({
                    name: `Color ${i+1}`,
                    value: p.proportion,
                    css: p.css,
                    isFocal: p.isFocal,
                    hex: p.hex
                }))
            };

            const root = d3.hierarchy(data).sum(d => d.value);
            
            d3.treemap()
                .size([width, height])
                .padding(2)(root);

            const nodes = svg.selectAll(".treemap-node")
                .data(root.leaves())
                .enter()
                .append("g")
                .attr("class", "treemap-node")
                .attr("transform", d => `translate(${d.x0},${d.y0})`);

            nodes.append("rect")
                .attr("width", d => d.x1 - d.x0)
                .attr("height", d => d.y1 - d.y0)
                .attr("fill", d => d.data.css)
                .attr("rx", 4)
                .attr("stroke", d => d.data.isFocal ? "#fff" : "none")
                .attr("stroke-width", d => d.data.isFocal ? 3 : 0);

            nodes.append("text")
                .attr("x", 8)
                .attr("y", 20)
                .text(d => `${d.data.value.toFixed(1)}%`);
                
            nodes.append("text")
                .attr("x", 8)
                .attr("y", 38)
                .text(d => d.data.isFocal ? '★ FOCAL' : '');
        }

        function drawTonalGraph() {
            const ctx = initSvg('#tonal-chart', false); // Don't clear!
            if(!ctx) return;
            const { svg, width, height } = ctx;
            
            const margin = {top: 20, right: 30, bottom: 30, left: 40};
            const w = width - margin.left - margin.right;
            const h = height - margin.top - margin.bottom;

            // Ensure main group exists
            let g = svg.select(".main-g");
            if (g.empty()) {
                g = svg.append("g").attr("class", "main-g").attr("transform", `translate(${margin.left},${margin.top})`);
                g.append("path").attr("class", "tonal-area");
                g.append("path").attr("class", "tonal-line");
                g.append("g").attr("class", "y-axis");
                g.append("g").attr("class", "x-axis-line").attr("transform", `translate(0,${h})`).append("line");
            }

            // Use the palette in original order (Base color first)
            const graphData = [...palette.value];

            const x = d3.scalePoint()
                .domain(graphData.map((_, i) => i === 0 ? "Base" : `C${i}`))
                .range([0, w])
                .padding(0.5);

            const y = d3.scaleLinear()
                .domain([0, 1]) // Lightness bounds 0 to 1
                .range([h, 0]);

            // Area and Line generators
            const area = d3.area()
                .x((d, i) => x(i === 0 ? "Base" : `C${i}`))
                .y0(h)
                .y1(d => y(d.l))
                .curve(d3.curveMonotoneX);

            const line = d3.line()
                .x((d, i) => x(i === 0 ? "Base" : `C${i}`))
                .y(d => y(d.l))
                .curve(d3.curveMonotoneX);

            // Ensure gradient def exists
            if (svg.select('#tonal-gradient').empty()) {
                const defs = svg.append('defs');
                const gradient = defs.append('linearGradient')
                    .attr('id', 'tonal-gradient')
                    .attr('x1', '0%').attr('y1', '0%')
                    .attr('x2', '0%').attr('y2', '100%');
                gradient.append('stop').attr('offset', '0%').style('stop-color', 'rgba(255,255,255,0.2)');
                gradient.append('stop').attr('offset', '100%').style('stop-color', 'rgba(255,255,255,0)');
            }

            // Draw Area path
            g.select(".tonal-area").datum(graphData).attr("d", area);
            // Draw Line path
            g.select(".tonal-line").datum(graphData).attr("d", line);

            // Define Drag Behavior — optimistic visual update during drag, commit on end
            let dragCurrentL = 0; // track current drag lightness in closure
            const drag = d3.drag()
                .on("start", function(event, d) {
                    isGraphDragging.value = true;
                    dragCurrentL = d.l;
                    d3.select(this).raise().attr("stroke", "#00ffcc");
                })
                .on("drag", function(event, d) {
                    const newL = Math.max(0, Math.min(1, y.invert(event.y)));
                    dragCurrentL = newL;
                    const i = graphData.indexOf(d);
                    if (i < 0) return;

                    if (isHarmonyConnected.value) {
                        // Move ALL points to the same lightness in the graph
                        g.selectAll(".tonal-point").attr("cy", y(newL));
                        // Flatten line/area to show all connected
                        g.select(".tonal-area").attr("d", () => {
                            const pts = graphData.map((_, idx) => [x(idx === 0 ? "Base" : `C${idx}`), y(newL)]);
                            return `M${pts.map(p => p.join(',')).join('L')} L${pts[pts.length-1][0]},${h} L${pts[0][0]},${h} Z`;
                        });
                        g.select(".tonal-line").attr("d", () => {
                            const pts = graphData.map((_, idx) => [x(idx === 0 ? "Base" : `C${idx}`), y(newL)]);
                            return `M${pts.map(p => p.join(',')).join('L')}`;
                        });
                    } else {
                        // Detached: only move this point
                        d3.select(this).attr("cy", y(newL));
                        // Update curve using current data but override this point's y
                        const tempArea = d3.area()
                            .x((d2, i2) => x(i2 === 0 ? "Base" : `C${i2}`))
                            .y0(h)
                            .y1((d2, i2) => i2 === i ? y(newL) : y(d2.l))
                            .curve(d3.curveMonotoneX);
                        const tempLine = d3.line()
                            .x((d2, i2) => x(i2 === 0 ? "Base" : `C${i2}`))
                            .y((d2, i2) => i2 === i ? y(newL) : y(d2.l))
                            .curve(d3.curveMonotoneX);
                        g.select(".tonal-area").datum(graphData).attr("d", tempArea);
                        g.select(".tonal-line").datum(graphData).attr("d", tempLine);
                    }
                })
                .on("end", function(event, d) {
                    const i = graphData.indexOf(d);
                    d3.select(this).attr("stroke", "#fff");
                    isGraphDragging.value = false;

                    if (i < 0) return;

                    if (isHarmonyConnected.value) {
                        // Setting lightness.value fires the watcher, which clears overrides
                        // and re-generates ALL harmony colors with the new base lightness
                        lightness.value = dragCurrentL;
                    } else {
                        // Detached: surgical override for just this color
                        if (i === 0) {
                            lightness.value = dragCurrentL;
                        } else {
                            const override = palette.value[i].colorObj.clone();
                            override.coords[0] = dragCurrentL;
                            colorOverrides.value[i] = override;
                            updatePalette();
                        }
                    }
                });

            // Bind Points with enter/update/exit pattern
            const circles = g.selectAll(".tonal-point").data(graphData);

            circles.enter().append("circle")
                .attr("class", "tonal-point")
                .attr("r", 20)
                .attr("stroke", "#fff")
                .merge(circles)
                .attr("cx", (d, i) => x(i === 0 ? "Base" : `C${i}`))
                .attr("cy", d => y(d.l))
                .attr("fill", d => d.css)
                .call(drag);

            circles.exit().remove();

            // Update Axes
            const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d => d.toFixed(1));
            g.select(".y-axis")
                .call(yAxis)
                .select(".domain").attr("stroke", "rgba(255,255,255,0.2)");
                
            g.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.1)");
            g.selectAll(".tick text").attr("fill", "rgba(255,255,255,0.5)");

            g.select(".x-axis-line line")
                .attr("x1", 0).attr("x2", w)
                .attr("stroke", "rgba(255,255,255,0.2)");
        }

        // Graphing Context (Three.js)
        let scene, camera, renderer, controls, pointsGroup, wheelMesh, wheelTex, wheelCtx;
        let animationFrameId;

        const createTextSprite = (message, colorHex) => {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.font = 'bold 36px Inter, sans-serif';
            ctx.fillStyle = colorHex;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(message, 256, 64);
            
            const texture = new THREE.CanvasTexture(canvas);
            texture.minFilter = THREE.LinearFilter;
            const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.8 });
            const sprite = new THREE.Sprite(material);
            sprite.scale.set(1.5, 0.375, 1);
            return sprite;
        };

        const createHueWheelTexture = () => {
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            wheelCtx = canvas.getContext('2d');
            wheelTex = new THREE.CanvasTexture(canvas);
            return wheelTex;
        };

        const updateHueWheelTexture = (lVal, cVal) => {
            if (!wheelCtx) return;
            const size = 512;
            const cx = size/2;
            const cy = size/2;
            
            wheelCtx.clearRect(0, 0, size, size);
            
            // 0 start angle
            const gradient = wheelCtx.createConicGradient(0, cx, cy); 
            for(let deg = 0; deg <= 360; deg += 10) {
                // Use the user's current L and a reasonable reference C if current C is 0
                const displayC = Math.max(cVal, 0.1); 
                let cObj = new Color("oklch", [lVal, displayC, deg]);
                gradient.addColorStop(deg / 360, cObj.toString({format: "hex"}));
            }
            
            wheelCtx.fillStyle = gradient;
            wheelCtx.beginPath();
            wheelCtx.arc(cx, cy, size/2, 0, Math.PI * 2);
            wheelCtx.arc(cx, cy, size/2 * 0.8, 0, Math.PI * 2, true);
            wheelCtx.fill();
            
            wheelTex.needsUpdate = true;
        };

        const initThreeJS = () => {
            const container = document.getElementById('three-chart');
            if (!container || scene) return;

            scene = new THREE.Scene();
            
            const w = container.clientWidth;
            const h = container.clientHeight;
            
            camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
            camera.position.set(3, 2, 3);

            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(w, h);
            renderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(renderer.domElement);

            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            
            // Lighting
            scene.add(new THREE.AmbientLight(0xffffff, 0.8));
            const dl = new THREE.DirectionalLight(0xffffff, 0.5);
            dl.position.set(2, 5, 2);
            scene.add(dl);

            // Base Grid (Lightness = 0)
            const gridHelper = new THREE.GridHelper(2, 20, 0x888888, 0x444444);
            gridHelper.material.transparent = true;
            gridHelper.material.opacity = 0.2;
            scene.add(gridHelper);

            // Central Vertical L Axis (0 to 1 mapped to 0 to 2 for better viz)
            const axisMat = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 });
            const axisGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 2, 0)
            ]);
            scene.add(new THREE.Line(axisGeo, axisMat));

            // Axis Labels
            const labelColor = '#888888';
            const lblL = createTextSprite("Lightness (Y)", labelColor);
            lblL.position.set(0, 2.2, 0);
            scene.add(lblL);

            const lblC = createTextSprite("Chroma (Radius)", labelColor);
            lblC.position.set(1.5, 0, 0);
            scene.add(lblC);

            const lblH = createTextSprite("Hue (Angle)", labelColor);
            lblH.position.set(0, 0.1, 1.5);
            scene.add(lblH);

            // Hue Reference Wheel on Ground Plane
            const wTex = createHueWheelTexture();
            const wheelGeo = new THREE.PlaneGeometry(1, 1);
            const wheelMat = new THREE.MeshBasicMaterial({ 
                map: wTex, 
                transparent: true, 
                opacity: 0.6, 
                side: THREE.DoubleSide, 
                depthWrite: false 
            });
            wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
            wheelMesh.rotation.x = -Math.PI / 2;
            wheelMesh.rotation.z = Math.PI / 2; // Aligns Red (Hue 0) roughly with +X axis.
            scene.add(wheelMesh);

            pointsGroup = new THREE.Group();
            scene.add(pointsGroup);

            const animate = () => {
                animationFrameId = requestAnimationFrame(animate);
                controls.update();
                pointsGroup.children.forEach(child => {
                    if (child.userData.isRing) {
                        child.lookAt(camera.position);
                    }
                });
                renderer.render(scene, camera);
            };
            animate();
        };

        const drawThreeGraph = () => {
            if (!scene) initThreeJS();
            if (!pointsGroup) return;

            // Update Dynamic Wheel
            if (wheelMesh) {
                const isNum = v => typeof v === 'number' && !isNaN(v);
                const lVal = lightness.value;
                const cVal = chroma.value;
                const y = isNum(lVal) ? lVal * 2 : 0;
                const radius = isNum(cVal) ? cVal * 8 : 0; 
                
                wheelMesh.position.y = 0; // Pin to ground plane
                // Base size + chroma expansion
                const s = 1 + radius; 
                wheelMesh.scale.set(s, s, 1);
                
                updateHueWheelTexture(lVal, cVal);
            }

            while(pointsGroup.children.length > 0) {
                const child = pointsGroup.children.pop();
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
                pointsGroup.remove(child);
            }

            palette.value.forEach(p => {
                const l = p.colorObj.coords[0];
                const c = p.colorObj.coords[1];
                const h = p.colorObj.coords[2] || 0;
                
                const hRad = h * (Math.PI / 180);
                
                const isNum = v => typeof v === 'number' && !isNaN(v);
                const y = isNum(l) ? l * 2 : 0;
                const radius = isNum(c) ? c * 4 : 0;
                const x = radius * Math.cos(hRad);
                const z = radius * Math.sin(hRad);
                
                const geo = new THREE.SphereGeometry(0.08, 32, 32);
                const mat = new THREE.MeshPhysicalMaterial({
                    color: new THREE.Color(p.hex),
                    emissive: new THREE.Color(p.hex),
                    emissiveIntensity: 0.2,
                    roughness: 0.1,
                    metalness: 0.1
                });
                const sphere = new THREE.Mesh(geo, mat);
                sphere.position.set(x, y, z);
                pointsGroup.add(sphere);

                const lineGeo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, y, 0),
                    new THREE.Vector3(x, y, z)
                ]);
                const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(p.hex), transparent: true, opacity: 0.4 });
                pointsGroup.add(new THREE.Line(lineGeo, lineMat));

                if (p.isFocal) {
                    const ringGeo = new THREE.RingGeometry(0.12, 0.15, 32);
                    const ringMat = new THREE.MeshBasicMaterial({ color: isDarkMode.value ? 0xffffff : 0x000000, side: THREE.DoubleSide });
                    const ring = new THREE.Mesh(ringGeo, ringMat);
                    ring.position.set(x, y, z);
                    ring.userData.isRing = true;
                    pointsGroup.add(ring);
                }
            });
        };

        // Handle window resize dynamically to re-render charts
        onMounted(() => {
            window.addEventListener('resize', () => {
                drawTreemap();
                drawTonalGraph();
                if (camera && renderer) {
                    const container = document.getElementById('three-chart');
                    if (container) {
                        camera.aspect = container.clientWidth / container.clientHeight;
                        camera.updateProjectionMatrix();
                        renderer.setSize(container.clientWidth, container.clientHeight);
                    }
                }
            });
            nextTick(() => {
                initThreeJS();
            });

            window.addEventListener('mouseup', onDragEnd);
            window.addEventListener('touchend', onDragEnd);
        });

        return {
            lightness,
            chroma,
            hue,
            harmonyType,
            proportionRule,
            palette,
            baseCssColor,
            baseHex,
            apcaClass,
            textInputColor,
            parseTextInput,
            copyHex,
            copiedIndex,
            isDarkMode,
            toggleTheme,
            selectedSwatchIndex,
            selectSwatch,
            fineTuneL,
            fineTuneC,
            fineTuneH,
            resetSelectedColor,
            hasOverride,
            textInputFineTune,
            parseFineTuneInput,
            isImageLoaded,
            imageSrc,
            isImageExpanded,
            selectionBoxStyle,
            triggerFileUpload,
            handleImageUpload,
            onDragStart,
            onDragMove,
            onDragEnd,
            aiPrompt,
            isPromptCopied,
            isHarmonyConnected,
            isGrayscaleMode,
            grayscaleImageSrc,
            displayImageSrc,
            toggleGrayscale,
            downloadGrayscaleImage,
            copyPrompt,
            exportPalette
        };
    }
};

createApp(App).mount('#app');
