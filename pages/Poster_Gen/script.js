/* --- Configuration & State --- */
const config = {
    posterWidth: 842, 
    posterHeight: 1191,
    defaultColors: [
        "#3B6085", "#2E7D75", "#359C86", "#8CB078", "#BCC773", 
        "#EBCB76", "#F2AB61", "#F1945F", "#EE7D55", "#D56C5B"
    ]
};

let items = [
    { title: "Detach from Outcome", desc: "Focus on mastering what you can control.", color: config.defaultColors[0] },
    { title: "Clarity of Purpose", desc: "Know exactly why you're doing what you do.", color: config.defaultColors[1] },
    { title: "Find the Smarter People", desc: "Build success through hiring people who know more.", color: config.defaultColors[2] },
];

let renderTimeout; 

/* --- DOM Elements --- */
const poster = document.getElementById('poster');
const itemsContainer = document.getElementById('items-container');
const posterTitle = document.getElementById('poster-title');
const debugLog = document.getElementById('debug-log');
const renderedOverlay = document.getElementById('rendered-overlay');
const renderedImg = document.getElementById('rendered-img');

// Controls
const uiThemeToggle = document.getElementById('uiThemeToggle');
const autoRenderToggle = document.getElementById('autoRenderToggle');
const exportScaleSelect = document.getElementById('exportScale');

// Inputs
const bgColorPicker = document.getElementById('bgColorPicker');
const textColorPicker = document.getElementById('textColorPicker');
const titleColorPicker = document.getElementById('titleColorPicker');

// All sliders
const rangeInputs = document.querySelectorAll('input[type="range"]');

/* --- Initialization --- */
document.fonts.ready.then(() => {
    log("Fonts loaded. App ready.");
    init();
}).catch(e => {
    log("Font warn: " + e);
    init(); 
});

function init() {
    renderPosterItems(); 
    setupEventListeners();
    setupResizeObserver();
    updateVisuals(); 
    
    rangeInputs.forEach(el => updateSliderValue(el.id, el.value));

    if(autoRenderToggle.checked) {
        setTimeout(triggerAutoRender, 800);
    }
}

/* --- Core Logic --- */

function updateVisuals() {
    poster.style.setProperty('--poster-bg', bgColorPicker.value);
    poster.style.setProperty('--text-color', textColorPicker.value);
    poster.style.setProperty('--title-color', titleColorPicker.value);
    
    rangeInputs.forEach(input => {
        const val = input.value;
        const id = input.id;
        
        // --- Mapping Sliders to CSS Variables ---
        if(id === 'mainTitleSize') poster.style.setProperty('--main-title-size', `${val}px`);
        if(id === 'mainTitleSpacing') poster.style.setProperty('--main-title-spacing', val);
        
        if(id === 'blockTitleSize') poster.style.setProperty('--block-title-size', `${val}px`);
        if(id === 'blockTitleY') poster.style.setProperty('--block-title-y', `${val}px`);
        
        if(id === 'blockDescSize') poster.style.setProperty('--block-desc-size', `${val}px`);
        if(id === 'blockDescY') poster.style.setProperty('--block-desc-y', `${val}px`);

        if(id === 'gapSlider') poster.style.setProperty('--vertical-gap', `${val}px`);
        if(id === 'heightSlider') poster.style.setProperty('--base-height', `${val}px`);
        
        if(id === 'topPaddingSlider') poster.style.setProperty('--page-padding-top', `${val}px`);
        if(id === 'topSpacingSlider') poster.style.setProperty('--title-spacing', `${val}px`);
        
        if(id === 'numXSlider') poster.style.setProperty('--number-offset-x', `${val}px`);
        if(id === 'textXSlider') poster.style.setProperty('--text-offset-x', `${val}px`);
        if(id === 'overlapSlider') poster.style.setProperty('--block-overlap', `${val}px`);
    });
}

function updateSliderValue(id, value) {
    const display = document.getElementById(`val-${id}`);
    if (display) display.textContent = value;
}

function renderPosterItems() {
    itemsContainer.innerHTML = ''; 
    if (items.length >= 10) itemsContainer.classList.add('wide-layout');
    else itemsContainer.classList.remove('wide-layout');

    items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'poster-item';
        row.style.setProperty('--item-color', item.color);

        // --- SVG Number Construction ---
        const numDiv = document.createElement('div');
        numDiv.className = 'item-number';
        
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("class", "number-svg");
        svg.setAttribute("viewBox", "0 0 200 150"); 
        
        const fontSize = "130";
        const fontWeight = "900"; 
        const outlineVal = document.getElementById('outlineSlider') ? document.getElementById('outlineSlider').value : 18;

        // LAYER 1: Background Outline
        const bgText = document.createElementNS(ns, "text");
        bgText.setAttribute("class", "svg-bg-stroke");
        bgText.setAttribute("x", "50%");
        bgText.setAttribute("y", "50%");
        bgText.textContent = index + 1;
        bgText.setAttribute("fill", "none"); 
        bgText.setAttribute("stroke", bgColorPicker.value);
        bgText.setAttribute("stroke-width", outlineVal * 2); 
        bgText.setAttribute("stroke-linejoin", "round");
        bgText.setAttribute("font-size", fontSize);
        bgText.setAttribute("font-weight", fontWeight);
        bgText.style.fontWeight = fontWeight; 
        bgText.style.fontFamily = "'Montserrat', sans-serif";

        // LAYER 2: Foreground Color
        const fgText = document.createElementNS(ns, "text");
        fgText.setAttribute("class", "svg-fg-fill");
        fgText.setAttribute("x", "50%");
        fgText.setAttribute("y", "50%");
        fgText.textContent = index + 1;
        fgText.setAttribute("fill", item.color);
        fgText.setAttribute("stroke", "none"); 
        fgText.setAttribute("font-size", fontSize);
        fgText.setAttribute("font-weight", fontWeight);
        fgText.style.fontWeight = fontWeight;
        fgText.style.fontFamily = "'Montserrat', sans-serif";

        svg.appendChild(bgText);
        svg.appendChild(fgText);
        numDiv.appendChild(svg);

        // --- Content Block ---
        const contentDiv = document.createElement('div');
        contentDiv.className = 'item-content';
        
        const itemColorInput = document.createElement('input');
        itemColorInput.type = 'color';
        itemColorInput.className = 'item-color-picker';
        itemColorInput.value = item.color;
        itemColorInput.addEventListener('input', (e) => {
            items[index].color = e.target.value;
            row.style.setProperty('--item-color', e.target.value);
            fgText.setAttribute("fill", e.target.value);
            triggerAutoRender();
        });

        contentDiv.addEventListener('click', (e) => {
            if(e.target === contentDiv || e.target.classList.contains('item-content')) itemColorInput.click();
        });

        const title = document.createElement('div');
        title.className = 'editable-title';
        title.contentEditable = true;
        title.textContent = item.title;
        title.addEventListener('input', (e) => { items[index].title = e.target.textContent; hideRenderOverlay(); });

        const desc = document.createElement('div');
        desc.className = 'editable-desc';
        desc.contentEditable = true;
        desc.textContent = item.desc;
        desc.addEventListener('input', (e) => { items[index].desc = e.target.textContent; hideRenderOverlay(); });

        contentDiv.appendChild(title);
        contentDiv.appendChild(desc);
        contentDiv.appendChild(itemColorInput);

        row.appendChild(numDiv);
        row.appendChild(contentDiv);
        itemsContainer.appendChild(row);
    });
}

function triggerAutoRender() {
    if (!autoRenderToggle.checked) return;
    if (renderTimeout) clearTimeout(renderTimeout);
    hideRenderOverlay();
    renderTimeout = setTimeout(() => {
        performRender(1, false); 
    }, 700);
}

function performRender(scaleVal, isDownload, format = 'png') {
    log(`Render start (Scale: ${scaleVal}x)...`);

    // OFF-SCREEN SANDBOX to prevent flash
    const sandbox = document.createElement('div');
    sandbox.style.position = 'fixed'; 
    sandbox.style.top = '-10000px';   
    sandbox.style.left = '-10000px';  
    sandbox.style.zIndex = '-99999';
    sandbox.style.width = config.posterWidth + 'px';
    sandbox.style.height = config.posterHeight + 'px';
    sandbox.style.overflow = 'hidden';
    document.body.appendChild(sandbox);

    const posterEl = document.getElementById('poster');
    const clone = posterEl.cloneNode(true);
    
    clone.style.transform = 'none';
    clone.style.margin = '0';
    clone.style.boxShadow = 'none';
    clone.style.cssText += posterEl.style.cssText;
    
    sandbox.appendChild(clone);

    html2canvas(clone, {
        scale: scaleVal,
        width: config.posterWidth,
        height: config.posterHeight,
        windowWidth: config.posterWidth,
        windowHeight: config.posterHeight,
        useCORS: true,
        backgroundColor: bgColorPicker.value,
        
        onclone: (doc) => {
            const svgTexts = doc.querySelectorAll('.number-svg text');
            svgTexts.forEach(el => {
                el.style.fontFamily = "'Montserrat', sans-serif";
                el.style.fontWeight = "900"; 
            });
            const bgTexts = doc.querySelectorAll('.svg-bg-stroke');
            bgTexts.forEach(el => el.setAttribute('stroke', bgColorPicker.value));

            const mt = doc.getElementById('poster-title');
            if(mt) mt.style.fontWeight = "900";
        }
    }).then(canvas => {
        document.body.removeChild(sandbox);
        if (isDownload) {
            const link = document.createElement('a');
            link.download = `PosterGen-${Date.now()}.${format}`;
            link.href = canvas.toDataURL(`image/${format}`, 0.9);
            link.click();
            log(`Exported ${format.toUpperCase()}`);
        } else {
            renderedImg.src = canvas.toDataURL('image/png');
            renderedOverlay.style.display = 'block';
            log("Preview Updated");
        }
    }).catch(err => {
        if(document.body.contains(sandbox)) document.body.removeChild(sandbox);
        log("Error: " + err.message);
    });
}

function hideRenderOverlay() {
    renderedOverlay.style.display = 'none';
}

function log(msg) {
    const time = new Date().toLocaleTimeString();
    debugLog.textContent = `[${time}] ${msg}`;
    console.log(`[App] ${msg}`);
}

function setupResizeObserver() {
    const wrapper = document.getElementById('scaler-wrapper');
    const container = document.querySelector('.preview-area');
    
    const fitPoster = () => {
        if(!wrapper || !container) return;
        const padding = 40; 
        const availW = container.clientWidth - padding;
        const availH = container.clientHeight - padding;
        const scale = Math.min(availW / config.posterWidth, availH / config.posterHeight);
        wrapper.style.transform = `scale(${Math.max(scale, 0.1)})`; 
    };
    
    const observer = new ResizeObserver(() => fitPoster());
    observer.observe(container);
    window.addEventListener('resize', fitPoster);
    fitPoster();
}

function setupEventListeners() {
    uiThemeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
    });

    rangeInputs.forEach(el => {
        el.addEventListener('input', () => {
            updateSliderValue(el.id, el.value);
            updateVisuals();
            if(el.id === 'outlineSlider') {
                document.querySelectorAll('.svg-bg-stroke').forEach(svgEl => {
                    svgEl.setAttribute('stroke-width', el.value * 2);
                });
            }
            triggerAutoRender();
        });
    });

    [bgColorPicker, textColorPicker, titleColorPicker].forEach(picker => {
        picker.addEventListener('input', (e) => {
            updateVisuals();
            if(picker === bgColorPicker) {
                 document.querySelectorAll('.svg-bg-stroke').forEach(svgEl => {
                    svgEl.setAttribute('stroke', e.target.value);
                });
            }
            triggerAutoRender();
        });
    });

    posterTitle.addEventListener('input', hideRenderOverlay);

    const mdBtn = document.getElementById('importMarkdownBtn');
    if(mdBtn) {
        mdBtn.addEventListener('click', () => {
            const text = document.getElementById('markdownInput').value;
            const lines = text.split('\n');
            const newItems = [];
            let count = 0;
            const regex = /^\d+\.\s*\*\*(.*?)\*\*\s*(.*)$/;
            lines.forEach(line => {
                const match = line.match(regex);
                if(match) {
                    newItems.push({
                        title: match[1].trim(),
                        desc: match[2].trim(),
                        color: config.defaultColors[count % config.defaultColors.length]
                    });
                    count++;
                }
            });
            if(newItems.length > 0) {
                items = newItems; renderPosterItems(); triggerAutoRender();
                log(`Imported ${count} items.`);
            }
        });
    }

    document.getElementById('addItemBtn').addEventListener('click', () => {
        items.push({ title: "New Point", desc: "...", color: config.defaultColors[items.length % config.defaultColors.length] });
        renderPosterItems(); triggerAutoRender();
    });
    
    document.getElementById('remItemBtn').addEventListener('click', () => {
        if(items.length > 0) { items.pop(); renderPosterItems(); triggerAutoRender(); }
    });

    document.getElementById('saveProjectBtn').addEventListener('click', () => {
        const data = { meta: "PosterGen", items, settings: {} };
        rangeInputs.forEach(r => data.settings[r.id] = r.value);
        data.mainTitle = posterTitle.innerText;
        data.colors = { bg: bgColorPicker.value, text: textColorPicker.value, title: titleColorPicker.value };
        const blob = new Blob([JSON.stringify(data)], {type: "application/json"});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = "poster.json"; a.click();
    });

    document.getElementById('loadProjectBtn').addEventListener('click', () => document.getElementById('projectFileInput').click());
    document.getElementById('projectFileInput').addEventListener('change', (e) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const d = JSON.parse(evt.target.result);
                items = d.items || items;
                if(d.mainTitle) posterTitle.innerText = d.mainTitle;
                if(d.colors) { bgColorPicker.value=d.colors.bg; textColorPicker.value=d.colors.text; titleColorPicker.value=d.colors.title; }
                if(d.settings) {
                    Object.entries(d.settings).forEach(([k,v]) => {
                        const el = document.getElementById(k);
                        if(el) { el.value = v; updateSliderValue(k,v); }
                    });
                }
                renderPosterItems(); updateVisuals(); triggerAutoRender();
            } catch(x) { log("Load error"); }
        };
        reader.readAsText(e.target.files[0]);
    });

    document.getElementById('exportPngBtn').addEventListener('click', () => performRender(parseInt(exportScaleSelect.value), true, 'png'));
    document.getElementById('exportJpegBtn').addEventListener('click', () => performRender(parseInt(exportScaleSelect.value), true, 'jpeg'));
    
    renderedOverlay.addEventListener('click', hideRenderOverlay);
}