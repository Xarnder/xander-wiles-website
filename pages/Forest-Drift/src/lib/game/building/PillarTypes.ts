import type { FurnitureDefinition } from './FurnitureTypes';

export interface PillarSettings {
	shape: 'square' | 'circular';
	height: number;
	width: number;
	topEnabled: boolean;
	topWidth: number;
	topHeight: number;
	bottomEnabled: boolean;
	bottomWidth: number;
	bottomHeight: number;
}

export function createDefaultPillarSettings(): PillarSettings {
	return {
		shape: 'square',
		height: 3,
		width: 0.25,
		topEnabled: true,
		topWidth: 0.4,
		topHeight: 0.12,
		bottomEnabled: true,
		bottomWidth: 0.4,
		bottomHeight: 0.12
	};
}

export function normalizePillarSettings(value: Record<string, unknown>): PillarSettings {
	const defaults = createDefaultPillarSettings();
	const number = (key: keyof PillarSettings, min: number, max: number) => {
		const n =
			typeof value[key] === 'number' && Number.isFinite(value[key])
				? (value[key] as number)
				: (defaults[key] as number);
		return Math.min(max, Math.max(min, n));
	};
	const height = number('height', 0.3, 10);
	return {
		shape: value.shape === 'circular' ? 'circular' : 'square',
		height,
		width: number('width', 0.05, 1.5),
		topEnabled: value.topEnabled !== false,
		topWidth: number('topWidth', 0.05, 2),
		topHeight: number('topHeight', 0.02, height / 3),
		bottomEnabled: value.bottomEnabled !== false,
		bottomWidth: number('bottomWidth', 0.05, 2),
		bottomHeight: number('bottomHeight', 0.02, height / 3)
	};
}

export function pillarDefinition(
	settings: PillarSettings,
	position: { x: number; y: number; z: number },
	foundationId: string | null,
	id: string
): FurnitureDefinition {
	const normalized = normalizePillarSettings({ ...settings });
	const width = Math.max(
		normalized.width,
		normalized.topEnabled ? normalized.topWidth : 0,
		normalized.bottomEnabled ? normalized.bottomWidth : 0
	);
	return {
		id,
		kind: 'wooden-pillar',
		foundationId,
		...position,
		nx: 0,
		ny: 1,
		nz: 0,
		dimensions: { width, depth: width, height: normalized.height },
		parameters: { ...normalized }
	};
}
