import { createDefaultPillarSettings, pillarDefinition } from '../../building/PillarTypes';
import { generateSpecies } from '../../creatures/SpeciesGenerator';
import { generateIndividual } from '../../creatures/IndividualGenerator';
import { createMusicTree, species } from '../../music/MusicModel';
import { instruments } from '../../music/InstrumentLibrary';
import { richWorld } from './worldFixtures';

/** Portable content spanning every persistence subsystem, including recent building additions. */
export function exportAuditWorld() {
	const world = richWorld({ name: 'Export audit 🌲', id: 'export-audit' });
	const building = world.buildings[0];
	building.walls[0].openings[0].shutters = { mode: 'manual', side: -1 };
	building.walls[0].openings[1].doorStyle = { double: true, arched: true };
	building.wallPaths[0].segments[0].openings[0].shutters = { mode: 'off' };
	building.roofs[0].openings = [
		{
			id: 'gable-door',
			type: 'door',
			face: '+x',
			minU: 1,
			maxU: 2,
			minY: 5.2,
			maxY: 6.2,
			doorStyle: { double: true, arched: true }
		}
	];
	world.furniture.push(
		pillarDefinition(
			{ ...createDefaultPillarSettings(), shape: 'circular', height: 4.2, topEnabled: false },
			{ x: 2, y: 12, z: 3 },
			world.foundations[0].id,
			'custom-pillar'
		)
	);
	world.environment.sky.hdri.preset = 'cloudscape-moody';
	world.environment.sky.hdri.rotation = 0.73;
	world.environment.vegetation.grass.maxHeight = 1;
	const tree = createMusicTree(4, 12, 5);
	tree.id = 'song-tree';
	world.musicTrees = [tree];
	world.musicPlants = [
		{
			id: 'song-note',
			musicTreeId: tree.id,
			speciesId: species[0].id,
			angle: 0.3,
			ringIndex: 2,
			durationSteps: 3,
			pitchMidi: 60,
			instrumentId: instruments[0].id,
			vibrancy: 0.7
		}
	];
	const genome = generateSpecies(42);
	world.creatures.individuals = [
		{
			id: 'pet-creature',
			species: genome,
			individual: generateIndividual(genome, 21),
			position: { x: 3, y: 12, z: 5 },
			heading: 0.5,
			state: 'IDLE'
		}
	];
	return world;
}
