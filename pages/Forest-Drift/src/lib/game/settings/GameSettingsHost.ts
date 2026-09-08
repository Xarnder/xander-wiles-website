import type { BuildingSettings } from '../building/FoundationTypes';
import type { GraphicsSettings } from '../graphics/GraphicsTypes';
import type { MusicPlantPlacementTool } from '../music/MusicPlantPlacementTool';
import type { SustainSettings } from '../music/SustainTrailBuilder';
import type { SkySettings } from '../sky/SkyTypes';
import type { TerrainSettings } from '../terrain/TerrainSettings';
import type { VegetationSettings } from '../vegetation/VegetationTypes';

export interface MusicVisualSettings {
	waveWidth: number;
	waveOpacity: number;
	waveGlow: number;
	masterMusicVolume: number;
}

export function createDefaultMusicVisualSettings(): MusicVisualSettings {
	return {
		waveWidth: 0.24,
		waveOpacity: 0.6,
		waveGlow: 1,
		masterMusicVolume: 0.6
	};
}

/**
 * Scene-side side effects for the settings menu. Field setters mutate the live settings objects;
 * these callbacks apply those mutations (regenerate terrain, rebuild frames, etc.).
 */
export interface GameSettingsActions {
	terrainSeed: () => void;
	terrainSettings: () => void;
	terrainTopology: () => void;
	terrainViewDistance: () => void;
	terrainRendering: () => void;
	foundationBounds: () => void;
	wallBounds: () => void;
	slabBounds: () => void;
	stairBounds: () => void;
	roofBounds: () => void;
	floorDetailBounds: () => void;
	removalProxies: () => void;
	openingVisuals: () => void;
	wallFraming: () => void;
	stairwellFraming: () => void;
	vegetationSettings: () => void;
	vegetationViewDistance: () => void;
	vegetationBorders: () => void;
	sky: () => void;
	graphicsQuality: (quality: string) => void;
	graphicsAdvanced: () => void;
	graphicsExposure: () => void;
	graphicsAo: () => void;
	graphicsExport: () => void;
	musicLoop: (key: string, value: number) => void;
	musicWave: () => void;
	musicVolume: () => void;
	musicTrails: () => void;
	creatureLab?: () => void;
	creatureDemo?: () => void;
	creatureEndDemo?: () => void;
}

/** Optional port keeps settings usable by scenes without an ecosystem runtime. */
export interface CreatureSettingsPort {
	state: { settings: { enabled: boolean; creatureDensity: number; maxActiveCreatures: number } };
	debug: {
		showSkeleton: boolean;
		showBehaviourState: boolean;
		showTarget: boolean;
		showSpeciesId: boolean;
		showIndividualId: boolean;
		showLOD: boolean;
	};
	settingsChanged(): void;
}

export interface GameSettingsHost {
	creatures?: CreatureSettingsPort;
	terrain: TerrainSettings;
	vegetation: VegetationSettings;
	sky: SkySettings;
	graphics: GraphicsSettings;
	building: BuildingSettings;
	music: MusicPlantPlacementTool;
	sustain: SustainSettings;
	musicVisual: MusicVisualSettings;
	actions: GameSettingsActions;
}

export type SettingsSelectOption = { value: string; label: string };

export type SettingsField =
	| {
			kind: 'number';
			id: string;
			label: string;
			min: number;
			max: number;
			step: number;
			get: () => number;
			set: (value: number) => void;
			onInput?: () => void;
			onCommit?: () => void;
			disabled?: boolean;
			/** Live caption under the slider — used for clock-style time of day. */
			detail?: () => string;
	  }
	| {
			kind: 'boolean';
			id: string;
			label: string;
			get: () => boolean;
			set: (value: boolean) => void;
			onChange?: () => void;
			disabled?: boolean;
	  }
	| {
			kind: 'select';
			id: string;
			label: string;
			options: readonly SettingsSelectOption[];
			get: () => string;
			set: (value: string) => void;
			onChange?: () => void;
			disabled?: boolean;
	  }
	| {
			kind: 'text';
			id: string;
			label: string;
			get: () => string;
			set: (value: string) => void;
			onCommit?: () => void;
			disabled?: boolean;
	  }
	| {
			kind: 'color';
			id: string;
			label: string;
			get: () => string;
			set: (value: string) => void;
			onChange?: () => void;
			disabled?: boolean;
	  }
	| {
			kind: 'button';
			id: string;
			label: string;
			onClick: () => void;
	  };

export interface SettingsGroup {
	id: string;
	title: string;
	description?: string;
	fields: SettingsField[];
	groups?: SettingsGroup[];
}

export interface SettingsCategory {
	id: string;
	title: string;
	description: string;
	groups: SettingsGroup[];
}
