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

const saveProjectBtn = document.getElementById('saveProjectBtn');
const loadProjectBtn = document.getElementById('loadProjectBtn');
const projectFileInput = document.getElementById('projectFileInput');

const bgColorPicker = document.getElementById('bgColorPicker');
const textColorPicker = document.getElementById('textColorPicker');
const titleColorPicker = document.getElementById('titleColorPicker');

const mainTitleSize = document.getElementById('mainTitleSize');
const mainTitleSpacing = document.getElementById('mainTitleSpacing');
const blockTitleSize = document.getElementById('blockTitleSize');
const blockTitleSpacing = document.getElementById('blockTitleSpacing');
const blockTitleY = document.getElementById('blockTitleY');
const blockDescSize = document.getElementById('blockDescSize');
const blockDescSpacing = document.getElementById('blockDescSpacing');
const blockDescY = document.getElementById('blockDescY');

const heightSlider = document.getElementById('heightSlider');
const gapSlider = document.getElementById('gapSlider');
const outlineSlider = document.getElementById('outlineSlider');
const overlapSlider = document.getElementById('overlapSlider');
const topPaddingSlider = document.getElementById('topPaddingSlider'); // NEW
const topSpacingSlider = document.getElementById('topSpacingSlider');
const bottomSpacingSlider = document.getElementById('bottomSpacingSlider');
const numXSlider = document.getElementById('numXSlider');
const textXSlider = document.getElementById('textXSlider');

const exportScaleSelect = document.getElementById('exportScale');
const autoRenderToggle = document.getElementById('autoRenderToggle');
const uiThemeToggle = document.getElementById('uiThemeToggle');

const allSliders = [
    mainTitleSize, mainTitleSpacing, blockTitleSize, blockTitleSpacing, blockTitleY,
    blockDescSize, blockDescSpacing, blockDescY,
    gapSlider, heightSlider, topPaddingSlider, topSpacingSlider, bottomSpacingSlider,
    outlineSlider, overlapSlider, numXSlider, textXSlider
];

/* --- Initialization --- */
function init() {
    log("Initializing app...");
    renderPoster(); 
    setupEventListeners();
    setupResizeObserver();
    updateVisuals();
    
    allSliders.forEach(el => updateSliderValue(el.id, el.value));

    if(autoRenderToggle.checked) {
        setTimeout(() => {
            triggerAutoRender();
        }, 500);
    }
}

/* --- Layout Engine --- */
function updateVisuals() {
    poster.style.setProperty('--poster-bg', bgColorPicker.value);
    poster.style.setProperty('--text-color', textColorPicker.value);
    poster.style.setProperty('--title-color', titleColorPicker.value);
    
    poster.style.setProperty('--main-title-size', `${mainTitleSize.value}px`);
    poster.style.setProperty('--main-title-spacing', `${mainTitleSpacing.value}`);
    poster.style.setProperty('--block-title-size', `${blockTitleSize.value}px`);
    poster.style.setProperty('--block-title-spacing', `${blockTitleSpacing.value}`);
    poster.style.setProperty('--block-title-y', `${blockTitleY.value}px`);
    poster.style.setProperty('--block-desc-size', `${blockDescSize.value}px`);
    poster.style.setProperty('--block-desc-spacing', `${blockDescSpacing.value}`);
    poster.style.setProperty('--block-desc-y', `${blockDescY.value}px`);
    
    poster.style.setProperty('--base-height', `${heightSlider.value}px`);
    poster.style.setProperty('--vertical-gap', `${gapSlider.value}px`);
    poster.style.setProperty('--outline-width', `${outlineSlider.value}px`);
    poster.style.setProperty('--block-overlap', `${overlapSlider.value}px`);
    
    poster.style.setProperty('--page-padding-top', `${topPaddingSlider.value}px`); // NEW
    poster.style.setProperty('--title-spacing', `${topSpacingSlider.value}px`);
    poster.style.setProperty('--page-padding-bottom', `${bottomSpacingSlider.value}px`);
    
    poster.style.setProperty('--number-offset-x', `${numXSlider.value}px`);
    poster.style.setProperty('--text-offset-x', `${textXSlider.value}px`);
}

function updateSliderValue(id, value) {
    const display = document.getElementById(`val-${id}`);
    if (display) display.textContent = value;
}

function renderPoster() {
    itemsContainer.innerHTML = ''; 
    if (items.length >= 10) itemsContainer.classList.add('wide-layout');
    else itemsContainer.classList.remove('wide-layout');

    items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'poster-item';
        row.style.setProperty('--item-color', item.color);

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

        const contentDiv = document.createElement('div');
        contentDiv.className = 'item-content';
        
        contentDiv.addEventListener('click', (e) => {
            if(e.target === contentDiv) itemColorInput.click();
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
}

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

function saveProject() {
    log("Saving project...");
    const settings = {};
    allSliders.forEach(slider => { settings[slider.id] = slider.value; });

    const projectData = {
        meta: "PosterGen",
        timestamp: new Date().toISOString(),
        mainTitle: posterTitle.innerText,
        colors: {
            bg: bgColorPicker.value,
            title: titleColorPicker.value,
            text: textColorPicker.value
        },
        settings: settings,
        items: items
    };

    try {
        const jsonStr = JSON.stringify(projectData, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `poster-project-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        log("Project saved.");
    } catch (e) {
        log("Error saving: " + e.message);
    }
}

function loadProject(event) {
    const file = event.target.files[0];
    if (!file) return;
    log("Loading project...");
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const projectData = JSON.parse(e.target.result);
            if(!projectData.items) throw new Error("Invalid file.");

            if(projectData.mainTitle) posterTitle.innerText = projectData.mainTitle;

            if(projectData.colors) {
                if(projectData.colors.bg) bgColorPicker.value = projectData.colors.bg;
                if(projectData.colors.title) titleColorPicker.value = projectData.colors.title;
                if(projectData.colors.text) textColorPicker.value = projectData.colors.text;
            }

            items = projectData.items;

            if(projectData.settings) {
                for (const [id, val] of Object.entries(projectData.settings)) {
                    const slider = document.getElementById(id);
                    if (slider) {
                        slider.value = val;
                        updateSliderValue(id, val);
                    }
                }
            }

            renderPoster();
            updateVisuals();
            triggerAutoRender();
            projectFileInput.value = '';
            log("Loaded successfully.");
        } catch (error) {
            log("Error: " + error.message);
        }
    };
    reader.readAsText(file);
}

function exportPoster(format) {
    log(`Generating ${format}...`);
    hideRenderOverlay();
    
    if (document.activeElement) document.activeElement.blur();
    const editables = document.querySelectorAll('[contenteditable="true"]');
    editables.forEach(el => el.setAttribute('contenteditable', 'false'));

    const resScale = parseInt(exportScaleSelect.value) || 4;

    generateCanvas(resScale, (canvas) => {
        const link = document.createElement('a');
        link.download = `poster-export-${resScale}x.${format}`;
        link.href = canvas.toDataURL(`image/${format}`, 0.9);
        link.click();
        log("Export complete.");
        
        editables.forEach(el => el.setAttribute('contenteditable', 'true'));
        if(autoRenderToggle.checked) performAutoRender();
    });
}

/* --- THE SANDBOX GENERATOR (Offset Fix) --- */
function generateCanvas(scale, callback) {
    const sandbox = document.createElement('div');
    sandbox.style.position = 'fixed';
    
    // Strict 0,0 positioning
    sandbox.style.top = '0'; 
    sandbox.style.left = '0';
    sandbox.style.margin = '0';
    sandbox.style.padding = '0';
    
    // Hide behind UI
    sandbox.style.zIndex = '-99999'; 
    
    // Strict dimensions matching config
    sandbox.style.width = config.posterWidth + 'px';
    sandbox.style.height = config.posterHeight + 'px';
    sandbox.style.overflow = 'hidden';
    
    // Copy CSS vars
    sandbox.style.cssText += poster.style.cssText;
    document.body.appendChild(sandbox);

    // Clone the poster
    const clone = poster.cloneNode(true);
    clone.style.transform = 'none';
    clone.style.margin = '0';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.boxShadow = 'none';
    clone.style.width = '100%';
    clone.style.height = '100%';
    
    sandbox.appendChild(clone);

    // Reset scroll to ensure no browser scroll offset affects render
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    window.scrollTo(0,0);

    html2canvas(clone, {
        scale: scale,
        width: config.posterWidth,
        height: config.posterHeight,
        windowWidth: config.posterWidth,
        windowHeight: config.posterHeight,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        backgroundColor: null, 
        onclone: (clonedDoc) => {
             const mt = clonedDoc.getElementById('poster-title');
             if(mt) mt.style.letterSpacing = `${mainTitleSpacing.value}px`;
             
             const svgTexts = clonedDoc.querySelectorAll('.number-svg text');
             svgTexts.forEach(el => {
                const s = parseFloat(el.getAttribute('stroke-width')) || 0;
                if(s > 0) el.setAttribute('stroke-width', s * 1.35);
            });
        }
    }).then(canvas => {
        document.body.removeChild(sandbox);
        window.scrollTo(scrollLeft, scrollTop); 
        callback(canvas);
    }).catch(e => {
        log("Render Error: " + e.message);
        if(document.body.contains(sandbox)) document.body.removeChild(sandbox);
        window.scrollTo(scrollLeft, scrollTop);
    });
}

function setupEventListeners() {
    uiThemeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
    });

    saveProjectBtn.addEventListener('click', saveProject);
    loadProjectBtn.addEventListener('click', () => projectFileInput.click());
    projectFileInput.addEventListener('change', loadProject);

    const colorPickers = [bgColorPicker, textColorPicker, titleColorPicker];
    colorPickers.forEach(cp => cp.addEventListener('input', (e) => {
        updateVisuals();
        triggerAutoRender();
        if(cp === bgColorPicker) {
            const outlines = document.querySelectorAll('.number-svg text');
            outlines.forEach(el => el.setAttribute('stroke', e.target.value));
        }
    }));

    allSliders.forEach(el => {
        el.addEventListener('input', () => {
            updateVisuals();
            updateSliderValue(el.id, el.value);
            triggerAutoRender();
            if(el.id === 'outlineSlider') {
                const outlines = document.querySelectorAll('.number-svg text');
                outlines.forEach(svgEl => svgEl.setAttribute('stroke-width', el.value * 2));
            }
        });
    });
    
    posterTitle.addEventListener('input', () => { hideRenderOverlay(); });
    
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
}

/* --- RESIZE OBSERVER --- */
function setupResizeObserver() {
    const wrapper = document.getElementById('scaler-wrapper');
    const container = document.querySelector('.preview-area');
    
    const observer = new ResizeObserver(() => {
        fitPosterToScreen(wrapper, container);
    });
    
    observer.observe(container);
    fitPosterToScreen(wrapper, container); 
}

function fitPosterToScreen(wrapper, container) {
    if(!wrapper || !container) return;
    const padding = 40; 
    const availW = container.clientWidth - padding;
    const availH = container.clientHeight - padding;
    const scale = Math.min(availW / config.posterWidth, availH / config.posterHeight);
    wrapper.style.transform = `scale(${Math.max(scale, 0.1)})`;
}

function log(msg) {
    const time = new Date().toLocaleTimeString();
    debugLog.textContent = `[${time}] ${msg}`;
    console.log(`[App] ${msg}`);
}

document.fonts.ready.then(() => { init(); });