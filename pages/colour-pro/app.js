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
                lightness.value = isNaN(parsed.coords[0]) ? 0 : parsed.coords[0];
                chroma.value = isNaN(parsed.coords[1]) ? 0 : parsed.coords[1];
                hue.value = isNaN(parsed.coords[2]) ? 0 : parsed.coords[2]; 
            } catch (e) {
                // Invalid color format, just revert to current baseHex
                textInputColor.value = baseHex.value;
            }
        }

        function copyHex(hex, index) {
            navigator.clipboard.writeText(hex).then(() => {
                copiedIndex.value = index;
                setTimeout(() => {
                    if (copiedIndex.value === index) {
                        copiedIndex.value = null;
                    }
                }, 2000);
            });
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
                return isNaN(l) ? 0 : l;
            },
            set(val) { applyOverride(0, val); }
        });

        const fineTuneC = computed({
            get() {
                if (selectedSwatchIndex.value === null) return 0;
                let c = colorOverrides.value[selectedSwatchIndex.value] || palette.value[selectedSwatchIndex.value].colorObj;
                let ch = c.coords[1];
                return isNaN(ch) ? 0 : ch;
            },
            set(val) { applyOverride(1, val); }
        });

        const fineTuneH = computed({
            get() {
                if (selectedSwatchIndex.value === null) return 0;
                let c = colorOverrides.value[selectedSwatchIndex.value] || palette.value[selectedSwatchIndex.value].colorObj;
                let h = c.coords[2];
                return isNaN(h) ? 0 : h;
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
                // Reset selection
                startX.value = currentX.value = startY.value = currentY.value = 0;
            };
            reader.readAsDataURL(file);
        }

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

            if (selectedSwatchIndex.value !== null) {
                textInputFineTune.value = rgbStr;
                parseFineTuneInput();
            } else {
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

        // Graphing Context (D3)
        const initSvg = (selector) => {
            const container = document.querySelector(selector);
            if (!container) return null;
            container.innerHTML = ''; // clear
            const width = container.clientWidth;
            const height = container.clientHeight;
            
            const svg = d3.select(selector)
                .append('svg')
                .attr('width', '100%')
                .attr('height', '100%')
                .attr('viewBox', `0 0 ${width} ${height}`)
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
            const ctx = initSvg('#tonal-chart');
            if(!ctx) return;
            const { svg, width, height } = ctx;
            
            const margin = {top: 20, right: 30, bottom: 30, left: 40};
            const w = width - margin.left - margin.right;
            const h = height - margin.top - margin.bottom;

            const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

            // Use the palette in original order (Base color first)
            const graphData = [...palette.value];

            const x = d3.scalePoint()
                .domain(graphData.map((_, i) => i === 0 ? "Base" : `C${i}`))
                .range([0, w])
                .padding(0.5);

            const y = d3.scaleLinear()
                .domain([0, 1]) // Lightness bounds 0 to 1
                .range([h, 0]);

            // Add gradient def
            const defs = svg.append('defs');
            const gradient = defs.append('linearGradient')
                .attr('id', 'tonal-gradient')
                .attr('x1', '0%').attr('y1', '0%')
                .attr('x2', '0%').attr('y2', '100%');
            gradient.append('stop').attr('offset', '0%').style('stop-color', 'rgba(255,255,255,0.2)');
            gradient.append('stop').attr('offset', '100%').style('stop-color', 'rgba(255,255,255,0)');

            // Area
            const area = d3.area()
                .x((d, i) => x(i === 0 ? "Base" : `C${i}`))
                .y0(h)
                .y1(d => y(d.l))
                .curve(d3.curveMonotoneX);

            g.append("path")
                .datum(graphData)
                .attr("class", "tonal-area")
                .attr("d", area);

            // Line
            const line = d3.line()
                .x((d, i) => x(i === 0 ? "Base" : `C${i}`))
                .y(d => y(d.l))
                .curve(d3.curveMonotoneX);

            g.append("path")
                .datum(graphData)
                .attr("class", "tonal-line")
                .attr("d", line);

            // Points
            g.selectAll("circle")
                .data(graphData)
                .enter().append("circle")
                .attr("class", "tonal-point")
                .attr("cx", (d, i) => x(i === 0 ? "Base" : `C${i}`))
                .attr("cy", d => y(d.l))
                .attr("r", 20)
                .attr("fill", d => d.css)
                .attr("stroke", "#fff");

            // Axes
            const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d => d.toFixed(1));
            g.append("g")
                .attr("transform", `translate(0,0)`)
                .call(yAxis)
                .select(".domain").attr("stroke", "rgba(255,255,255,0.2)");
                
            g.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.1)");
            g.selectAll(".tick text").attr("fill", "rgba(255,255,255,0.5)");

            // X-axis label
            g.append("g")
                .attr("transform", `translate(0,${h})`)
                .append("line")
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
                const l = lightness.value;
                const c = chroma.value;
                const y = isNaN(l) ? 0 : l * 2;
                const radius = isNaN(c) ? 0 : c * 8; // Scale factor for visual clarity
                
                wheelMesh.position.y = 0; // Pin to ground plane
                // Base size + chroma expansion
                const s = 1 + radius; 
                wheelMesh.scale.set(s, s, 1);
                
                updateHueWheelTexture(l, c);
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
                
                const y = isNaN(l) ? 0 : l * 2;
                const radius = isNaN(c) ? 0 : c * 4;
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
            onDragMove
        };
    }
};

createApp(App).mount('#app');
