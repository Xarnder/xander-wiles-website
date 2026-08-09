export type Font = {
	id: string
	name: string
	family: string
	category: 'sans' | 'serif' | 'display' | 'mono' | 'custom'
	/** Present when loaded from a user-uploaded file. */
	custom?: boolean
}

export const fonts: Font[] = [
	{ id: 'inter', name: 'Inter', family: "'Inter', sans-serif", category: 'sans' },
	{ id: 'space-grotesk', name: 'Space Grotesk', family: "'Space Grotesk', sans-serif", category: 'sans' },
	{ id: 'outfit', name: 'Outfit', family: "'Outfit', sans-serif", category: 'sans' },
	{ id: 'manrope', name: 'Manrope', family: "'Manrope', sans-serif", category: 'sans' },
	{ id: 'dm-sans', name: 'DM Sans', family: "'DM Sans', sans-serif", category: 'sans' },
	{ id: 'plus-jakarta', name: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans', sans-serif", category: 'sans' },
	{ id: 'sora', name: 'Sora', family: "'Sora', sans-serif", category: 'sans' },
	{ id: 'instrument-sans', name: 'Instrument Sans', family: "'Instrument Sans', sans-serif", category: 'sans' },
	{ id: 'figtree', name: 'Figtree', family: "'Figtree', sans-serif", category: 'sans' },
	{ id: 'onest', name: 'Onest', family: "'Onest', sans-serif", category: 'sans' },
	{ id: 'playfair', name: 'Playfair Display', family: "'Playfair Display', serif", category: 'serif' },
	{ id: 'cormorant', name: 'Cormorant Garamond', family: "'Cormorant Garamond', serif", category: 'serif' },
	{ id: 'libre-baskerville', name: 'Libre Baskerville', family: "'Libre Baskerville', serif", category: 'serif' },
	{ id: 'fraunces', name: 'Fraunces', family: "'Fraunces', serif", category: 'serif' },
	{ id: 'instrument-serif', name: 'Instrument Serif', family: "'Instrument Serif', serif", category: 'serif' },
	{ id: 'bebas-neue', name: 'Bebas Neue', family: "'Bebas Neue', sans-serif", category: 'display' },
	{ id: 'archivo-black', name: 'Archivo Black', family: "'Archivo Black', sans-serif", category: 'display' },
	{ id: 'oswald', name: 'Oswald', family: "'Oswald', sans-serif", category: 'display' },
	{ id: 'syne', name: 'Syne', family: "'Syne', sans-serif", category: 'display' },
	{ id: 'unbounded', name: 'Unbounded', family: "'Unbounded', sans-serif", category: 'display' },
	{ id: 'bricolage', name: 'Bricolage Grotesque', family: "'Bricolage Grotesque', sans-serif", category: 'display' },
	{ id: 'jetbrains-mono', name: 'JetBrains Mono', family: "'JetBrains Mono', monospace", category: 'mono' },
	{ id: 'ibm-plex-mono', name: 'IBM Plex Mono', family: "'IBM Plex Mono', monospace", category: 'mono' },
	{ id: 'space-mono', name: 'Space Mono', family: "'Space Mono', monospace", category: 'mono' },
]

/** Combined Google Fonts stylesheet URL for all families above. */
export const googleFontsHref =
	'https://fonts.googleapis.com/css2?' +
	[
		'family=Inter:wght@400;500;600;700',
		'family=Space+Grotesk:wght@400;500;600;700',
		'family=Outfit:wght@400;500;600;700',
		'family=Manrope:wght@400;500;600;700',
		'family=DM+Sans:wght@400;500;600;700',
		'family=Plus+Jakarta+Sans:wght@400;500;600;700',
		'family=Sora:wght@400;500;600;700',
		'family=Instrument+Sans:wght@400;500;600;700',
		'family=Figtree:wght@400;500;600;700',
		'family=Onest:wght@400;500;600;700',
		'family=Playfair+Display:wght@400;500;600;700',
		'family=Cormorant+Garamond:wght@400;500;600;700',
		'family=Libre+Baskerville:wght@400;700',
		'family=Fraunces:wght@400;500;600;700',
		'family=Instrument+Serif',
		'family=Bebas+Neue',
		'family=Archivo+Black',
		'family=Oswald:wght@400;500;600;700',
		'family=Syne:wght@400;500;600;700',
		'family=Unbounded:wght@400;500;600;700',
		'family=Bricolage+Grotesque:wght@400;500;600;700',
		'family=JetBrains+Mono:wght@400;500;600;700',
		'family=IBM+Plex+Mono:wght@400;500;600;700',
		'family=Space+Mono:wght@400;700',
	].join('&') +
	'&display=swap'
