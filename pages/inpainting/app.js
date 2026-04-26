// --- Element References ---
const imageUpload = document.getElementById('image-upload');
const imageCanvas = document.getElementById('image-canvas');
const maskCanvas = document.getElementById('mask-canvas');
const canvasWrapper = document.querySelector('.canvas-wrapper');
const brushSizeSlider = document.getElementById('brush-size');
const brushSizeVal = document.getElementById('brush-size-val');
const clearMaskBtn = document.getElementById('clear-mask-btn');
const inpaintBtn = document.getElementById('inpaint-btn');
const statusText = document.getElementById('status-text');

const progressContainer = document.getElementById('progress-container');
const uploadLabel = document.querySelector('label[for="image-upload"]');

const imgCtx = imageCanvas.getContext('2d', { willReadFrequently: true });
const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

// --- State Variables ---
let onnxSession = null;
let isDrawing = false;
let uploadedImage = null;
const INFERENCE_SIZE = 512;

console.log("[DEBUG] Application initialized. Waiting for WASM backend to load.");

// --- Initialize ONNX Session ---
async function initModel() {
    try {
        statusText.innerText = "Downloading MIGAN ONNX Model (~100MB)... check network tab.";
        progressContainer.style.display = 'block';
        console.log("[DEBUG] Fetching model from Hugging Face...");

        ort.env.wasm.numThreads = 1;

        const modelUrl = 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';

        onnxSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['wasm']
        });

        console.log("[DEBUG] MIGAN model loaded successfully!", onnxSession.inputNames);
        statusText.innerText = "Model loaded. Upload an image to begin.";
        progressContainer.style.display = 'none';
    } catch (error) {
        console.error("[ERROR] Failed to load ONNX model. Detailed error:", error);
        statusText.innerText = "Error loading model. Check console.";
        progressContainer.style.display = 'none';
    }
}

initModel();

// --- Image Upload Handling ---
imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    console.log(`[DEBUG] Image selected: ${file.name} (${file.type})`);
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            uploadedImage = img;
            
            // Calculate aspect ratio and set canvas size
            const maxDisplaySize = 800; // Cap display size for performance
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDisplaySize) {
                    height = Math.round((height * maxDisplaySize) / width);
                    width = maxDisplaySize;
                }
            } else {
                if (height > maxDisplaySize) {
                    width = Math.round((width * maxDisplaySize) / height);
                    height = maxDisplaySize;
                }
            }

            imageCanvas.width = width;
            imageCanvas.height = height;
            maskCanvas.width = width;
            maskCanvas.height = height;

            // Update wrapper aspect ratio to match canvas
            canvasWrapper.style.aspectRatio = `${width} / ${height}`;

            imgCtx.clearRect(0, 0, width, height);
            imgCtx.drawImage(img, 0, 0, width, height);

            clearMask();
            inpaintBtn.disabled = false;
            statusText.innerText = "Image loaded. Draw a mask and click Run Inpaint.";
            console.log(`[DEBUG] Image drawn to canvas. Size: ${width}x${height}.`);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// --- Canvas Drawing Logic ---
function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function startDrawing(e) {
    if (!uploadedImage || inpaintBtn.disabled) return;
    isDrawing = true;
    draw(e);
}

function stopDrawing() {
    isDrawing = false;
    maskCtx.beginPath();
}

function draw(e) {
    if (!isDrawing || inpaintBtn.disabled) return;
    e.preventDefault();

    const pos = getMousePos(maskCanvas, e);

    maskCtx.lineWidth = brushSizeSlider.value;
    maskCtx.lineCap = 'round';
    maskCtx.strokeStyle = 'rgba(255, 255, 255, 1)';

    maskCtx.lineTo(pos.x, pos.y);
    maskCtx.stroke();
    maskCtx.beginPath();
    maskCtx.moveTo(pos.x, pos.y);
}

maskCanvas.addEventListener('mousedown', startDrawing);
maskCanvas.addEventListener('mousemove', draw);
maskCanvas.addEventListener('mouseup', stopDrawing);
maskCanvas.addEventListener('mouseout', stopDrawing);

maskCanvas.addEventListener('touchstart', startDrawing, { passive: false });
maskCanvas.addEventListener('touchmove', draw, { passive: false });
maskCanvas.addEventListener('touchend', stopDrawing);

brushSizeSlider.addEventListener('input', (e) => {
    brushSizeVal.innerText = e.target.value;
});

clearMaskBtn.addEventListener('click', clearMask);

function clearMask() {
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    console.log("[DEBUG] Mask cleared.");
}

// --- Inference & Tensor Logic ---
inpaintBtn.addEventListener('click', async () => {
    if (!onnxSession) {
        console.error("[ERROR] Model is not loaded yet.");
        alert("Model is still downloading. Please wait.");
        return;
    }

    try {
        console.log("[DEBUG] Starting Inpainting Process...");
        statusText.innerText = "Processing... (This might freeze the browser for a few seconds)";
        
        // Disable UI and show progress
        inpaintBtn.disabled = true;
        clearMaskBtn.disabled = true;
        uploadLabel.classList.add('disabled');
        progressContainer.style.display = 'block';

        // Wait a tiny bit for the UI to update before heavy sync work
        await new Promise(r => setTimeout(r, 50));

        // --- Prepare 512x512 Offscreen Canvases ---
        const offscreenImg = document.createElement('canvas');
        offscreenImg.width = INFERENCE_SIZE;
        offscreenImg.height = INFERENCE_SIZE;
        const offscreenImgCtx = offscreenImg.getContext('2d');
        offscreenImgCtx.drawImage(imageCanvas, 0, 0, INFERENCE_SIZE, INFERENCE_SIZE);

        const offscreenMask = document.createElement('canvas');
        offscreenMask.width = INFERENCE_SIZE;
        offscreenMask.height = INFERENCE_SIZE;
        const offscreenMaskCtx = offscreenMask.getContext('2d');
        offscreenMaskCtx.drawImage(maskCanvas, 0, 0, INFERENCE_SIZE, INFERENCE_SIZE);

        const imgData = offscreenImgCtx.getImageData(0, 0, INFERENCE_SIZE, INFERENCE_SIZE);
        const maskData = offscreenMaskCtx.getImageData(0, 0, INFERENCE_SIZE, INFERENCE_SIZE);

        console.log("[DEBUG] Converting image and mask to Uint8 Tensors...");

        const imageUint8 = new Uint8Array(3 * INFERENCE_SIZE * INFERENCE_SIZE);
        for (let i = 0; i < INFERENCE_SIZE * INFERENCE_SIZE; i++) {
            imageUint8[i] = imgData.data[i * 4];
            imageUint8[INFERENCE_SIZE * INFERENCE_SIZE + i] = imgData.data[i * 4 + 1];
            imageUint8[2 * INFERENCE_SIZE * INFERENCE_SIZE + i] = imgData.data[i * 4 + 2];
        }
        const imageTensor = new ort.Tensor('uint8', imageUint8, [1, 3, INFERENCE_SIZE, INFERENCE_SIZE]);

        const maskUint8 = new Uint8Array(INFERENCE_SIZE * INFERENCE_SIZE);
        for (let i = 0; i < INFERENCE_SIZE * INFERENCE_SIZE; i++) {
            // MIGAN expects 0 for masked area and 255 for known area
            maskUint8[i] = maskData.data[i * 4 + 3] > 0 ? 0 : 255;
        }
        const maskTensor = new ort.Tensor('uint8', maskUint8, [1, 1, INFERENCE_SIZE, INFERENCE_SIZE]);

        console.log(`[DEBUG] Image Tensor Shape: ${imageTensor.dims}, Type: ${imageTensor.type}`);
        console.log(`[DEBUG] Mask Tensor Shape: ${maskTensor.dims}, Type: ${maskTensor.type}`);

        const feeds = {};
        feeds[onnxSession.inputNames[0]] = imageTensor;
        feeds[onnxSession.inputNames[1]] = maskTensor;

        console.log("[DEBUG] Executing ONNX Session run()...");
        const startTime = performance.now();
        const results = await onnxSession.run(feeds);
        const endTime = performance.now();
        console.log(`[DEBUG] Inference complete in ${Math.round(endTime - startTime)}ms`);

        const outputName = onnxSession.outputNames[0];
        const outputTensor = results[outputName];
        console.log(`[DEBUG] Output Tensor Shape: ${outputTensor.dims}, Type: ${outputTensor.type}`);

        const outData = outputTensor.data;
        const newImageData = new ImageData(INFERENCE_SIZE, INFERENCE_SIZE);

        for (let i = 0; i < INFERENCE_SIZE * INFERENCE_SIZE; i++) {
            let r = outData[i];
            let g = outData[INFERENCE_SIZE * INFERENCE_SIZE + i];
            let b = outData[2 * INFERENCE_SIZE * INFERENCE_SIZE + i];

            if (outputTensor.type === 'float32') {
                newImageData.data[i * 4] = Math.max(0, Math.min(255, r * 255));
                newImageData.data[i * 4 + 1] = Math.max(0, Math.min(255, g * 255));
                newImageData.data[i * 4 + 2] = Math.max(0, Math.min(255, b * 255));
            } else {
                newImageData.data[i * 4] = r;
                newImageData.data[i * 4 + 1] = g;
                newImageData.data[i * 4 + 2] = b;
            }
            newImageData.data[i * 4 + 3] = 255;
        }

        // --- Draw back to main canvas ---
        // We create a temporary canvas for the result to resize it back correctly
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = INFERENCE_SIZE;
        tempCanvas.height = INFERENCE_SIZE;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(newImageData, 0, 0);

        // Draw the inpainted result back onto the main canvas, stretching it to match the current aspect ratio
        imgCtx.drawImage(tempCanvas, 0, 0, imageCanvas.width, imageCanvas.height);
        
        clearMask();

        statusText.innerText = "Inpainting Complete! Draw again to refine.";
    } catch (err) {
        console.error("[ERROR] Inpainting failed during tensor processing or execution:", err);
        statusText.innerText = "Failed. Check console logs for tensor/dimension errors.";
    } finally {
        // Re-enable UI and hide progress
        inpaintBtn.disabled = false;
        clearMaskBtn.disabled = false;
        uploadLabel.classList.remove('disabled');
        progressContainer.style.display = 'none';
    }
});