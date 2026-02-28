const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 64;
const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;

export class Chunk {
    constructor(cq, cr) {
        this.cq = cq; // Chunk Q coordinate
        this.cr = cr; // Chunk R coordinate

        // Uint8Array allows up to 255 block IDs.
        // Size: 16 * 16 * 64 = 16,384 bytes
        this.blocks = new Uint8Array(CHUNK_AREA * CHUNK_HEIGHT);

        this.isDirty = true; // Needs remesh
        this.mesh = null;    // The THREE.Group or Mesh holding the rendering
    }

    getIndex(lq, lr, y) {
        // local coordinates must be positive (0-15)
        if (lq < 0 || lq >= CHUNK_SIZE || lr < 0 || lr >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) {
            return -1;
        }
        return lq + (lr * CHUNK_SIZE) + (y * CHUNK_AREA);
    }

    getBlock(lq, lr, y) {
        const index = this.getIndex(lq, lr, y);
        if (index === -1) return 0; // Air for out of bounds
        return this.blocks[index];
    }

    setBlock(lq, lr, y, id) {
        const index = this.getIndex(lq, lr, y);
        if (index !== -1) {
            this.blocks[index] = id;
            this.isDirty = true;
            return true;
        }
        return false;
    }

    /**
     * Iterator that yields all blocks in the chunk with their global coordinates and ID.
     */
    *getBlocks() {
        const globalQOffset = this.cq * CHUNK_SIZE;
        const globalROffset = this.cr * CHUNK_SIZE;

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
            for (let lr = 0; lr < CHUNK_SIZE; lr++) {
                for (let lq = 0; lq < CHUNK_SIZE; lq++) {
                    const id = this.blocks[this.getIndex(lq, lr, y)];
                    if (id > 0) {
                        yield {
                            q: globalQOffset + lq,
                            r: globalROffset + lr,
                            y: y,
                            id: id
                        };
                    }
                }
            }
        }
    }
}
