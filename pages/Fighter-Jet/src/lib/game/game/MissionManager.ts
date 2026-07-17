import { GAME_CONFIG } from '../config/gameConfig';
import type { MissionPhase, RadioSnapshot } from '../types';

export interface MissionContext {
	hasTarget: boolean;
	hasLock: boolean;
	regularTargetsDestroyed: number;
	finalTargetDestroyed: boolean;
	playerHealth: number;
}

export interface MissionEvent {
	type: 'phase' | 'notification' | 'radio' | 'success' | 'failure';
	text: string;
	speaker?: string;
}

const OBJECTIVES: Record<MissionPhase, string> = {
	approach: 'Follow Viper flight to the combat zone',
	'combat-zone': 'Select a marked ground target',
	'first-lock': 'Hold the target in the lock circle',
	strikes: 'Destroy the strategic targets',
	'final-target': 'Strike the command centre weak point',
	egress: 'Clear the blast zone and regroup',
	complete: 'Mission complete'
};

export class MissionManager {
	private phaseValue: MissionPhase = 'approach';
	private missionElapsed = 0;
	private phaseElapsed = 0;
	private radioValue: RadioSnapshot | null = null;
	private readonly events: MissionEvent[] = [];

	constructor(private readonly testMode = false) {}

	get phase(): MissionPhase {
		return this.phaseValue;
	}

	get objective(): string {
		return OBJECTIVES[this.phaseValue];
	}

	get elapsed(): number {
		return this.missionElapsed;
	}

	get radio(): RadioSnapshot | null {
		return this.radioValue;
	}

	start(): readonly MissionEvent[] {
		this.reset();
		this.queueRadio('Viper Lead', 'Viper flight, fence in. Stay low and follow my lead.');
		this.events.push({ type: 'notification', text: 'MISSION START' });
		return this.flushEvents();
	}

	reset(): void {
		this.phaseValue = 'approach';
		this.missionElapsed = 0;
		this.phaseElapsed = 0;
		this.radioValue = null;
		this.events.length = 0;
	}

	update(delta: number, context: MissionContext): readonly MissionEvent[] {
		this.missionElapsed += delta;
		this.phaseElapsed += delta;
		if (
			this.radioValue &&
			this.missionElapsed - this.radioValue.startedAt >= this.radioValue.duration
		) {
			this.radioValue = null;
		}
		if (context.playerHealth <= 0 && this.phaseValue !== 'complete') {
			this.events.push({ type: 'failure', text: 'Aircraft lost' });
			return this.flushEvents();
		}

		switch (this.phaseValue) {
			case 'approach':
				if (
					this.phaseElapsed >=
					(this.testMode
						? GAME_CONFIG.mission.testApproachSeconds
						: GAME_CONFIG.mission.approachSeconds)
				) {
					this.transition('combat-zone', 'Combat zone reached');
					this.queueRadio('Viper Two', 'Targets painted. Pick one and begin your run.');
				}
				break;
			case 'combat-zone':
				if (context.hasTarget) this.transition('first-lock', 'Target selected');
				break;
			case 'first-lock':
				if (context.hasLock) {
					this.transition('strikes', 'Weapons free');
					this.queueRadio('Viper Lead', 'Good lock. Viper Three, weapons free.');
				}
				break;
			case 'strikes':
				if (context.regularTargetsDestroyed >= 5) {
					this.transition('final-target', 'Command centre exposed');
					this.queueRadio(
						'Overwatch',
						'Command bunker shields are down. Put a missile through the marked weak point.'
					);
				}
				break;
			case 'final-target':
				if (context.finalTargetDestroyed) {
					this.transition('egress', 'Primary objective destroyed');
					this.queueRadio('Viper Lead', 'Direct hit! All aircraft, egress south!');
				}
				break;
			case 'egress':
				if (
					this.phaseElapsed >=
					(this.testMode
						? GAME_CONFIG.mission.testEgressSeconds
						: GAME_CONFIG.mission.egressSeconds)
				) {
					this.transition('complete', 'Mission accomplished');
					this.events.push({ type: 'success', text: 'Mission accomplished' });
				}
				break;
			case 'complete':
				break;
		}
		return this.flushEvents();
	}

	forceSuccess(): readonly MissionEvent[] {
		this.transition('complete', 'Mission accomplished');
		this.events.push({ type: 'success', text: 'Mission accomplished' });
		return this.flushEvents();
	}

	skipPhase(): readonly MissionEvent[] {
		switch (this.phaseValue) {
			case 'approach':
				this.transition('combat-zone', 'Combat zone reached');
				break;
			case 'combat-zone':
				this.transition('first-lock', 'Target selected');
				break;
			case 'first-lock':
				this.transition('strikes', 'Weapons free');
				break;
			case 'strikes':
				this.transition('final-target', 'Command centre exposed');
				break;
			case 'final-target':
				this.transition('egress', 'Primary objective destroyed');
				break;
			case 'egress':
				this.transition('complete', 'Mission accomplished');
				this.events.push({ type: 'success', text: 'Mission accomplished' });
				break;
			case 'complete':
				break;
		}
		return this.flushEvents();
	}

	private transition(next: MissionPhase, message: string): void {
		if (next === this.phaseValue) return;
		this.phaseValue = next;
		this.phaseElapsed = 0;
		this.events.push({ type: 'phase', text: message });
	}

	private queueRadio(speaker: string, text: string): void {
		const duration = Math.max(2.6, text.length * 0.045);
		this.radioValue = {
			speaker,
			text,
			active: true,
			startedAt: this.missionElapsed,
			duration
		};
		this.events.push({ type: 'radio', speaker, text });
	}

	private flushEvents(): readonly MissionEvent[] {
		if (this.events.length === 0) return [];
		return this.events.splice(0, this.events.length);
	}
}
