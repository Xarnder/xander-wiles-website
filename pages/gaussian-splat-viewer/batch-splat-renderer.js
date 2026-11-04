import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { abortCheck, sortVideoFrame } from './camera-path.js';
import { renderExportImage } from './export-image.js';

// Dedicated export scene with exactly one GPU-resident model, independent of
// the main viewer and comparison slots. Files are only parsed when reached.
export function createBatchSplatRenderer(renderer, camera) {
    const scene = new THREE.Scene();
    let group = null;
    async function unload() {
        if (!group) return;
        const old = group;
        group = null;
        scene.remove(old);
        await old.dispose();
    }
    return {
        unload,
        async load(entry, signal) {
            await unload();
            abortCheck(signal);
            let bytes = await entry.file.arrayBuffer();
            abortCheck(signal);
            const ext = entry.name.split('.').pop().toLowerCase();
            let buffer;
            if (ext === 'ply') buffer = await GaussianSplats3D.PlyLoader.loadFromFileData(bytes, 0, 0, false);
            else if (ext === 'splat') buffer = await GaussianSplats3D.SplatLoader.loadFromFileData(bytes, 0, 0, false);
            else if (ext === 'ksplat') buffer = await GaussianSplats3D.KSplatLoader.loadFromFileData(bytes);
            else if (ext === 'spz') buffer = await GaussianSplats3D.SpzLoader.loadFromFileData(bytes, 0, 0, false);
            bytes = null;
            abortCheck(signal);
            if (!buffer || buffer.getSplatCount() < 1) throw new Error('File contains no splats');
            group = new GaussianSplats3D.DropInViewer({
                gpuAcceleratedSort: false, sharedMemoryForWorkers: false,
                integerBasedSort: true, halfPrecisionCovariancesOnGPU: true,
                freeIntermediateSplatData: true, sphericalHarmonicsDegree: 0,
                dynamicScene: false, sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
                logLevel: GaussianSplats3D.LogLevel.None
            });
            // Sorting must use the recorded camera's aspect, not the window's.
            group.viewer.getRenderDimensions = out => { out.x = 1000 * camera.aspect; out.y = 1000; };
            group.viewer.updateForDropInMode(renderer, camera);
            scene.add(group);
            try {
                await group.viewer.addSplatBuffers([buffer], [{ splatAlphaRemovalThreshold: 1 }], true, false, false, true, true, false);
                buffer = null;
                abortCheck(signal);
                scene.updateMatrixWorld(true);
            } catch (error) { await unload(); throw error; }
        },
        async frame(entry, options, signal) {
            if (!group) throw new Error('No batch splat is loaded');
            if (renderer.getContext().isContextLost()) {
                const error = new Error('GPU context lost. Batch stopped; completed files are saved.');
                error.batchFatal = true;
                throw error;
            }
            await sortVideoFrame(group.viewer, signal, options);
            const update = group.viewer.update;
            group.viewer.update = () => {};
            try { return renderExportImage(renderer, [group.viewer], options, () => renderer.render(scene, camera)); }
            finally { group.viewer.update = update; }
        }
    };
}
