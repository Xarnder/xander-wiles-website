import { batchEntries, batchVideoName, scanBatchDirectory, sourceVideoName, processBatch, batchOutput, writeBatchJSON } from './batch-video.js';
import { captureCamera, applyCamera, createOrbitPath, orbitStartPose, samplePath, videoDimensions, frameSchedule, abortCheck, waitFor, parseCameraPath, cameraPathJSON } from './camera-path.js';

let active = false;
let driven = false;
export const isVideoActive = () => active;
export const isVideoCameraDriven = () => driven;
const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));

export async function openVideoRecorder(adapter) {
    if (active) return;
    active = true;
    document.body.classList.add('video-workflow');
    const panels = [...document.querySelectorAll('.compare-bar, .compare-pose-panel, .controls-panel, .floating-hud, .toggle-panel-btn, .mobile-gizmo-bar')];
    const inertStates = panels.map(panel => panel.inert);
    panels.forEach(panel => { panel.inert = true; });
    const controller = new AbortController();
    const { signal } = controller;
    const initial = adapter.save();
    const initialCamera = captureCamera(adapter.camera());
    const dialog = document.createElement('dialog');
    dialog.className = 'image-export-dialog video-dialog';
    dialog.setAttribute('aria-label', 'Camera path video');
    const overlay = document.createElement('div');
    overlay.className = 'video-record-status';
    overlay.hidden = true;
    const urls = [];
    let phase = 'setup';
    let samples = [];
    let duration = 10;
    let orbit = false;
    let exporting = false;
    let batch = null;
    let batchFinished = false;
    document.body.append(dialog, overlay);
    const abort = () => controller.abort();
    const hidden = () => { if (document.hidden && ['countdown', 'recording', 'preview'].includes(phase)) abort(); };
    // Browser resizing must not cancel or change the recorded world-space path.
    const key = event => {
        if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); abort(); }
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('keydown', key, true);
    dialog.addEventListener('cancel', event => { event.preventDefault(); abort(); });

    function setDriven(value) { driven = value; adapter.setDriven(value); }
    const statusLabel = document.createElement('span');
    const cancelButton = document.createElement('button');
    cancelButton.className = 'compare-chip'; cancelButton.textContent = 'Cancel'; cancelButton.onclick = abort;
    overlay.append(statusLabel, cancelButton);
    function status(text) {
        overlay.hidden = false;
        statusLabel.textContent = text;
    }
    async function choose(html, validate) {
        abortCheck(signal);
        overlay.hidden = true;
        dialog.innerHTML = html;
        dialog.showModal();
        return waitFor(new Promise(resolve => {
            dialog.onclick = async event => {
                const action = event.target.closest('[data-action]');
                if (!action || action.disabled) return;
                if (validate && action.dataset.action !== 'cancel') {
                    action.disabled = true;
                    try { if (!await validate(action.dataset.action)) return; }
                    catch (error) { const alert = dialog.querySelector('[role=alert]'); if (alert) alert.textContent = error.message; return; }
                    finally { action.disabled = false; }
                }
                resolve(action.dataset.action);
            };
        }), signal, 86400000).finally(() => dialog.close());
    }
    async function animate(seconds, tick) {
        const start = performance.now();
        await waitFor(new Promise((resolve, reject) => {
            const step = now => {
                try {
                    abortCheck(signal);
                    const time = Math.min(seconds, (now - start) / 1000);
                    tick(time);
                    if (time >= seconds) resolve(); else requestAnimationFrame(step);
                } catch (error) { reject(error); }
            };
            requestAnimationFrame(step);
        }), signal, (seconds + 30) * 1000);
    }
    try {
        async function configureOrbit() {
            setDriven(true);
            dialog.classList.add('orbit-live-dialog');
            const choice = choose(`<h2>360° orbit</h2>
                <p>Make one full circle around the current orbit target, always looking at its center. Pan the viewer before opening Video to change that target.</p><p class="export-note">Live framing: changing radius or height updates the view immediately. Create the orbit to preview the full circle.</p>
                <label>Radius (scene units)<input id="orbit-radius" type="number" min="0.001" step="any" value="${orbit?.radius ?? 3}"></label>
                <label>Height above target (scene units)<input id="orbit-height" type="number" step="any" value="${orbit?.height ?? 0}"></label>
                <label>Duration (5–20 seconds)<input id="orbit-duration" type="number" min="5" max="20" step="1" value="${duration}"></label>
                <p class="export-note">Height follows the camera’s up axis; negative values move below the target. The same orbit is used for all loaded splats and all files in batch mode. Keep batch models aligned in the same coordinates.</p>
                <p role="alert"></p><div class="export-actions"><button class="btn-action" data-action="cancel">Cancel</button><button class="btn-action primary" data-action="generate">Create orbit</button></div>`, () => {
                    const inputs = ['radius', 'height', 'duration'].map(key => dialog.querySelector(`#orbit-${key}`));
                    if (inputs.some(input => !input.value.trim())) throw new Error('Enter a radius, height and duration');
                    const [radius, height, seconds] = inputs.map(input => Number(input.value));
                    const path = createOrbitPath(initialCamera, initial.target.toArray(), radius, height, seconds);
                    orbit = { radius, height };
                    samples = path.samples;
                    duration = path.duration;
                    return true;
                });
            const updateFraming = () => {
                const radiusText = dialog.querySelector('#orbit-radius').value;
                const heightText = dialog.querySelector('#orbit-height').value;
                const radius = Number(radiusText), height = Number(heightText);
                // Keep the last valid framing while a number is temporarily empty or incomplete.
                if (!radiusText.trim() || !heightText.trim() || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(height)) return;
                applyCamera(adapter.camera(), orbitStartPose(initialCamera, initial.target.toArray(), radius, height));
                adapter.preview();
            };
            dialog.oninput = updateFraming;
            try {
                updateFraming();
                return await choice !== 'cancel';
            } finally {
                dialog.oninput = null;
                dialog.classList.remove('orbit-live-dialog');
            }
        }
        const setup = await choose(`<h2>Camera movement</h2>
            <p>Record your own camera path, create a 360° orbit, or load a saved path. Each option works for loaded splats and batch processing.</p>
            <label>Duration (5–20 seconds)<input id="video-duration" type="number" min="5" max="20" step="1" value="10"></label>
            <p class="export-note">For a custom path, orbit, pan and zoom after a 3-second countdown. Keep this tab visible while recording. Output framing is set separately from the browser window.</p>
            <button class="btn-action" data-action="orbit">Create 360° orbit</button>
            <div class="video-path-import"><label>Or reuse a saved camera movement<input id="video-path-file" type="file" accept=".json,application/json"></label>
            <button class="btn-action" data-action="import">Load camera path JSON</button></div>
            <p class="export-note">Saved paths contain camera movement only. Load your splats separately; keep their coordinates and alignment consistent.</p>
            <p role="alert"></p>
            <div class="export-actions"><button class="btn-action" data-action="cancel">Cancel</button><button class="btn-action primary" data-action="record">Record new movement</button></div>`, async action => {
                if (action !== 'import') return true;
                const file = dialog.querySelector('#video-path-file').files?.[0];
                if (!file) throw new Error('Choose a saved camera path JSON file first');
                if (file.size > 10 * 1024 * 1024) throw new Error('Camera path JSON must be smaller than 10 MB');
                const path = parseCameraPath(await file.text());
                abortCheck(signal);
                samples = path.samples;
                duration = path.duration;
                return true;
            });
        if (setup === 'cancel') return;
        if (setup === 'orbit' && !await configureOrbit()) return;
        if (setup === 'record') duration = Math.max(5, Math.min(20, Math.round(Number(dialog.querySelector('#video-duration').value) || 10)));
        else {
            setDriven(true);
            applyCamera(adapter.camera(), samples[0].pose);
            adapter.preview();
        }
        let action = setup === 'record' ? 'redo' : 'review';
        while (true) {
            if (action === 'edit-orbit') {
                if (!await configureOrbit()) return;
                applyCamera(adapter.camera(), samples[0].pose);
                adapter.preview();
            }
            if (action === 'redo') {
                adapter.restore(initial);
                setDriven(false);
                phase = 'countdown';
                await animate(3, time => status(`Get ready… ${Math.max(1, Math.ceil(3 - time))}`));
                phase = 'recording';
                samples = [{ time: 0, pose: { ...captureCamera(adapter.camera()), aspect: initialCamera.aspect } }];
                await animate(duration, time => {
                    samples.push({ time, pose: { ...captureCamera(adapter.camera()), aspect: initialCamera.aspect } });
                    status(`Recording ${time.toFixed(1)} / ${duration}s — orbit, pan and zoom`);
                });
                setDriven(true);
            }
            if (action === 'preview') {
                phase = 'preview';
                await animate(duration, time => {
                    applyCamera(adapter.camera(), samplePath(samples, time));
                    adapter.preview();
                    status(`Preview ${time.toFixed(1)} / ${duration}s`);
                });
            }
            phase = 'review';
            action = await choose(`<h2>Happy with the movement?</h2><p>${duration} seconds of camera movement. Preview replays the camera path in the viewer.</p>
                <div class="export-actions"><button class="btn-action" data-action="preview">Preview</button><button class="btn-action" data-action="${orbit ? 'edit-orbit' : 'redo'}">${orbit ? 'Edit orbit' : 'Redo'}</button></div>
                <button class="btn-action" data-action="save-path">Download camera path JSON</button>
                <p class="export-note">Save this movement to reuse it in a new session, without recording again. The original timing and framing are included.</p>
                <p id="video-path-saved" aria-live="polite"></p><p role="alert"></p>
                <div class="export-actions"><button class="btn-action" data-action="cancel">Close</button><button class="btn-action" data-action="batch">Batch processing</button><button class="btn-action primary" data-action="export">Use movement</button></div>`, action => {
                    if (action === 'save-path') {
                        const blob = new Blob([cameraPathJSON(samples, duration)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `camera-path-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
                        document.body.appendChild(link);
                        link.click(); link.remove();
                        setTimeout(() => URL.revokeObjectURL(url), 4000);
                        dialog.querySelector('#video-path-saved').textContent = 'Camera path download started. You can close this window or continue to video export.';
                        return false;
                    }
                    if (['export', 'batch'].includes(action) && (!globalThis.VideoEncoder || !globalThis.VideoFrame)) throw new Error('MP4 export requires WebCodecs video encoding. You can still save this camera path JSON and use it in a supported browser.');
                    return true;
                });
            if (action === 'cancel') return;
            if (action === 'export' || action === 'batch') break;
        }
        if (action === 'batch') {
            phase = 'batch-setup';
            let destination = null;
            let sourceRoot = null;
            let sourceEntries = [];
            const selection = choose(`<h2>Batch processing</h2>
                <p>Choose a folder of splats. Files in subfolders are included. Each model is loaded, rendered, saved and unloaded before the next begins. There is no four-file or 100-file limit.</p>
                <label>Save videos<select id="batch-layout" class="custom-select"><option value="separate">In a separate output folder</option><option value="source">Beside each original splat</option></select></label>
                <div id="batch-separate"><label>Splat folder<input id="batch-files" type="file" webkitdirectory multiple></label>
                <button class="btn-action" data-action="destination">Choose output folder</button>
                <p id="batch-destination" aria-live="polite">No output folder selected.</p></div>
                <div id="batch-source" hidden><button class="btn-action" data-action="source">Choose source folder</button>
                <p class="export-note">Includes all subfolders. Each video keeps its source name: room/model.ply → room/model.mp4. Existing MP4s are skipped, never overwritten.</p></div>
                <label>Filename prefix (optional)<input id="batch-prefix" type="text" maxlength="64" placeholder="e.g. orbit_" autocomplete="off"></label>
                <label>Filename suffix (optional)<input id="batch-suffix" type="text" maxlength="64" placeholder="e.g. _360" autocomplete="off"></label>
                <p id="batch-name-preview" class="export-note" aria-live="polite"></p>
                <p id="batch-count" aria-live="polite">No source folder selected.</p>
                <p class="export-note">Separate-folder mode saves MP4s into a new subfolder. Beside-source mode saves them alongside the originals. Files stay on your computer. Splats keep their original coordinates; no automatic centering or alignment is applied.</p>
                <p class="export-note">Automatic folder saving requires a browser with folder-write support, such as desktop Chrome or Edge. Keep this page open until the batch finishes.</p>
                <p role="alert"></p><div class="export-actions"><button class="btn-action" data-action="cancel">Cancel</button><button class="btn-action primary" data-action="continue">Continue</button></div>`, async action => {
                    if (action === 'source') {
                        if (!window.showDirectoryPicker) throw new Error('Saving beside source files requires desktop Chrome or Edge.');
                        let root;
                        try { root = await window.showDirectoryPicker({ mode: 'readwrite', id: 'splat-video-source' }); }
                        catch (error) { if (error.name === 'AbortError') return false; throw error; }
                        dialog.querySelector('#batch-count').textContent = 'Scanning subfolders…';
                        const entries = await scanBatchDirectory(root, signal);
                        sourceRoot = root;
                        sourceEntries = entries;
                        updateNamePreview();
                        dialog.querySelector('#batch-count').textContent = `${entries.length} splats found in ${root.name} and its subfolders.`;
                        return false;
                    }
                    if (action === 'destination') {
                        if (!window.showDirectoryPicker) throw new Error('This browser cannot save automatically to a folder. Open this viewer in desktop Chrome or Edge for batch processing.');
                        try { destination = await window.showDirectoryPicker({ mode: 'readwrite', id: 'splat-video-output' }); }
                        catch (error) { if (error.name === 'AbortError') return false; throw error; }
                        dialog.querySelector('#batch-destination').textContent = `Output folder: ${destination.name}`;
                        return false;
                    }
                    const besideSource = dialog.querySelector('#batch-layout').value === 'source';
                    const entries = besideSource ? sourceEntries : batchEntries(dialog.querySelector('#batch-files').files);
                    if (!entries.length) throw new Error('Choose a folder containing .ply, .splat, .ksplat or .spz files');
                    if (!(besideSource ? sourceRoot : destination)) throw new Error('Choose an output folder first');
                    const naming = readNaming();
                    sourceVideoName(entries[0], naming); // Validate before starting the batch.
                    batch = { naming, entries, destination: besideSource ? sourceRoot : destination, besideSource, directory: null, results: [] };
                    return true;
                });
            const readNaming = () => ({ prefix: dialog.querySelector('#batch-prefix').value, suffix: dialog.querySelector('#batch-suffix').value });
            function updateNamePreview() {
                const besideSource = dialog.querySelector('#batch-layout').value === 'source';
                const entry = (besideSource ? sourceEntries : batchEntries(dialog.querySelector('#batch-files').files))[0] || { name: 'model.ply' };
                try {
                    const name = besideSource ? sourceVideoName(entry, readNaming()) : batchVideoName(entry, 0, readNaming());
                    dialog.querySelector('#batch-name-preview').textContent = `${entry.name} → ${name}`;
                    dialog.querySelector('[role=alert]').textContent = '';
                } catch (error) {
                    dialog.querySelector('#batch-name-preview').textContent = '';
                    dialog.querySelector('[role=alert]').textContent = error.message;
                }
            }
            dialog.oninput = updateNamePreview;
            updateNamePreview();
            dialog.onchange = () => {
                const besideSource = dialog.querySelector('#batch-layout').value === 'source';
                dialog.querySelector('#batch-separate').hidden = besideSource;
                dialog.querySelector('#batch-source').hidden = !besideSource;
                updateNamePreview();
                const count = besideSource ? sourceEntries.length : batchEntries(dialog.querySelector('#batch-files').files).length;
                dialog.querySelector('#batch-count').textContent = `${count} supported splat files queued, processed one at a time.`;
            };
            if (await selection === 'cancel') return;
            dialog.onchange = null;
            dialog.oninput = null;
        }
        phase = 'settings';
        const recordedAspect = samples[0].pose.aspect;
        let settings;
        // Load the encoder only when needed; ordinary viewing stays lightweight.
        const media = await import('./vendor/mediabunny.mjs');
        const outputDimensions = () => {
            const shape = dialog.querySelector('#video-aspect').value;
            return videoDimensions(Number(dialog.querySelector('#video-width').value), shape === 'recorded' ? recordedAspect : Number(shape));
        };
        const choicePromise = choose(`<h2>Export MP4 videos</h2>
                <label>Video shape<select id="video-aspect" class="custom-select"><option value="1.7777777777777777">Landscape (16:9)</option><option value="0.5625">Portrait (9:16)</option><option value="1">Square (1:1)</option><option value="recorded">Original camera path</option></select></label>
                <p class="export-note">Video shape is independent of your window size. Camera position, direction and vertical field of view are preserved.</p>
                <label>Resolution (width)<select id="video-width" class="custom-select"><option value="1280">1280 px</option><option value="1920" selected>1920 px</option><option value="2560">2560 px</option><option value="3840">3840 px</option></select></label>
                <label>Frame rate<select id="video-fps" class="custom-select"><option value="24">24 fps</option><option value="30" selected>30 fps</option><option value="60">60 fps</option></select></label>
                <label>Background<select id="video-background" class="custom-select"><option value="black">Black</option><option value="white">White</option></select></label>
                <p id="video-size" aria-live="polite"></p><p class="export-note">One silent MP4 per splat, with matching camera movement and timing. Rendering may take longer than the video duration.</p>
                <p id="video-error" role="alert"></p><div class="export-actions"><button class="btn-action" data-action="cancel">Cancel</button><button class="btn-action primary" data-action="start">Render videos</button></div>`, async () => {
            const dimensions = outputDimensions();
            const fps = Number(dialog.querySelector('#video-fps').value);
            const quality = new media.Quality({ bitrate: Math.min(60000000, Math.max(4000000, dimensions.width * dimensions.height * fps * 0.16)) });
            const encoding = { codec: 'avc', quality, latencyMode: 'quality' };
            const supported = await media.canEncodeVideo('avc', { ...dimensions, ...encoding, frameRate: fps });
            if (!supported) throw new Error('This browser cannot encode that MP4 size/frame rate. Try a lower resolution or frame rate.');
            settings = { ...dimensions, fps, encoding, background: dialog.querySelector('#video-background').value };
            return true;
        });
        const updateSize = () => {
            const size = outputDimensions();
            dialog.querySelector('#video-size').textContent = `${size.width} × ${size.height} pixels · ${duration * Number(dialog.querySelector('#video-fps').value)} frames per video`;
        };
        dialog.oninput = updateSize; updateSize();
        if (await choicePromise === 'cancel') return;
        dialog.oninput = null;
        abortCheck(signal);
        phase = 'export';
        exporting = true;
        status('Preparing splats…');
        if (batch) {
            batch.folderName = `splat-videos-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
            batch.directory = await batch.destination.getDirectoryHandle(batch.folderName, { create: true });
            await writeBatchJSON(batch.directory, 'camera-path.json', JSON.parse(cameraPathJSON(samples, duration)));
            await writeBatchJSON(batch.directory, 'batch-report.json', { status: 'running', total: batch.entries.length, results: [] });
        }
        await adapter.beginExport({ batch: !!batch });
        const entries = batch ? batch.entries : adapter.entries();
        const schedule = frameSchedule(duration, settings.fps);
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        async function renderEntry(entry, s) {
            abortCheck(signal);
            const canvas = document.createElement('canvas');
            canvas.width = settings.width; canvas.height = settings.height;
            const ctx = canvas.getContext('2d', { alpha: false });
            const stem = entry.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').slice(0, 60) || 'splat';
            const filename = batch ? (batch.besideSource ? sourceVideoName(entry, batch.naming) : batchVideoName(entry, s, batch.naming)) : `splat-${stamp}-${s + 1}-${stem}.mp4`;
            let output, fileOutput;
            let complete = false;
            try {
                if (batch) fileOutput = await batchOutput(media, batch.besideSource ? entry.directory : batch.directory, filename, batch.besideSource);
                output = new media.Output({
                    format: new media.Mp4OutputFormat(batch ? { fastStart: false } : {}),
                    target: fileOutput ? fileOutput.target : new media.BufferTarget()
                });
                const source = new media.CanvasSource(canvas, settings.encoding);
                output.addVideoTrack(source, { frameRate: settings.fps });
                await output.start();
                for (let i = 0; i < schedule.length; i++) {
                    abortCheck(signal);
                    applyCamera(adapter.camera(), { ...samplePath(samples, schedule[i].time), aspect: settings.width / settings.height });
                    const frame = await adapter.frame(entry, settings, signal);
                    try { ctx.drawImage(frame, 0, 0); }
                    finally { frame.width = 0; frame.height = 0; }
                    await waitFor(source.add(schedule[i].time, schedule[i].duration), signal);
                    status(`Splat ${s + 1} / ${entries.length}: ${entry.name} · frame ${i + 1} / ${schedule.length} · ${Math.round(((s * schedule.length + i + 1) / (entries.length * schedule.length)) * 100)}%`);
                    await yieldTask();
                }
                source.close();
                await waitFor(output.finalize(), signal);
                abortCheck(signal);
                if (fileOutput) await fileOutput.commit();
                else {
                    const url = URL.createObjectURL(new Blob([output.target.buffer], { type: 'video/mp4' }));
                    urls.push({ url, name: filename });
                }
                complete = true;
                return batch?.besideSource ? entry.path.replace(/[^/]+$/, () => filename) : filename;
            } finally {
                if (!complete) {
                    if (output) await output.cancel().catch(() => {});
                    if (fileOutput) await fileOutput.discard();
                }
                canvas.width = 0; canvas.height = 0;
            }
        }
        if (batch) {
            await processBatch(entries, {
                signal,
                load: (entry, signal) => adapter.load(entry, signal),
                render: renderEntry,
                unload: () => adapter.unload(),
                async progress(entry, index, result, results) {
                    if (!result) status(`Loading ${index + 1} / ${entries.length}: ${entry.path}`);
                    else {
                        batch.results = [...results];
                        await writeBatchJSON(batch.directory, 'batch-report.json', {
                            status: 'running', total: entries.length, resolution: [settings.width, settings.height],
                            fps: settings.fps, results: batch.results
                        });
                    }
                }
            });
            batchFinished = true;
        } else {
            for (let s = 0; s < entries.length; s++) {
                abortCheck(signal);
                status(`Loading splat ${s + 1} / ${entries.length}…`);
                await adapter.load(entries[s], signal);
                await renderEntry(entries[s], s);
            }
        }
        await adapter.endExport(); exporting = false;
        phase = 'complete';
        if (batch) {
            const saved = batch.results.filter(result => result.status === 'saved').length;
            await writeBatchJSON(batch.directory, 'batch-report.json', { status: 'complete', total: entries.length, resolution: [settings.width, settings.height], fps: settings.fps, results: batch.results });
            const skipped = batch.results.filter(result => result.status === 'skipped').length;
            const failed = batch.results.filter(result => result.status === 'failed').length;
            const done = choose(`<h2>Batch processing complete</h2><p>${saved} videos saved automatically. ${skipped} existing videos skipped. ${failed} files failed.</p><p id="batch-saved-location"></p><p class="export-note">No download clicks are needed. The output folder also contains your camera path and a batch report listing saved files and errors.</p><button class="btn-action" data-action="done">Close</button>`);
            dialog.querySelector('#batch-saved-location').textContent = batch.besideSource ? `Videos saved beside their source splats in ${batch.destination.name}. Camera path and report: ${batch.folderName}` : `Saved in ${batch.destination.name} / ${batch.folderName}`;
            await done;
            return;
        }
        const done = choose(`<h2>Download your videos</h2><p>Your ${urls.length} MP4 ${urls.length === 1 ? 'video is' : 'videos are'} ready. Click Download MP4 next to each filename to save it to your computer.</p><div class="video-downloads"></div><p class="export-note">Download the videos you want before closing this window.</p><button class="btn-action" data-action="done">Close</button>`);
        for (const result of urls) {
            const row = document.createElement('div');
            row.className = 'video-download-row';
            const name = document.createElement('span');
            name.className = 'video-download-name';
            name.textContent = result.name;
            const link = document.createElement('a');
            link.className = 'btn-action primary';
            link.href = result.url;
            link.download = result.name;
            link.textContent = 'Download MP4';
            link.setAttribute('aria-label', `Download ${result.name}`);
            row.append(name, link);
            dialog.querySelector('.video-downloads').appendChild(row);
        }
        await done;
    } catch (error) {
        if (error.name !== 'AbortError') adapter.toast(error.message || 'Could not create video', 'error');
        else adapter.toast('Video operation cancelled', 'info');
    } finally {
        controller.abort();
        if (batch?.directory && !batchFinished) {
            try {
                await writeBatchJSON(batch.directory, 'batch-report.json', { status: 'stopped', total: batch.entries.length, results: batch.results });
                adapter.toast(`${batch.results.filter(result => result.status === 'saved').length} completed videos remain saved ${batch.besideSource ? 'beside their source splats' : 'in ' + batch.folderName}`, 'info');
            } catch (error) { adapter.toast(`Could not update the batch report: ${error.message}`, 'error'); }
        }
        if (exporting) { try { await adapter.endExport(); } catch (error) { adapter.toast(error.message, 'error'); } }
        try { adapter.restore(initial); }
        catch (error) { adapter.toast(error.message, 'error'); }
        try { setDriven(false); }
        catch (error) { adapter.toast(error.message, 'error'); }
        urls.forEach(({ url }) => URL.revokeObjectURL(url));
        dialog.remove(); overlay.remove();
        document.body.classList.remove('video-workflow');
        panels.forEach((panel, i) => { panel.inert = inertStates[i]; });
        document.removeEventListener('visibilitychange', hidden);
        window.removeEventListener('keydown', key, true);
        active = false;
    }
}
