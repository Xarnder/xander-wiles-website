import * as THREE from 'three';

let dialog;
let pending = false;

export function isExportDialogOpen() { return pending; }

export function chooseImageExport(aspect, nativeWidth) {
    if (pending) return Promise.resolve(null);
    pending = true;
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.className = 'image-export-dialog image-export-panel';
        dialog.setAttribute('aria-labelledby', 'image-export-title');
        dialog.innerHTML = `<form method="dialog">
            <div class="panel-header">
                <div class="panel-brand"><span class="brand-dot" aria-hidden="true"></span><h2 id="image-export-title" class="panel-title">Export image</h2></div>
                <button value="cancel" formnovalidate class="panel-collapse-btn" aria-label="Close image export" title="Close image export">&times;</button>
            </div>
            <div class="image-export-body">
            <label>Background<select name="background" class="custom-select">
                <option value="black">Black</option><option value="white">White</option><option value="alpha">Transparent (alpha)</option>
            </select></label>
            <label>File format<select name="format" class="custom-select">
                <option value="png">PNG</option><option value="jpeg">JPEG</option>
            </select></label>
            <p class="export-note">Transparency requires PNG. Selecting JPEG uses an opaque background.</p>
            <label>Resolution<select name="resolution" class="custom-select">
                <option value="native">Current view</option><option value="1280">1280 px wide</option>
                <option value="1920" selected>1920 px wide</option><option value="2560">2560 px wide</option>
                <option value="3840">3840 px wide</option><option value="custom">Custom width</option>
            </select></label>
            <label class="export-custom" hidden>Width (pixels)<input name="width" type="number" min="64" max="8192" step="1" value="1920"></label>
            <p class="export-dimensions" aria-live="polite"></p>
            <p class="export-note">Aspect ratio is preserved. In compare mode, resolution applies to each image; the combined grid is larger.</p>
            </div>
            <div class="export-actions"><button value="cancel" formnovalidate class="btn-action">Cancel</button><button value="export" class="btn-action primary">Export</button></div>
        </form>`;
        document.body.appendChild(dialog);
    }
    const form = dialog.querySelector('form');
    const fields = form.elements;
    let options;
    function update(event) {
        if (event?.target === fields.format && fields.format.value === 'jpeg' && fields.background.value === 'alpha') fields.background.value = 'white';
        if (fields.background.value === 'alpha') fields.format.value = 'png';
        const custom = fields.resolution.value === 'custom';
        dialog.querySelector('.export-custom').hidden = !custom;
        fields.width.disabled = !custom;
        const width = Math.round(fields.resolution.value === 'native' ? nativeWidth : custom ? Number(fields.width.value) : Number(fields.resolution.value));
        const height = Math.round(width / aspect);
        const valid = width >= 64 && width <= 8192 && height >= 1 && height <= 8192 && width * height <= 33554432;
        dialog.querySelector('button[value="export"]').disabled = !valid;
        dialog.querySelector('.export-dimensions').textContent = valid ? `${width} × ${height} pixels per image` : 'Choose a smaller size (maximum 8192 px per side and 32 megapixels).';
        options = { width, height, background: fields.background.value, format: fields.format.value };
    }
    form.oninput = update;
    update();
    dialog.returnValue = 'cancel';
    dialog.showModal();
    return new Promise(resolve => {
        dialog.onclose = () => { pending = false; resolve(dialog.returnValue === 'export' ? options : null); };
    });
}

// Render into an RGBA target: transparency works even when the on-screen
// WebGL canvas was created opaque. Read back at the requested native resolution.
export function renderExportImage(renderer, viewers, options, draw) {
    const { width, height, background } = options;
    const gl = renderer.getContext();
    const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    if (width > max || height > max) throw new Error(`This GPU supports exports up to ${max} pixels per side`);
    const target = new THREE.WebGLRenderTarget(width, height);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const oldTarget = renderer.getRenderTarget();
    const color = renderer.getClearColor(new THREE.Color()).clone();
    const alpha = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    const saved = viewers.map(viewer => ({ viewer, dimensions: viewer.getRenderDimensions, ratio: viewer.devicePixelRatio, meshRatio: viewer.splatMesh?.devicePixelRatio }));
    try {
        saved.forEach(({ viewer }) => {
            viewer.getRenderDimensions = out => { out.x = width; out.y = height; };
            viewer.devicePixelRatio = 1;
            if (viewer.splatMesh) viewer.splatMesh.devicePixelRatio = 1;
            viewer.updateSplatMesh();
        });
        // setRenderTarget uses the target's pixel-sized viewport. setViewport
        // would multiply these dimensions by the display pixel ratio again,
        // cropping exports on Retina/high-DPI screens.
        renderer.setRenderTarget(target);
        renderer.setScissorTest(false);
        renderer.setClearColor(background === 'white' ? 0xffffff : 0x000000, background === 'alpha' ? 0 : 1);
        renderer.autoClear = false;
        renderer.clear(true, true, true);
        draw();
        const pixels = new Uint8Array(width * height * 4);
        renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(width, height);
        for (let y = 0; y < height; y++) {
            image.data.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), (height - y - 1) * width * 4);
        }
        // WebGL blending produces premultiplied RGB; ImageData expects straight RGB.
        if (background === 'alpha') {
            for (let i = 0; i < image.data.length; i += 4) {
                const a = image.data[i + 3];
                if (a > 0 && a < 255) for (let c = 0; c < 3; c++) image.data[i + c] = Math.min(255, Math.round(image.data[i + c] * 255 / a));
            }
        }
        ctx.putImageData(image, 0, 0);
        return canvas;
    } finally {
        saved.forEach(({ viewer, dimensions, ratio, meshRatio }) => {
            viewer.getRenderDimensions = dimensions;
            viewer.devicePixelRatio = ratio;
            if (viewer.splatMesh) viewer.splatMesh.devicePixelRatio = meshRatio;
            viewer.updateSplatMesh();
        });
        renderer.setRenderTarget(oldTarget);
        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest);
        renderer.setClearColor(color, alpha);
        renderer.autoClear = autoClear;
        target.dispose();
    }
}

export function saveExportImage(canvas, filename, format) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Could not encode image. Try a smaller resolution.'));
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `${filename}.${format === 'jpeg' ? 'jpg' : 'png'}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        resolve();
    }, format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95));
}
