/**
 * The player's key bindings: profiles saved on this device, like audio and tutorial preferences.
 * Never saved in worlds and never sent to other players.
 *
 * A profile stores **only the keys the player changed** (`overrides`). Anything else uses the
 * action's default, so actions added in later versions just work with old profiles and files.
 *
 * Every change is saved straight away (there's no separate Save button) and can be undone, up to
 * the last 20 changes. The built-in Default profile is never edited: the first change made while
 * it is active creates a copy called "My controls" and switches to it.
 */
import { findKeyAction, isKeyActionId, type KeyActionId } from './keyActions';
import { bindingsCollide, normalizeBinding, refusalReason, type Binding } from './keyCodes';

export const KEY_BINDINGS_STORAGE_KEY = 'forest-drift.keybindings.v1';
export const KEY_BINDINGS_VERSION = 1;
/** The built-in profile. Read-only; it is never stored. */
export const DEFAULT_PROFILE_ID = 'default';
export const MAX_PROFILES = 20;
export const MAX_PROFILE_NAME_LENGTH = 40;

/** One action's two slots. `null` means "cleared on purpose", not "use the default". */
export type BindingPair = readonly [Binding | null, Binding | null];

export interface KeyProfile {
	readonly id: string;
	readonly name: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly overrides: Readonly<Partial<Record<KeyActionId, BindingPair>>>;
}

export interface KeyBindingsState {
	readonly version: typeof KEY_BINDINGS_VERSION;
	/** `DEFAULT_PROFILE_ID` or the id of one of `profiles`. */
	readonly activeProfileId: string;
	/** Player profiles only; Default is built in. */
	readonly profiles: readonly KeyProfile[];
}

const EMPTY_STATE: KeyBindingsState = {
	version: KEY_BINDINGS_VERSION,
	activeProfileId: DEFAULT_PROFILE_ID,
	profiles: []
};

const PROFILE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const EPOCH = new Date(0).toISOString();

function normalizePair(value: unknown): BindingPair | null {
	if (!Array.isArray(value) || value.length !== 2) return null;
	const slots: (Binding | null)[] = [];
	for (const slot of value) {
		if (slot === null) {
			slots.push(null);
			continue;
		}
		const binding = normalizeBinding(slot);
		// A broken slot (or a key the browser always takes) means a broken entry: fall back to the
		// defaults rather than guess.
		if (!binding || refusalReason(binding)) return null;
		slots.push(binding);
	}
	return [slots[0], slots[1]];
}

/** Keeps only overrides for actions this version knows and players may change. */
export function normalizeOverrides(value: unknown): Partial<Record<KeyActionId, BindingPair>> {
	const overrides: Partial<Record<KeyActionId, BindingPair>> = {};
	if (!value || typeof value !== 'object' || Array.isArray(value)) return overrides;
	for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
		if (!isKeyActionId(id) || findKeyAction(id)?.locked) continue;
		const pair = normalizePair(raw);
		if (pair) overrides[id] = pair;
	}
	return overrides;
}

export function normalizeProfileName(value: unknown): string {
	const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
	return name.slice(0, MAX_PROFILE_NAME_LENGTH) || 'Untitled';
}

function normalizeTimestamp(value: unknown): string {
	return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : EPOCH;
}

/**
 * Whatever was in storage, as a valid state: unknown actions, bad keys, duplicate or extra
 * profiles and a missing active profile are all dropped or reset. Never throws.
 */
export function normalizeKeyBindingsState(value: unknown): KeyBindingsState {
	if (!value || typeof value !== 'object') return EMPTY_STATE;
	const raw = value as Record<string, unknown>;
	if (raw.version !== KEY_BINDINGS_VERSION) return EMPTY_STATE;
	const profiles: KeyProfile[] = [];
	const seen = new Set<string>([DEFAULT_PROFILE_ID]);
	for (const entry of Array.isArray(raw.profiles) ? raw.profiles : []) {
		if (profiles.length >= MAX_PROFILES) break;
		if (!entry || typeof entry !== 'object') continue;
		const profile = entry as Record<string, unknown>;
		if (typeof profile.id !== 'string' || !PROFILE_ID.test(profile.id) || seen.has(profile.id))
			continue;
		seen.add(profile.id);
		profiles.push({
			id: profile.id,
			name: normalizeProfileName(profile.name),
			createdAt: normalizeTimestamp(profile.createdAt),
			updatedAt: normalizeTimestamp(profile.updatedAt),
			overrides: normalizeOverrides(profile.overrides)
		});
	}
	const activeProfileId =
		typeof raw.activeProfileId === 'string' && seen.has(raw.activeProfileId)
			? raw.activeProfileId
			: DEFAULT_PROFILE_ID;
	return { version: KEY_BINDINGS_VERSION, activeProfileId, profiles };
}

/** An action's slots in this profile (`null` profile = Default). Locked actions keep defaults. */
export function resolveBindings(id: KeyActionId, profile: KeyProfile | null): BindingPair {
	const action = findKeyAction(id);
	if (!action) return [null, null];
	if (!action.locked) {
		const override = profile?.overrides[id];
		if (override) return override;
	}
	return action.defaults;
}

// ------------------------------------------------------------------ the live store

let state: KeyBindingsState | undefined;
let revision = 0;
const listeners = new Set<(state: KeyBindingsState) => void>();

function readStorage(): KeyBindingsState {
	try {
		const raw = globalThis.localStorage?.getItem(KEY_BINDINGS_STORAGE_KEY);
		return raw ? normalizeKeyBindingsState(JSON.parse(raw)) : EMPTY_STATE;
	} catch {
		// Blocked storage (private windows, previews) or broken JSON: play with the defaults.
		return EMPTY_STATE;
	}
}

export function getKeyBindingsState(): KeyBindingsState {
	state ??= readStorage();
	return state;
}

/** The active player profile, or null while the built-in Default is active. */
export function getActiveProfile(): KeyProfile | null {
	const current = getKeyBindingsState();
	return current.profiles.find((profile) => profile.id === current.activeProfileId) ?? null;
}

/** An action's current primary and secondary binding. */
export function getBindings(id: KeyActionId): BindingPair {
	return resolveBindings(id, getActiveProfile());
}

/** Bumped whenever the bindings may have changed, for callers that cache derived data. */
export function getKeyBindingsRevision(): number {
	return revision;
}

/** Called after any change (including another tab changing them). Returns an unsubscribe. */
export function subscribeKeyBindings(listener: (state: KeyBindingsState) => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Read storage again and tell listeners, e.g. after another tab saved new bindings. */
export function reloadKeyBindings(): void {
	state = readStorage();
	revision++;
	for (const listener of listeners) listener(state);
}

/** Keeps every open tab in step: another tab's save fires a `storage` event here. */
export function watchKeyBindingsStorage(
	target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window
): () => void {
	const onStorage = (event: StorageEvent) => {
		if (event.key === null || event.key === KEY_BINDINGS_STORAGE_KEY) reloadKeyBindings();
	};
	target.addEventListener('storage', onStorage);
	return () => target.removeEventListener('storage', onStorage);
}

// ------------------------------------------------------------------ changing bindings

export const UNDO_LIMIT = 20;
export const DEFAULT_COPY_NAME = 'My controls';
let undoStack: KeyBindingsState[] = [];

function now(): string {
	return new Date().toISOString();
}

function newProfileId(): string {
	return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Saves `next`, tells listeners, and (unless undoing) remembers the previous state for Undo. */
function commit(next: KeyBindingsState, undoable = true): void {
	if (undoable) {
		undoStack.push(getKeyBindingsState());
		if (undoStack.length > UNDO_LIMIT) undoStack.shift();
	}
	state = next;
	revision++;
	try {
		globalThis.localStorage?.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Blocked storage: the change still applies for this session.
	}
	for (const listener of listeners) listener(next);
}

export function canUndoKeyBindings(): boolean {
	return undoStack.length > 0;
}

/** Puts back the state before the last change. Returns false when there is nothing to undo. */
export function undoKeyBindings(): boolean {
	const previous = undoStack.pop();
	if (!previous) return false;
	commit(previous, false);
	return true;
}

/** `name`, or `name (2)`, `name (3)` … so no two profiles share a name. */
export function uniqueProfileName(
	name: string,
	profiles: readonly Pick<KeyProfile, 'id' | 'name'>[],
	ignoreId?: string
): string {
	const base = normalizeProfileName(name);
	const taken = new Set(profiles.filter((p) => p.id !== ignoreId).map((p) => p.name.toLowerCase()));
	taken.add('default');
	if (!taken.has(base.toLowerCase())) return base;
	for (let n = 2; ; n++) {
		const suffix = ` (${n})`;
		const candidate = base.slice(0, MAX_PROFILE_NAME_LENGTH - suffix.length) + suffix;
		if (!taken.has(candidate.toLowerCase())) return candidate;
	}
}

function pairsEqual(a: BindingPair, b: BindingPair): boolean {
	return [0, 1].every((slot) => {
		const left = a[slot];
		const right = b[slot];
		if (!left || !right) return left === right;
		return left.code === right.code && bindingsCollide(left, right);
	});
}

/** One slot of one action, set to a key or cleared (`null`). */
export interface BindingChange {
	readonly id: KeyActionId;
	readonly slot: 0 | 1;
	readonly binding: Binding | null;
}

export interface ChangeResult {
	/** Set when the change made a copy of Default (its name). */
	readonly createdProfile: string | null;
	/** False when nothing could be saved (the profile limit is reached). */
	readonly applied: boolean;
}

/**
 * Applies several slot changes as one step (one Undo), e.g. a swap. While Default is active it
 * first makes "My controls" and switches to it, so Default always stays as shipped.
 */
export function applyBindingChanges(changes: readonly BindingChange[]): ChangeResult {
	if (!changes.length) return { createdProfile: null, applied: false };
	const current = getKeyBindingsState();
	let profiles = [...current.profiles];
	let profile = profiles.find((p) => p.id === current.activeProfileId);
	let createdProfile: string | null = null;
	if (!profile) {
		if (profiles.length >= MAX_PROFILES) return { createdProfile: null, applied: false };
		const stamp = now();
		profile = {
			id: newProfileId(),
			name: uniqueProfileName(DEFAULT_COPY_NAME, profiles),
			createdAt: stamp,
			updatedAt: stamp,
			overrides: {}
		};
		profiles.push(profile);
		createdProfile = profile.name;
	}
	const overrides: Partial<Record<KeyActionId, BindingPair>> = { ...profile.overrides };
	for (const change of changes) {
		const action = findKeyAction(change.id);
		if (!action || action.locked) continue;
		const pair: [Binding | null, Binding | null] = [
			...resolveBindings(change.id, { ...profile, overrides })
		] as [Binding | null, Binding | null];
		pair[change.slot] = change.binding ? normalizeBinding(change.binding) : null;
		if (pairsEqual(pair, action.defaults)) delete overrides[change.id];
		else overrides[change.id] = pair;
	}
	const id = profile.id;
	profiles = profiles.map((p) => (p.id === id ? { ...p, overrides, updatedAt: now() } : p));
	commit({ version: KEY_BINDINGS_VERSION, activeProfileId: id, profiles });
	return { createdProfile, applied: true };
}

/** Puts these actions back to their default keys in the active profile. */
export function resetActions(ids: readonly KeyActionId[]): void {
	const active = getActiveProfile();
	if (!active || !ids.some((id) => active.overrides[id])) return;
	const overrides = { ...active.overrides };
	for (const id of ids) delete overrides[id];
	replaceProfile({ ...active, overrides, updatedAt: now() });
}

/** Every key in the active profile back to its default. */
export function resetActiveProfile(): void {
	const active = getActiveProfile();
	if (!active || !Object.keys(active.overrides).length) return;
	replaceProfile({ ...active, overrides: {}, updatedAt: now() });
}

function replaceProfile(profile: KeyProfile): void {
	const current = getKeyBindingsState();
	commit({
		...current,
		profiles: current.profiles.map((p) => (p.id === profile.id ? profile : p))
	});
}

/**
 * Makes a new profile, from the defaults or a copy of the active profile, and switches to it.
 * Returns its id, or null at the profile limit.
 */
export function createProfile(
	name: string,
	from: 'defaults' | 'active' = 'defaults'
): string | null {
	const current = getKeyBindingsState();
	if (current.profiles.length >= MAX_PROFILES) return null;
	const stamp = now();
	const profile: KeyProfile = {
		id: newProfileId(),
		name: uniqueProfileName(name, current.profiles),
		createdAt: stamp,
		updatedAt: stamp,
		overrides: from === 'active' ? { ...(getActiveProfile()?.overrides ?? {}) } : {}
	};
	commit({ ...current, activeProfileId: profile.id, profiles: [...current.profiles, profile] });
	return profile.id;
}

export function renameProfile(id: string, name: string): void {
	const current = getKeyBindingsState();
	const profile = current.profiles.find((p) => p.id === id);
	if (!profile) return;
	const next = uniqueProfileName(name, current.profiles, id);
	if (next === profile.name) return;
	replaceProfile({ ...profile, name: next, updatedAt: now() });
}

/** Deletes a player profile. If it was active, Default becomes active. */
export function deleteProfile(id: string): void {
	const current = getKeyBindingsState();
	if (!current.profiles.some((p) => p.id === id)) return;
	commit({
		...current,
		activeProfileId: current.activeProfileId === id ? DEFAULT_PROFILE_ID : current.activeProfileId,
		profiles: current.profiles.filter((p) => p.id !== id)
	});
}

export function setActiveProfile(id: string): void {
	const current = getKeyBindingsState();
	if (id === current.activeProfileId) return;
	if (id !== DEFAULT_PROFILE_ID && !current.profiles.some((p) => p.id === id)) return;
	commit({ ...current, activeProfileId: id });
}

/** A profile read from a file, ready to add. */
export interface ProfileToAdd {
	readonly name: string;
	readonly overrides: Partial<Record<KeyActionId, BindingPair>>;
	/** Replace this existing profile's keys (keeping its id) instead of adding a new one. */
	readonly replaceId?: string;
}

/**
 * Adds loaded profiles as one step (one Undo). Names are made unique; profiles past the limit are
 * left out. Returns the ids added or replaced, in order; the first one becomes active if asked.
 */
export function addProfiles(items: readonly ProfileToAdd[], activateFirst: boolean): string[] {
	const current = getKeyBindingsState();
	let profiles = [...current.profiles];
	const ids: string[] = [];
	const stamp = now();
	for (const item of items) {
		const overrides = normalizeOverrides(item.overrides);
		const existing = item.replaceId ? profiles.find((p) => p.id === item.replaceId) : undefined;
		if (existing) {
			profiles = profiles.map((p) =>
				p.id === existing.id ? { ...p, overrides, updatedAt: stamp } : p
			);
			ids.push(existing.id);
			continue;
		}
		if (profiles.length >= MAX_PROFILES) break;
		const profile: KeyProfile = {
			id: newProfileId(),
			name: uniqueProfileName(item.name, profiles),
			createdAt: stamp,
			updatedAt: stamp,
			overrides
		};
		profiles.push(profile);
		ids.push(profile.id);
	}
	if (!ids.length) return ids;
	commit({
		version: KEY_BINDINGS_VERSION,
		activeProfileId: activateFirst ? ids[0] : current.activeProfileId,
		profiles
	});
	return ids;
}

/** For tests: forget the cached state and undo history so the next read goes back to storage. */
export function resetKeyBindingsForTests(): void {
	state = undefined;
	undoStack = [];
	revision++;
	listeners.clear();
}
