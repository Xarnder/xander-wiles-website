import { audioContext } from '../music/InstrumentLibrary';
import { audioOutput } from './AudioPreferences';

/**
 * A soft synthesised thud for a damaging landing: low-passed noise with a quick decay, louder for
 * bigger hits. No asset to download; it follows the player's ambience volume.
 */
export function playLandingThud(amount: number): void {
	let context: AudioContext;
	try {
		context = audioContext();
	} catch {
		return;
	}
	// Landing always follows a key press or tap, so the context can resume.
	if (context.state === 'suspended') void context.resume().catch(() => {});
	const duration = 0.35;
	const now = context.currentTime;
	const buffer = context.createBuffer(
		1,
		Math.ceil(context.sampleRate * duration),
		context.sampleRate
	);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

	const source = context.createBufferSource();
	source.buffer = buffer;
	const filter = context.createBiquadFilter();
	filter.type = 'lowpass';
	filter.frequency.setValueAtTime(420, now);
	filter.frequency.exponentialRampToValueAtTime(90, now + duration);
	const gain = context.createGain();
	const peak = Math.min(0.9, 0.25 + amount * 0.03);
	gain.gain.setValueAtTime(peak, now);
	gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

	source.connect(filter).connect(gain).connect(audioOutput(context, 'ambience'));
	source.start(now);
	source.stop(now + duration);
	source.onended = () => gain.disconnect();
}
