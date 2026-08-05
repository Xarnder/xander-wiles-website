import type { Logo } from './logos'

function basename(path: string): string {
	const parts = path.split(/[/\\]/)
	return parts[parts.length - 1] || path
}

function fileBasename(file: File): string {
	return basename(file.webkitRelativePath || file.name)
}

/** True if the file looks like an SVG by extension or MIME type. */
export function isSvgFile(file: File): boolean {
	const name = fileBasename(file).toLowerCase()
	return name.endsWith('.svg') || file.type === 'image/svg+xml'
}

/**
 * Filter a FileList / File[] to SVG files only, sorted alphabetically by basename.
 */
export function filterSvgFiles(fileList: FileList | Iterable<File>): File[] {
	return Array.from(fileList)
		.filter(isSvgFile)
		.sort((a, b) =>
			fileBasename(a).localeCompare(fileBasename(b), undefined, {
				sensitivity: 'base',
				numeric: true,
			}),
		)
}

/** Build Logo entries with blob object URLs for each SVG file. */
export function logosFromSvgFiles(files: File[]): Logo[] {
	return files.map((file, index) => {
		const name = fileBasename(file)
		const label = name.replace(/\.svg$/i, '') || name
		return {
			id: `custom-${index}-${name}`,
			src: URL.createObjectURL(file),
			label,
		}
	})
}

/** Revoke blob object URLs on logos that use them. */
export function revokeLogoUrls(logos: Iterable<Logo>): void {
	for (const logo of logos) {
		if (logo.src.startsWith('blob:')) {
			URL.revokeObjectURL(logo.src)
		}
	}
}

export function isCustomBlobLogo(logo: Logo): boolean {
	return logo.src.startsWith('blob:')
}

export function hasCustomBlobLogos(logos: Iterable<Logo>): boolean {
	for (const logo of logos) {
		if (isCustomBlobLogo(logo)) return true
	}
	return false
}

/** Whether the selection came from a directory picker (webkitRelativePath has a slash). */
export function selectionLooksLikeFolder(files: Iterable<File>): boolean {
	for (const file of files) {
		if (file.webkitRelativePath.includes('/')) return true
	}
	return false
}
