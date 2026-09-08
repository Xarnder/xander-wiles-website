import type { MusicPlantDefinition, MusicTreeDefinition } from '../MusicModel';
import type { MusicTimelineDefinition } from '../MusicTimeline';
import type { PlantVisualMetrics } from '../PlantVisualMetrics';
export type ImportTarget = 'new' | 'replace' | 'add';
export type TimingResolution = 'auto' | 'eighth' | 'sixteenth' | 'thirtysecond' | 'triplet';
export type SpacingMode = 'tight' | 'compact' | 'balanced' | 'epic';
export interface MidiImportOptions {
	startBar: number;
	endBar: number;
	resolution: TimingResolution;
	spacing: SpacingMode;
	cluster: boolean;
	target: ImportTarget;
	tracks: Record<string, { enabled: boolean; speciesId: string }>;
	existingTree?: MusicTreeDefinition;
	existingPlants?: MusicPlantDefinition[];
}
export interface MidiImportedNotePlan extends MusicPlantDefinition {
	sourceTrackId: string;
	visualMetrics: PlantVisualMetrics;
}
export interface MidiImportPlan {
	source: { fileName: string; ppq: number; startBar: number; endBar: number; hash: number };
	timeline: MusicTimelineDefinition;
	notes: MidiImportedNotePlan[];
	layout: {
		firstRingRadius: number;
		ringSpacing: number;
		outerRadius: number;
		spacing: SpacingMode;
		cluster: boolean;
	};
	statistics: {
		plants: number;
		tracks: number;
		smallestPlant: number;
		largestPlant: number;
		maxSimultaneous: number;
		averageAdjustmentMs: number;
		maxAdjustmentMs: number;
	};
	warnings: string[];
	target: ImportTarget;
	targetTreeId?: string;
}
