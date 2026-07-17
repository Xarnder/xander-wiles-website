export const BALANCE = {
	flight: {
		// Arcade units are tuned for responsiveness rather than aeronautical simulation.
		minSpeed: 115,
		cruiseSpeed: 235,
		maxSpeed: 330,
		afterburnerSpeed: 435,
		acceleration: 64,
		braking: 46,
		pitchRate: 1.05,
		rollRate: 1.7,
		yawRate: 0.44,
		autoLevelRate: 0.32,
		terrainClearance: 16,
		crashClearance: 2.5,
		afterburnerCapacity: 8,
		afterburnerRecharge: 0.34
	},
	targeting: {
		lockConeRadians: 0.36,
		retentionConeRadians: 0.62,
		lockSeconds: 1.25,
		testLockSeconds: 0.08,
		retentionSeconds: 0.7,
		maxLockDistance: 4200,
		screenWeight: 2.7,
		distanceWeight: 0.75
	},
	missile: {
		capacity: 12,
		cooldownSeconds: 0.48,
		separationSeconds: 0.16,
		ignitionSpeed: 145,
		acceleration: 360,
		maxSpeed: 760,
		maxTurnRate: 2.65,
		lifetimeSeconds: 8.5,
		hitRadius: 14,
		damage: 62,
		poolSize: 18
	},
	projectile: {
		fireInterval: 1.9,
		speed: 470,
		damage: 5,
		lifetime: 4,
		maxActive: 36
	},
	player: {
		maxHealth: 100,
		warningHealth: 35,
		collisionDamage: 100
	},
	score: {
		baseTarget: 1000,
		finalTarget: 5000,
		weakPointBonus: 1800,
		comboStep: 0.18,
		maxComboMultiplier: 2.5,
		parTimeSeconds: 270,
		maxTimeBonus: 8000,
		damagePenaltyPerPoint: 35
	},
	squadron: {
		attackInterval: 11,
		maxAssistedKills: 2,
		formationSpacing: 24
	}
} as const;
