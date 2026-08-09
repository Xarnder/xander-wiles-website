import type { Font } from './fonts'

const FONT_EXT = /\.(woff2|woff|ttf|otf)$/i
const MAX_BYTES = 8 * 1024 * 1024

export type CustomFont = Font & {
	custom: true
	objectUrl: string
	fileName: string
}

function uid(): string {
	return Math.random().toString(36).slice(2, 9)
}

function displayNameFromFile(file: File): string {
	return file.name.replace(FONT_EXT, '').replace(/[_-]+/g, ' ').trim() || 'Custom font'
}

function isLikelyFontFile(file: File): boolean {
	if (FONT_EXT.test(file.name)) return true
	const t = file.type.toLowerCase()
	return (
		t.includes('font') ||
		t === 'application/font-woff' ||
		t === 'application/font-woff2' ||
		t === 'application/x-font-ttf' ||
		t === 'application/x-font-otf' ||
		t === 'application/octet-stream'
	)
}

/**
 * Load a user-uploaded font file into `document.fonts` and return a Font entry
 * usable with the existing company-name / PDF pipeline.
 */
export async function loadCustomFontFile(file: File): Promise<CustomFont> {
	if (!isLikelyFontFile(file)) {
		throw new Error('Use a .woff2, .woff, .ttf, or .otf font file')
	}
	if (file.size <= 0) throw new Error('Font file is empty')
	if (file.size > MAX_BYTES) throw new Error('Font file is too large (max 8MB)')

	const id = `custom-${uid()}`
	const familyToken = `UserFont_${id.replace(/-/g, '_')}`
	const objectUrl = URL.createObjectURL(file)
	const name = displayNameFromFile(file)

	try {
		const face = new FontFace(familyToken, `url(${objectUrl})`, {
			style: 'normal',
			weight: '100 900',
			display: 'swap',
		})
		await face.load()
		document.fonts.add(face)
		await document.fonts.load(`500 48px "${familyToken}"`)
	} catch {
		URL.revokeObjectURL(objectUrl)
		throw new Error('Could not load that font file')
	}

	return {
		id,
		name,
		family: `"${familyToken}", sans-serif`,
		category: 'custom',
		custom: true,
		objectUrl,
		fileName: file.name,
	}
}

/** Best-effort cleanup when discarding a custom font. */
export function revokeCustomFont(font: CustomFont): void {
	try {
		URL.revokeObjectURL(font.objectUrl)
	} catch {
		// ignore
	}
	try {
		const familyToken = font.family.split(',')[0]?.replace(/["']/g, '').trim()
		if (!familyToken || !document.fonts) return
		for (const face of [...document.fonts]) {
			if (face.family.replace(/["']/g, '') === familyToken) {
				document.fonts.delete(face)
			}
		}
	} catch {
		// ignore — FontFaceSet.delete is not critical
	}
}
