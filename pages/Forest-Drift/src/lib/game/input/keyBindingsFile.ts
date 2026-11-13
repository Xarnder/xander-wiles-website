/**
 * Downloaded controls files: what's written, and how a loaded file is checked.
 *
 * A file holds only overrides (keys the player changed), like storage, so it stays small and keeps
 * working when later versions add actions. Loading never trusts the file: it must be small, valid
 * JSON in this format; unknown actions and bad keys are skipped and counted, not fatal.
 */
import { findConflicts, type BindingResolver } from './conflicts';
import type { KeyActionId } from './keyActions';
import {
	KEY_BINDINGS_VERSION,
	normalizeOverrides,
	normalizeProfileName,
	resolveBindings,
	type BindingPair,
	type KeyProfile
} from './KeyBindingsStore';

export const KEY_BINDINGS_FILE_FORMAT = 'forest-drift.keybindings';
/** Real files are a few kilobytes; anything near this is not one. */
export const MAX_KEY_BINDINGS_FILE_BYTES = 256 * 1024;

type Overrides = Partial<Record<KeyActionId, BindingPair>>;

/** The JSON text of a controls file holding these profiles. */
export function exportProfilesFile(
	profiles: readonly Pick<KeyProfile, 'name' | 'overrides'>[],
	exportedAt = new Date()
): string {
	return `${JSON.stringify(
		{
			format: KEY_BINDINGS_FILE_FORMAT,
			version: KEY_BINDINGS_VERSION,
			exportedAt: exportedAt.toISOString(),
			game: 'Forest Drift',
			profiles: profiles.map((profile) => ({ name: profile.name, overrides: profile.overrides }))
		},
		null,
		'\t'
	)}\n`;
}

/** `forest-drift-controls-left-handed-2026-11-10.json`. */
export function profilesFileName(name: string, date = new Date()): string {
	const slug =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40) || 'controls';
	return `forest-drift-controls-${slug}-${date.toISOString().slice(0, 10)}.json`;
}

/** Reads an action's slots from a bare set of overrides (on top of the defaults). */
export function resolverFor(overrides: Overrides): BindingResolver {
	const profile = { id: '', name: '', createdAt: '', updatedAt: '', overrides };
	return (id) => resolveBindings(id, profile);
}

export interface LoadedProfile {
	readonly name: string;
	readonly overrides: Overrides;
	/** Keys this profile changes. */
	readonly changed: number;
	/** Entries left out: unknown actions (e.g. from a newer version), bad keys, locked actions. */
	readonly skipped: number;
	/** Keys that would clash once loaded. */
	readonly conflicts: number;
}

export type LoadResult =
	| {
			readonly ok: true;
			readonly profiles: readonly LoadedProfile[];
			readonly newerVersion: boolean;
	  }
	| { readonly ok: false; readonly error: string };

const NOT_A_FILE = 'This isn’t a Forest Drift controls file.';

/** Checks a file's text. Never throws; a bad file gives `{ ok: false, error }` to show as is. */
export function parseProfilesFile(text: string): LoadResult {
	if (text.length > MAX_KEY_BINDINGS_FILE_BYTES)
		return { ok: false, error: 'This file is too large to be a controls file.' };
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return { ok: false, error: NOT_A_FILE };
	}
	if (!data || typeof data !== 'object') return { ok: false, error: NOT_A_FILE };
	const raw = data as Record<string, unknown>;
	if (raw.format !== KEY_BINDINGS_FILE_FORMAT || typeof raw.version !== 'number')
		return { ok: false, error: NOT_A_FILE };
	if (!Array.isArray(raw.profiles) || !raw.profiles.length)
		return { ok: false, error: 'This file has no controls profiles in it.' };
	const profiles: LoadedProfile[] = [];
	for (const entry of raw.profiles.slice(0, 20)) {
		if (!entry || typeof entry !== 'object') continue;
		const profile = entry as Record<string, unknown>;
		const rawOverrides =
			profile.overrides &&
			typeof profile.overrides === 'object' &&
			!Array.isArray(profile.overrides)
				? (profile.overrides as Record<string, unknown>)
				: {};
		const overrides = normalizeOverrides(rawOverrides);
		const changed = Object.keys(overrides).length;
		profiles.push({
			name: normalizeProfileName(profile.name),
			overrides,
			changed,
			skipped: Object.keys(rawOverrides).length - changed,
			conflicts: findConflicts(resolverFor(overrides)).length
		});
	}
	if (!profiles.length) return { ok: false, error: 'This file has no controls profiles in it.' };
	return { ok: true, profiles, newerVersion: raw.version > KEY_BINDINGS_VERSION };
}
