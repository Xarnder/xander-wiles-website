import * as THREE from 'three';

export function captureCamera(camera) {
    return {
        position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
        up: camera.up.toArray(), fov: camera.fov, zoom: camera.zoom,
        near: camera.near, far: camera.far, aspect: camera.aspect
    };
}

export function applyCamera(camera, pose) {
    camera.position.fromArray(pose.position);
    camera.quaternion.fromArray(pose.quaternion);
    camera.up.fromArray(pose.up);
    for (const key of ['fov', 'zoom', 'near', 'far', 'aspect']) camera[key] = pose[key];
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
}

// Time-based interpolation means every output uses identical poses even if the
// interactive recording or offline rendering runs at an uneven frame rate.
export function samplePath(samples, time) {
    if (time <= samples[0].time) return samples[0].pose;
    if (time >= samples.at(-1).time) return samples.at(-1).pose;
    let lo = 0, hi = samples.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (samples[mid].time <= time) lo = mid; else hi = mid;
    }
    const a = samples[lo], b = samples[hi];
    const t = (time - a.time) / (b.time - a.time);
    const pose = { ...a.pose };
    for (const key of ['position', 'up']) pose[key] = a.pose[key].map((v, i) => v + (b.pose[key][i] - v) * t);
    pose.quaternion = new THREE.Quaternion().fromArray(a.pose.quaternion)
        .slerp(new THREE.Quaternion().fromArray(b.pose.quaternion), t).toArray();
    for (const key of ['fov', 'zoom', 'near', 'far']) pose[key] = a.pose[key] + (b.pose[key] - a.pose[key]) * t;
    return pose;
}

export function videoDimensions(width, aspect) {
    return { width: Math.max(2, Math.round(width / 2) * 2), height: Math.max(2, Math.round(width / aspect / 2) * 2) };
}

export function frameSchedule(duration, fps) {
    return Array.from({ length: Math.round(duration * fps) }, (_, i) => ({ time: i / fps, duration: 1 / fps }));
}

export function abortCheck(signal) {
    if (signal.aborted) throw new DOMException('Video operation cancelled', 'AbortError');
}

export function waitFor(promise, signal, timeout = 120000) {
    abortCheck(signal);
    return new Promise((resolve, reject) => {
        const cancel = () => finish(reject, new DOMException('Video operation cancelled', 'AbortError'));
        const timer = setTimeout(() => finish(reject, new Error('Rendering timed out. Try a smaller splat or resolution.')), timeout);
        function finish(fn, value) { clearTimeout(timer); signal.removeEventListener('abort', cancel); fn(value); }
        signal.addEventListener('abort', cancel, { once: true });
        Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    });
}

export async function sortVideoFrame(viewer, signal) {
    // Drain an earlier sort, then force a full sort for this precise camera pose.
    if (viewer.sortRunning && viewer.sortPromise) await waitFor(viewer.sortPromise, signal);
    abortCheck(signal);
    viewer.camera.updateMatrixWorld(true);
    viewer.splatMesh.updateMatrixWorld(true);
    viewer.updateSplatMesh();
    // Interactive rendering may have queued partial sorts. Drain those until
    // the library reports a full sort, rather than exporting a partial result.
    for (let attempt = 0; attempt < 8; attempt++) {
        await waitFor(viewer.runSplatSort(true, true), signal);
        if (viewer.sortPromise) await waitFor(viewer.sortPromise, signal);
        abortCheck(signal);
        if (!(viewer.splatSortCount < viewer.splatRenderCount)) return;
    }
    throw new Error('Could not finish a full depth sort for this video frame');
}

// Versioned, scene-independent camera animation. No splat data is embedded.
export function parseCameraPath(text) {
    if (typeof text !== 'string' || text.length > 10 * 1024 * 1024) throw new Error('Camera path JSON must be smaller than 10 MB');
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('This file is not valid camera path JSON'); }
    if (!data || data.type !== 'gaussian-splat-camera-path' || data.version !== 1) {
        throw new Error('Choose a camera movement JSON exported by this viewer (version 1), not a single camera pose');
    }
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    if (!finite(data.duration) || data.duration < 5 || data.duration > 20) throw new Error('Camera path duration must be 5–20 seconds');
    if (!Array.isArray(data.samples) || data.samples.length < 2 || data.samples.length > 20000) throw new Error('Camera path must contain 2–20,000 samples');
    let previous = -1;
    const samples = data.samples.map((sample, index) => {
        if (!sample || !finite(sample.time) || sample.time < 0 || sample.time > data.duration || sample.time <= previous) {
            throw new Error(`Invalid timestamp in camera sample ${index + 1}`);
        }
        previous = sample.time;
        const source = sample.pose;
        if (!source || typeof source !== 'object') throw new Error(`Missing camera pose in sample ${index + 1}`);
        const pose = {};
        for (const [key, length] of [['position', 3], ['quaternion', 4], ['up', 3]]) {
            if (!Array.isArray(source[key]) || source[key].length !== length || !source[key].every(finite)) throw new Error(`Invalid ${key} in sample ${index + 1}`);
            pose[key] = [...source[key]];
        }
        if (Math.abs(Math.hypot(...pose.quaternion) - 1) > 0.001 || Math.hypot(...pose.up) < 0.000001) throw new Error(`Invalid camera orientation in sample ${index + 1}`);
        for (const key of ['fov', 'zoom', 'near', 'far', 'aspect']) {
            if (!finite(source[key]) || source[key] <= 0) throw new Error(`Invalid ${key} in sample ${index + 1}`);
            pose[key] = source[key];
        }
        if (pose.fov >= 180 || pose.far <= pose.near || pose.aspect < 0.01 || pose.aspect > 100) throw new Error(`Invalid camera lens in sample ${index + 1}`);
        if (index && Math.abs(pose.aspect - data.samples[0].pose.aspect) > 0.000001) throw new Error('Camera path aspect ratio must stay constant');
        return { time: sample.time, pose };
    });
    if (samples[0].time !== 0 || Math.abs(samples.at(-1).time - data.duration) > 0.000001) throw new Error('Camera path must cover its complete duration, starting at zero');
    return { duration: data.duration, samples };
}

export function cameraPathJSON(samples, duration) {
    const json = JSON.stringify({ type: 'gaussian-splat-camera-path', version: 1, duration, samples }, null, 2);
    parseCameraPath(json);
    return json;
}
