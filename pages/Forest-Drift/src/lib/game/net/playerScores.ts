/**
 * Multiplayer stats: how often each player has hurt other players and knocked them out.
 *
 * The room is the only judge of damage (punches and creature pellets go through its checks), so it
 * keeps the scores too: a **hit** is a punch or pellet that took health from another player; a
 * **knockout** is a hit that took them to zero (this game knocks players out rather than killing
 * them). It also counts how often each player has been **knocked out**, by anyone or anything (a
 * long fall too). Scores are kept with the world, so they last between sessions until the world's
 * owner resets them.
 *
 * Free of DOM, Three.js and Cloudflare APIs, like `protocol.ts`.
 */

import type { PlayerInfo } from './protocol';

/** One player's record. */
export interface ScoreEntry {
	playerId: string;
	/** Their name when they last scored or were knocked out. */
	name: string;
	/** Punches and pellets that hurt another player. */
	hits: number;
	/** Hits that knocked another player out. */
	knockouts: number;
	/** Times this player was knocked out (by a player, or a fall). */
	knockedOut: number;
}

/** Players a world keeps scores for; the least recently active make way beyond this. */
export const MAX_SCORE_ENTRIES = 200;

/** Changed records (`replace`: the whole table, e.g. on reset), to everyone. */
export interface ServerScoresMessage {
	t: 'scores';
	entries: ScoreEntry[];
	replace?: boolean;
}

/** The world's owner clears everyone's scores. */
export interface ClientResetScoresMessage {
	t: 'resetScores';
}

function count(value: unknown): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** The room's table: credits hits and knockouts and round-trips through one JSON string. */
export class ScoreBoard {
	/** By player id, least recently active first. */
	private readonly entries = new Map<string, ScoreEntry>();

	constructor(savedJson?: string | null) {
		if (!savedJson) return;
		try {
			const saved = JSON.parse(savedJson) as unknown;
			if (!Array.isArray(saved)) return;
			for (const raw of saved.slice(-MAX_SCORE_ENTRIES)) {
				const r = raw as Record<string, unknown>;
				if (typeof r?.playerId !== 'string' || !r.playerId || r.playerId.length > 80) continue;
				this.entries.set(r.playerId, {
					playerId: r.playerId,
					name: typeof r.name === 'string' ? r.name.slice(0, 40) : '',
					hits: count(r.hits),
					knockouts: count(r.knockouts),
					knockedOut: count(r.knockedOut)
				});
			}
		} catch {
			// A damaged record: start again rather than refuse to open the world.
		}
	}

	get size(): number {
		return this.entries.size;
	}

	list(): ScoreEntry[] {
		return [...this.entries.values()].map((e) => ({ ...e }));
	}

	toJson(): string {
		return JSON.stringify([...this.entries.values()]);
	}

	/**
	 * `attacker` hurt `target`; `knockedOut` when that hit took them to zero. Returns the records
	 * that changed (copies).
	 */
	hit(
		attacker: { playerId: string; name: string },
		target: { playerId: string; name: string },
		knockedOut: boolean
	): ScoreEntry[] {
		const by = this.touch(attacker);
		by.hits++;
		if (!knockedOut) return [{ ...by }];
		by.knockouts++;
		const victim = this.touch(target);
		victim.knockedOut++;
		return [{ ...by }, { ...victim }];
	}

	/** Knocked out by something that isn't a player (a long fall). */
	knockedOut(player: { playerId: string; name: string }): ScoreEntry[] {
		const entry = this.touch(player);
		entry.knockedOut++;
		return [{ ...entry }];
	}

	reset(): void {
		this.entries.clear();
	}

	/** The player's record, created if new, moved to most recently active, name kept current. */
	private touch(player: { playerId: string; name: string }): ScoreEntry {
		let entry = this.entries.get(player.playerId);
		if (entry) this.entries.delete(player.playerId);
		else entry = { playerId: player.playerId, name: '', hits: 0, knockouts: 0, knockedOut: 0 };
		entry.name = player.name.slice(0, 40);
		this.entries.set(player.playerId, entry);
		while (this.entries.size > MAX_SCORE_ENTRIES) {
			const oldest = this.entries.keys().next().value!;
			this.entries.delete(oldest);
		}
		return entry;
	}
}

/** A row of the stats table: a record, or a player online now who hasn't scored yet. */
export interface ScoreRow extends ScoreEntry {
	online: boolean;
	self: boolean;
	/** `#rrggbb` while online (their player colour), else null. */
	colour: string | null;
}

/**
 * The table: everyone with a record plus everyone online now, most knockouts first, then most hits,
 * then fewest times knocked out, then by name. Online players show their current name and colour.
 */
export function scoreRows(
	entries: readonly ScoreEntry[],
	players: readonly Pick<PlayerInfo, 'playerId' | 'name' | 'colour' | 'offline'>[],
	selfId: string | null
): ScoreRow[] {
	const rows = new Map<string, ScoreRow>();
	for (const e of entries)
		rows.set(e.playerId, { ...e, online: false, self: e.playerId === selfId, colour: null });
	for (const p of players) {
		const row = rows.get(p.playerId) ?? {
			playerId: p.playerId,
			name: p.name,
			hits: 0,
			knockouts: 0,
			knockedOut: 0,
			online: false,
			self: p.playerId === selfId,
			colour: null
		};
		row.name = p.name;
		row.online = !p.offline;
		row.colour = p.colour;
		rows.set(p.playerId, row);
	}
	return [...rows.values()].sort(
		(a, b) =>
			b.knockouts - a.knockouts ||
			b.hits - a.hits ||
			a.knockedOut - b.knockedOut ||
			a.name.localeCompare(b.name)
	);
}
