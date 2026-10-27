import { audioLevel, subscribeAudioPreferences } from '../audio/AudioPreferences';
import type { SpeechResult } from './types';
/** Optional installed-device voice. Never selects a remote service or pretends audio is cacheable. */
export class LocalVoice {
	private finish?: (result: SpeechResult) => void;
	private voiceURI?: string;
	cancel() {
		this.finish?.('cancelled');
	}
	async say(
		text: string,
		language: string,
		started: () => void,
		expiresAt?: number
	): Promise<SpeechResult> {
		this.cancel();
		if (typeof speechSynthesis === 'undefined') return 'text';
		const voices = speechSynthesis
			.getVoices()
			.filter((voice) => voice.localService && voice.lang.split('-')[0] === language.split('-')[0]);
		const voice =
			voices.find((v) => v.voiceURI === this.voiceURI) ??
			voices.find((v) => v.lang === language) ??
			voices[0];
		if (!voice || audioLevel('narration') === 0) return 'text';
		this.voiceURI = voice.voiceURI;
		return new Promise((resolve) => {
			let done = false;
			const expiry =
				expiresAt === undefined
					? undefined
					: setTimeout(() => finish('cancelled'), Math.max(0, expiresAt - Date.now()));
			const utterance = new SpeechSynthesisUtterance(text);
			utterance.voice = voice;
			utterance.lang = voice.lang;
			utterance.volume = audioLevel('narration');
			let unsubscribe = () => {};
			const timeout = setTimeout(() => finish('text'), 30_000);
			const startTimeout = setTimeout(() => finish('text'), 2000);
			const finish = (result: SpeechResult) => {
				if (done) return;
				done = true;
				clearTimeout(timeout);
				clearTimeout(startTimeout);
				clearTimeout(expiry);
				unsubscribe();
				utterance.onstart = null;
				utterance.onend = null;
				utterance.onerror = null;
				this.finish = undefined;
				if (result !== 'ended') speechSynthesis.cancel();
				resolve(result);
			};
			this.finish = finish;
			unsubscribe = subscribeAudioPreferences((p) => {
				if (audioLevel('narration', p) === 0) finish('text');
			});
			utterance.onstart = () => {
				if (done) return;
				clearTimeout(startTimeout);
				started();
			};
			utterance.onend = () => finish('ended');
			utterance.onerror = () => finish('text');
			try {
				speechSynthesis.speak(utterance);
			} catch {
				finish('text');
			}
		});
	}
}
