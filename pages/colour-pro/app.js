import { createApp, ref, computed, watch, onMounted, nextTick } from 'https://unpkg.com/vue@3.3.4/dist/vue.esm-browser.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';
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
        const copiedIndex = ref(null);
        const isDarkMode = ref(true);

        // Computed
        const baseColorBase = computed(() => {
            return new Color(`oklch(${lightness.value} ${chroma.value} ${hue.value})`);
        });

        const baseCssColor = computed(() => {
            return baseColorBase.value.toString({ format: "oklch" });
        });

        const baseHex = computed(() => {
            return baseColorBase.value.to("srgb").toString({ format: "hex" });
        });

        // Watchers
        watch([lightness, chroma, hue, harmonyType, proportionRule], () => {
            updatePalette();
        }, { immediate: true });

        watch(isDarkMode, (newVal) => {
            if (newVal) {
                document.body.classList.remove('light-theme');
            } else {
                document.body.classList.add('light-theme');
            }
        }, { immediate: true });

        watch(baseHex, (newHex) => {
            if (document.activeElement?.id !== 'hexInput') {
                textInputColor.value = newHex;
            }
        }, { immediate: true });

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

        function updatePalette() {
            // 1. Generate core mathematical colors
            const colors = generateHarmonies(lightness.value, chroma.value, hue.value, harmonyType.value);
            // 2. Map metrics, APCA, proportions, focal focus
            palette.value = arrangePalette(colors, proportionRule.value);
            
            // 3. Update Graphics
            nextTick(() => {
                drawTreemap();
                drawTonalGraph();
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

            // Sort palette by original order or lightness (sorted makes graph nicer)
            const sorted = [...palette.value].sort((a,b) => a.l - b.l);

            const x = d3.scalePoint()
                .domain(sorted.map((_, i) => `C${i}`))
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
                .x((d, i) => x(`C${i}`))
                .y0(h)
                .y1(d => y(d.l))
                .curve(d3.curveMonotoneX);

            g.append("path")
                .datum(sorted)
                .attr("class", "tonal-area")
                .attr("d", area);

            // Line
            const line = d3.line()
                .x((d, i) => x(`C${i}`))
                .y(d => y(d.l))
                .curve(d3.curveMonotoneX);

            g.append("path")
                .datum(sorted)
                .attr("class", "tonal-line")
                .attr("d", line);

            // Points
            g.selectAll("circle")
                .data(sorted)
                .enter().append("circle")
                .attr("class", "tonal-point")
                .attr("cx", (d, i) => x(`C${i}`))
                .attr("cy", d => y(d.l))
                .attr("r", 5)
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

        // Handle window resize dynamically to re-render charts
        onMounted(() => {
            window.addEventListener('resize', () => {
                drawTreemap();
                drawTonalGraph();
            });
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
            toggleTheme
        };
    }
};

createApp(App).mount('#app');
