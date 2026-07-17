import { BALANCE } from '../config/balance';
import type { MissionRating, MissionResults, ScoreSnapshot, TargetType } from '../types';
import { clamp } from '../utils/math';

const STORAGE_KEY = 'viper-strike-bests-v1';

interface BestScores {
	score: number;
	time: number | null;
}

export interface ScoreCalculationInput {
	baseScore: number;
	hits: number;
	shots: number;
	maxCombo: number;
	damageTaken: number;
	missionTime: number;
}

export function calculateScore(input: ScoreCalculationInput): {
	score: number;
	accuracy: number;
	timeBonus: number;
	rating: MissionRating;
} {
	const accuracy = input.shots > 0 ? input.hits / input.shots : 0;
	const timeBonus = Math.round(
		clamp((BALANCE.score.parTimeSeconds - input.missionTime) / BALANCE.score.parTimeSeconds, 0, 1) *
			BALANCE.score.maxTimeBonus
	);
	const accuracyBonus = Math.round(input.baseScore * accuracy * 0.45);
	const comboBonus = Math.round(input.baseScore * clamp(input.maxCombo - 1, 0, 12) * 0.04);
	const damagePenalty = Math.round(input.damageTaken * BALANCE.score.damagePenaltyPerPoint);
	const score = Math.max(
		0,
		Math.round(input.baseScore + accuracyBonus + comboBonus + timeBonus - damagePenalty)
	);
	const normalized = score / 22000;
	const rating: MissionRating =
		normalized >= 1 || (accuracy >= 0.8 && input.damageTaken < 15)
			? 'S'
			: normalized >= 0.72
				? 'A'
				: normalized >= 0.5
					? 'B'
					: normalized >= 0.3
						? 'C'
						: 'D';
	return { score, accuracy, timeBonus, rating };
}

export class ScoreManager {
	private baseScore = 0;
	private hits = 0;
	private shots = 0;
	private combo = 0;
	private maxCombo = 0;
	private damageTaken = 0;
	private readonly bests: BestScores;

	constructor() {
		this.bests = this.loadBests();
	}

	reset(): void {
		this.baseScore = 0;
		this.hits = 0;
		this.shots = 0;
		this.combo = 0;
		this.maxCombo = 0;
		this.damageTaken = 0;
	}

	recordShot(): void {
		this.shots += 1;
	}

	recordHit(): void {
		this.hits += 1;
		this.combo += 1;
		this.maxCombo = Math.max(this.maxCombo, this.combo);
	}

	recordMiss(): void {
		this.combo = 0;
	}

	recordTargetDestroyed(type: TargetType): number {
		const targetScore =
			type === 'command'
				? BALANCE.score.finalTarget
				: type === 'weak-point'
					? BALANCE.score.weakPointBonus
					: BALANCE.score.baseTarget;
		const multiplier = Math.min(
			BALANCE.score.maxComboMultiplier,
			1 + Math.max(0, this.combo - 1) * BALANCE.score.comboStep
		);
		const awarded = Math.round(targetScore * multiplier);
		this.baseScore += awarded;
		return awarded;
	}

	recordDamage(amount: number): void {
		this.damageTaken += Math.max(0, amount);
		this.combo = 0;
	}

	snapshot(missionTime: number): ScoreSnapshot {
		const calculated = calculateScore({
			baseScore: this.baseScore,
			hits: this.hits,
			shots: this.shots,
			maxCombo: this.maxCombo,
			damageTaken: this.damageTaken,
			missionTime
		});
		return {
			score: calculated.score,
			hits: this.hits,
			shots: this.shots,
			accuracy: calculated.accuracy,
			combo: this.combo,
			maxCombo: this.maxCombo,
			damageTaken: this.damageTaken,
			timeBonus: calculated.timeBonus,
			rating: calculated.rating
		};
	}

	finalize(missionTime: number): MissionResults {
		const current = this.snapshot(missionTime);
		const newBestScore = current.score > this.bests.score;
		const newBestTime = this.bests.time === null || missionTime < this.bests.time;
		if (newBestScore) this.bests.score = current.score;
		if (newBestTime) this.bests.time = missionTime;
		this.persistBests();
		return {
			...current,
			missionTime,
			bestScore: this.bests.score,
			bestTime: this.bests.time,
			newBestScore,
			newBestTime
		};
	}

	private loadBests(): BestScores {
		if (typeof localStorage === 'undefined') return { score: 0, time: null };
		try {
			const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<
				string,
				unknown
			>;
			return {
				score:
					typeof parsed.score === 'number' && Number.isFinite(parsed.score)
						? Math.max(0, parsed.score)
						: 0,
				time:
					typeof parsed.time === 'number' && Number.isFinite(parsed.time)
						? Math.max(0, parsed.time)
						: null
			};
		} catch {
			return { score: 0, time: null };
		}
	}

	private persistBests(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bests));
		} catch {
			// Persistence is optional.
		}
	}
}
