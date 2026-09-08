import {
	pitch,
	species,
	timelineDefinition,
	type MusicTreeDefinition,
	type MusicPlantDefinition
} from './MusicModel';
/** Freeze the old scale algorithm in place via the legacy pitch helper; exact reference scale preserves old appearance. */
export function migrateMusicV3(world: Record<string, unknown>) {
	const trees = structuredClone(world.musicTrees) as MusicTreeDefinition[];
	const plants = structuredClone(world.musicPlants) as MusicPlantDefinition[];
	if (!Array.isArray(trees) || !Array.isArray(plants)) return { ...world, schemaVersion: 4 };
	for (const t of trees) if (t?.loop) t.loop.timeline = timelineDefinition(t.loop);
	for (const p of plants) {
		const t = trees.find((t) => t.id === p.musicTreeId);
		if (!t || !species.some((s) => s.id === p.speciesId) || typeof p.growth !== 'number') continue;
		p.pitchMidi = pitch(t, p);
		p.instrumentId = species.find((s) => s.id === p.speciesId)!.instrumentId;
		p.visualProfile = { referenceMidi: p.pitchMidi, referenceScale: 0.65 + p.growth * 0.85 };
		delete p.growth;
	}
	return { ...world, schemaVersion: 4, musicTrees: trees, musicPlants: plants };
}
