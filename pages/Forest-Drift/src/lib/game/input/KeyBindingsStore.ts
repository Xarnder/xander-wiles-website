/**
 * The player's key bindings: profiles saved on this device, like audio and tutorial preferences.
 * Never saved in worlds and never sent to other players.
 *
 * A profile stores **only the keys the player changed** (`overrides`). Anything else uses the
 * action's default, so actions added in later versions just work with old profiles and files.
 *
 * Phase 1 reads profiles; creating, editing and loading them arrives with the Controls screen.
 */
import { findKeyAction, isKeyActionId, type KeyActionId } from './keyActions';
import { normalizeBinding, type Binding } from './keyCodes';

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
		// A broken slot means a broken entry: fall back to the defaults rather than guess.
		if (!binding) return null;
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

/** For tests: forget the cached state so the next read goes back to storage. */
export function resetKeyBindingsForTests(): void {
	state = undefined;
	revision++;
	listeners.clear();
}
