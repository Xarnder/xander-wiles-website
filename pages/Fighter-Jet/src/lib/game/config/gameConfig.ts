export const GAME_CONFIG = {
	// Simulation timing. A small fixed step keeps missiles and flight stable after frame drops.
	maxDeltaSeconds: 0.05,
	fixedStepSeconds: 1 / 90,
	maxFixedSteps: 5,
	snapshotIntervalSeconds: 1 / 20,

	// Renderer presets are intentionally conservative for integrated GPUs.
	renderer: {
		lowPixelRatio: 1,
		mediumPixelRatio: 1.5,
		highPixelRatio: 2,
		clearColor: 0x96b6ca,
		exposure: 1.08,
		bloomStrength: 0.42,
		bloomRadius: 0.55,
		bloomThreshold: 0.72
	},

	// World distances are metres; the combat area fits comfortably inside the camera far plane.
	world: {
		size: 12000,
		segmentsLow: 72,
		segmentsMedium: 112,
		segmentsHigh: 160,
		installationRadius: 850,
		installationCenterX: 0,
		installationCenterZ: -3600,
		baseElevation: 38,
		cloudCount: 42,
		rockCount: 260,
		scrubCount: 180
	},

	camera: {
		near: 0.5,
		far: 18000,
		baseFov: 63,
		chaseDistance: 31,
		wideDistance: 58,
		chaseHeight: 10,
		lookAhead: 95,
		terrainClearance: 5
	},

	// The normal mission pacing targets roughly four minutes for a first playthrough.
	mission: {
		introSeconds: 3.25,
		testIntroSeconds: 0.15,
		approachSeconds: 18,
		testApproachSeconds: 0.2,
		egressSeconds: 13,
		testEgressSeconds: 0.2,
		expectedSeconds: 260,
		failureFloorAltitudeSeconds: 1.6
	},

	controls: {
		mouseDeadZone: 0.025,
		gamepadDeadZone: 0.12,
		pointerRangePixels: 240
	}
} as const;
