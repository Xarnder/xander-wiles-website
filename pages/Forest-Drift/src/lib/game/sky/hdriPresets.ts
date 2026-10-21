import sunnyUrl from '../../../../assets/HDRI/Cloudscape Sunny Seamless.webp?url';
import moodyUrl from '../../../../assets/HDRI/Cloudscape Moody Seamless.webp?url';

export type HdriPreset = 'cloudscape-sunny' | 'cloudscape-moody' | 'procedural';
export const DEFAULT_HDRI_PRESET: HdriPreset = 'cloudscape-sunny';

/** Vite emits hashed, base-relative URLs; listing a preset does not download its image. */
export const HDRI_PRESETS = [
	{ value: 'cloudscape-sunny', label: 'Cloudscape Sunny', url: sunnyUrl },
	{ value: 'cloudscape-moody', label: 'Cloudscape Moody', url: moodyUrl },
	{ value: 'procedural', label: 'Procedural gradient', url: null }
] as const;

export function resolveHdriPreset(value: unknown): HdriPreset {
	return HDRI_PRESETS.some((preset) => preset.value === value)
		? (value as HdriPreset)
		: DEFAULT_HDRI_PRESET;
}
