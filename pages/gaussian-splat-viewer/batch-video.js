import { abortCheck } from './camera-path.js';

export function batchEntries(files) {
    return Array.from(files || []).filter(file => /\.(ply|splat|ksplat|spz)$/i.test(file.name))
        .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }))
        .map((file, index) => ({ id: `batch-${index}`, name: file.name, path: file.webkitRelativePath || file.name, file }));
}

export function batchVideoName(entry, index) {
    const stem = entry.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').slice(0, 100) || 'splat';
    return `${String(index + 1).padStart(4, '0')}-${stem}.mp4`;
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
            result = { input: entry.path, status: 'failed', error: error.message || String(error) };
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
export async function batchOutput(media, directory, filename) {
    let stream;
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
