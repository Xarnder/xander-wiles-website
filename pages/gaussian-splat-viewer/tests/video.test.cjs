const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const pathSource = read('camera-path.js');
const identityQuaternion = class {
    fromArray(a) { this.value = a; return this; }
    slerp() { return this; }
    toArray() { return this.value; }
};
const contextFor = extra => vm.createContext({ assert, console, setTimeout, clearTimeout, AbortController, DOMException, THREE: { Quaternion: identityQuaternion }, ...extra });

test('recorded path interpolates by time; frame count and dimensions stay deterministic', () => {
    vm.runInContext(pathSource + `
        const pose = x => ({ position: [x, 0, 0], quaternion: [0, 0, 0, 1], up: [0, 1, 0], fov: 65, zoom: 1, near: .1, far: 100, aspect: 16/9 });
        const samples = [{time:0,pose:pose(0)}, {time:0.2,pose:pose(2)}, {time:5,pose:pose(50)}];
        assert.equal(samplePath(samples, 2.5).position[0], 25);
        assert.equal(samplePath(samples, -1).position[0], 0);
        assert.equal(samplePath(samples, 10).position[0], 50);
        for (const fps of [24,30,60]) {
            const frames = frameSchedule(20, fps);
            assert.equal(frames.length, 20 * fps);
            assert.ok(Math.abs(frames.at(-1).time + frames.at(-1).duration - 20) < 1e-9);
        }
        assert.equal(videoDimensions(1920, 16/9).height, 1080);
        assert.equal(videoDimensions(1280, 1.7).height % 2, 0);
    `, contextFor());
});

test('frame capture waits for previous and newly forced depth sort', async () => {
    const events = [];
    const viewer = {
        sortRunning: true, sortPromise: Promise.resolve().then(() => events.push('old sort')),
        camera: { updateMatrixWorld() {} }, splatMesh: { updateMatrixWorld() {} }, updateSplatMesh() {},
        async runSplatSort(force, all) {
            assert.equal(force, true); assert.equal(all, true); events.push('force');
            this.sortPromise = Promise.resolve().then(() => events.push('new sort'));
        }
    };
    await vm.runInContext(pathSource + 'sortVideoFrame(viewer, new AbortController().signal)', contextFor({ viewer }));
    assert.deepEqual(events, ['old sort', 'force', 'new sort']);
});

test('waiting for a stalled GPU sort can be cancelled', async () => {
    const controller = new AbortController();
    const waiting = vm.runInContext(pathSource + 'waitFor(new Promise(() => {}), controller.signal)', contextFor({ controller }));
    controller.abort();
    await assert.rejects(waiting, { name: 'AbortError' });
});

for (const [count, cancelExport, imported, batching] of [[1, false, false], [4, false, false], [4, true, false], [4, false, true], [3, false, true, true]]) test(`${imported ? 'imported path without recording' : 'countdown, preview and redo'} and ${count} video exports${cancelExport ? ' cancelled' : ''}${batching ? ' to a batch folder' : ''}`, async () => {
    let now = 0, restores = 0, previews = 0, finalized = 0, released = 0, ended = 0;
    const actions = batching ? ['import', 'preview', 'batch', 'destination', 'continue', 'start', 'done'] : imported ? ['import', 'preview', 'export', 'start', 'done'] : ['record', 'preview', 'redo', 'export', 'start', 'done'];
    const savedPose = x => ({ position:[x,0,0], quaternion:[0,0,0,1], up:[0,1,0], fov:65, zoom:1, near:.1, far:100, aspect:16/9 });
    const savedPath = JSON.stringify({ type:'gaussian-splat-camera-path', version:1, duration:5, samples:[{time:0,pose:savedPose(100)},{time:5,pose:savedPose(150)}] });
    const timing = [], recordings = [];
    let currentTiming;
    const elements = {
        '#batch-files': { files: Array.from({length:count}, (_,i)=>({name:'model'+i+'.splat'})) },
        '#batch-destination': {}, '#batch-saved-location': {},
        '#video-path-file': { files: [{ size: savedPath.length, text: async () => savedPath }] },
        '#video-duration': { value: '5' }, '#video-width': { value: '1280' },
        '#video-fps': { value: '24' }, '#video-background': { value: 'black' },
        '#video-size': {}, '[role=alert]': {}, '.video-downloads': { appendChild() {} }
    };
    const makeElement = tag => ({
        tag, innerHTML: '', hidden: false, className: '',
        setAttribute() {}, append() {}, appendChild() {}, replaceChildren() {}, remove() {}, close() {}, addEventListener() {},
        querySelector: selector => elements[selector],
        showModal() {
            const action = actions.shift();
            assert.ok(action, 'unexpected modal');
            setImmediate(async () => {
                await this.onclick({ target: { closest: () => ({ dataset: { action }, disabled: false }) } });
                if (action === 'destination') {
                    const next = actions.shift();
                    await this.onclick({ target: { closest: () => ({ dataset: { action: next }, disabled: false }) } });
                }
            });
        },
        getContext: () => ({ drawImage() {} })
    });
    const camera = {
        position: { value: [0,0,0], toArray() { return [...this.value]; }, fromArray(a) { this.value = a; } },
        quaternion: { toArray: () => [0,0,0,1], fromArray() {} }, up: { toArray: () => [0,1,0], fromArray() {} },
        fov:65, zoom:1, near:.1, far:100, aspect:16/9, updateProjectionMatrix() {}, updateMatrixWorld() {}
    };
    const adapter = {
        camera: () => camera, save: () => ({}), restore: () => restores++, setDriven() {},
        preview: () => previews++, toast: message => { if (!cancelExport) throw new Error(message); },
        entries: () => Array.from({length: count}, (_, id) => ({id, name: 'test.splat'})),
        async unload() {}, async beginExport() {}, async load() { recordings.push([]); }, async endExport() { ended++; },
        async frame(entry, settings) {
            if (cancelExport && recordings.at(-1).length === 3) throw new DOMException('Cancelled', 'AbortError');
            assert.equal(settings.width,1280); assert.equal(settings.height,720);
            recordings.at(-1).push([...camera.position.value]); return { width:1280,height:720 };
        }
    };
    const media = {
        StreamTarget: class { constructor(stream) { this.stream = stream; } },
        Quality: class {}, Mp4OutputFormat: class {}, BufferTarget: class { buffer = new ArrayBuffer(4); },
        canEncodeVideo: async () => true,
        CanvasSource: class { async add(time, duration) { currentTiming.push([time,duration]); } close() {} },
        Output: class {
            constructor(options) { this.target = options.target; currentTiming = []; timing.push(currentTiming); }
            addVideoTrack() {} async start() {} async finalize() { finalized++; } async cancel() {}
        }
    };
    const committed = [], reports = [];
    const directory = {
        async getFileHandle(name) {
            return { async createWritable() { return {
                async write(data) { if (name.endsWith('.json')) reports.push({name, data:JSON.parse(data)}); },
                async close() { if (name.endsWith('.mp4')) committed.push(name); }, async abort() {}
            }; } };
        }, async removeEntry() {}
    };
    const destination = {name:'output', async getDirectoryHandle() {return directory;} };
    const context = contextFor({
        WritableStream, crypto:{ randomUUID: () => '12345678-1234-1234-1234-123456789012' },
        adapter, media, VideoEncoder: class {}, VideoFrame: class {}, Blob,
        document: { body: { classList: { add() {}, remove() {} }, append() {} }, createElement: makeElement, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} },
        window: { showDirectoryPicker: async () => destination, addEventListener() {}, removeEventListener() {} },
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => released++ },
        performance: { now: () => now },
        requestAnimationFrame: fn => setImmediate(() => { now += 100; camera.position.value = [now / 1000,0,0]; fn(now); })
    });
    const workflow = read('video-export.js').replace("await import('./vendor/mediabunny.mjs')", 'globalThis.media');
    await vm.runInContext(pathSource + '\n' + read('batch-video.js') + '\n' + workflow + '\nopenVideoRecorder(adapter)', context);
    if (cancelExport) { assert.equal(ended, 1); assert.ok(restores >= 3); assert.equal(finalized, 0); return; }
    assert.equal(finalized, count);
    assert.equal(released, batching ? 0 : count);
    if (batching) { assert.equal(committed.length, count); assert.equal(reports.at(-1).data.status, 'complete'); assert.equal(reports.at(-1).data.results.length, count); }
    assert.ok(previews > 0);
    assert.ok(restores >= (imported ? 1 : 3));
    if (imported) { assert.equal(now, 5000); assert.equal(recordings[0][0][0], 100); }
    assert.equal(timing[0].length, 120);
    assert.equal(timing[0][0][0], 0);
    for (let i = 1; i < count; i++) {
        assert.deepEqual(timing[i], timing[0]); assert.deepEqual(recordings[i], recordings[0]);
    }
    assert.equal(actions.length, 0);
});


test('camera path JSON round-trips all poses and rejects malformed paths', () => {
    vm.runInContext(pathSource + `
        const pose = { position:[1,2,3], quaternion:[0,0,0,1], up:[0,1,0], fov:65, zoom:1.5, near:.1, far:500, aspect:1.25 };
        const samples = [{time:0,pose}, {time:2,pose:{...pose,position:[4,5,6]}}, {time:5,pose:{...pose,position:[7,8,9]}}];
        const json = cameraPathJSON(samples, 5);
        assert.deepEqual(parseCameraPath(json), {duration:5,samples});
        assert.deepEqual(samplePath(parseCameraPath(json).samples, 3), samplePath(samples, 3));
        const rejectEdit = change => { const data = JSON.parse(json); change(data); assert.throws(() => parseCameraPath(JSON.stringify(data))); };
        rejectEdit(d => { d.version = 2; });
        rejectEdit(d => { d.samples[1].time = 0; });
        rejectEdit(d => { d.samples[0].pose.position[0] = '1'; });
        rejectEdit(d => { d.samples[0].pose.quaternion = [0,0,0,0]; });
        rejectEdit(d => { d.samples[2].pose.far = .01; });
        rejectEdit(d => { d.samples[2].pose.aspect = 2; });
        rejectEdit(d => { d.duration = 30; });
        rejectEdit(d => { d.samples[2].time = 4; });
        assert.throws(() => parseCameraPath('{}'), /single camera pose/);
        assert.throws(() => parseCameraPath('not json'), /valid camera path JSON/);
    `, contextFor());
});
