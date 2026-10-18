import type { NetStats, NetStatus } from './NetSession';
import type { PlayerRole } from './protocol';
import { PROTOCOL_VERSION } from './protocol';

/** Raw counters and readings, sampled from the session. */
export interface NetDiagnosticsSample {
	status: NetStatus;
	role: PlayerRole | null;
	stats: NetStats;
	rttMs: number;
	interpolationDelayMs: number | null;
	silenceMs: number;
	lastClose: { code: number; reason: string } | null;
	roomSeconds: number | null;
	players: number;
	build: string;
}

/** What the in-game diagnostics panel shows (plan §8.11 "in-game diagnostics overlay"). */
export interface NetDiagnosticsReport {
	status: NetStatus;
	role: PlayerRole | null;
	protocol: number;
	build: string;
	players: number;
	rttMs: number | null;
	interpolationDelayMs: number | null;
	snapshotsPerSecond: number;
	posesPerSecond: number;
	downloadBytesPerSecond: number;
	uploadBytesPerSecond: number;
	reconnects: number;
	/** Since anything was heard from the room. */
	lastMessageAgoMs: number | null;
	lastClose: string | null;
	/** Room clock as h:mm:ss of occupied time. */
	roomClock: string | null;
}

/** Turns cumulative counters into per-second rates between successive reads. */
export class NetDiagnostics {
	private previous: { at: number; stats: NetStats } | null = null;
	private rates = { snapshots: 0, poses: 0, down: 0, up: 0 };

	constructor(
		private readonly read: () => NetDiagnosticsSample,
		private readonly now: () => number = () => performance.now()
	) {}

	report(): NetDiagnosticsReport {
		const sample = this.read();
		const now = this.now();
		const previous = this.previous;
		if (!previous) {
			this.previous = { at: now, stats: { ...sample.stats } };
		} else if (now - previous.at >= 500) {
			const seconds = (now - previous.at) / 1000;
			this.rates = {
				snapshots: (sample.stats.snapshotsIn - previous.stats.snapshotsIn) / seconds,
				poses: (sample.stats.posesOut - previous.stats.posesOut) / seconds,
				down: (sample.stats.bytesIn - previous.stats.bytesIn) / seconds,
				up: (sample.stats.bytesOut - previous.stats.bytesOut) / seconds
			};
			this.previous = { at: now, stats: { ...sample.stats } };
		}
		return {
			status: sample.status,
			role: sample.role,
			protocol: PROTOCOL_VERSION,
			build: sample.build,
			players: sample.players,
			rttMs: Number.isFinite(sample.rttMs) ? Math.round(sample.rttMs) : null,
			interpolationDelayMs:
				sample.interpolationDelayMs === null ? null : Math.round(sample.interpolationDelayMs),
			snapshotsPerSecond: round1(this.rates.snapshots),
			posesPerSecond: round1(this.rates.poses),
			downloadBytesPerSecond: Math.round(this.rates.down),
			uploadBytesPerSecond: Math.round(this.rates.up),
			reconnects: sample.stats.reconnects,
			lastMessageAgoMs: Number.isFinite(sample.silenceMs) ? Math.round(sample.silenceMs) : null,
			lastClose: sample.lastClose
				? `${sample.lastClose.code}${sample.lastClose.reason ? ` ${sample.lastClose.reason}` : ''}`
				: null,
			roomClock: sample.roomSeconds === null ? null : formatDuration(sample.roomSeconds)
		};
	}
}

function round1(value: number): number {
	return Math.round(value * 10) / 10;
}

export function formatDuration(totalSeconds: number): string {
	const seconds = Math.max(0, Math.floor(totalSeconds));
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
