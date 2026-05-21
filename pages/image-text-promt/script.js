const MODEL_ID = "onnx-community/LFM2.5-VL-450M-ONNX";

const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const generateBtn = document.getElementById("generateBtn");
const copyBtn = document.getElementById("copyBtn");
const promptOutput = document.getElementById("promptOutput");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");
const debugLog = document.getElementById("debugLog");
const supportBox = document.getElementById("supportBox");

let selectedFile = null;
let selectedImageUrl = null;

let transformers = null;
let model = null;
let processor = null;
let tokenizer = null;
let isLoadingModel = false;

function debug(message, data = null) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    console.log(line, data ?? "");
    if (debugLog) {
        debugLog.textContent += `${line}${data ? `\n${safeStringify(data)}` : ""}\n`;
    }
}

function safeStringify(value) {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function setStatus(message, type = "idle") {
    statusText.textContent = message;
    statusDot.className = "status-dot";

    if (type === "ready") statusDot.classList.add("ready");
    if (type === "error") statusDot.classList.add("error");

    debug(message);
}

async function checkSupport() {
    debug("Checking browser support.");

    if (!("gpu" in navigator)) {
        supportBox.innerHTML = `
      ⚠️ WebGPU is not available in this browser.
      Use Chrome or Edge desktop first.
    `;
        setStatus("WebGPU not available.", "error");
        return false;
    }

    try {
        const adapter = await navigator.gpu.requestAdapter();

        if (!adapter) {
            supportBox.innerHTML = `
        ⚠️ WebGPU exists, but no GPU adapter was found.
        Check chrome://gpu.
      `;
            setStatus("No WebGPU adapter found.", "error");
            return false;
        }

        supportBox.textContent =
            "✅ WebGPU detected. First run may download a large model and take a while.";

        debug("WebGPU adapter found.", {
            isFallbackAdapter: adapter.isFallbackAdapter
        });

        return true;
    } catch (error) {
        console.error(error);
        setStatus("WebGPU check failed.", "error");
        return false;
    }
}

async function loadModel() {
    if (model && processor && tokenizer) {
        return { model, processor, tokenizer };
    }

    if (isLoadingModel) {
        throw new Error("Model is already loading. Please wait.");
    }

    isLoadingModel = true;
    setStatus("Loading LFM2.5-VL model. First run downloads model files…");

    try {
        debug("Importing Transformers.js v4 dev build.");

        /*
          IMPORTANT:
          LFM2.5-VL needs Transformers.js v4+.
          If this CDN URL changes, install @huggingface/transformers locally
          and import it through Vite instead.
        */
        transformers = await import(
            "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.0-alpha.20/dist/transformers.min.js"
        );

        const {
            AutoModelForImageTextToText,
            AutoProcessor,
            AutoTokenizer,
            env
        } = transformers;

        env.allowLocalModels = false;
        env.allowRemoteModels = true;
        env.useBrowserCache = true;

        debug("Loading processor.", { MODEL_ID });
        processor = await AutoProcessor.from_pretrained(MODEL_ID);

        debug("Loading tokenizer.", { MODEL_ID });
        tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);

        debug("Loading model.", { MODEL_ID });
        model = await AutoModelForImageTextToText.from_pretrained(MODEL_ID, {
            device: "webgpu",
            dtype: {
                embed_tokens: "fp16",
                embed_images: "fp16",
                decoder_model_merged: "q4"
            }
        });

        setStatus("Model loaded. Ready to generate.", "ready");

        return { model, processor, tokenizer };
    } catch (error) {
        console.error("Model load failed:", error);

        debug("Model load failed.", {
            name: error.name,
            message: error.message,
            stack: error.stack
        });

        setStatus("Model failed to load. See console/debug notes.", "error");

        throw error;
    } finally {
        isLoadingModel = false;
    }
}

async function fileToRawImage(file) {
    const { RawImage } = transformers;

    const blobUrl = URL.createObjectURL(file);

    try {
        const image = await RawImage.fromURL(blobUrl);
        return image;
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
}

function buildImagePrompt(description) {
    return [
        description,
        "",
        "Text-to-image prompt:",
        `A detailed, high-quality image of ${description}.`,
        "Include the main subject, environment, lighting, colours, composition, camera angle, mood, textures, and visible details.",
        "Natural proportions, coherent background, sharp focus, realistic detail."
    ].join("\n");
}

async function generatePrompt() {
    if (!selectedFile) {
        setStatus("Please upload an image first.", "error");
        return;
    }

    generateBtn.disabled = true;
    copyBtn.disabled = true;
    promptOutput.value = "";

    try {
        const loaded = await loadModel();

        setStatus("Reading image…");
        const image = await fileToRawImage(selectedFile);

        const messages = [
            {
                role: "user",
                content: [
                    { type: "image" },
                    {
                        type: "text",
                        text: "Describe this image in detail as a prompt for a text-to-image model. Mention subject, setting, lighting, colours, composition, mood, style, and important visible details."
                    }
                ]
            }
        ];

        debug("Applying chat template.");

        const text = loaded.tokenizer.apply_chat_template(messages, {
            add_generation_prompt: true,
            tokenize: false
        });

        debug("Processing image and text.");
        const inputs = await loaded.processor(text, image);

        setStatus("Generating description…");

        const generatedIds = await loaded.model.generate({
            ...inputs,
            max_new_tokens: 220,
            do_sample: false
        });

        debug("Generation complete. Decoding output.");

        const decoded = loaded.tokenizer.batch_decode(generatedIds, {
            skip_special_tokens: true
        });

        debug("Decoded model output.", decoded);

        let description = Array.isArray(decoded) ? decoded[0] : String(decoded);

        // Remove the user prompt if the chat template echoes it.
        description = description
            .replace(/Describe this image[\s\S]*?visible details\./i, "")
            .trim();

        if (!description) {
            throw new Error("The model returned an empty description.");
        }

        promptOutput.value = buildImagePrompt(description);
        copyBtn.disabled = false;
        setStatus("Prompt generated.", "ready");
    } catch (error) {
        console.error(error);

        debug("Generation failed.", {
            name: error.name,
            message: error.message,
            stack: error.stack
        });

        promptOutput.value =
            "The model failed to run.\n\n" +
            error.message +
            "\n\nLikely causes:\n" +
            "1. The Transformers.js v4 alpha CDN URL changed.\n" +
            "2. Your browser does not fully support WebGPU.\n" +
            "3. The model files are too large for the browser/device memory.\n" +
            "4. The model API has changed and needs matching example code from the model card.";

        setStatus("Generation failed.", "error");
    } finally {
        generateBtn.disabled = !selectedFile;
    }
}

imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0];

    if (!file) {
        debug("No file selected.");
        return;
    }

    if (!file.type.startsWith("image/")) {
        setStatus("Please choose an image file.", "error");
        return;
    }

    selectedFile = file;

    if (selectedImageUrl) {
        URL.revokeObjectURL(selectedImageUrl);
    }

    selectedImageUrl = URL.createObjectURL(file);

    previewImage.src = selectedImageUrl;
    previewImage.hidden = false;

    generateBtn.disabled = false;
    copyBtn.disabled = true;
    promptOutput.value = "";

    debug("Image selected.", {
        name: file.name,
        type: file.type,
        sizeMB: Math.round((file.size / 1024 / 1024) * 100) / 100
    });

    setStatus("Image loaded. Ready to generate.", "ready");
});

generateBtn.addEventListener("click", generatePrompt);

copyBtn.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(promptOutput.value);
        setStatus("Prompt copied to clipboard.", "ready");
    } catch (error) {
        console.error(error);
        setStatus("Could not copy prompt.", "error");
    }
});

checkSupport();