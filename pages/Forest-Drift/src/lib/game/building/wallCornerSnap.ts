import type { BuildingLevelManager } from './BuildingLevelManager';
import type { BuildingManager } from './BuildingManager';
import type { BuildingGridPoint } from './FoundationLocalMath';

/** Walls join their own storey; slabs and roofs follow the storey below their placement plane. */
export function wallCornersForPlacement(
	buildingManager: BuildingManager,
	levelManager: BuildingLevelManager,
	foundationId: string,
	placementY?: number
): BuildingGridPoint[] {
	const current = levelManager.getOrCreateLevel(
		foundationId,
		levelManager.getCurrentLevelIndex(foundationId)
	);
	const level =
		placementY === undefined
			? current
			: levelManager
					.getLevelsForFoundation(foundationId)
					.filter((candidate) => candidate.baseY < placementY - 1e-6)
					.sort((a, b) => b.baseY - a.baseY)[0];
	if (!level) return [];
	const building = buildingManager.getBuildingForFoundation(foundationId);
	const corners: BuildingGridPoint[] = [];
	for (const wall of building.walls) {
		if (Math.abs(wall.baseY - level.baseY) > 1e-6) continue;
		corners.push(
			{ gridX: wall.startGridX, gridZ: wall.startGridZ },
			{ gridX: wall.endGridX, gridZ: wall.endGridZ }
		);
	}
	for (const path of building.wallPaths) {
		if (Math.abs(path.baseY - level.baseY) > 1e-6) continue;
		for (const point of path.points) corners.push({ gridX: point.gridX, gridZ: point.gridZ });
	}
	return corners;
}
