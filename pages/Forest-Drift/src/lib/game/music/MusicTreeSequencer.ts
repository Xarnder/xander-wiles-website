import { AudioScheduler } from './AudioScheduler';
import { audioContext, InstrumentLibrary } from './InstrumentLibrary';
import {
	noteDurationSeconds,
	pitch,
	species,
	vibrancyGain,
	type MusicPlantDefinition,
	type MusicTreeDefinition
} from './MusicModel';
export class MusicTreeSequencer {
	private context?: AudioContext;
	private library?: InstrumentLibrary;
	private bus?: GainNode;
	private compressor?: DynamicsCompressorNode;
	private timer?: ReturnType<typeof setInterval>;
	private scheduler?: AudioScheduler;
	private index = new Map<number, MusicPlantDefinition[]>();
	private generation = 0;
	start = 0;
	playing = false;
	volume = 0.6;
	schedulerMetrics = { ticks: 0, totalMs: 0, maxMs: 0 };
	constructor(
		public tree: MusicTreeDefinition,
		private getContext: () => AudioContext = audioContext
	) {}
	reindex(plants: MusicPlantDefinition[]) {
		this.index.clear();
		for (const p of plants)
			if (p.musicTreeId === this.tree.id) {
				const ring = this.index.get(p.ringIndex) ?? [];
				ring.push(p);
				this.index.set(p.ringIndex, ring);
			}
	}
	async play() {
		const generation = ++this.generation;
		this.context ??= this.getContext();
		await this.context.resume();
		if (this.playing || generation !== this.generation) return;
		if (!this.bus) {
			this.bus = this.context.createGain();
			this.compressor = this.context.createDynamicsCompressor();
			this.compressor.threshold.value = -18;
			this.compressor.ratio.value = 8;
			this.bus.connect(this.compressor);
			this.compressor.connect(this.context.destination);
			this.library = new InstrumentLibrary(this.context, this.bus);
		}
		this.playing = true;
		this.start = this.context.currentTime + 0.08;
		this.scheduler = new AudioScheduler(this.start, this.tree.loop);
		this.tick();
		this.timer = setInterval(() => this.tick(), 25);
	}
	private tick() {
		if (!this.context || this.context.state !== 'running') return;
		const tickStart = performance.now();
		this.bus!.gain.setTargetAtTime(this.volume * 0.35, this.context.currentTime, 0.03);
		this.scheduler?.schedule(this.context.currentTime, (ring, time) => {
			for (const p of this.index.get(ring) ?? [])
				this.library!.play(
					p.instrumentId ?? species.find((s) => s.id === p.speciesId)!.instrumentId,
					pitch(this.tree, p),
					vibrancyGain(p.vibrancy),
					time,
					p.id,
					noteDurationSeconds(this.tree.loop, p.durationSteps, p.ringIndex)
				);
		});
		const cost = performance.now() - tickStart;
		this.schedulerMetrics.ticks++;
		this.schedulerMetrics.totalMs += cost;
		this.schedulerMetrics.maxMs = Math.max(this.schedulerMetrics.maxMs, cost);
	}
	get started() {
		return this.playing && !!this.context && this.context.currentTime >= this.start;
	}
	get scheduledThrough() {
		return this.scheduler?.scheduledThrough ?? 0;
	}
	get elapsed() {
		return this.playing && this.context ? Math.max(0, this.context.currentTime - this.start) : 0;
	}
	get state() {
		return this.context?.state ?? 'suspended';
	}
	get voices() {
		return this.library?.count ?? 0;
	}
	cancel(id: string) {
		this.library?.stop(id);
	}
	pause() {
		this.generation++;
		this.playing = false;
		clearInterval(this.timer);
		this.library?.stop();
		this.scheduler = undefined;
	}
	dispose() {
		this.pause();
		this.bus?.disconnect();
		this.compressor?.disconnect();
	}
}
