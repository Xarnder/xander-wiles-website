import type { DitherStrategy, SizePreset } from './types';

export const PRESET_SIZES: readonly SizePreset[] = [
	{ label: '1 MB', bytes: 1 * 1024 * 1024 },
	{ label: '2 MB', bytes: 2 * 1024 * 1024 },
	{ label: '5 MB', bytes: 5 * 1024 * 1024 },
	{ label: '10 MB', bytes: 10 * 1024 * 1024 },
	{ label: '20 MB', bytes: 20 * 1024 * 1024 }
];

export const DEFAULT_TARGET_BYTES = 10 * 1024 * 1024;

export const WIDTH_LADDER = [
	960, 800, 720, 640, 560, 480, 400, 360, 320, 280, 240, 200, 160
] as const;

export const FPS_LADDER = [24, 20, 18, 15, 12, 10, 8, 6, 5, 4, 3] as const;

export const COLOUR_LADDER = [256, 192, 128, 96, 64, 48, 32, 24, 16] as const;

export const MIN_WIDTH = 160;
export const MIN_FPS = 3;
export const MIN_COLOURS = 16;
export const MAX_WIDTH_CAP = 960;
export const MAX_FPS_CAP = 24;

export const LARGE_FILE_BYTES = 150 * 1024 * 1024;
export const HUGE_FILE_BYTES = 400 * 1024 * 1024;
export const LONG_CLIP_SECONDS = 20;
export const VERY_LONG_CLIP_SECONDS = 45;

export const ANALYSE_FRAME_WIDTH = 160;
export const ANALYSE_SAMPLE_COUNT = 10;

export const DEFAULT_DITHER: DitherStrategy = 'sierra2_4a';

export const SPEED_PRESETS = [1, 1.5, 2, 2.5, 3, 3.5, 4] as const;
export const MIN_SPEED = 1;
export const MAX_SPEED = 4;

export const VIDEO_EXTENSIONS = [
	'.mp4',
	'.mov',
	'.webm',
	'.m4v',
	'.avi',
	'.mkv',
	'.ogv',
	'.ogg',
	'.3gp',
	'.wmv',
	'.flv',
	'.mts',
	'.m2ts',
	'.ts',
	'.mpg',
	'.mpeg',
	'.m2v',
	'.asf',
	'.vob',
	'.f4v',
	'.mxf',
	'.m4s'
] as const;

// Keep this short. A long extension list makes iOS Safari skip Photos/Camera Roll
// and open the Files browser instead.
export const FILE_PICKER_ACCEPT = 'video/*,video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v';
