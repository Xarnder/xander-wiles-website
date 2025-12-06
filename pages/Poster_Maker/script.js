/* --- Configuration & State --- */
const config = {
    posterWidth: 842,
    posterHeight: 1191,
    defaultColors: [
        "#3B6085", "#2E7D75", "#359C86", "#8CB078", "#BCC773", 
        "#EBCB76", "#F2AB61", "#F1945F", "#EE7D55", "#D56C5B"
    ]
};

// Initial Data
let items = [
    { title: "Detach from Outcome", desc: "Focus on mastering what you can control.", color: config.defaultColors[0] },
    { title: "Clarity of Purpose", desc: "Know exactly why you're doing what you do.", color: config.defaultColors[1] },
    { title: "Find the Smarter People", desc: "Build success through hiring people who know more.", color: config.defaultColors[2] },
    { title: "Consistency Over Goals", desc: "Small, steady actions create more lasting success.", color: config.defaultColors[3] },
    { title: "Embrace Discomfort", desc: "Growth begins the moment you step beyond comfort.", color: config.defaultColors[4] },
    { title: "Think Long-Term", desc: "Keep vision big but focus on the next step.", color: config.defaultColors[5] },
    { title: "Always Open to Learn", desc: "Stay curious and humble to maintain your edge.", color: config.defaultColors[6] },
    { title: "Invest in People", desc: "Genuine relationships multiply your impact.", color: config.defaultColors[7] },
    { title: "Allow for Rest", desc: "True productivity comes from balanced recovery.", color: config.defaultColors[8] },
    { title: "Reflect and Iterate", desc: "Regular reflection turns experience into wisdom.", color: config.defaultColors[9] }
];

let renderTimeout; 

/* --- DOM Elements --- */
const poster = document.getElementById('poster');
const itemsContainer = document.getElementById('items-container');
const posterTitle = document.getElementById('poster-title');
const debugLog = document.getElementById('debug-log');
const renderedOverlay = document.getElementById('rendered-overlay');
const renderedImg = document.getElementById('rendered-img');

// Colors
const bgColorPicker = document.getElementById('bgColorPicker');
const textColorPicker = document.getElementById('textColorPicker');
const titleColorPicker = document.getElementById('titleColorPicker');

// Typography
const mainTitleSize = document.getElementById('mainTitleSize');
const mainTitleSpacing = document.getElementById('mainTitleSpacing');
const blockTitleSize = document.getElementById('blockTitleSize');
const blockTitleSpacing = document.getElementById('blockTitleSpacing');
const blockTitleY = document.getElementById('blockTitleY');
const blockDescSize = document.getElementById('blockDescSize');
const blockDescSpacing = document.getElementById('blockDescSpacing');
const blockDescY = document.getElementById('blockDescY');

// Layout
const heightSlider = document.getElementById('heightSlider');
const gapSlider = document.getElementById('gapSlider');
const outlineSlider = document.getElementById('outlineSlider');
const overlapSlider = document.getElementById('overlapSlider');
const topSpacingSlider = document.getElementById('topSpacingSlider');
const bottomSpacingSlider = document.getElementById('bottomSpacingSlider');
const numXSlider = document.getElementById('numXSlider');
const textXSlider = document.getElementById('textXSlider');

const exportScaleSelect = document.getElementById('exportScale');
const autoRenderToggle = document.getElementById('autoRenderToggle');

// All Sliders List for Iteration
const allSliders = [
    mainTitleSize, mainTitleSpacing, blockTitleSize, blockTitleSpacing, blockTitleY,
    blockDescSize, blockDescSpacing, blockDescY,
    gapSlider, heightSlider, topSpacingSlider, bottomSpacingSlider,
    outlineSlider, overlapSlider, numXSlider, textXSlider
];

/* --- Initialization --- */
function init() {
    log("Initializing app...");
    renderPoster(); 
    setupEventListeners();
    handleResize(); 
    updateVisuals(); // Syncs JS slider values to CSS variables immediately
    
    // Ensure value displays are correct on load
    allSliders.forEach(el => updateSliderValue(el.id, el.value));

    // Allow layout calculations to apply before taking the initial snapshot
    if(autoRenderToggle.checked) {
        setTimeout(() => {
            triggerAutoRender();
        }, 300);
    }
}

/* --- Layout Engine --- */
function calculateLayout() {
    const gapVal = parseInt(gapSlider.value);
    const heightVal = parseInt(heightSlider.value); 
    const titleHeightEstimate = posterTitle.offsetHeight || 100;
    const titleGap = parseInt(topSpacingSlider.value); 
    const pageBotPad = parseInt(bottomSpacingSlider.value); 
    const baseTopPad = 60; 
    
    const baseItemHeight = heightVal; 
    const totalGaps = Math.max(0, items.length - 1) * gapVal;
    
    const totalContentHeight = baseTopPad + titleHeightEstimate + titleGap + (items.length * baseItemHeight) + totalGaps + pageBotPad;
    
    let scale = 1;
    if (totalContentHeight > config.posterHeight) {
        scale = config.posterHeight / totalContentHeight;
    }
    
    scale = Math.max(scale, 0.35);
    
    poster.style.setProperty('--dynamic-scale', scale);
}

function updateVisuals() {
    // Colors
    poster.style.setProperty('--poster-bg', bgColorPicker.value);
    poster.style.setProperty('--text-color', textColorPicker.value);
    poster.style.setProperty('--title-color', titleColorPicker.value);
    
    // Typography
    poster.style.setProperty('--main-title-size', `${mainTitleSize.value}px`);
    poster.style.setProperty('--main-title-spacing', `${mainTitleSpacing.value}`);
    poster.style.setProperty('--block-title-size', `${blockTitleSize.value}px`);
    poster.style.setProperty('--block-title-spacing', `${blockTitleSpacing.value}`);
    poster.style.setProperty('--block-title-y', `${blockTitleY.value}px`);
    poster.style.setProperty('--block-desc-size', `${blockDescSize.value}px`);
    poster.style.setProperty('--block-desc-spacing', `${blockDescSpacing.value}`);
    poster.style.setProperty('--block-desc-y', `${blockDescY.value}px`);
    
    // Layout
    poster.style.setProperty('--base-height', `${heightSlider.value}px`);
    poster.style.setProperty('--vertical-gap', `${gapSlider.value}px`);
    poster.style.setProperty('--outline-width', `${outlineSlider.value}px`);
    poster.style.setProperty('--block-overlap', `${overlapSlider.value}px`);
    
    poster.style.setProperty('--title-spacing', `${topSpacingSlider.value}px`);
    poster.style.setProperty('--page-padding-bottom', `${bottomSpacingSlider.value}px`);
    
    poster.style.setProperty('--number-offset-x', `${numXSlider.value}px`);
    poster.style.setProperty('--text-offset-x', `${textXSlider.value}px`);
}

/* --- Helper: Update Value Displays --- */
function updateSliderValue(id, value) {
    const display = document.getElementById(`val-${id}`);
    if (display) display.textContent = value;
}

/* --- Rendering --- */
function renderPoster() {
    itemsContainer.innerHTML = ''; 
    
    if (items.length >= 10) {
        itemsContainer.classList.add('wide-layout');
    } else {
        itemsContainer.classList.remove('wide-layout');
    }

    items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'poster-item';
        row.style.setProperty('--item-color', item.color);

        // SVG Number
        const numDiv = document.createElement('div');
        numDiv.className = 'item-number';
        
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("class", "number-svg");
        svg.setAttribute("viewBox", "0 0 200 150"); 
        
        const textSvg = document.createElementNS(ns, "text");
        textSvg.setAttribute("x", "50%");
        textSvg.setAttribute("y", "50%");
        textSvg.textContent = index + 1;
        
        textSvg.setAttribute("stroke", poster.style.getPropertyValue('--poster-bg') || bgColorPicker.value);
        textSvg.setAttribute("stroke-width", outlineSlider.value * 2); 
        textSvg.setAttribute("stroke-linejoin", "round"); 
        textSvg.setAttribute("fill", item.color);
        textSvg.setAttribute("font-size", "130"); 
        
        svg.appendChild(textSvg);
        numDiv.appendChild(svg);

        // Content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'item-content';
        
        contentDiv.addEventListener('click', (e) => {
            if(e.target === contentDiv) {
                itemColorInput.click();
            }
        });

        const title = document.createElement('div');
        title.className = 'editable-title';
        title.contentEditable = true;
        title.textContent = item.title;
        title.addEventListener('input', (e) => { 
            items[index].title = e.target.textContent; 
            hideRenderOverlay();
        });

        const desc = document.createElement('div');
        desc.className = 'editable-desc';
        desc.contentEditable = true;
        desc.textContent = item.desc;
        desc.addEventListener('input', (e) => { 
            items[index].desc = e.target.textContent; 
            hideRenderOverlay();
        });

        contentDiv.appendChild(title);
        contentDiv.appendChild(desc);

        // Color Picker
        const itemColorInput = document.createElement('input');
        itemColorInput.type = 'color';
        itemColorInput.className = 'item-color-picker';
        itemColorInput.value = item.color;
        itemColorInput.addEventListener('input', (e) => {
            const newColor = e.target.value;
            items[index].color = newColor;
            row.style.setProperty('--item-color', newColor);
            textSvg.setAttribute("fill", newColor);
            triggerAutoRender();
        });

        row.appendChild(numDiv);
        row.appendChild(contentDiv);
        row.appendChild(itemColorInput);

        itemsContainer.appendChild(row);
    });

    calculateLayout();
}

/* --- Auto-Render Logic --- */
function triggerAutoRender() {
    if (!autoRenderToggle.checked) return;
    if (renderTimeout) clearTimeout(renderTimeout);
    hideRenderOverlay();
    renderTimeout = setTimeout(() => {
        performAutoRender();
    }, 500);
}

function performAutoRender() {
    log("Auto-rendering...");
    generateCanvas(1, (canvas) => {
        renderedImg.src = canvas.toDataURL('image/png');
        renderedOverlay.style.display = 'block';
        log("Render Updated.");
    });
}

function hideRenderOverlay() {
    renderedOverlay.style.display = 'none';
}

/* --- Export Logic --- */
function exportPoster(format) {
    log(`Generating ${format.toUpperCase()}...`);
    hideRenderOverlay();
    
    if (document.activeElement) document.activeElement.blur();
    const editables = document.querySelectorAll('[contenteditable="true"]');
    editables.forEach(el => el.setAttribute('contenteditable', 'false'));

    const resScale = parseInt(exportScaleSelect.value) || 4;

    generateCanvas(resScale, (canvas) => {
        const link = document.createElement('a');
        link.download = `poster-design-${resScale}x.${format}`;
        link.href = canvas.toDataURL(`image/${format}`, 0.9);
        link.click();
        log("Export complete.");
        editables.forEach(el => el.setAttribute('contenteditable', 'true'));
        if(autoRenderToggle.checked) performAutoRender();
    });
}

// Unified Canvas Generator
function generateCanvas(scale, callback) {
    const currentScale = parseFloat(getComputedStyle(poster).getPropertyValue('--dynamic-scale'));
    
    html2canvas(poster, {
        scale: scale, 
        useCORS: true, 
        backgroundColor: null,
        onclone: (clonedDoc) => {
            // Apply Spacing Offsets
            const mainTitle = clonedDoc.getElementById('poster-title');
            if(mainTitle) {
                const sp = parseInt(mainTitleSpacing.value) * currentScale;
                mainTitle.style.letterSpacing = `${sp}px`;
                mainTitle.style.fontVariantLigatures = 'none';
            }

            const blockTitles = clonedDoc.querySelectorAll('.editable-title');
            const btSpacing = parseInt(blockTitleSpacing.value) * currentScale;
            blockTitles.forEach(el => {
                el.style.letterSpacing = `${btSpacing}px`;
                el.style.fontVariantLigatures = 'none';
            });

            const blockDescs = clonedDoc.querySelectorAll('.editable-desc');
            const bdSpacing = parseInt(blockDescSpacing.value) * currentScale;
            blockDescs.forEach(el => {
                el.style.letterSpacing = `${bdSpacing}px`;
                el.style.fontVariantLigatures = 'none';
            });

            // Stroke boost
            const svgTexts = clonedDoc.querySelectorAll('.number-svg text');
            svgTexts.forEach(el => {
                const s = parseFloat(el.getAttribute('stroke-width')) || 0;
                if(s > 0) el.setAttribute('stroke-width', s * 1.35);
            });
        }
    }).then(callback).catch(e => log("Error: " + e.message));
}


function setupEventListeners() {
    // Colors
    const colorPickers = [bgColorPicker, textColorPicker, titleColorPicker];
    colorPickers.forEach(cp => cp.addEventListener('input', (e) => {
        updateVisuals();
        triggerAutoRender();
        if(cp === bgColorPicker) {
            const outlines = document.querySelectorAll('.number-svg text');
            outlines.forEach(el => el.setAttribute('stroke', e.target.value));
        }
    }));

    // Sliders
    allSliders.forEach(el => {
        el.addEventListener('input', () => {
            updateVisuals();
            updateSliderValue(el.id, el.value);
            calculateLayout();
            triggerAutoRender();
            if(el.id === 'outlineSlider') {
                const outlines = document.querySelectorAll('.number-svg text');
                outlines.forEach(svgEl => svgEl.setAttribute('stroke-width', el.value * 2));
            }
        });
    });
    
    posterTitle.addEventListener('input', () => { calculateLayout(); hideRenderOverlay(); });
    
    autoRenderToggle.addEventListener('change', () => {
        if(autoRenderToggle.checked) triggerAutoRender();
        else hideRenderOverlay();
    });
    
    renderedOverlay.addEventListener('click', () => {
        hideRenderOverlay();
    });

    document.getElementById('addItemBtn').addEventListener('click', () => {
        const nextColorIndex = items.length % config.defaultColors.length;
        items.push({
            title: "New Item Title",
            desc: "Click here to edit description text.",
            color: config.defaultColors[nextColorIndex]
        });
        renderPoster();
        triggerAutoRender();
    });

    document.getElementById('remItemBtn').addEventListener('click', () => {
        if(items.length > 0) items.pop(); renderPoster();
        triggerAutoRender();
    });

    document.getElementById('exportPngBtn').addEventListener('click', () => exportPoster('png'));
    document.getElementById('exportJpegBtn').addEventListener('click', () => exportPoster('jpeg'));
    
    window.addEventListener('resize', handleResize);
}

function handleResize() {
    const scaler = document.querySelector('.poster-scaler');
    const container = document.querySelector('.preview-area');
    const padding = 40; 
    const availableWidth = container.clientWidth - padding;
    const availableHeight = container.clientHeight - padding;
    const scale = Math.min(availableWidth / config.posterWidth, availableHeight / config.posterHeight, 1);
    scaler.style.transform = `scale(${scale})`;
}

function log(msg) {
    const time = new Date().toLocaleTimeString();
    debugLog.textContent = `[${time}] ${msg}`;
    console.log(`[App] ${msg}`);
}

document.fonts.ready.then(() => { init(); });