import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import pako from 'pako';

// --- Global Variables ---
let scene, camera, renderer, controls, grid;
let axesHelper, axisLabels = [];
let composer, renderPass, gtaoPass, outputPass;
let currentVoxData = null;
let ambientLight, dirLight, hemiLight;
let currentTexture = null;
let instancedMesh = null;

const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const errorDisplay = document.getElementById('error-display');
const loader = document.getElementById('loader');
const loadingText = document.getElementById('loading-text');
const controlsDiv = document.getElementById('controls');
const uploadDiv = document.querySelector('.upload-area');
const dimInfo = document.getElementById('dim-info');
const blockCountInfo = document.getElementById('block-count');
const progressFill = document.getElementById('progress-fill');

// --- Initialization ---
initThreeJS();
setupEventListeners();

function log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    if (type === 'error') console.error(`[${timestamp}] ERROR:`, msg);
    else if (type === 'warn') console.warn(`[${timestamp}] WARN:`, msg);
    else console.log(`[${timestamp}] DEBUG:`, msg);
}

function updateStatus(msg, percent = -1) {
    if (loadingText) loadingText.textContent = msg;
    if (percent >= 0 && progressFill) {
        progressFill.style.width = `${percent}%`;
    }
    // log(msg); // Reduce log spam
}

// --- Three.js Setup ---
function initThreeJS() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a20);

    // Grid Helper
    grid = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
    scene.add(grid);

    // Axes Helper
    axesHelper = new THREE.AxesHelper(5);
    axesHelper.visible = false; // Default hidden
    scene.add(axesHelper);

    // Create Axis Labels
    createAxisLabels();

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(50, 50, 50);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace; // Ensure correct colors
    container.appendChild(renderer.domElement);

    // Post-processing
    composer = new EffectComposer(renderer);
    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    gtaoPass = new GTAOPass(scene, camera, container.clientWidth, container.clientHeight);
    // gtaoPass.output.encoding = THREE.sRGBEncoding; // Removed: Causes error and handled by OutputPass/Renderer
    composer.addPass(gtaoPass);

    outputPass = new OutputPass();
    composer.addPass(outputPass);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.0;

    // Lights
    hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // We don't really need ambient light if we have hemi, but can keep it low or remove
    ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    window.addEventListener('resize', () => {
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height);
        composer.setSize(width, height);
        if (gtaoPass) gtaoPass.setSize(width, height);
    });

    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    // renderer.render(scene, camera);
    composer.render();
}

// --- Event Listeners ---
function setupEventListeners() {
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    document.getElementById('download-btn').addEventListener('click', downloadVox);
    document.getElementById('reset-btn').addEventListener('click', () => location.reload());

    // Lighting Controls
    document.getElementById('ambient-intensity').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('ambient-val').innerText = val.toFixed(1);
        if (hemiLight) hemiLight.intensity = val; // Control Hemisphere Light
        if (ambientLight) ambientLight.intensity = val * 0.2; // Scale ambient
    });

    document.getElementById('dir-intensity').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('dir-val').innerText = val.toFixed(1);
        if (dirLight) dirLight.intensity = val;
    });

    // Material Color Control
    const matColorInput = document.getElementById('material-color');
    matColorInput.addEventListener('input', (e) => {
        if (!instancedMesh) return;
        instancedMesh.material.color.set(e.target.value);
        instancedMesh.material.needsUpdate = true;
    });

    const blockColorsToggle = document.getElementById('block-colors-toggle');
    blockColorsToggle.addEventListener('change', () => {
        if (!instancedMesh) return;

        if (blockColorsToggle.checked) {
            // Restore colors
            if (instancedMesh.userData.originalColors) {
                instancedMesh.instanceColor = instancedMesh.userData.originalColors.clone();
            }
            instancedMesh.material.vertexColors = true;
        } else {
            // Hide colors (use material color)
            instancedMesh.instanceColor = null;
            instancedMesh.material.vertexColors = false;
        }
        instancedMesh.material.needsUpdate = true;
    });

    const gtaoToggle = document.getElementById('gtao-toggle');
    const gtaoControls = document.getElementById('gtao-controls');

    // Initial State
    if (gtaoPass) {
        // Set initial values
        gtaoPass.blendIntensity = 1.0;
        // Radius is tricky, depends on scene scale. 
        // Our blocks are size 1. A radius of ~5-10 might be good? 
        // Wait, standard GTAO radius is in world units usually.
        // Let's try to set a reasonable default.
        gtaoPass.radius = 2.0;
        document.getElementById('gtao-rad-val').innerText = "2.0";
        document.getElementById('gtao-radius').value = 2.0;
        document.getElementById('gtao-str-val').innerText = "1.0";
        document.getElementById('gtao-intensity').value = 1.0;
    }

    if (gtaoToggle) {
        gtaoToggle.addEventListener('change', () => {
            if (gtaoPass) gtaoPass.enabled = gtaoToggle.checked;
            if (gtaoControls) gtaoControls.style.opacity = gtaoToggle.checked ? "1" : "0.5";
            if (gtaoControls) gtaoControls.style.pointerEvents = gtaoToggle.checked ? "auto" : "none";
        });
    }

    document.getElementById('gtao-intensity').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('gtao-str-val').innerText = val.toFixed(1);
        if (gtaoPass) gtaoPass.blendIntensity = val;
    });

    document.getElementById('gtao-radius').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('gtao-rad-val').innerText = val.toFixed(2);
        if (gtaoPass) gtaoPass.radius = val;
    });

    // View Controls
    document.getElementById('auto-rotate-toggle').addEventListener('change', (e) => {
        if (controls) controls.autoRotate = e.target.checked;
    });

    document.getElementById('grid-toggle').addEventListener('change', (e) => {
        if (grid) grid.visible = e.target.checked;
    });

    document.getElementById('axis-toggle').addEventListener('change', (e) => {
        const show = e.target.checked;
        if (axesHelper) axesHelper.visible = show;
        axisLabels.forEach(label => label.visible = show);
    });

    // Geometry Controls
    document.getElementById('voxel-size').addEventListener('input', (e) => {
        const scale = parseFloat(e.target.value);
        document.getElementById('voxel-size-val').innerText = scale.toFixed(2);

        if (!instancedMesh || !currentVoxData) return;

        const dummy = new THREE.Object3D();
        const voxelCount = instancedMesh.count;

        for (let i = 0; i < voxelCount; i++) {
            const v = currentVoxData.voxels[i];
            dummy.position.set(v.x, v.z, v.y); // Maintain Y-up
            dummy.scale.set(scale, scale, scale);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
    });

    // Texture Controls
    const texInput = document.getElementById('texture-input');
    const texBtn = document.getElementById('texture-btn');
    const texToggle = document.getElementById('texture-toggle');

    texBtn.addEventListener('click', () => texInput.click());
    texInput.addEventListener('change', (e) => handleTextureUpload(e.target.files[0]));
    texToggle.addEventListener('change', () => updateMaterialTexture());
}

// --- Texture Handling ---
function handleTextureUpload(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const loader = new THREE.TextureLoader();
        loader.load(e.target.result, (texture) => {
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.colorSpace = THREE.SRGBColorSpace;

            currentTexture = texture;
            document.getElementById('texture-name').innerText = file.name;

            const toggle = document.getElementById('texture-toggle');
            toggle.disabled = false;
            toggle.checked = true;

            updateMaterialTexture();
        });
    };
    reader.readAsDataURL(file);
}

function updateMaterialTexture() {
    if (!instancedMesh) return;

    const toggle = document.getElementById('texture-toggle');
    const shouldUseTexture = toggle.checked && currentTexture;

    instancedMesh.material.map = shouldUseTexture ? currentTexture : null;
    instancedMesh.material.needsUpdate = true;
}

// --- Core Logic ---

async function handleFile(file) {
    if (!file.name.endsWith('.schem')) {
        showError("Invalid file type. Please upload a .schem file.");
        return;
    }

    showError("");
    loader.classList.remove('hidden');
    updateStatus(`Reading ${file.name}...`, 0);

    try {
        const arrayBuffer = await file.arrayBuffer();

        // 1. Decompress
        updateStatus("Decompressing GZip...", 5);
        // Allow UI to update
        await new Promise(r => setTimeout(r, 10));

        let decompressed;
        try {
            decompressed = pako.inflate(new Uint8Array(arrayBuffer));
        } catch (err) {
            throw new Error("Failed to decompress. File might be corrupted or not a valid .schem.");
        }

        // 2. Parse NBT (Robust Recursive)
        updateStatus("Parsing NBT tags...", 10);
        await new Promise(r => setTimeout(r, 10));
        const nbtData = new NBTParser(decompressed).read();

        console.group("Parsed NBT Data");
        console.log(nbtData);
        console.groupEnd();

        // 3. Process Data
        updateStatus("Processing Voxel Data...", 15);

        // Handle Sponge V2/V3 variations
        let width = nbtData.value.Width || nbtData.value.width;
        let height = nbtData.value.Height || nbtData.value.height;
        let length = nbtData.value.Length || nbtData.value.length;
        let palette = nbtData.value.Palette || nbtData.value.palette;
        let blockData = nbtData.value.BlockData || nbtData.value.blockData;

        if (!width || !height || !length) throw new Error("Missing dimensions (Width/Height/Length) in NBT.");
        if (!palette) throw new Error("Missing Palette in NBT.");
        if (!blockData) throw new Error("Missing BlockData in NBT. (Is this a valid .schem file?)");

        // Convert big ints to simple numbers if needed
        width = Number(width);
        height = Number(height);
        length = Number(length);

        currentVoxData = await processSchematic({
            Width: width, Height: height, Length: length,
            Palette: palette, BlockData: blockData
        });

        // 4. Render
        updateStatus("Preparing Render...", 80);
        await renderPreview(currentVoxData);

        uploadDiv.classList.add('hidden');
        controlsDiv.classList.remove('hidden');
        dimInfo.innerText = `Size: ${currentVoxData.size.x}x${currentVoxData.size.y}x${currentVoxData.size.z}`;
        blockCountInfo.innerText = `Blocks: ${currentVoxData.voxels.length}`;

        loader.classList.add('hidden');
        log("Conversion complete.");

    } catch (err) {
        log(err.message, 'error');
        console.error(err);
        showError("Error: " + err.message);
        loader.classList.add('hidden');
    }
}

// --- Robust NBT Parser Class ---
class NBTParser {
    constructor(buffer) {
        this.data = new DataView(buffer.buffer);
        this.offset = 0;
        this.buffer = buffer; // Uint8Array
    }

    read() {
        // Root is always a named Compound Tag (Tag 10)
        const type = this.readByte();
        if (type !== 10) throw new Error(`Root tag must be Compound (10), found ${type}`);

        const name = this.readString();
        log(`Found Root Tag: "${name}"`);

        return {
            type: 'compound',
            name: name,
            value: this.readCompound()
        };
    }

    readByte() { return this.data.getInt8(this.offset++); }
    readShort() { const v = this.data.getInt16(this.offset); this.offset += 2; return v; }
    readInt() { const v = this.data.getInt32(this.offset); this.offset += 4; return v; }
    readLong() {
        // JS max integer safety. BigInt is needed for 64-bit.
        const high = this.data.getInt32(this.offset);
        const low = this.data.getInt32(this.offset + 4);
        this.offset += 8;
        return (BigInt(high) << 32n) | BigInt(low >>> 0);
    }
    readFloat() { const v = this.data.getFloat32(this.offset); this.offset += 4; return v; }
    readDouble() { const v = this.data.getFloat64(this.offset); this.offset += 8; return v; }

    readString() {
        const len = this.data.getUint16(this.offset);
        this.offset += 2;
        const str = new TextDecoder().decode(this.buffer.subarray(this.offset, this.offset + len));
        this.offset += len;
        return str;
    }

    readTag(type) {
        switch (type) {
            case 0: return undefined; // End
            case 1: return this.readByte();
            case 2: return this.readShort();
            case 3: return this.readInt();
            case 4: return this.readLong();
            case 5: return this.readFloat();
            case 6: return this.readDouble();
            case 7: // Byte Array
                const len7 = this.readInt();
                const arr7 = this.buffer.slice(this.offset, this.offset + len7);
                this.offset += len7;
                return arr7;
            case 8: return this.readString();
            case 9: return this.readList();
            case 10: return this.readCompound();
            case 11: // Int Array
                const len11 = this.readInt();
                const arr11 = [];
                for (let i = 0; i < len11; i++) arr11.push(this.readInt());
                return arr11;
            case 12: // Long Array
                const len12 = this.readInt();
                const arr12 = [];
                for (let i = 0; i < len12; i++) arr12.push(this.readLong());
                return arr12;
            default:
                throw new Error(`Unknown NBT Tag Type: ${type} at offset ${this.offset}`);
        }
    }

    readList() {
        const type = this.readByte();
        const length = this.readInt();
        const list = [];
        for (let i = 0; i < length; i++) {
            list.push(this.readTag(type));
        }
        return list;
    }

    readCompound() {
        const compound = {};
        while (true) {
            const type = this.readByte();
            if (type === 0) break; // End Tag
            const name = this.readString();
            compound[name] = this.readTag(type);
        }
        return compound;
    }
}

// --- Logic ---
async function processSchematic(nbt) {
    const width = nbt.Width;
    const height = nbt.Height;
    const length = nbt.Length;

    log(`Schematic Dimensions: ${width}x${height}x${length}`);

    // Invert Palette: ID -> Name
    const idToName = {};
    const paletteEntries = Object.entries(nbt.Palette);

    if (paletteEntries.length === 0) throw new Error("Palette is empty!");

    for (const [key, val] of paletteEntries) {
        idToName[val] = key;
    }

    // Decode BlockData (VarInts)
    const blockIds = [];
    let idx = 0;
    const data = nbt.BlockData; // Uint8Array

    // Safety check on data
    if (!(data instanceof Uint8Array)) throw new Error("BlockData is not a ByteArray");

    // Chunk Size for processing
    const CHUNK_SIZE = 100000;
    let nextYield = CHUNK_SIZE;

    // We can't easily chunk the VarInt decoding freely because it's stateful per byte,
    // but we can yield every N bytes processed or N blocks found.
    // Given the tight loop, let's yield based on output size or input index.

    const totalBytes = data.length;

    while (idx < data.length) {
        let value = 0;
        let varintLength = 0;
        let currentByte;

        while (true) {
            currentByte = data[idx];
            value |= (currentByte & 127) << (varintLength++ * 7);
            idx++;
            if (varintLength > 5) throw new Error("VarInt too big at index " + idx);
            if ((currentByte & 128) !== 128) break;
        }
        blockIds.push(value);

        if (idx > nextYield) {
            const progress = 15 + (idx / totalBytes) * 15; // 15% to 30%
            updateStatus(`Decoding Block Data... ${Math.floor(progress)}%`, progress);
            await new Promise(r => setTimeout(r, 0));
            nextYield = idx + CHUNK_SIZE;
        }
    }

    log(`Decoded ${blockIds.length} blocks.`);

    // Validate block count
    const expected = width * height * length;
    if (blockIds.length !== expected) {
        log(`WARNING: Block count mismatch! Expected ${expected}, got ${blockIds.length}. Visuals might be skewed.`, 'warn');
    }

    const voxels = [];
    const palette = [];
    const blockNameToColorIndex = {};

    const getColor = (str) => {
        if (str.includes("air")) return null;
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        const hex = "00000".substring(0, 6 - c.length) + c;
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        // Ensure not too dark
        if (r + g + b < 100) return { r: r + 100, g: g + 100, b: b + 100, a: 255 };
        return { r, g, b, a: 255 };
    };

    let nextPaletteIdx = 1;

    // Sponge Order: Y Z X usually? Or Y X Z?
    // Spec says: index = (y * length + z) * width + x
    let i = 0;

    const totalBlocks = height * length * width;
    let processedBlocks = 0;
    nextYield = 10000; // Reset yield counter

    for (let y = 0; y < height; y++) {
        for (let z = 0; z < length; z++) {
            for (let x = 0; x < width; x++) {
                if (i >= blockIds.length) break;

                const id = blockIds[i++];
                processedBlocks++;

                if (processedBlocks % 20000 === 0) {
                    const progress = 30 + (processedBlocks / totalBlocks) * 50; // 30% to 80%
                    updateStatus(`Extracting Voxels... ${Math.floor(progress)}%`, progress);
                    await new Promise(r => setTimeout(r, 0));
                }

                if (id === 0) continue;

                const name = idToName[id] || "minecraft:unknown";
                if (name.includes("air") || name === "minecraft:structure_void") continue;

                let colorIdx = blockNameToColorIndex[name];

                if (!colorIdx) {
                    if (nextPaletteIdx > 255) {
                        colorIdx = 1; // Fallback
                    } else {
                        const col = getColor(name);
                        palette.push(col);
                        colorIdx = nextPaletteIdx;
                        blockNameToColorIndex[name] = nextPaletteIdx;
                        nextPaletteIdx++;
                    }
                }

                voxels.push({ x, y: z, z: y, colorIndex: colorIdx });
            }
        }
    }

    // Fill Palette to 256
    while (palette.length < 256) palette.push({ r: 0, g: 0, b: 0, a: 255 });

    return {
        size: { x: width, y: length, z: height },
        voxels: voxels,
        palette: palette
    };
}

// --- Render ---
async function renderPreview(data) {
    // Clean scene
    scene.children.filter(o => o.type === "Mesh" || o.type === "Group").forEach(o => scene.remove(o));

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    // Use MeshStandardMaterial for better lighting/PBR
    const material = new THREE.MeshStandardMaterial({
        vertexColors: document.getElementById('block-colors-toggle').checked, // Default from UI
        roughness: 0.8,
        metalness: 0.1
    });

    if (currentTexture && document.getElementById('texture-toggle').checked) {
        material.map = currentTexture;
    }

    // Limit Max Instances for performance on phones
    // Updated to support larger models (512^3 is huge, so we might still hit GPU limits)
    // 512^3 is 134 million blocks. InstancedMesh limit is technically high, but VRAM is the issue.
    // However, most 512^3 region files are not 100% full.
    // Let's set a safe high limit. 2 million? 
    const MAX_INSTANCES = 5000000;
    const voxelCount = Math.min(data.voxels.length, MAX_INSTANCES);

    if (data.voxels.length > MAX_INSTANCES) {
        log(`Model too large. Previewing first ${MAX_INSTANCES} blocks only.`, 'warn');
        updateStatus("Large model: Preview simplified.");
    }

    const mesh = new THREE.InstancedMesh(geometry, material, voxelCount);
    instancedMesh = mesh; // Save reference
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // Initial Scale
    const initialScale = parseFloat(document.getElementById('voxel-size').value) || 1.0;

    // Batch processing
    const BATCH_SIZE = 5000;

    for (let i = 0; i < voxelCount; i++) {
        const v = data.voxels[i];
        dummy.position.set(v.x, v.z, v.y); // Flip to Y-up
        dummy.scale.set(initialScale, initialScale, initialScale); // Use UI value
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        const p = data.palette[v.colorIndex - 1];
        // Convert to linear space for correct rendering
        color.setRGB(p.r / 255, p.g / 255, p.b / 255);
        color.convertSRGBToLinear();
        mesh.setColorAt(i, color);

        if (i % BATCH_SIZE === 0) {
            const progress = 80 + (i / voxelCount) * 20;
            updateStatus(`Building Mesh... ${Math.floor(progress)}%`, progress);
            await new Promise(r => setTimeout(r, 0));
        }
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;

    // Store original colors for toggling
    mesh.userData.originalColors = mesh.instanceColor.clone(); // Clone the attribute

    // Apply initial state based on toggle
    const blockColorsToggle = document.getElementById('block-colors-toggle');
    if (!blockColorsToggle.checked) {
        mesh.instanceColor = null; // Disable colors if unchecked
        material.vertexColors = false;
    }

    // Center geometry but align to grid cells
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    mesh.position.sub(center); // Centers at 0,0,0

    // Align to Grid Cells (Shift if odd dimension)
    // Three.js X = Schematic Width (data.size.x)
    // Three.js Z = Schematic Length (data.size.y)
    if (data.size.x % 2 !== 0) mesh.position.x += 0.5;
    if (data.size.y % 2 !== 0) mesh.position.z += 0.5;

    // Move to Floor
    // Bottom is at -size.y/2. We want bottom at 0.
    mesh.position.y += size.y / 2;

    // Position Grid at 0
    if (grid) {
        grid.position.set(0, 0, 0);
    }

    scene.add(mesh);

    // Update Dimensions UI with VOXEL counts (Schematic size vs actual bounds?)
    // Let's show the schematic size as requested, with 'voxels' unit
    if (dimInfo) {
        dimInfo.innerText = `Size: ${data.size.x} x ${data.size.y} x ${data.size.z} voxels`;
    }

    // Adjust Camera
    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(maxDim * 1.5, maxDim * 1.2, maxDim * 1.5);
    camera.lookAt(0, 0, 0);
}

// --- Download ---
function downloadVox() {
    if (!currentVoxData) return;

    const parts = [];
    const enc = new TextEncoder();
    const writeStr = (str) => parts.push(enc.encode(str));
    const writeInt = (num) => {
        const b = new ArrayBuffer(4);
        new DataView(b).setInt32(0, num, true);
        parts.push(b);
    };

    writeStr("VOX ");
    writeInt(150);

    const numVoxels = currentVoxData.voxels.length;
    const sizeChunkSize = 24;
    const xyziChunkSize = 12 + 4 + (numVoxels * 4);
    const rgbaChunkSize = 12 + (256 * 4);
    const totalChildrenSize = sizeChunkSize + xyziChunkSize + rgbaChunkSize;

    writeStr("MAIN");
    writeInt(0);
    writeInt(totalChildrenSize);

    // SIZE
    writeStr("SIZE");
    writeInt(12);
    writeInt(0);
    writeInt(currentVoxData.size.x);
    writeInt(currentVoxData.size.y); // Y and Z swapped in VOX
    writeInt(currentVoxData.size.z);

    // XYZI
    writeStr("XYZI");
    writeInt(4 + numVoxels * 4);
    writeInt(0);
    writeInt(numVoxels);

    const xyziBuffer = new ArrayBuffer(numVoxels * 4);
    const xyziView = new DataView(xyziBuffer);
    currentVoxData.voxels.forEach((v, i) => {
        xyziView.setUint8(i * 4 + 0, v.x);
        xyziView.setUint8(i * 4 + 1, v.y);
        xyziView.setUint8(i * 4 + 2, v.z);
        xyziView.setUint8(i * 4 + 3, v.colorIndex);
    });
    parts.push(xyziBuffer);

    // RGBA
    writeStr("RGBA");
    writeInt(256 * 4);
    writeInt(0);

    const paletteBuffer = new ArrayBuffer(256 * 4);
    const palView = new DataView(paletteBuffer);
    currentVoxData.palette.forEach((c, i) => {
        palView.setUint8(i * 4 + 0, c.r);
        palView.setUint8(i * 4 + 1, c.g);
        palView.setUint8(i * 4 + 2, c.b);
        palView.setUint8(i * 4 + 3, c.a);
    });
    parts.push(paletteBuffer);

    const blob = new Blob(parts, { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "converted.vox";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showError(msg) {
    errorDisplay.textContent = msg;
    if (msg) errorDisplay.style.display = 'block';
    else errorDisplay.style.display = 'none';
}

// --- Helper Functions ---
function createAxisLabels() {
    // Clear existing
    axisLabels.forEach(l => scene.remove(l));
    axisLabels = [];

    const distance = 5.5; // Slightly offset from axis helper end (5)
    // AxesHelper colors: X=Red, Y=Green, Z=Blue
    const labels = [
        { text: 'X', pos: new THREE.Vector3(distance, 0, 0), color: '#ff0000' },
        { text: 'Y', pos: new THREE.Vector3(0, distance, 0), color: '#00ff00' },
        { text: 'Z', pos: new THREE.Vector3(0, 0, distance), color: '#0000ff' }
    ];

    labels.forEach(info => {
        const sprite = createTextSprite(info.text, info.color);
        sprite.position.copy(info.pos);
        sprite.visible = false; // Default hidden matching toggle
        scene.add(sprite);
        axisLabels.push(sprite);
    });
}

function createTextSprite(message, color) {
    const canvas = document.createElement('canvas');
    const size = 64;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size); // Clear background
    ctx.fillStyle = color;
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, size / 2, size / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.5, 1.5, 1.5);
    return sprite;
}