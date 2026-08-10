import {
	canGoBack,
	completeCurrent,
	createRunSession,
	getCurrentTask,
	goBack,
	hasProgress,
	skipCurrent
} from '$lib/run/run-session';
import { deriveSummary } from '$lib/run/summary';
import type { Routine } from '$lib/types/routine';
import type { RunSession, RoutineSummaryStats } from '$lib/types/run';

const STORAGE_KEY = 'routine-active-run';

let session: RunSession | null = $state(null);
let storageEpoch = $state(0);
let transitionLock = false;

function persist(): void {
	if (typeof sessionStorage === 'undefined') return;
	if (!session) {
		sessionStorage.removeItem(STORAGE_KEY);
	} else {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
	}
	storageEpoch += 1;
}

export function getRunSession(): RunSession | null {
	return session;
}

export function getRunSummary(): RoutineSummaryStats | null {
	if (!session) return null;
	return deriveSummary(session);
}

export function getActiveTask() {
	if (!session) return null;
	return getCurrentTask(session);
}

export function runHasProgress(): boolean {
	return session ? hasProgress(session) : false;
}

export function runCanGoBack(): boolean {
	return session ? canGoBack(session) : false;
}

export function startRun(routine: Routine): void {
	if (routine.tasks.length === 0) {
		throw new Error('This routine has no tasks.');
	}
	session = createRunSession(routine);
	persist();
}

export function restoreRunFromStorage(routineId?: string): boolean {
	if (typeof sessionStorage === 'undefined') return false;
	const raw = sessionStorage.getItem(STORAGE_KEY);
	if (!raw) return false;
	try {
		const parsed = JSON.parse(raw) as RunSession;
		if (!isValidStoredSession(parsed)) {
			sessionStorage.removeItem(STORAGE_KEY);
			storageEpoch += 1;
			return false;
		}
		if (routineId && parsed.routineId !== routineId) return false;
		session = parsed;
		storageEpoch += 1;
		return true;
	} catch {
		sessionStorage.removeItem(STORAGE_KEY);
		storageEpoch += 1;
		return false;
	}
}

/** Read a stored unfinished run without activating it (for library resume UI). */
export function peekStoredRun(): RunSession | null {
	void storageEpoch;
	if (typeof sessionStorage === 'undefined') return null;
	const raw = sessionStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as RunSession;
		if (!isValidStoredSession(parsed) || parsed.phase !== 'running') {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export function discardStoredRun(): void {
	session = null;
	persist();
}

export function clearRun(): void {
	session = null;
	persist();
}

function isValidStoredSession(value: RunSession): boolean {
	return (
		typeof value?.routineId === 'string' &&
		typeof value?.routineName === 'string' &&
		Array.isArray(value?.tasks) &&
		value.tasks.length > 0 &&
		typeof value?.currentIndex === 'number' &&
		(value.phase === 'running' || value.phase === 'summary')
	);
}

function withLock(fn: () => void): void {
	if (transitionLock || !session) return;
	transitionLock = true;
	fn();
	persist();
	// Unlock on the next macrotask so a double-tap in the same gesture is ignored,
	// but the following intentional Complete/Skip (e.g. Playwright) is not dropped.
	window.setTimeout(() => {
		transitionLock = false;
	}, 0);
}

export function completeAndNext(): void {
	withLock(() => {
		if (!session) return;
		session = completeCurrent(session);
	});
}

export function skipAndNext(): void {
	withLock(() => {
		if (!session) return;
		session = skipCurrent(session);
	});
}

export function backOne(): void {
	withLock(() => {
		if (!session) return;
		session = goBack(session);
	});
}

export function restartRun(routine: Routine): void {
	startRun(routine);
}
