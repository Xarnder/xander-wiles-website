export type Logo = {
	id: string
	src: string
	label: string
}

export const LOGO_STORAGE_KEY = 'logo-demo-order'

const numbers = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const

const base = import.meta.env.BASE_URL

/** Default logo catalog / initial display order. */
export const logos: Logo[] = numbers.map((n) => ({
	id: `asset-${n}`,
	src: `${base}logos/Asset%20${n}Icons.svg`,
	label: `Asset ${n}`,
}))

export const DEFAULT_LOGOS = logos
