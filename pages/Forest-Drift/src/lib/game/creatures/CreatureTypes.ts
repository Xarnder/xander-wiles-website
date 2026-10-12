import type { CreatureSurfaceDefinition } from './surface/CreaturePatternGenerator';
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
/** Procedural surface pattern vocabulary (see surface/CreaturePatternGenerator). */
export type CreaturePatternType =
	| 'solid'
	| 'spots'
	| 'mottled'
	| 'stripes'
	| 'bands'
	| 'back-stripe'
	| 'limb-bands'
	| 'dorsal-spots'
	| 'gradient'
	| 'underbelly';
/** How a pattern colour relates to the body colour. */
export type CreaturePatternTone = 'light' | 'dark' | 'underbelly' | 'accent';
export interface CreaturePatternDefinition {
	type: CreaturePatternType;
	/** Noise features (spots/mottle) per body length. */
	scale: number;
	/** Fraction of the target area covered, 0–1. */
	density: number;
	/** Blend strength toward the pattern colour, 0–1. */
	contrast: number;
	/** Elongation of spots along the body (1 = round). */
	stretch: number;
	/** Bands/stripes per body length (limbs and tails: per part). */
	frequency: number;
	tone: CreaturePatternTone;
}
export interface UnderbellyPatternDefinition {
	/** Share of the cross-section counted as underside, 0–1. */
	width: number;
	softness: number;
	strength: number;
	/** Extra lightness of the underside colour. */
	brightness: number;
	/** Belly plates: faint bands across the underside (serpents). */
	segmented: boolean;
}
export type CreatureAccentRegion =
	| 'feet'
	| 'hands'
	| 'ears'
	| 'horns'
	| 'fins'
	| 'spines'
	| 'plates'
	| 'frills'
	| 'antennae'
	| 'tail-tip';
/**
 * Persisted surface recipe. Colours come from the palette; this holds pattern rules only, so a
 * recipe is a few numbers — never pixels. `version` pins the surface algorithm for saved species.
 */
export interface CreatureSurfaceGenome {
	version: 1;
	seed: number;
	primaryPattern: CreaturePatternDefinition;
	/** `type: 'solid'` means none. */
	secondaryPattern: CreaturePatternDefinition;
	underbelly: UnderbellyPatternDefinition;
	accents: CreatureAccentRegion[];
	roughness: number;
	roughnessVariation: number;
	/** 0 matte → 1 wet-looking. */
	gloss: number;
}
export interface SpeciesAppearance {
	palette: CreaturePalette;
	surface?: CreatureSurfaceGenome;
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
/**
 * How a species meets uneven ground: body slope following, tilt limits, foot planting and head
 * stabilisation. Angles are radians; step values are fractions of leg length. Optional in saved
 * recipes; `deriveTerrainLocomotion` supplies it for recipes that predate it.
 */
export interface TerrainLocomotion {
	maxWalkSlope: number;
	bodyPitchFollowStrength: number;
	bodyRollFollowStrength: number;
	maxBodyPitch: number;
	maxBodyRoll: number;
	/** Exponential response rate (1/s) of body height and orientation smoothing. */
	bodyGroundResponse: number;
	footGroundAlignStrength: number;
	stepHeight: number;
	stepTriggerDistance: number;
	/** Fraction of a gait cycle each foot spends planted. */
	dutyFactor: number;
	neckSlopeCompensation: number;
	headSlopeCompensation: number;
	/** Upper-torso counter-pitch (upright bipeds). */
	spineSlopeCompensation: number;
}
export interface SpeciesLocomotion {
	gait: GaitDefinition;
	terrain?: TerrainLocomotion;
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
export type CreatureStyle = 'elegant' | 'chunky' | 'cute' | 'slender' | 'heavy';
export type TorsoProfile =
	'slender' | 'deep-chested' | 'round' | 'pear' | 'rear-heavy' | 'front-heavy' | 'long' | 'compact';
export type FootType = 'hoof' | 'paw' | 'two-toe' | 'three-toe' | 'leaf';
export type HandType = 'mitten' | 'paw' | 'leaf' | 'fingers';
/** Shared vocabulary for ears, horns, fins, plates and tail tips. */
export type FeatureShape =
	'leaf' | 'petal' | 'spike' | 'rounded-ear' | 'fin' | 'plate' | 'horn' | 'diamond';
export type TailTipShape = 'leaf' | 'club' | 'diamond' | 'tuft';
/**
 * Art-direction genome: proportions, attachment, shape-vocabulary and colour-blocking choices that sit
 * on top of SpeciesProportions. Every value is a bounded ratio so one recipe compiles identically at
 * any size or LOD. Optional on SpeciesGenome so recipes saved before it existed still load; they
 * receive `deriveSpeciesForm(species)`, which is the same function new species are generated with.
 */
export interface SpeciesForm {
	style: CreatureStyle;
	torsoProfile: TorsoProfile;
	/** One dominant, one secondary and an optional ('' = none) minor signature trait. */
	traits: { dominant: string; secondary: string; minor: string };
	/** Proximal limb depth inside the host, as a fraction of the limb root radius. */
	limbRootPenetration: number;
	shoulderMass: number;
	hipMass: number;
	haunchRoundness: number;
	jointMassScale: number;
	/** Lateral spread of fore/hind limb roots around the torso cross-section (0 = underneath, 1 = side). */
	shoulderSpread: number;
	hipSpread: number;
	/** Angle (radians) the first limb section travels below horizontal as it leaves the torso. */
	limbRootAngle: number;
	/** Distal radius as a fraction of proximal radius for each limb segment (lower = stronger taper). */
	limbTaper: number;
	/** Knee/elbow widening relative to the local limb radius. */
	jointScale: number;
	footType: FootType;
	handType: HandType;
	footScale: number;
	chestDepth: number;
	bellySag: number;
	headScale: number;
	headLength: number;
	headWidth: number;
	/** 0 disables the muzzle. Ratios of head size. */
	muzzleLength: number;
	muzzleWidth: number;
	muzzleHeight: number;
	eyeScale: number;
	/** Yaw of each eye from the face forward axis, radians. */
	eyeSpacing: number;
	/** Pitch of the eyes above the face equator, radians. */
	eyeHeight: number;
	neckScale: number;
	neckThickness: number;
	neckCurve: number;
	earShape: FeatureShape;
	hornShape: FeatureShape;
	backShape: FeatureShape;
	featureCurl: number;
	earScale: number;
	/** Size multiplier for spikes, plates and fins along the back. */
	backScale: number;
	tailScale: number;
	tailCurl: number;
	tailCarriage: number;
	tailTip: TailTipShape;
	/** Underside colour strength, 0–1. */
	bellyStrength: number;
	/** Accent colour on feet, hands and feature tips, 0–1. */
	accentExtremities: number;
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
	form?: SpeciesForm;
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
	/** Radius below the section centre when the underside is deeper or flatter than the back. */
	radiusYLower?: number;
	offsetX?: number;
	offsetY?: number;
	rotation?: number;
}
export type CapStyle = 'flat' | 'dome';
/** Semantic surface region used for colour blocking and part-aware shading. */
export type CreaturePart =
	| 'torso'
	| 'neck'
	| 'head'
	| 'muzzle'
	| 'nose'
	| 'limb'
	| 'joint-mass'
	| 'foot'
	| 'hand'
	| 'tail'
	| 'eye'
	| 'eye-highlight'
	| 'feature';
/** Radial-segment class: torso/head get the most sides, small adornments the fewest. */
export type VolumeDetail = 'face' | 'major' | 'limb' | 'minor';
export interface BodyVolumeDefinition {
	id: string;
	/** Bone for each path point. A joint may repeat when `pointOffsets` extends the path. */
	jointIds: string[];
	sections: CrossSection[];
	/** Bind-pose offsets from each joint's position; lets a path start embedded in its host. */
	pointOffsets?: Vec3[];
	caps?: { start?: CapStyle; end?: CapStyle };
	part?: CreaturePart;
	detail?: VolumeDetail;
	/** Rings per path segment at LOD0, before the quality scale. */
	segmentRings?: number[];
	/** Start-frame lateral axis for flat cross-sections; projected onto the path's normal plane. */
	initialNormal?: Vec3;
	/** Fraction of each segment blended with its neighbouring bone (0.5 = fully smooth chain). */
	skinBlend?: number;
}
/** Where a limb grows out of its host body volume. All points are bind-pose creature space. */
export interface LimbAttachmentDefinition {
	limbId: string;
	hostVolumeId: string;
	hostJointId: string;
	proximalJointId: string;
	/** Normalised position along the host volume path. */
	t: number;
	/** Angle around the host cross-section, 0 = lateral, -π/2 = underneath. */
	angle: number;
	surfacePoint: Vec3;
	surfaceNormal: Vec3;
	/** First point of the limb sweep, inside the host. */
	rootPoint: Vec3;
	rootRadius: number;
	penetration: number;
	/** Normalised host-ellipse depth of the root: 0 = host axis, 1 = surface. */
	rootDepth: number;
	massId: string;
}
/** Smooth ellipsoid bridging two volumes (shoulder, haunch, neck base, tail root). */
export interface AttachmentMassDefinition {
	id: string;
	kind: 'shoulder' | 'hip' | 'limb-root' | 'neck' | 'tail';
	centre: Vec3;
	/** Unit axes; radii[n] is measured along axes[n]. axes[0] runs host → appendage. */
	axes: [Vec3, Vec3, Vec3];
	radii: [number, number, number];
	hostJointId: string;
	limbJointId: string;
	/** Host bone weight at the host end and the appendage end of axes[0]. */
	hostWeight: [number, number];
}
/** Head-local frame that eyes, ears, horns and the muzzle are placed from. */
export interface FaceFrame {
	centre: Vec3;
	forward: Vec3;
	up: Vec3;
	right: Vec3;
	/** Head ellipsoid radii along right, up and forward. */
	radii: Vec3;
}
export interface FeatureAttachment {
	id: string;
	/** Persisted anatomy kinds, plus hands and nose which every compatible plan derives. */
	kind: CreatureFeatureKind | 'hands' | 'nose';
	hostJointId: string;
	/** Embedded base point relative to the host joint. */
	offset: Vec3;
	/** Width, length and thickness. */
	scale: Vec3;
	mirror?: boolean;
	shape?: FeatureShape | FootType | HandType | TailTipShape | 'eye';
	/** Unit growth direction of the feature from its base. */
	direction?: Vec3;
	/** Unit axis across the feature's width. */
	lateral?: Vec3;
	/** Bend, as a fraction of length, applied toward `curlAxis`. */
	curl?: number;
	curlAxis?: Vec3;
	/** How far the base sits below the host surface. */
	embed?: number;
	/** Host surface point the feature leaves through (validation/debug). */
	surfacePoint?: Vec3;
	/** Host volume the base must sit inside (validation). */
	hostVolumeId?: string;
	/** Blended host bones; defaults to hostJointId alone. */
	skin?: { jointId: string; weight: number }[];
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
	/** Unit knee-bend direction from the bind pose, creature space. IK keeps the knee on this side. */
	bendHint?: Vec3;
}
export interface ProceduralSkeletonDefinition {
	joints: ProceduralJoint[];
	volumes: BodyVolumeDefinition[];
	features: FeatureAttachment[];
	limbs: LimbRigDefinition[];
	groundOffset: number;
	attachments?: LimbAttachmentDefinition[];
	masses?: AttachmentMassDefinition[];
	face?: FaceFrame;
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
	/**
	 * Per vertex: roughness·1000, emissive·1000, surface-table slot (written at instantiation),
	 * region id. Shared-material shading without extra draws.
	 */
	surface: Uint16Array;
	/** Per vertex: longitudinal coordinate·1024, radial (dorsal +1 … ventral −1), mask A, mask B. */
	surfacePattern: Uint16Array;
}
export type CreatureLod = 0 | 1 | 2;
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
	lod: CreatureLod;
	/** Resolved surface (palette + individual patterns); absent for the legacy comparison compiler. */
	surface?: CreatureSurfaceDefinition;
	/** Body scale patterns are sized against (torso path length). */
	surfaceScale?: number;
	/** Per-vertex underbelly/accent masks, only when compiled for Lab debug views. */
	surfaceDebug?: { underbelly: Float32Array; accent: Float32Array };
	fingerprint: string;
}
export type CreatureBehaviourState =
	'IDLE' | 'WANDER' | 'LOOK' | 'APPROACH' | 'FLEE' | 'RETURN_TO_GROUP';
export interface CreatureIntent {
	velocity: Vec3;
	heading: number;
	/** Rad/s the heading is actually turning, computed once per physics step so animation lean stays stable regardless of render frame rate. */
	angularVelocity: number;
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
	/** Authoritative walkable height (terrain, foundations…), never a rendered-mesh raycast. */
	surface: (x: number, z: number) => number;
	blocked: (x: number, z: number, radius: number, height: number) => boolean;
	/** Cheap per-foot check (e.g. not deep water). Absent means every finite surface is standable. */
	standable?: (x: number, z: number) => boolean;
}
