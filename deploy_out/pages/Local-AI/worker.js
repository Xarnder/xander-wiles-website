// State
let generator = null;

// Message Handler
self.addEventListener('message', async (event) => {
    const { type, data } = event.data;

    switch (type) {
        case 'init':
            await initializeModel(data.model, data.options);
            break;
        case 'generate':
            await generateText(data.prompt, data.config);
            break;
        case 'interrupt':
            // TODO: Implement interrupt logic if supported by transformers.js streamer
            break;
    }
});

/**
 * Initialize the pipeline
 */
async function initializeModel(modelID, options) {
    try {
        self.postMessage({ type: 'status', data: { status: 'initiate', file: modelID } });

        // Dynamic import inside worker
        const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');

        // Environment setup
        env.allowLocalModels = false;
        env.useBrowserCache = (typeof self.caches !== 'undefined');

        const progressCallback = (data) => {
            // Include type for reliable handling
            self.postMessage({ type: 'progress', data });
        };

        generator = await pipeline('text-generation', modelID, {
            ...options,
            progress_callback: progressCallback
        });

        self.postMessage({ type: 'ready' });
    } catch (err) {
        self.postMessage({
            type: 'error',
            error: err.message,
            stack: err.stack
        });
    }
}

/**
 * Generate text
 */
async function generateText(prompt, config) {
    if (!generator) {
        self.postMessage({ type: 'error', error: 'Model not initialized' });
        return;
    }

    try {
        const output = await generator(prompt, {
            ...config,
            callback_function: (beams) => {
                // Stream partial output if needed
                // For now, transformers.js might not support robust streaming via callback in all versions
                // We'll rely on the final output, or implement a Streamer if needed
                // But user wants "not frozen", which worker achieves regardless of streaming.
                // To support streaming tokens:
                if (beams && beams[0]) {
                    const partial = generator.tokenizer.decode(beams[0].output_token_ids, { skip_special_tokens: true });
                    self.postMessage({ type: 'output', partial });
                }
            }
        });

        // Send final complete output
        const finalRaw = output[0].generated_text;
        self.postMessage({ type: 'complete', output: finalRaw });

    } catch (err) {
        self.postMessage({ type: 'error', error: err.message });
    }
}
