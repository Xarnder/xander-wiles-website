/** Generator v1 uses +Y up, +Z forward and +X creature-right. Logical roots lie on the ground. */
export const CREATURE_GENERATOR_VERSION = 1;
export type Vec3 = { x: number; y: number; z: number };
export type BodyPlanId = 'quadruped' | 'biped' | 'hexapod' | 'serpentine';
export interface BodyPlanDefinition {
	id: BodyPlanId;
	spineSegments: number;
}
export interface SpeciesProportions {
	bodyLength: number;
	bodyWidth: number;
	bodyDepth: number;
	chestScale: number;
	waistScale: number;
	neckLength: number;
	headSize: number;
	legLength: number;
	legThickness: number;
	stanceWidth: number;
	tailLength: number;
	tailThickness: number;
	frontLegRatio: number;
}
export type CreatureFeatureKind =
	| 'eyes'
	| 'ears'
	| 'horns'
	| 'antennae'
	| 'spikes'
	| 'fins'
	| 'frills'
	| 'plates'
	| 'feet'
	| 'tail-tip';
export interface SpeciesAnatomy {
	symmetryStrength: number;
	features: CreatureFeatureKind[];
	signatureTraits: string[];
	featureScale: number;
}
export type CreaturePattern =
	'solid' | 'gradient' | 'belly' | 'stripe' | 'spots' | 'bands' | 'limb-tips';
export interface CreaturePalette {
	primary: string;
	secondary: string;
	accent: string;
	eye: string;
	roughness: number;
	metalness: number;
	pattern: CreaturePattern;
}
export interface SpeciesAppearance {
	palette: CreaturePalette;
}
export interface GaitDefinition {
	walkFrequency: number;
	runFrequency: number;
	strideLength: number;
	strideLift: number;
	bodyBob: number;
	bodySway: number;
	headBob: number;
	tailSway: number;
	footPhaseOffsets: number[];
}
export interface SpeciesLocomotion {
	gait: GaitDefinition;
}
export interface SpeciesBehaviour {
	curiosity: number;
	fear: number;
	sociality: number;
	territoriality: number;
	preferredGroupSize: number;
	wanderSpeed: number;
	fleeSpeed: number;
	wanderRadius: number;
	awarenessRadius: number;
	comfortDistance: number;
}
export interface IndividualVariationRules {
	size: number;
	proportions: number;
	hue: number;
	features: number;
	behaviour: number;
}
export interface SpeciesGenome {
	id: string;
	name: string;
	seed: number;
	generatorVersion: 1;
	bodyPlan: BodyPlanDefinition;
	proportions: SpeciesProportions;
	anatomy: SpeciesAnatomy;
	appearance: SpeciesAppearance;
	locomotion: SpeciesLocomotion;
	behaviour: SpeciesBehaviour;
	scaleRange: { min: number; max: number };
	individualVariation: IndividualVariationRules;
	voiceProfileId?: string;
}
export interface IndividualGenome {
	id: string;
	speciesId: string;
	seed: number;
	sizeFactor: number;
	proportionVariation: { length: number; width: number; legs: number; head: number };
	paletteVariation: { hue: number; lightness: number };
	featureVariation: { scale: number; asymmetry: number };
	behaviouralVariation: { curiosity: number; fear: number; speed: number };
	age?: number;
}
export interface CreatureDefinition {
	species: SpeciesGenome;
	individual: IndividualGenome;
}
export type JointSemantic =
	| 'root'
	| 'spine'
	| 'chest'
	| 'pelvis'
	| 'neck'
	| 'head'
	| 'limb-root'
	| 'upper-limb'
	| 'lower-limb'
	| 'foot'
	| 'tail'
	| 'feature';
export interface ProceduralJoint {
	id: string;
	parentId?: string;
	localPosition: Vec3;
	semantic: JointSemantic;
	mirrorGroup?: string;
}
export interface CrossSection {
	t: number;
	radiusX: number;
	radiusY: number;
	offsetX?: number;
	offsetY?: number;
	rotation?: number;
}
export interface BodyVolumeDefinition {
	id: string;
	jointIds: string[];
	sections: CrossSection[];
}
export interface FeatureAttachment {
	id: string;
	kind: CreatureFeatureKind;
	hostJointId: string;
	offset: Vec3;
	scale: Vec3;
	mirror?: boolean;
}
export interface LimbRigDefinition {
	id: string;
	side: -1 | 1;
	pair: number;
	hipId: string;
	kneeId: string;
	footId: string;
	upperLength: number;
	lowerLength: number;
	restFoot: Vec3;
	phase: number;
	arm?: boolean;
}
export interface ProceduralSkeletonDefinition {
	joints: ProceduralJoint[];
	volumes: BodyVolumeDefinition[];
	features: FeatureAttachment[];
	limbs: LimbRigDefinition[];
	groundOffset: number;
}
/** Transferable numeric compiler output. No renderer state is authoritative or persisted. */
export interface CreatureCompiledGeometry {
	positions: Float32Array;
	normals: Float32Array;
	indices: Uint32Array;
	skinIndices: Uint16Array;
	skinWeights: Float32Array;
	colors: Float32Array;
	uvs: Float32Array;
}
export interface CreatureBounds {
	min: Vec3;
	max: Vec3;
	radius: number;
	height: number;
}
export interface CreatureCollisionDefinition {
	radius: number;
	height: number;
}
export interface CreatureCompilation {
	definition: CreatureDefinition;
	skeleton: ProceduralSkeletonDefinition;
	geometry: CreatureCompiledGeometry;
	bounds: CreatureBounds;
	collision: CreatureCollisionDefinition;
	lod: 0 | 1;
	fingerprint: string;
}
export type CreatureBehaviourState =
	'IDLE' | 'WANDER' | 'LOOK' | 'APPROACH' | 'FLEE' | 'RETURN_TO_GROUP';
export interface CreatureIntent {
	velocity: Vec3;
	heading: number;
	gait: 'idle' | 'walk' | 'run';
	lookTarget?: Vec3;
}
export interface CreatureSpawnDefinition {
	id: string;
	species: SpeciesGenome;
	individual: IndividualGenome;
	position: Vec3;
	heading: number;
	groupId: string;
	groupCentre: Vec3;
	cellX: number;
	cellZ: number;
	persistent: boolean;
}
export interface CreatureRuntimeDefinition {
	spawn: CreatureSpawnDefinition;
	position: Vec3;
	heading: number;
	state: CreatureBehaviourState;
	intent: CreatureIntent;
	target: Vec3;
	nextDecision: number;
	decisionIndex: number;
}
export interface CreatureWorldSettings {
	enabled: boolean;
	generatorVersion: 1;
	creatureDensity: number;
	maxActiveCreatures: number;
}
export interface PersistentCreatureDefinition {
	id: string;
	species: SpeciesGenome;
	individual: IndividualGenome;
	position: Vec3;
	heading: number;
	state: CreatureBehaviourState;
}
export interface CreatureWorldState {
	settings: CreatureWorldSettings;
	individuals: PersistentCreatureDefinition[];
}
export interface CreatureWorldAccess {
	surface: (x: number, z: number) => number;
	blocked: (x: number, z: number, radius: number, height: number) => boolean;
}
