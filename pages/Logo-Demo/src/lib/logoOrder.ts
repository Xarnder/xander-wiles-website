import { logos as defaultLogos, LOGO_STORAGE_KEY, type Logo } from './logos'

export const ORDER_STORAGE_KEY = LOGO_STORAGE_KEY

/**
 * Resolve stored id order against known logos.
 * Drops unknown ids; appends any missing catalog logos at the end.
 */
export function resolveOrder(
	ids: string[] | null | undefined,
	catalog: Logo[] = defaultLogos,
): Logo[] {
	if (!ids || !Array.isArray(ids) || ids.length === 0) {
		return [...catalog]
	}

	const byId = new Map(catalog.map((logo) => [logo.id, logo]))
	const seen = new Set<string>()
	const ordered: Logo[] = []

	for (const id of ids) {
		if (typeof id !== 'string') continue
		const logo = byId.get(id)
		if (!logo || seen.has(id)) continue
		ordered.push(logo)
		seen.add(id)
	}

	for (const logo of catalog) {
		if (!seen.has(logo.id)) {
			ordered.push(logo)
		}
	}

	return ordered.length > 0 ? ordered : [...catalog]
}

export function loadOrderFromStorage(catalog: Logo[] = defaultLogos): Logo[] {
	if (typeof localStorage === 'undefined') {
		return [...catalog]
	}

	try {
		const raw = localStorage.getItem(ORDER_STORAGE_KEY)
		if (raw == null || raw === '') {
			return [...catalog]
		}

		const parsed: unknown = JSON.parse(raw)
		if (!Array.isArray(parsed)) {
			return [...catalog]
		}

		const ids = parsed.filter((id): id is string => typeof id === 'string')
		return resolveOrder(ids, catalog)
	} catch {
		return [...catalog]
	}
}

export function saveOrderToStorage(ordered: Logo[]): void {
	if (typeof localStorage === 'undefined') return

	try {
		const ids = ordered.map((logo) => logo.id)
		localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(ids))
	} catch {
		// Quota / private mode — ignore persistence failure
	}
}

/**
 * Move item from fromIndex to toIndex (splice-based insert-at).
 * Returns a new array; clamps indices defensively.
 */
export function moveItem<T>(list: T[], fromIndex: number, toIndex: number): T[] {
	const len = list.length
	if (len === 0) return []

	const from = Math.max(0, Math.min(len - 1, fromIndex))
	const to = Math.max(0, Math.min(len - 1, toIndex))
	if (from === to) return [...list]

	const next = [...list]
	const [item] = next.splice(from, 1)
	next.splice(to, 0, item)
	return next
}
