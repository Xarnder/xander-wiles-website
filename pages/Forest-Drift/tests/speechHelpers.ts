import type { Page } from '@playwright/test';

export type Probe = {
	started: number;
	stopped: number;
	active: number;
	maxActive: number;
	audible: number;
};
export async function observeAudio(page: Page) {
	await page.addInitScript(() => {
		const probe = { started: 0, stopped: 0, active: 0, maxActive: 0, audible: 0 };
		(window as unknown as { speechProbe: Probe }).speechProbe = probe;
		const live = new Set<AudioBufferSourceNode>();
		const contexts = new Set<AudioContext>();
		(window as unknown as { suspendNarrator: () => Promise<void[]> }).suspendNarrator = () =>
			Promise.all([...contexts].map((context) => context.suspend()));
		const start = AudioBufferSourceNode.prototype.start;
		const stop = AudioBufferSourceNode.prototype.stop;
		const disconnect = AudioBufferSourceNode.prototype.disconnect;
		AudioBufferSourceNode.prototype.start = function (...args) {
			if (this.buffer?.sampleRate === 24000 && this.buffer.numberOfChannels === 1) {
				contexts.add(this.context as AudioContext);
				probe.started++;
				if (this.buffer.getChannelData(0).some((v) => Math.abs(v) > 0.001)) probe.audible++;
				live.add(this);
				probe.active = live.size;
				probe.maxActive = Math.max(probe.maxActive, live.size);
				this.addEventListener('ended', () => {
					live.delete(this);
					probe.active = live.size;
				});
			}
			return start.apply(this, args);
		};
		AudioBufferSourceNode.prototype.stop = function (...args) {
			if (live.delete(this)) {
				probe.stopped++;
				probe.active = live.size;
			}
			return stop.apply(this, args);
		};
		AudioBufferSourceNode.prototype.disconnect = function (...args: unknown[]) {
			const result = Reflect.apply(disconnect, this, args);
			// WebKit can deliver `ended` after the service has disconnected a finished clip.
			// A node with no output connections cannot overlap the next audible instruction.
			if (args.length === 0 && live.delete(this)) probe.active = live.size;
			return result;
		};
	});
}
export const probe = (page: Page) =>
	page.evaluate(() => (window as unknown as { speechProbe: Probe }).speechProbe);
