import { ensureDayCycleSettings, formatDayClock } from '../sky/dayNightMath';
import type {
	GameSettingsHost,
	SettingsCategory,
	SettingsField,
	SettingsGroup,
	SettingsSelectOption
} from './GameSettingsHost';

const DEFAULT_MUSIC_LOOP = {
	bpm: 90,
	beatsPerBar: 4,
	barsPerLoop: 4,
	subdivisionsPerBeat: 2,
	firstRingRadius: 3,
	ringSpacing: 1
} as const;

function assignNumber(target: object, key: string, value: number): void {
	(target as Record<string, number>)[key] = value;
}

function assignBoolean(target: object, key: string, value: boolean): void {
	(target as Record<string, boolean>)[key] = value;
}

function assignString(target: object, key: string, value: string): void {
	(target as Record<string, string>)[key] = value;
}

function numberField(
	id: string,
	label: string,
	target: object,
	key: string,
	min: number,
	max: number,
	step: number,
	onInput?: () => void,
	onCommit?: () => void,
	disabled = false
): SettingsField {
	return {
		kind: 'number',
		id,
		label,
		min,
		max,
		step,
		get: () => (target as Record<string, number>)[key],
		set: (value) => assignNumber(target, key, value),
		onInput,
		onCommit,
		disabled
	};
}

function boolField(
	id: string,
	label: string,
	target: object,
	key: string,
	onChange?: () => void,
	disabled = false
): SettingsField {
	return {
		kind: 'boolean',
		id,
		label,
		get: () => (target as Record<string, boolean>)[key],
		set: (value) => assignBoolean(target, key, value),
		onChange,
		disabled
	};
}

function selectField(
	id: string,
	label: string,
	target: object,
	key: string,
	options: readonly SettingsSelectOption[],
	onChange?: () => void
): SettingsField {
	return {
		kind: 'select',
		id,
		label,
		options,
		get: () => String((target as Record<string, string>)[key]),
		set: (value) => assignString(target, key, value),
		onChange
	};
}

function textField(
	id: string,
	label: string,
	target: object,
	key: string,
	onCommit?: () => void
): SettingsField {
	return {
		kind: 'text',
		id,
		label,
		get: () => String((target as Record<string, string>)[key]),
		set: (value) => assignString(target, key, value),
		onCommit
	};
}

function colorField(
	id: string,
	label: string,
	target: object,
	key: string,
	onChange?: () => void
): SettingsField {
	return {
		kind: 'color',
		id,
		label,
		get: () => String((target as Record<string, string>)[key]),
		set: (value) => assignString(target, key, value),
		onChange
	};
}

function group(id: string, title: string, fields: SettingsField[], groups?: SettingsGroup[]): SettingsGroup {
	return { id, title, fields, groups };
}

function musicLoopField(
	id: string,
	label: string,
	host: GameSettingsHost,
	draft: Record<keyof typeof DEFAULT_MUSIC_LOOP, number>,
	key: keyof typeof DEFAULT_MUSIC_LOOP,
	min: number,
	max: number,
	step: number
): SettingsField {
	return {
		kind: 'number',
		id,
		label,
		min,
		max,
		step,
		get: () => draft[key],
		set: (value) => {
			draft[key] = value;
		},
		onCommit: () => host.actions.musicLoop(key, draft[key]),
		disabled: !(host.music.activeTree ?? host.music.trees[0])
	};
}

export function buildSettingsCatalog(host: GameSettingsHost): SettingsCategory[] {
	const { terrain, vegetation, sky, graphics, building, music, sustain, musicVisual, actions } = host;
	ensureDayCycleSettings(sky);
	const shape = actions.terrainSettings;
	const activeLoop = host.music.activeTree ?? host.music.trees[0];
	const musicLoopDraft: Record<keyof typeof DEFAULT_MUSIC_LOOP, number> = {
		...DEFAULT_MUSIC_LOOP,
		...(activeLoop
			? {
					bpm: activeLoop.loop.bpm,
					beatsPerBar: activeLoop.loop.beatsPerBar,
					barsPerLoop: activeLoop.loop.barsPerLoop,
					subdivisionsPerBeat: activeLoop.loop.subdivisionsPerBeat,
					firstRingRadius: activeLoop.loop.firstRingRadius,
					ringSpacing: activeLoop.loop.ringSpacing
				}
			: {})
	};

	return [
		{
			id: 'world',
			title: 'World',
			description: 'Seed, height, and how much terrain loads around you.',
			groups: [
				group('world-shape', 'Landscape', [
					textField('world.seed', 'Seed', terrain, 'seed', actions.terrainSeed),
					numberField('world.heightMultiplier', 'Height multiplier', terrain, 'heightMultiplier', 0, 4, 0.01, shape),
					numberField('world.baseHeight', 'Base height', terrain, 'baseHeight', -50, 50, 0.5, shape),
					numberField('world.terraceAmount', 'Terrace amount', terrain, 'terraceAmount', 0, 1, 0.01, shape)
				]),
				group('chunk-loading', 'Chunk loading', [
					numberField(
						'world.chunkSize',
						'Chunk size',
						terrain,
						'chunkSize',
						16,
						256,
						1,
						undefined,
						actions.terrainTopology
					),
					numberField(
						'world.chunkResolution',
						'Chunk resolution',
						terrain,
						'chunkResolution',
						4,
						128,
						1,
						undefined,
						actions.terrainTopology
					),
					numberField(
						'world.viewDistance',
						'View distance',
						terrain,
						'viewDistance',
						1,
						12,
						1,
						actions.terrainViewDistance
					),
					numberField(
						'world.chunksGeneratedPerFrame',
						'Chunks per frame',
						terrain,
						'chunksGeneratedPerFrame',
						1,
						8,
						1
					)
				])
			]
		},
		{
			id: 'terrain',
			title: 'Terrain',
			description: 'Region recipes that shape plains, hills, and mountains.',
			groups: [
				group('biome', 'Biome distribution', [
					numberField('terrain.biome.scale', 'Scale', terrain.biome, 'scale', 100, 3000, 10, shape),
					numberField('terrain.biome.contrast', 'Contrast', terrain.biome, 'contrast', 0.3, 3, 0.05, shape),
					numberField('terrain.biome.blendWidth', 'Blend width', terrain.biome, 'blendWidth', 0, 1, 0.01, shape),
					numberField(
						'terrain.biome.warpStrength',
						'Warp strength',
						terrain.biome,
						'warpStrength',
						0,
						400,
						5,
						shape
					)
				]),
				group('macro', 'Macro elevation', [
					numberField('terrain.macro.scale', 'Scale', terrain.macroElevation, 'scale', 200, 8000, 50, shape),
					numberField(
						'terrain.macro.amplitude',
						'Amplitude',
						terrain.macroElevation,
						'amplitude',
						0,
						80,
						0.5,
						shape
					)
				]),
				group('plains', 'Plains', [
					numberField('terrain.plains.amplitude', 'Amplitude', terrain.plains, 'amplitude', 0, 20, 0.1, shape),
					numberField('terrain.plains.flatness', 'Flatness', terrain.plains, 'flatness', 0, 1, 0.01, shape),
					numberField(
						'terrain.plains.detail',
						'Detail strength',
						terrain.plains,
						'detailStrength',
						0,
						2,
						0.01,
						shape
					)
				]),
				group('hills', 'Rolling hills', [
					numberField('terrain.hills.amplitude', 'Amplitude', terrain.hills, 'amplitude', 0, 60, 0.5, shape),
					numberField('terrain.hills.scale', 'Scale', terrain.hills, 'scale', 20, 800, 5, shape),
					numberField('terrain.hills.roundness', 'Roundness', terrain.hills, 'roundness', 0, 1, 0.01, shape),
					numberField(
						'terrain.hills.detail',
						'Detail strength',
						terrain.hills,
						'detailStrength',
						0,
						2,
						0.01,
						shape
					)
				]),
				group('highlands', 'Highlands', [
					numberField(
						'terrain.highlands.amplitude',
						'Amplitude',
						terrain.highlands,
						'amplitude',
						0,
						100,
						0.5,
						shape
					),
					numberField('terrain.highlands.scale', 'Scale', terrain.highlands, 'scale', 20, 800, 5, shape),
					numberField(
						'terrain.highlands.ridge',
						'Ridge amount',
						terrain.highlands,
						'ridgeAmount',
						0,
						1,
						0.01,
						shape
					),
					numberField(
						'terrain.highlands.detail',
						'Detail strength',
						terrain.highlands,
						'detailStrength',
						0,
						2,
						0.01,
						shape
					)
				]),
				group('mountains', 'Mountains', [
					numberField(
						'terrain.mountains.amplitude',
						'Amplitude',
						terrain.mountains,
						'amplitude',
						0,
						200,
						1,
						shape
					),
					numberField('terrain.mountains.scale', 'Scale', terrain.mountains, 'scale', 40, 1500, 10, shape),
					numberField(
						'terrain.mountains.sharpness',
						'Sharpness',
						terrain.mountains,
						'sharpness',
						0.2,
						4,
						0.05,
						shape
					),
					numberField(
						'terrain.mountains.detail',
						'Detail strength',
						terrain.mountains,
						'detailStrength',
						0,
						3,
						0.01,
						shape
					)
				]),
				group('mountain-ranges', 'Mountain ranges', [
					numberField(
						'terrain.mountains.regionScale',
						'Region scale',
						terrain.mountains,
						'regionScale',
						100,
						4000,
						25,
						shape
					),
					numberField(
						'terrain.mountains.regionThreshold',
						'Region threshold',
						terrain.mountains,
						'regionThreshold',
						0,
						1,
						0.01,
						shape
					),
					numberField(
						'terrain.mountains.regionBlend',
						'Region blend',
						terrain.mountains,
						'regionBlend',
						0,
						1,
						0.01,
						shape
					),
					numberField(
						'terrain.mountains.warp',
						'Warp strength',
						terrain.mountains,
						'warpStrength',
						0,
						600,
						5,
						shape
					)
				]),
				group('detail-warp', 'Detail warp', [
					boolField('terrain.warp.enabled', 'Enabled', terrain.detailWarp, 'enabled', shape),
					numberField(
						'terrain.warp.frequency',
						'Frequency',
						terrain.detailWarp,
						'frequency',
						0.005,
						0.3,
						0.001,
						shape
					),
					numberField('terrain.warp.strength', 'Strength', terrain.detailWarp, 'strength', 0, 10, 0.1, shape),
					numberField('terrain.warp.octaves', 'Octaves', terrain.detailWarp, 'octaves', 1, 4, 1, shape)
				])
			]
		},
		{
			id: 'player',
			title: 'Player',
			description: 'Movement, camera height, and gravity.',
			groups: [
				group('player-move', 'Movement', [
					numberField('player.walkSpeed', 'Walk speed', terrain.player, 'walkSpeed', 1, 20, 0.5),
					numberField('player.runSpeed', 'Run speed', terrain.player, 'runSpeed', 1, 30, 0.5),
					numberField('player.eyeHeight', 'Eye height', terrain.player, 'eyeHeight', 0.5, 4, 0.1),
					boolField('player.gravityEnabled', 'Gravity', terrain.player, 'gravityEnabled')
				])
			]
		},
		{
			id: 'music',
			title: 'Music',
			description: 'Garden loop, wave look, volume, and sustain trails.',
			groups: [
				group('music-debug', 'Debug overlays', [
					boolField('music.debug.rings', 'Show ring indices', music.debug, 'showRingIndices'),
					boolField('music.debug.timing', 'Show plant timing', music.debug, 'showPlantTimingDebug'),
					boolField('music.debug.audio', 'Show audio scheduler', music.debug, 'showAudioSchedulerDebug'),
					boolField('music.debug.duration', 'Show duration steps', music.debug, 'showDurationSteps')
				]),
				group('music-loop', 'Active tree loop', [
					musicLoopField('music.loop.bpm', 'BPM', host, musicLoopDraft, 'bpm', 30, 240, 1),
					musicLoopField('music.loop.beats', 'Beats per bar', host, musicLoopDraft, 'beatsPerBar', 1, 8, 1),
					musicLoopField('music.loop.bars', 'Bars per loop', host, musicLoopDraft, 'barsPerLoop', 1, 8, 1),
					musicLoopField(
						'music.loop.sub',
						'Subdivisions per beat',
						host,
						musicLoopDraft,
						'subdivisionsPerBeat',
						1,
						4,
						1
					),
					musicLoopField(
						'music.loop.radius',
						'First ring radius',
						host,
						musicLoopDraft,
						'firstRingRadius',
						2,
						20,
						0.5
					),
					musicLoopField('music.loop.spacing', 'Ring spacing', host, musicLoopDraft, 'ringSpacing', 0.5, 4, 0.25)
				]),
				group('music-wave', 'Wave & volume', [
					numberField(
						'music.wave.width',
						'Wave width',
						musicVisual,
						'waveWidth',
						0.05,
						2,
						0.05,
						actions.musicWave
					),
					numberField(
						'music.wave.opacity',
						'Wave opacity',
						musicVisual,
						'waveOpacity',
						0.05,
						2,
						0.05,
						actions.musicWave
					),
					numberField('music.wave.glow', 'Wave glow', musicVisual, 'waveGlow', 0.05, 2, 0.05, actions.musicWave),
					numberField(
						'music.volume',
						'Master volume',
						musicVisual,
						'masterMusicVolume',
						0,
						1,
						0.01,
						actions.musicVolume
					)
				]),
				group('music-sustain', 'Sustain trails', [
					boolField('music.sustain.enabled', 'Trails enabled', sustain, 'sustainTrailsEnabled', actions.musicTrails),
					numberField(
						'music.sustain.width',
						'Trail width',
						sustain,
						'trailWidth',
						0.2,
						4,
						0.05,
						actions.musicTrails
					),
					numberField(
						'music.sustain.idle',
						'Idle opacity',
						sustain,
						'idleTrailOpacity',
						0,
						3,
						0.05,
						actions.musicTrails
					),
					numberField(
						'music.sustain.compose',
						'Compose opacity',
						sustain,
						'composeTrailOpacity',
						0,
						3,
						0.05,
						actions.musicTrails
					),
					numberField(
						'music.sustain.glow',
						'Active glow',
						sustain,
						'activeTrailGlow',
						0,
						3,
						0.05,
						actions.musicTrails
					),
					numberField(
						'music.sustain.spacing',
						'Sample spacing',
						sustain,
						'trailSampleSpacing',
						0.1,
						2,
						0.05,
						actions.musicTrails
					),
					boolField(
						'music.sustain.markers',
						'Show start/end markers',
						sustain,
						'showSustainStartEnd',
						actions.musicTrails
					)
				])
			]
		},
		{
			id: 'building',
			title: 'Building',
			description: 'Defaults for the next piece you place, plus live visual overlays.',
			groups: [
				group('foundation', 'Foundation', [
					boolField('building.foundation.vertexGrid', 'Show vertex grid', building, 'showVertexGrid'),
					numberField(
						'building.foundation.gridRadius',
						'Grid display radius',
						building,
						'foundationGridDisplayRadius',
						1,
						10,
						1
					),
					numberField(
						'building.foundation.maxCells',
						'Max foundation cells',
						building,
						'maxFoundationCells',
						4,
						128,
						1
					),
					numberField(
						'building.foundation.depth',
						'Underground depth',
						building,
						'foundationUndergroundDepth',
						0,
						10,
						0.1
					),
					boolField(
						'building.foundation.highest',
						'Show highest point',
						building,
						'showFoundationHighestPoint'
					),
					boolField(
						'building.foundation.bounds',
						'Show foundation bounds',
						building,
						'showFoundationBounds',
						actions.foundationBounds
					),
					numberField('building.foundation.preview', 'Preview opacity', building, 'previewOpacity', 0.1, 1, 0.05)
				]),
				group('grid', 'Grid', [
					numberField('building.grid.size', 'Grid size', building, 'buildingGridSize', 0.05, 2, 0.05),
					boolField('building.grid.show', 'Show building grid', building, 'showBuildingGrid'),
					numberField('building.grid.opacity', 'Grid opacity', building, 'buildingGridOpacity', 0, 1, 0.05)
				]),
				group(
					'walls',
					'Walls',
					[
						numberField('building.walls.height', 'Wall height', building, 'wallHeight', 0.5, 6, 0.05),
						numberField('building.walls.thickness', 'Wall thickness', building, 'wallThickness', 0.05, 0.5, 0.01),
						numberField(
							'building.walls.minLength',
							'Minimum length',
							building,
							'minimumWallLength',
							0.05,
							2,
							0.05
						),
						boolField('building.walls.bounds', 'Show wall bounds', building, 'showWallBounds', actions.wallBounds),
						selectField(
							'building.walls.join',
							'Join style (continuous wall)',
							building,
							'wallJoinStyle',
							[
								{ value: 'miter', label: 'Miter' },
								{ value: 'bevel', label: 'Bevel' }
							]
						),
						numberField('building.walls.miter', 'Miter limit', building, 'miterLimit', 1, 10, 0.5),
						numberField(
							'building.walls.corner',
							'Corner opening margin',
							building,
							'cornerOpeningMargin',
							0.05,
							1,
							0.01
						)
					],
					[
						group('wall-framing', 'Framing', [
							boolField(
								'building.walls.frame.enabled',
								'Enabled',
								building,
								'wallFrameEnabled',
								actions.wallFraming
							),
							numberField(
								'building.walls.frame.width',
								'Frame width',
								building,
								'wallFrameWidth',
								0.02,
								0.4,
								0.005,
								actions.wallFraming
							),
							numberField(
								'building.walls.frame.depth',
								'Frame depth extra',
								building,
								'wallFrameDepthExtra',
								0,
								0.3,
								0.005,
								actions.wallFraming
							),
							boolField(
								'building.walls.frame.bounds',
								'Show frame bounds',
								building,
								'showWallFrameBounds',
								actions.wallFraming
							),
							boolField(
								'building.walls.frame.joins',
								'Show frame joins',
								building,
								'showWallFrameJoins',
								actions.wallFraming
							)
						]),
						group('skirting', 'Skirting', [
							boolField('building.skirt.enabled', 'Enabled', building, 'skirtingEnabled', actions.wallFraming),
							numberField(
								'building.skirt.height',
								'Height',
								building,
								'skirtingHeight',
								0.02,
								0.4,
								0.005,
								actions.wallFraming
							),
							numberField(
								'building.skirt.depth',
								'Depth',
								building,
								'skirtingDepth',
								0.005,
								0.1,
								0.005,
								actions.wallFraming
							)
						])
					]
				),
				group('windows', 'Windows', [
					numberField('building.windows.width', 'Width', building, 'windowWidth', 0.2, 4, 0.05),
					numberField('building.windows.height', 'Height', building, 'windowHeight', 0.2, 3, 0.05),
					numberField('building.windows.sill', 'Sill height', building, 'windowSillHeight', 0, 3, 0.05),
					numberField('building.windows.grid', 'Opening grid size', building, 'openingGridSize', 0.02, 1, 0.01),
					numberField('building.windows.margin', 'Edge margin', building, 'openingEdgeMargin', 0, 1, 0.01),
					numberField('building.windows.spacing', 'Spacing', building, 'openingSpacing', 0, 1, 0.01)
				]),
				group('doors', 'Doors', [
					numberField('building.doors.width', 'Width', building, 'doorWidth', 0.4, 3, 0.05),
					numberField('building.doors.height', 'Height', building, 'doorHeight', 0.5, 4, 0.05),
					numberField('building.doors.grid', 'Opening grid size', building, 'openingGridSize', 0.02, 1, 0.01),
					numberField('building.doors.margin', 'Edge margin', building, 'openingEdgeMargin', 0, 1, 0.01),
					numberField('building.doors.spacing', 'Spacing', building, 'openingSpacing', 0, 1, 0.01)
				]),
				group('beams', 'Beams', [
					selectField('building.beams.orientation', 'Orientation', building, 'beamOrientation', [
						{ value: 'vertical', label: 'Vertical' },
						{ value: 'horizontal', label: 'Horizontal' }
					]),
					numberField('building.beams.width', 'Width', building, 'beamWidth', 0.2, 4, 0.05),
					numberField('building.beams.height', 'Height', building, 'beamHeight', 0.04, 0.8, 0.01),
					numberField(
						'building.beams.depth',
						'Depth extra',
						building,
						'beamDepthExtra',
						0,
						0.3,
						0.005,
						actions.openingVisuals
					)
				]),
				group('levels', 'Levels', [
					numberField(
						'building.levels.current',
						'Current level (mirror)',
						building,
						'currentBuildingLevelIndex',
						0,
						20,
						1,
						undefined,
						undefined,
						true
					),
					numberField(
						'building.levels.storey',
						'Default storey height',
						building,
						'defaultStoreyHeight',
						1,
						8,
						0.1
					),
					numberField('building.levels.max', 'Max levels', building, 'maxBuildingLevels', 1, 30, 1),
					boolField(
						'building.levels.plane',
						'Show construction plane',
						building,
						'showLevelConstructionPlane'
					),
					selectField('building.levels.view', 'Level view mode', building, 'buildingLevelViewMode', [
						{ value: 'all', label: 'All' },
						{ value: 'current-and-below', label: 'Current + below' },
						{ value: 'current-only', label: 'Current only' }
					]),
					boolField('building.levels.fade', 'Fade other levels', building, 'fadeNonCurrentLevels')
				]),
				group(
					'slabs',
					'Slabs',
					[
						numberField('building.slabs.floor', 'Floor thickness', building, 'floorThickness', 0.05, 1, 0.01),
						numberField('building.slabs.roof', 'Roof thickness', building, 'roofThickness', 0.05, 1, 0.01),
						boolField('building.slabs.bounds', 'Show slab bounds', building, 'showSlabBounds', actions.slabBounds),
						boolField('building.slabs.points', 'Show polygon points', building, 'showSlabPolygonPoints'),
						numberField(
							'building.slabs.preview',
							'Preview opacity',
							building,
							'slabPreviewOpacity',
							0.1,
							1,
							0.05
						)
					],
					[
						group('slab-opening-frame', 'Opening frame', [
							boolField(
								'building.slabs.frame.enabled',
								'Enabled',
								building,
								'slabOpeningFrameEnabled',
								actions.stairwellFraming
							),
							numberField(
								'building.slabs.frame.width',
								'Frame width',
								building,
								'slabOpeningFrameWidth',
								0.02,
								0.2,
								0.005,
								actions.stairwellFraming
							),
							numberField(
								'building.slabs.frame.depth',
								'Frame depth extra',
								building,
								'slabOpeningFrameDepthExtra',
								0,
								0.08,
								0.005,
								actions.stairwellFraming
							)
						])
					]
				),
				group('roofs', 'Roofs', [
					selectField('building.roofs.type', 'Default type', building, 'defaultRoofType', [
						{ value: 'flat', label: 'Flat' },
						{ value: 'shed', label: 'Shed' },
						{ value: 'gable', label: 'Gable' },
						{ value: 'hip', label: 'Hip' },
						{ value: 'gambrel', label: 'Gambrel' },
						{ value: 'mansard', label: 'Mansard' },
						{ value: 'butterfly', label: 'Butterfly' },
						{ value: 'm-shaped', label: 'M-shaped' },
						{ value: 'dutch-gable', label: 'Dutch gable' }
					]),
					numberField('building.roofs.rise', 'Default rise', building, 'defaultRoofRise', 0, 12, 0.25),
					numberField('building.roofs.deck', 'Deck thickness', building, 'roofDeckThickness', 0.05, 1, 0.01),
					numberField('building.roofs.step', 'Rise step', building, 'roofRiseStep', 0.05, 2, 0.05),
					numberField(
						'building.roofs.fine',
						'Rise fine step (Shift)',
						building,
						'roofRiseFineStep',
						0.01,
						0.5,
						0.0025
					),
					numberField('building.roofs.overhang', 'Overhang', building, 'roofOverhang', 0, 2, 0.05),
					numberField(
						'building.roofs.preview',
						'Preview opacity',
						building,
						'roofPreviewOpacity',
						0.1,
						1,
						0.05
					),
					numberField(
						'building.roofs.gambrelSlope',
						'Gambrel lower slope',
						building,
						'gambrelLowerSlopeFraction',
						0.1,
						0.9,
						0.01
					),
					numberField(
						'building.roofs.gambrelBreak',
						'Gambrel break height',
						building,
						'gambrelBreakHeightFraction',
						0.1,
						0.9,
						0.01
					),
					numberField(
						'building.roofs.mansard',
						'Mansard break',
						building,
						'mansardBreakFraction',
						0.1,
						0.9,
						0.01
					),
					numberField(
						'building.roofs.dutch',
						'Dutch gable hip',
						building,
						'dutchGableHipFraction',
						0.1,
						0.9,
						0.01
					),
					numberField(
						'building.roofs.valley',
						'M-shaped valley',
						building,
						'mShapedValleyFraction',
						0.05,
						0.95,
						0.01
					),
					boolField('building.roofs.bounds', 'Show roof bounds', building, 'showRoofBounds', actions.roofBounds),
					boolField('building.roofs.planes', 'Show face planes', building, 'showRoofPlanes'),
					boolField('building.roofs.ridge', 'Show ridge line', building, 'showRoofRidge'),
					boolField('building.roofs.normals', 'Show normals', building, 'showRoofNormals')
				]),
				group(
					'openings',
					'Openings',
					[
						boolField(
							'building.openings.bounds',
							'Show opening bounds',
							building,
							'showOpeningBounds',
							actions.openingVisuals
						),
						boolField(
							'building.openings.interior',
							'Show interior bounds',
							building,
							'showOpeningFrameBounds',
							actions.openingVisuals
						)
					],
					[
						group('window-frames', 'Window frames', [
							boolField(
								'building.openings.window.enabled',
								'Enabled',
								building,
								'windowFramesEnabled',
								actions.openingVisuals
							),
							numberField(
								'building.openings.window.width',
								'Frame width',
								building,
								'windowFrameWidth',
								0.01,
								0.3,
								0.005,
								actions.openingVisuals
							),
							numberField(
								'building.openings.window.depth',
								'Frame depth',
								building,
								'windowFrameDepth',
								0.01,
								0.3,
								0.005,
								actions.openingVisuals
							),
							boolField(
								'building.openings.window.glass',
								'Glass enabled',
								building,
								'windowGlassEnabled',
								actions.openingVisuals
							)
						]),
						group('door-visuals', 'Door visuals', [
							boolField(
								'building.openings.door.enabled',
								'Enabled',
								building,
								'doorFramesEnabled',
								actions.openingVisuals
							),
							numberField(
								'building.openings.door.width',
								'Frame width',
								building,
								'doorFrameWidth',
								0.01,
								0.3,
								0.005,
								actions.openingVisuals
							),
							numberField(
								'building.openings.door.depth',
								'Frame depth',
								building,
								'doorFrameDepth',
								0.01,
								0.3,
								0.005,
								actions.openingVisuals
							),
							numberField(
								'building.openings.door.leaf',
								'Leaf thickness',
								building,
								'doorThickness',
								0.01,
								0.2,
								0.005,
								actions.openingVisuals
							),
							numberField(
								'building.openings.door.clearance',
								'Leaf clearance',
								building,
								'doorClearance',
								0,
								0.1,
								0.005,
								actions.openingVisuals
							),
							boolField(
								'building.openings.door.hinge',
								'Show hinge',
								building,
								'showDoorHinge',
								actions.openingVisuals
							)
						])
					]
				),
				group(
					'stairs',
					'Stairs',
					[
						numberField(
							'building.stairs.minWidth',
							'Min width (cells)',
							building,
							'minimumStairWidthCells',
							1,
							10,
							1
						),
						numberField(
							'building.stairs.minRun',
							'Min run (cells)',
							building,
							'minimumStairRunCells',
							1,
							20,
							1
						),
						numberField('building.stairs.step', 'Max step height', building, 'maxStepHeight', 0.05, 1, 0.01),
						numberField(
							'building.stairs.preview',
							'Preview opacity',
							building,
							'stairPreviewOpacity',
							0.1,
							1,
							0.05
						),
						boolField(
							'building.stairs.bounds',
							'Show stair bounds',
							building,
							'showStairBounds',
							actions.stairBounds
						),
						boolField('building.stairs.direction', 'Show direction markers', building, 'showStairDirection'),
						numberField(
							'building.stairs.head',
							'Head clearance',
							building,
							'stairHeadClearance',
							1,
							3,
							0.05
						)
					],
					[
						group('stair-framing', 'Framing', [
							boolField(
								'building.stairs.frame.enabled',
								'Enabled',
								building,
								'stairFrameEnabled',
								actions.stairwellFraming
							),
							numberField(
								'building.stairs.frame.width',
								'Frame width',
								building,
								'stairFrameWidth',
								0.02,
								0.4,
								0.005,
								actions.stairwellFraming
							),
							numberField(
								'building.stairs.frame.depth',
								'Frame depth extra',
								building,
								'stairFrameDepthExtra',
								0,
								0.3,
								0.005,
								actions.stairwellFraming
							)
						])
					]
				),
				group('floor-detailing', 'Floor detailing', [
					selectField('building.floor.mode', 'Render mode', building, 'floorDetailRenderMode', [
						{ value: '3d', label: '3D' },
						{ value: '2d', label: '2D' }
					]),
					numberField(
						'building.floor.plankWidth',
						'Plank width',
						building,
						'floorDetailPlankWidth',
						0.08,
						0.5,
						0.01
					),
					selectField('building.floor.plankDir', 'Plank direction', building, 'floorDetailPlankDirection', [
						{ value: 'x', label: 'X' },
						{ value: 'z', label: 'Z' }
					]),
					numberField('building.floor.tileSize', 'Tile size', building, 'floorDetailTileSize', 0.2, 1.2, 0.05),
					selectField('building.floor.pattern', 'Tile pattern', building, 'floorDetailTilePattern', [
						{ value: 'solid', label: 'Solid' },
						{ value: 'checker', label: 'Checker' },
						{ value: 'diamond', label: 'Diamond' },
						{ value: 'running-bond', label: 'Running bond' }
					]),
					numberField('building.floor.pathWidth', 'Path width', building, 'floorDetailPathWidth', 0.4, 3, 0.05),
					boolField('building.floor.framing', 'Path framing', building, 'floorDetailPathFraming'),
					numberField(
						'building.floor.preview',
						'Preview opacity',
						building,
						'floorDetailPreviewOpacity',
						0.1,
						1,
						0.05
					),
					boolField(
						'building.floor.bounds',
						'Show bounds',
						building,
						'showFloorDetailBounds',
						actions.floorDetailBounds
					)
				]),
				group('remove', 'Remove', [
					numberField(
						'building.remove.distance',
						'Max distance',
						building,
						'removeToolMaxDistance',
						1,
						30,
						0.5
					),
					boolField(
						'building.remove.proxies',
						'Show opening proxies',
						building,
						'showRemovalPickingProxies',
						actions.removalProxies
					)
				]),
				group('paint', 'Paint', [
					numberField(
						'building.paint.distance',
						'Max distance',
						building,
						'paintToolMaxDistance',
						1,
						30,
						0.5
					)
				])
			]
		},
		{
			id: 'vegetation',
			title: 'Vegetation',
			description: 'Forest coverage, tree placement, and vegetation debug views.',
			groups: [
				group('forest', 'Forest regions', [
					numberField(
						'vegetation.forest.scale',
						'Forest region scale',
						vegetation.forest,
						'forestRegionScale',
						100,
						4000,
						25,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.forest.threshold',
						'Forest threshold',
						vegetation.forest,
						'forestThreshold',
						0,
						1,
						0.01,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.forest.blend',
						'Forest blend width',
						vegetation.forest,
						'forestBlendWidth',
						0.01,
						0.5,
						0.01,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.forest.warpScale',
						'Forest warp scale',
						vegetation.forest,
						'forestWarpScale',
						20,
						1000,
						10,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.forest.warp',
						'Forest warp strength',
						vegetation.forest,
						'forestWarpStrength',
						0,
						400,
						5,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.forest.clearingScale',
						'Clearing scale',
						vegetation.forest,
						'clearingScale',
						20,
						600,
						5,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.forest.clearingStrength',
						'Clearing strength',
						vegetation.forest,
						'clearingStrength',
						0,
						1,
						0.01,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.forest.clearingThreshold',
						'Clearing threshold',
						vegetation.forest,
						'clearingThreshold',
						0,
						1,
						0.01,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.forest.clusterScale',
						'Tree cluster scale',
						vegetation.forest,
						'treeClusterScale',
						5,
						200,
						1,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.forest.cluster',
						'Tree cluster strength',
						vegetation.forest,
						'treeClusterStrength',
						0,
						1,
						0.01,
						actions.vegetationSettings
					)
				]),
				group('trees', 'Trees', [
					numberField(
						'vegetation.trees.cell',
						'Tree cell size',
						vegetation.trees,
						'treeCellSize',
						2,
						20,
						0.5,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.trees.density',
						'Density multiplier',
						vegetation.trees,
						'treeDensityMultiplier',
						0,
						3,
						0.05,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.trees.view',
						'View distance (chunks)',
						vegetation.loading,
						'treeViewDistanceChunks',
						1,
						10,
						1,
						actions.vegetationViewDistance
					),
					numberField(
						'vegetation.trees.perFrame',
						'Chunks per frame',
						vegetation.loading,
						'treeChunksGeneratedPerFrame',
						1,
						8,
						1
					),
					numberField(
						'vegetation.trees.minScale',
						'Min tree scale',
						vegetation.trees,
						'minTreeScale',
						0.2,
						2,
						0.05,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.trees.maxScale',
						'Max tree scale',
						vegetation.trees,
						'maxTreeScale',
						0.2,
						3,
						0.05,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.trees.slope',
						'Max slope (degrees)',
						vegetation.trees,
						'maxTreeSlopeDegrees',
						5,
						80,
						1,
						actions.vegetationSettings
					),
					boolField(
						'vegetation.trees.treeline',
						'Enable tree line',
						vegetation.trees,
						'enableTreeLine',
						actions.vegetationSettings
					),
					numberField(
						'vegetation.trees.lineStart',
						'Tree line start height',
						vegetation.trees,
						'treeLineStartHeight',
						-20,
						150,
						1,
						actions.vegetationSettings
					),
					numberField(
						'vegetation.trees.lineEnd',
						'Tree line end height',
						vegetation.trees,
						'treeLineEndHeight',
						-20,
						200,
						1,
						actions.vegetationSettings
					)
				]),
				group('vegetation-debug', 'Debug', [
					boolField(
						'vegetation.debug.cells',
						'Show tree cells',
						vegetation.debug,
						'showTreeCells',
						actions.vegetationSettings
					),
					boolField(
						'vegetation.debug.borders',
						'Show tree chunk borders',
						vegetation.debug,
						'showTreeChunkBorders',
						actions.vegetationBorders
					),
					boolField(
						'vegetation.debug.rejected',
						'Show rejected candidates',
						vegetation.debug,
						'showRejectedTreeCandidates',
						actions.vegetationSettings
					)
				])
			]
		},
		{
			id: 'sky',
			title: 'Sky',
			description: 'Day/night cycle, sky colours, HDRI lighting, sun, fog, and clouds.',
			groups: [
				group('day-cycle', 'Day & night', [
					boolField('sky.day.enabled', 'Day/night cycle', sky.dayCycle, 'enabled', actions.sky),
					{
						kind: 'number',
						id: 'sky.day.time',
						label: 'Time of day',
						min: 0,
						max: 24,
						step: 1 / 60,
						get: () => sky.dayCycle.timeOfDay * 24,
						set: (hours: number) => {
							const wrapped = ((hours % 24) + 24) % 24;
							sky.dayCycle.timeOfDay = wrapped / 24;
						},
						onInput: actions.sky,
						detail: () => formatDayClock(sky.dayCycle.timeOfDay)
					},
					{
						kind: 'number',
						id: 'sky.day.length',
						label: 'Full day (minutes)',
						min: 5,
						max: 60,
						step: 1,
						get: () => sky.dayCycle.durationSeconds / 60,
						set: (minutes: number) => {
							sky.dayCycle.durationSeconds = Math.max(60, minutes * 60);
						},
						onInput: actions.sky
					}
				]),
				group('sky-dome', 'Sky', [
					boolField('sky.enabled', 'Enabled', sky.sky, 'enabled', actions.sky),
					colorField('sky.top', 'Top colour', sky.sky, 'topColor', actions.sky),
					colorField('sky.mid', 'Mid colour', sky.sky, 'midColor', actions.sky),
					colorField('sky.horizon', 'Horizon colour', sky.sky, 'horizonColor', actions.sky),
					colorField('sky.haze', 'Ground haze', sky.sky, 'groundHazeColor', actions.sky),
					numberField('sky.horizonHeight', 'Horizon height', sky.sky, 'horizonHeight', -0.3, 0.3, 0.005, actions.sky),
					numberField(
						'sky.horizonSoftness',
						'Horizon softness',
						sky.sky,
						'horizonSoftness',
						0.01,
						0.6,
						0.005,
						actions.sky
					),
					numberField('sky.brightness', 'Sky brightness', sky.sky, 'brightness', 0.3, 2, 0.01, actions.sky),
					boolField('sky.sunDisk', 'Show sun disk', sky.sky, 'showSunDisk', actions.sky),
					numberField('sky.sunSize', 'Sun disk size', sky.sky, 'sunDiskSize', 0.002, 0.15, 0.001, actions.sky),
					numberField(
						'sky.sunBright',
						'Sun disk brightness',
						sky.sky,
						'sunDiskBrightness',
						0,
						10,
						0.1,
						actions.sky
					),
					numberField(
						'sky.sunSoft',
						'Sun disk softness',
						sky.sky,
						'sunDiskSoftness',
						0.001,
						0.1,
						0.001,
						actions.sky
					)
				]),
				group('hdri', 'HDRI', [
					boolField('sky.hdri.enabled', 'HDRI enabled', sky.hdri, 'enabled', actions.sky),
					numberField('sky.hdri.intensity', 'HDRI intensity', sky.hdri, 'intensity', 0, 3, 0.05, actions.sky),
					numberField('sky.hdri.rotation', 'HDRI rotation', sky.hdri, 'rotation', 0, 360, 1, actions.sky),
					boolField('sky.hdri.background', 'Show as background', sky.hdri, 'showAsBackground', actions.sky)
				]),
				group('atmosphere', 'Sun & atmosphere', [
					boolField('sky.sun.enabled', 'Sun enabled', sky.atmosphere, 'sunEnabled', actions.sky),
					numberField(
						'sky.sun.intensity',
						'Sun intensity',
						sky.atmosphere,
						'sunIntensity',
						0,
						3,
						0.05,
						actions.sky
					),
					numberField(
						'sky.sun.elevation',
						'Sun elevation (noon)',
						sky.atmosphere,
						'sunElevation',
						-10,
						90,
						0.5,
						actions.sky
					),
					numberField(
						'sky.sun.azimuth',
						'Sun azimuth (noon)',
						sky.atmosphere,
						'sunAzimuth',
						0,
						360,
						1,
						actions.sky
					),
					colorField('sky.sun.color', 'Sun colour', sky.atmosphere, 'sunColor', actions.sky),
					numberField(
						'sky.hemi',
						'Hemisphere intensity',
						sky.atmosphere,
						'hemisphereIntensity',
						0,
						2,
						0.05,
						actions.sky
					),
					boolField('sky.fog.enabled', 'Fog enabled', sky.atmosphere, 'fogEnabled', actions.sky),
					numberField('sky.fog.near', 'Fog near', sky.atmosphere, 'fogNear', 1, 800, 1, actions.sky),
					numberField('sky.fog.far', 'Fog far', sky.atmosphere, 'fogFar', 10, 2000, 1, actions.sky),
					colorField('sky.fog.color', 'Fog colour', sky.atmosphere, 'fogColor', actions.sky),
					boolField('sky.fog.match', 'Fog match horizon', sky.atmosphere, 'fogMatchHorizon', actions.sky),
					selectField(
						'sky.fog.mode',
						'Fog density mode',
						sky.atmosphere,
						'fogDensityMode',
						[
							{ value: 'linear', label: 'Linear' },
							{ value: 'exponential', label: 'Exponential' }
						],
						actions.sky
					)
				]),
				group('clouds', 'Clouds', [
					boolField('sky.clouds.enabled', 'Clouds enabled', sky.clouds, 'enabled', actions.sky),
					numberField('sky.clouds.layers', 'Layer count', sky.clouds, 'layerCount', 1, 3, 1, actions.sky),
					numberField('sky.clouds.altitude', 'Altitude', sky.clouds, 'altitude', 30, 600, 5, actions.sky),
					numberField('sky.clouds.scale', 'Scale', sky.clouds, 'scale', 0.2, 4, 0.05, actions.sky),
					numberField('sky.clouds.coverage', 'Coverage', sky.clouds, 'coverage', 0, 1, 0.01, actions.sky),
					numberField('sky.clouds.softness', 'Softness', sky.clouds, 'softness', 0, 1, 0.01, actions.sky),
					numberField('sky.clouds.opacity', 'Opacity', sky.clouds, 'opacity', 0, 1, 0.01, actions.sky),
					numberField('sky.clouds.brightness', 'Brightness', sky.clouds, 'brightness', 0.2, 2, 0.02, actions.sky),
					numberField('sky.clouds.shadow', 'Shadow tint', sky.clouds, 'shadowTint', 0, 1, 0.01, actions.sky),
					numberField('sky.clouds.speed1', 'Speed 1', sky.clouds, 'speed1', 0, 3, 0.02, actions.sky),
					numberField('sky.clouds.speed2', 'Speed 2', sky.clouds, 'speed2', 0, 3, 0.02, actions.sky),
					numberField('sky.clouds.dir1', 'Direction 1', sky.clouds, 'direction1', 0, 360, 1, actions.sky),
					numberField('sky.clouds.dir2', 'Direction 2', sky.clouds, 'direction2', 0, 360, 1, actions.sky),
					numberField('sky.clouds.drift', 'Drift strength', sky.clouds, 'driftStrength', 0, 3, 0.05, actions.sky),
					numberField('sky.clouds.macro', 'Macro scale', sky.clouds, 'macroScale', 0.2, 6, 0.05, actions.sky),
					numberField('sky.clouds.breakup', 'Breakup scale', sky.clouds, 'breakupScale', 0.5, 16, 0.1, actions.sky),
					numberField('sky.clouds.wispy', 'Wispy scale', sky.clouds, 'wispyScale', 1, 24, 0.1, actions.sky),
					numberField(
						'sky.clouds.edgeThreshold',
						'Edge threshold',
						sky.clouds,
						'edgeThreshold',
						0.1,
						0.9,
						0.01,
						actions.sky
					),
					numberField(
						'sky.clouds.edgeSoft',
						'Edge softness',
						sky.clouds,
						'edgeSoftness',
						0.02,
						0.6,
						0.01,
						actions.sky
					),
					numberField(
						'sky.clouds.light',
						'Light response',
						sky.clouds,
						'lightResponse',
						0,
						1,
						0.01,
						actions.sky
					),
					numberField('sky.clouds.warmth', 'Warmth', sky.clouds, 'warmth', 0, 1, 0.01, actions.sky),
					numberField('sky.clouds.cool', 'Cool tint', sky.clouds, 'coolTint', 0, 1, 0.01, actions.sky)
				]),
				group('sky-debug', 'Debug', [
					boolField('sky.debug.bounds', 'Show cloud bounds', sky.debug, 'showCloudBounds', actions.sky),
					boolField(
						'sky.debug.wire',
						'Show cloud layer wireframe',
						sky.debug,
						'showCloudLayerWireframe',
						actions.sky
					),
					boolField('sky.debug.skyOnly', 'Show sky only', sky.debug, 'showSkyOnly', actions.sky)
				])
			]
		},
		{
			id: 'graphics',
			title: 'Graphics',
			description: 'Quality preset, exposure, dynamic resolution, and ambient occlusion.',
			groups: [
				group('graphics-main', 'Display', [
					{
						kind: 'select',
						id: 'graphics.quality',
						label: 'Quality preset',
						options: [
							{ value: 'low', label: 'Low' },
							{ value: 'medium', label: 'Medium' },
							{ value: 'high', label: 'High' },
							{ value: 'ultra', label: 'Ultra' }
						],
						get: () => graphics.quality,
						set: (value) => actions.graphicsQuality(value)
					},
					boolField(
						'graphics.dynamic',
						'Dynamic resolution',
						graphics,
						'dynamicResolutionEnabled',
						actions.graphicsAdvanced
					),
					numberField('graphics.fps', 'Target FPS', graphics, 'targetFps', 30, 120, 1, actions.graphicsAdvanced),
					numberField(
						'graphics.exposure',
						'Exposure',
						graphics,
						'toneMappingExposure',
						0.2,
						2,
						0.01,
						actions.graphicsExposure
					),
					boolField(
						'graphics.stats',
						'Show render stats',
						graphics,
						'showRenderStats',
						actions.graphicsAdvanced
					),
					{ kind: 'button', id: 'graphics.export', label: 'Export settings', onClick: actions.graphicsExport }
				]),
				group('ao', 'Ambient occlusion', [
					numberField(
						'graphics.ao.strength',
						'GTAO strength',
						graphics.aoTuning,
						'blendIntensity',
						0,
						2,
						0.01,
						actions.graphicsAo
					),
					numberField(
						'graphics.ao.radius',
						'AO spread distance',
						graphics.aoTuning,
						'radius',
						0.05,
						2,
						0.01,
						actions.graphicsAo
					),
					numberField(
						'graphics.ao.power',
						'AO darkness power',
						graphics.aoTuning,
						'distanceExponent',
						0.1,
						4,
						0.05,
						actions.graphicsAo
					),
					numberField(
						'graphics.ao.thickness',
						'AO thickness',
						graphics.aoTuning,
						'thickness',
						0.1,
						4,
						0.05,
						actions.graphicsAo
					),
					numberField(
						'graphics.ao.falloff',
						'AO distance falloff',
						graphics.aoTuning,
						'distanceFallOff',
						0,
						2,
						0.01,
						actions.graphicsAo
					),
					numberField('graphics.ao.scale', 'AO scale', graphics.aoTuning, 'scale', 0.1, 4, 0.05, actions.graphicsAo),
					numberField('graphics.ao.samples', 'AO samples', graphics.aoTuning, 'samples', 4, 32, 1, actions.graphicsAo),
					numberField(
						'graphics.ao.denoiseRadius',
						'AO denoise radius',
						graphics.aoTuning,
						'denoiseRadius',
						0,
						20,
						0.5,
						actions.graphicsAo
					),
					numberField(
						'graphics.ao.denoiseRings',
						'AO denoise rings',
						graphics.aoTuning,
						'denoiseRings',
						1,
						6,
						1,
						actions.graphicsAo
					),
					numberField(
						'graphics.ao.denoiseSamples',
						'AO denoise samples',
						graphics.aoTuning,
						'denoiseSamples',
						4,
						32,
						1,
						actions.graphicsAo
					),
					numberField(
						'graphics.ao.distribution',
						'AO sample distribution',
						graphics.aoTuning,
						'denoiseRadiusExponent',
						0.5,
						4,
						0.1,
						actions.graphicsAo
					)
				])
			]
		},
		{
			id: 'rendering',
			title: 'Rendering',
			description: 'Terrain debug views and chunk overlays.',
			groups: [
				group('rendering-debug', 'Terrain debug', [
					boolField('render.wireframe', 'Wireframe', terrain.rendering, 'wireframe', actions.terrainRendering),
					boolField(
						'render.borders',
						'Show chunk borders',
						terrain.rendering,
						'showChunkBorders',
						actions.terrainRendering
					),
					boolField(
						'render.coords',
						'Show chunk coordinates',
						terrain.rendering,
						'showChunkCoordinates',
						actions.terrainRendering
					),
					selectField(
						'render.debugView',
						'Debug view',
						terrain.rendering,
						'debugView',
						[
							{ value: 'normal', label: 'Normal' },
							{ value: 'biomeColors', label: 'Biome colours' },
							{ value: 'biomeMask', label: 'Biome mask' },
							{ value: 'elevation', label: 'Elevation' },
							{ value: 'forestDensity', label: 'Forest density' },
							{ value: 'terrainPlusForest', label: 'Terrain + forest' }
						],
						actions.terrainSettings
					)
				])
			]
		}
	];
}

export function fieldMatchesQuery(field: SettingsField, query: string): boolean {
	if (!query) return true;
	const hay = `${field.id} ${field.label}`.toLowerCase();
	return hay.includes(query);
}

export function groupMatchesQuery(groupItem: SettingsGroup, query: string): boolean {
	if (!query) return true;
	if (groupItem.title.toLowerCase().includes(query) || groupItem.id.toLowerCase().includes(query))
		return true;
	if (groupItem.fields.some((field) => fieldMatchesQuery(field, query))) return true;
	return (groupItem.groups ?? []).some((child) => groupMatchesQuery(child, query));
}

export function categoryMatchesQuery(category: SettingsCategory, query: string): boolean {
	if (!query) return true;
	if (category.title.toLowerCase().includes(query) || category.description.toLowerCase().includes(query))
		return true;
	return category.groups.some((groupItem) => groupMatchesQuery(groupItem, query));
}

export function firstMatchingCategoryId(
	catalog: readonly SettingsCategory[],
	query: string
): string | undefined {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return undefined;
	return catalog.find((category) => categoryMatchesQuery(category, normalized))?.id;
}
