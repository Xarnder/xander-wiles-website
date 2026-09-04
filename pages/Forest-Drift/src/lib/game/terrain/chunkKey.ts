export type ChunkKey = string;

export function chunkKey(chunkX: number, chunkZ: number): ChunkKey {
	return `${chunkX}:${chunkZ}`;
}

/** Floor-based so this behaves correctly for negative coordinates (world x = -0.1 -> chunk -1). */
export function worldToChunkCoord(worldCoord: number, chunkSize: number): number {
	return Math.floor(worldCoord / chunkSize);
}
