import * as THREE from 'three';

export class BlockSystem {
    constructor() {
        this.blocks = new Map();
        this.blocksByName = new Map();
        this.palette = new Map(); // name -> hex string (used by UI and materials)
        this.paletteOpacity = new Map(); // name -> float opacity blending scalar for shadow map
    }

    async init() {
        console.log("Loading block configurations...");

        // Load palette
        const paletteRes = await fetch('data/palette.json');
        const paletteData = await paletteRes.json();

        for (const [name, data] of Object.entries(paletteData)) {
            // Support both flat string "#fff" and dense config objects {color: "#fff", opacity: 0.5}
            if (typeof data === 'object') {
                this.palette.set(name, data.color);
                this.paletteOpacity.set(name, data.opacity !== undefined ? data.opacity : 0.8);
            } else {
                this.palette.set(name, data);
                this.paletteOpacity.set(name, 0.8); // Default fallback opacity
            }
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

    getColorName(name) {
        // Return the string name if it exists in the palette, otherwise default to "white"
        return this.palette.has(name) ? name : "white";
    }
}
