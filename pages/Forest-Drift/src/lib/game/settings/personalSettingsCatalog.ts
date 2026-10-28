import { getTutorialPreferences, setTutorialPreferences } from '../tutorials/TutorialPreferences';
import type { SettingsCategory, SettingsField } from './GameSettingsHost';
import { getAudioPreferences, setAudioPreferences } from '../audio/AudioPreferences';
import { GraphicsSettingsStore } from '../graphics/GraphicsSettingsStore';
import {
	clampFieldOfView,
	DEFAULT_FIELD_OF_VIEW,
	type GraphicsQuality
} from '../graphics/GraphicsTypes';

export function audioSettingsCategory(): SettingsCategory {
	const volume = (
		key: 'master' | 'music' | 'ambience' | 'narration',
		label: string
	): SettingsField => ({
		kind: 'number',
		id: `audio.${key}`,
		label: `${label} (%)`,
		min: 0,
		max: 100,
		step: 1,
		get: () => Math.round(getAudioPreferences()[key] * 100),
		set: (value) => setAudioPreferences({ [key]: value / 100 })
	});
	return {
		id: 'audio',
		title: 'Audio',
		description:
			'Your listening preferences apply across all worlds and are saved on this device. Music and ambience levels multiply the world’s own mix.',
		groups: [
			{
				id: 'audio-output',
				title: 'Sound & volume',
				fields: [
					{
						kind: 'boolean',
						id: 'audio.muted',
						label: 'Mute all audio',
						get: () => getAudioPreferences().muted,
						set: (muted) => setAudioPreferences({ muted })
					},
					volume('master', 'Master volume'),
					volume('music', 'Music volume'),
					volume('ambience', 'Ambience & weather volume'),
					volume('narration', 'Narration volume')
				]
			}
		]
	};
}

export function tutorialSettingsCategory(): SettingsCategory {
	const toggle = (key: 'enabled' | 'narration' | 'subtitles', label: string): SettingsField => ({
		kind: 'boolean',
		id: `tutorials.${key}`,
		label,
		get: () => getTutorialPreferences()[key],
		set: (value) => setTutorialPreferences({ [key]: value })
	});
	return {
		id: 'tutorials',
		title: 'Tutorials & subtitles',
		description:
			'Personal guidance preferences. Open Speech options (F6) in a world to prepare or replay the narrator.',
		groups: [
			{
				id: 'tutorial-guidance',
				title: 'Guidance',
				fields: [
					toggle('enabled', 'Enable tutorials'),
					toggle('narration', 'Speak tutorial instructions'),
					toggle('subtitles', 'Keep instructions visible after speech'),
					{
						kind: 'number',
						id: 'tutorials.autoPauseSeconds',
						label: 'Auto pause between instructions (seconds)',
						min: 0,
						max: 30,
						step: 1,
						get: () => getTutorialPreferences().autoPauseSeconds,
						set: (autoPauseSeconds) => setTutorialPreferences({ autoPauseSeconds })
					},
					{
						kind: 'number',
						id: 'tutorials.size',
						label: 'Subtitle size (px)',
						min: 16,
						max: 24,
						step: 1,
						get: () => getTutorialPreferences().size,
						set: (size) => setTutorialPreferences({ size })
					}
				]
			}
		]
	};
}

/** Only preferences with a persistent, world-independent runtime consumer belong here. */
export function personalSettingsCatalog(): SettingsCategory[] {
	const store = new GraphicsSettingsStore();
	return [
		{
			id: 'graphics',
			title: 'Graphics & display',
			description:
				'Make Forest Drift comfortable on your device. These preferences are saved automatically and used when you enter a world.',
			groups: [
				{
					id: 'personal-display',
					title: 'Display',
					fields: [
						{
							kind: 'select',
							id: 'graphics.quality',
							label: 'Graphics quality',
							options: ['low', 'medium', 'high', 'ultra'].map((value) => ({
								value,
								label: value[0].toUpperCase() + value.slice(1)
							})),
							get: () => store.getQuality() ?? 'high',
							set: (value) => store.setQuality(value as GraphicsQuality)
						},
						{
							kind: 'number',
							id: 'graphics.fov',
							label: 'Field of view (°)',
							min: 50,
							max: 110,
							step: 1,
							get: () => clampFieldOfView(store.getFieldOfView() ?? DEFAULT_FIELD_OF_VIEW),
							set: (value) => store.setFieldOfView(clampFieldOfView(value))
						}
					]
				},
				{
					id: 'personal-hud',
					title: 'On-screen information',
					fields: [
						{
							kind: 'boolean',
							id: 'graphics.fpsCounter',
							label: 'Show FPS counter',
							get: () => store.getShowFpsCounter(),
							set: (value) => store.setShowFpsCounter(value)
						},
						{
							kind: 'boolean',
							id: 'graphics.locatorBar',
							label: 'Show locator bar in online worlds',
							get: () => store.getShowLocatorBar(),
							set: (value) => store.setShowLocatorBar(value)
						}
					]
				}
			]
		},
		audioSettingsCategory(),
		tutorialSettingsCategory()
	];
}
