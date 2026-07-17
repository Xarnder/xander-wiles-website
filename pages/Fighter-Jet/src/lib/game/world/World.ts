import { Color, FogExp2, Group, Scene } from 'three';
import type { QualityLevel } from '../types';
import { disposeObject3D } from '../utils/dispose';
import { EnemyBase } from './EnemyBase';
import { Environment } from './Environment';
import { Terrain } from './Terrain';

export class World extends Group {
	readonly terrain: Terrain;
	readonly environment: Environment;
	readonly enemyBase: EnemyBase;

	constructor(quality: QualityLevel) {
		super();
		this.name = 'World';
		this.terrain = new Terrain(quality);
		this.environment = new Environment(this.terrain, quality);
		this.enemyBase = new EnemyBase();
		this.add(this.terrain, this.environment, this.enemyBase);
	}

	configureScene(scene: Scene, highContrast: boolean): void {
		scene.background = new Color(highContrast ? 0x78a9c8 : 0x96b6ca);
		scene.fog = new FogExp2(highContrast ? 0x8ba6b5 : 0xb5bdba, highContrast ? 0.0001 : 0.000125);
	}

	update(elapsed: number): void {
		this.environment.update(elapsed);
	}

	dispose(): void {
		disposeObject3D(this);
		this.removeFromParent();
	}
}
