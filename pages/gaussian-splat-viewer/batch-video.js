import { abortCheck } from './camera-path.js';

export function batchEntries(files) {
    return Array.from(files || []).filter(file => /\.(ply|splat|ksplat|spz)$/i.test(file.name))
        .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }))
        .map((file, index) => ({ id: `batch-${index}`, name: file.name, path: file.webkitRelativePath || file.name, file }));
}

function namedVideo(stem, { prefix = '', suffix = '' } = {}) {
    if (/[<>:"/\\|?*\u0000-\u001f]/.test(prefix + suffix)) {
        throw new Error('Prefix and suffix cannot contain slashes, control characters, or < > : " | ? *');
    }
    return `${prefix}${stem}${suffix}.mp4`;
}

export function batchVideoName(entry, index, naming) {
    const stem = entry.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').slice(0, 100) || 'splat';
    return namedVideo(`${String(index + 1).padStart(4, '0')}-${stem}`, naming);
}

// Retain each source directory handle so videos can be written beside the
// original file, without reconstructing or flattening its relative path.
export async function scanBatchDirectory(root, signal) {
    const entries = [];
    async function visit(directory, prefix) {
        for await (const handle of directory.values()) {
            abortCheck(signal);
            const path = prefix + handle.name;
            if (handle.kind === 'directory') await visit(handle, path + '/');
            else if (/\.(ply|splat|ksplat|spz)$/i.test(handle.name)) {
                entries.push({ name: handle.name, path, file: await handle.getFile(), directory });
            }
        }
    }
    await visit(root, '');
    entries.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
    return entries.map((entry, index) => ({ ...entry, id: `batch-${index}` }));
}

export function sourceVideoName(entry, naming) {
    return namedVideo(entry.name.replace(/\.[^.]+$/, ''), naming);
}

// Never begin another upload until the previous model has been disposed.
export async function processBatch(entries, { signal, load, render, unload, progress }) {
    const results = [];
    for (let index = 0; index < entries.length; index++) {
        abortCheck(signal);
        const entry = entries[index];
        let result;
        try {
            await progress(entry, index);
            await load(entry, signal);
            abortCheck(signal);
            const filename = await render(entry, index);
            result = { input: entry.path, output: filename, status: 'saved' };
        } catch (error) {
            if (error.name === 'AbortError' || error.batchFatal) throw error;
            result = { input: entry.path, status: error.batchSkipped ? 'skipped' : 'failed', error: error.message || String(error) };
        } finally {
            await unload();
        }
        results.push(result);
        // Persist the manifest after each file; completed work survives cancellation.
        await progress(entry, index, result, results);
    }
    return results;
}

export async function writeBatchJSON(directory, name, data) {
    const handle = await directory.getFileHandle(name, { create: true });
    const stream = await handle.createWritable();
    try { await stream.write(JSON.stringify(data, null, 2)); await stream.close(); }
    catch (error) { await stream.abort().catch(() => {}); throw error; }
}

// Own the final commit: cancelling the encoder must not commit a partial MP4.
export async function batchOutput(media, directory, filename, protectExisting = false) {
    let stream;
    if (protectExisting) {
        try {
            await directory.getFileHandle(filename);
            const error = new Error(`${filename} already exists; left unchanged`);
            error.batchSkipped = true;
            throw error;
        } catch (error) {
            if (error.name !== 'NotFoundError') {
                if (!error.batchSkipped) error.batchFatal = true;
                throw error;
            }
        }
    }
    try {
        const handle = await directory.getFileHandle(filename, { create: true });
        stream = await handle.createWritable();
    } catch (error) { error.batchFatal = true; throw error; }
    const target = new media.StreamTarget(new WritableStream({
        async write(chunk) {
            try { await stream.write(chunk); }
            catch (error) { error.batchFatal = true; throw error; }
        }
    }), { chunked: true, chunkSize: 1024 * 1024 });
    return {
        target,
        async commit() {
            try { await stream.close(); } catch (error) { error.batchFatal = true; throw error; }
        },
        async discard() {
            await stream.abort().catch(() => {});
            await directory.removeEntry(filename).catch(() => {});
        }
    };
}
