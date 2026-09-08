export interface PlantPitchVisualDefinition {
	referenceMidi: number;
	referenceHeight: number;
	scalePerOctave: number;
	minHeight: number;
	maxHeight: number;
	referenceFootprintRadius: number;
}
export interface PlantVisualMetrics {
	height: number;
	baseRadius: number;
	canopyRadius: number;
	placementClearanceRadius: number;
	scale: number;
}
const profiles: Record<string, PlantPitchVisualDefinition> = {
	flower: {
		referenceMidi: 60,
		referenceHeight: 0.8,
		scalePerOctave: 2,
		minHeight: 0.05,
		maxHeight: 40,
		referenceFootprintRadius: 0.4
	},
	mushroom: {
		referenceMidi: 48,
		referenceHeight: 0.7,
		scalePerOctave: 1.9,
		minHeight: 0.05,
		maxHeight: 45,
		referenceFootprintRadius: 0.4
	},
	fern: {
		referenceMidi: 60,
		referenceHeight: 0.8,
		scalePerOctave: 1.85,
		minHeight: 0.05,
		maxHeight: 35,
		referenceFootprintRadius: 0.56
	},
	reed: {
		referenceMidi: 60,
		referenceHeight: 1.112,
		scalePerOctave: 1.9,
		minHeight: 0.05,
		maxHeight: 40,
		referenceFootprintRadius: 0.4
	},
	crystal: {
		referenceMidi: 60,
		referenceHeight: 1.298,
		scalePerOctave: 1.85,
		minHeight: 0.05,
		maxHeight: 45,
		referenceFootprintRadius: 0.28
	}
};
export interface PitchVisualInput {
	speciesId: string;
	pitchMidi?: number;
	percussionNote?: number;
	visualProfile?: { referenceMidi: number; referenceScale: number };
	growth?: number;
}
/** Legacy profile is a pitch-derived reference, never an independent editable growth value. */
export function plantMetrics(p: PitchVisualInput): PlantVisualMetrics {
	const v = profiles[p.speciesId] ?? profiles.flower;
	const base =
		p.speciesId === 'mushroom'
			? 1
			: p.speciesId === 'reed'
				? 1.112
				: p.speciesId === 'crystal'
					? 1.298
					: 0.761;
	let height: number;
	if (p.pitchMidi === undefined && p.growth !== undefined) height = base * (0.65 + p.growth * 0.85);
	else if (p.percussionNote !== undefined)
		height = [35, 36].includes(p.percussionNote)
			? 0.9
			: [42, 44, 46].includes(p.percussionNote)
				? 0.35
				: 0.6;
	else if (p.visualProfile)
		height =
			base *
			p.visualProfile.referenceScale *
			2 ** ((p.visualProfile.referenceMidi - (p.pitchMidi ?? 60)) / 12);
	else
		height = v.referenceHeight * v.scalePerOctave ** ((v.referenceMidi - (p.pitchMidi ?? 60)) / 12);
	height = Math.max(v.minHeight, Math.min(v.maxHeight, height));
	const scale = height / base;
	const canopy = v.referenceFootprintRadius * scale;
	return {
		height,
		scale,
		baseRadius: 0.08 * scale,
		canopyRadius: canopy,
		placementClearanceRadius: canopy * 1.18 + 0.12
	};
}
