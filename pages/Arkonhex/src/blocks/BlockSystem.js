import * as THREE from 'three';

export class BlockSystem {
    constructor() {
        this.blocks = new Map();
        this.blocksByName = new Map();
        this.palette = new Map(); // name -> normalized RGB array [r, g, b]
    }

    async init() {
        console.log("Loading block configurations...");

        // Load palette
        const paletteRes = await fetch('data/palette.json');
        const paletteData = await paletteRes.json();

        for (const [name, hex] of Object.entries(paletteData)) {
            const color = new THREE.Color(hex);

            // We store colors as normalized arrays for vertex colors
            // Since we set outputColorSpace to sRGB, Three.js standard material 
            // expects linear vertex colors. We must convert sRGB hex to linear.
            color.convertSRGBToLinear();
            this.palette.set(name, [color.r, color.g, color.b]);
        }

        // Load block definitions
        const blocksRes = await fetch('data/blocks.json');
        const blocksData = await blocksRes.json();

        for (const def of blocksData) {
            this.blocks.set(def.id, def);
            this.blocksByName.set(def.name, def.id);
        }

        console.log(`Loaded ${this.blocks.size} block types.`);
    }

    getBlockDef(id) {
        return this.blocks.get(id);
    }

    getBlockId(name) {
        return this.blocksByName.get(name) || 0;
    }

    getColor(name) {
        return this.palette.get(name) || [1, 1, 1];
    }
}
