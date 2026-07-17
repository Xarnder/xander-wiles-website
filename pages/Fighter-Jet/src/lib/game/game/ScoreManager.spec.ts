import { describe, expect, it } from 'vitest';
import { calculateScore, ScoreManager } from './ScoreManager';

describe('score calculation', () => {
	it('rewards accurate, fast, undamaged missions', () => {
		const clean = calculateScore({
			baseScore: 12000,
			hits: 10,
			shots: 10,
			maxCombo: 10,
			damageTaken: 0,
			missionTime: 180
		});
		const rough = calculateScore({
			baseScore: 12000,
			hits: 5,
			shots: 12,
			maxCombo: 2,
			damageTaken: 45,
			missionTime: 330
		});

		expect(clean.score).toBeGreaterThan(rough.score);
		expect(clean.accuracy).toBe(1);
		expect(clean.timeBonus).toBeGreaterThan(0);
		expect(['A', 'S']).toContain(clean.rating);
	});

	it('tracks combo awards and resets combo after damage', () => {
		const manager = new ScoreManager();
		manager.recordShot();
		manager.recordHit();
		manager.recordTargetDestroyed('radar');
		manager.recordHit();
		const comboAward = manager.recordTargetDestroyed('sam');
		manager.recordDamage(10);
		const snapshot = manager.snapshot(200);

		expect(comboAward).toBeGreaterThan(1000);
		expect(snapshot.combo).toBe(0);
		expect(snapshot.damageTaken).toBe(10);
	});
});
