import { getNeighbor, HEX_DIRECTIONS } from '../utils/HexUtils.js';

export class LightSystem {
    constructor(engine, chunkSystem, blockSystem) {
        this.engine = engine;
        this.chunkSystem = chunkSystem;
        this.blockSystem = blockSystem;

        this.addQueue = [];
        this.removeQueue = [];

        this.engine.registerSystem(this);
    }

    onBlockChanged(globalQ, globalR, y, id, oldId) {
        if (id === 0) {
            // Block removed
            const oldDef = this.blockSystem.getBlockDef(oldId);
            if (oldDef && oldDef.lightLevel > 0) {
                const lightVal = this.chunkSystem.getLightGlobal(globalQ, globalR, y);
                this.chunkSystem.setLightGlobal(globalQ, globalR, y, 0);
                this.removeQueue.push({ q: globalQ, r: globalR, y, val: lightVal });
                this.propagateRemove();
                this.propagateAdd();
            } else {
                for (let i = 0; i < 6; i++) {
                    const n = getNeighbor(globalQ, globalR, i);
                    const nLight = this.chunkSystem.getLightGlobal(n.q, n.r, y);
                    if (nLight > 1) {
                        this.addQueue.push({ q: n.q, r: n.r, y, val: nLight });
                    }
                }
                if (y < 63) {
                    const upLight = this.chunkSystem.getLightGlobal(globalQ, globalR, y + 1);
                    if (upLight > 1) this.addQueue.push({ q: globalQ, r: globalR, y: y + 1, val: upLight });
                }
                if (y > 0) {
                    const downLight = this.chunkSystem.getLightGlobal(globalQ, globalR, y - 1);
                    if (downLight > 1) this.addQueue.push({ q: globalQ, r: globalR, y: y - 1, val: downLight });
                }
                this.propagateAdd();
            }
        } else {
            // Block placed
            const def = this.blockSystem.getBlockDef(id);
            if (def && def.lightLevel > 0) {
                // It's a light source
                this.chunkSystem.setLightGlobal(globalQ, globalR, y, def.lightLevel);
                this.addQueue.push({ q: globalQ, r: globalR, y, val: def.lightLevel });
                this.propagateAdd();
            } else if (def && !(def.transparent || def.translucent)) {
                // Opaque block placed, removes light
                const lightVal = this.chunkSystem.getLightGlobal(globalQ, globalR, y);
                if (lightVal > 0) {
                    this.chunkSystem.setLightGlobal(globalQ, globalR, y, 0);
                    this.removeQueue.push({ q: globalQ, r: globalR, y, val: lightVal });
                    this.propagateRemove();
                    this.propagateAdd();
                }
            }
        }
    }

    propagateAdd() {
        while (this.addQueue.length > 0) {
            const node = this.addQueue.shift();

            const neighbors = [
                ...HEX_DIRECTIONS.map(d => ({ q: node.q + d[0], r: node.r + d[1], y: node.y })),
                { q: node.q, r: node.r, y: node.y + 1 },
                { q: node.q, r: node.r, y: node.y - 1 }
            ];

            for (const n of neighbors) {
                if (n.y < 0 || n.y >= 64) continue;

                const nBlockId = this.chunkSystem.getBlockGlobal(n.q, n.r, n.y);
                const nDef = this.blockSystem.getBlockDef(nBlockId);

                // Allow light through air and transparent/translucent blocks
                if (nBlockId === 0 || (nDef && (nDef.transparent || nDef.translucent || nDef.lightLevel > 0))) {
                    const currentLight = this.chunkSystem.getLightGlobal(n.q, n.r, n.y);
                    // Standard voxel light falloff is 1 per block
                    if (currentLight < node.val - 1) {
                        this.chunkSystem.setLightGlobal(n.q, n.r, n.y, node.val - 1);
                        this.addQueue.push({ q: n.q, r: n.r, y: n.y, val: node.val - 1 });
                    }
                }
            }
        }
    }

    propagateRemove() {
        while (this.removeQueue.length > 0) {
            const node = this.removeQueue.shift();

            const neighbors = [
                ...HEX_DIRECTIONS.map(d => ({ q: node.q + d[0], r: node.r + d[1], y: node.y })),
                { q: node.q, r: node.r, y: node.y + 1 },
                { q: node.q, r: node.r, y: node.y - 1 }
            ];

            for (const n of neighbors) {
                if (n.y < 0 || n.y >= 64) continue;

                const neighborLight = this.chunkSystem.getLightGlobal(n.q, n.r, n.y);

                if (neighborLight !== 0 && neighborLight < node.val) {
                    // This neighbor was lit by the removed node
                    this.chunkSystem.setLightGlobal(n.q, n.r, n.y, 0);
                    this.removeQueue.push({ q: n.q, r: n.r, y: n.y, val: neighborLight });
                } else if (neighborLight >= node.val) {
                    // This neighbor is lit by another source, let it propagate back to fill the void
                    this.addQueue.push({ q: n.q, r: n.r, y: n.y, val: neighborLight });
                }
            }
        }
    }
}
