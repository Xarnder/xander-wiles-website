import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicTreeSequencer } from '../MusicTreeSequencer';
import { createMusicTree, type MusicPlantDefinition } from '../MusicModel';
function audioMock() {
	const starts: number[] = [];
	const sources: {
		start: ReturnType<typeof vi.fn>;
		stop: ReturnType<typeof vi.fn>;
		disconnect: ReturnType<typeof vi.fn>;
		onended?: () => void;
	}[] = [];
	const gains: ReturnType<typeof parameter>[] = [];
	function parameter() {
		return {
			value: 0,
			setValueAtTime: vi.fn(),
			linearRampToValueAtTime: vi.fn(),
			exponentialRampToValueAtTime: vi.fn(),
			setTargetAtTime: vi.fn(),
			cancelScheduledValues: vi.fn()
		};
	}
	const ctx = {
		currentTime: 0,
		state: 'running',
		destination: {},
		resume: vi.fn(async () => {}),
		createPeriodicWave: vi.fn(() => ({})),
		createGain: () => {
			const gain = parameter();
			gains.push(gain);
			return { gain, connect: vi.fn(), disconnect: vi.fn() };
		},
		createDynamicsCompressor: () => ({
			threshold: parameter(),
			ratio: parameter(),
			connect: vi.fn(),
			disconnect: vi.fn()
		}),
		createOscillator: () => {
			const source = {
				frequency: parameter(),
				type: 'sine',
				setPeriodicWave: vi.fn(),
				connect: vi.fn(),
				disconnect: vi.fn(),
				start: vi.fn((time: number) => starts.push(time)),
				stop: vi.fn(),
				onended: undefined as (() => void) | undefined
			};
			sources.push(source);
			return source;
		}
	};
	return { ctx, starts, sources, gains, context: ctx as unknown as AudioContext };
}
afterEach(() => vi.useRealTimers());
describe('MusicTreeSequencer lifecycle', () => {
	it('starts a 20-plant chord sample-accurately, cancels removal, and restarts without stale voices', async () => {
		vi.useFakeTimers();
		const mock = audioMock();
		const t = createMusicTree();
		t.loop.bpm = 120;
		const q = new MusicTreeSequencer(t, () => mock.context);
		const plants: MusicPlantDefinition[] = Array.from({ length: 20 }, (_, i) => ({
			id: `p${i}`,
			musicTreeId: t.id,
			speciesId: 'flower',
			ringIndex: 0,
			angle: i / 20,
			durationSteps: 1,
			growth: i / 20,
			vibrancy: 0.7
		}));
		q.reindex(plants);
		await q.play();
		expect(mock.starts).toEqual(Array(20).fill(0.08));
		expect(q.voices).toBe(20);
		q.cancel('p0');
		expect(mock.sources[0].stop).toHaveBeenCalledTimes(2);
		q.reindex(plants.slice(1));
		q.pause();
		expect(q.playing).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
		for (const source of mock.sources) source.onended?.();
		expect(q.voices).toBe(0);
		mock.ctx.currentTime = 8;
		await q.play();
		expect(mock.starts.slice(20)).toEqual(Array(19).fill(8.08));
		q.dispose();
		expect(vi.getTimerCount()).toBe(0);
	});
	it('cancels a pending browser audio resume when disposed', async () => {
		const mock = audioMock();
		let release!: () => void;
		mock.ctx.resume.mockImplementation(() => new Promise<void>((r) => (release = r)));
		const q = new MusicTreeSequencer(createMusicTree(), () => mock.context);
		const pending = q.play();
		q.dispose();
		release();
		await pending;
		expect(q.playing).toBe(false);
		expect(mock.starts).toEqual([]);
	});
	it('reads visual time from AudioContext even without render callbacks', async () => {
		vi.useFakeTimers();
		const mock = audioMock();
		const q = new MusicTreeSequencer(createMusicTree(), () => mock.context);
		await q.play();
		mock.ctx.currentTime = 4.58;
		expect(q.elapsed).toBeCloseTo(4.5);
		q.dispose();
		expect(q.elapsed).toBe(0);
	});
	it('schedules note-on AND note-off/release for sustained notes, and two overlapping durations never cut one another off', async () => {
		vi.useFakeTimers();
		const mock = audioMock();
		const t = createMusicTree();
		t.loop.bpm = 120; // stepDuration = 0.25s
		const q = new MusicTreeSequencer(t, () => mock.context);
		const bass: MusicPlantDefinition = {
			id: 'bass',
			musicTreeId: t.id,
			speciesId: 'mushroom', // 'gated' sustain mode, attack 0.012, release 0.2
			ringIndex: 0,
			angle: 0,
			durationSteps: 4, // 1.0s
			growth: 0.5,
			vibrancy: 0.7
		};
		const bell: MusicPlantDefinition = {
			id: 'bell',
			musicTreeId: t.id,
			speciesId: 'flower', // 'natural-decay', duration 1.2s
			ringIndex: 0,
			angle: 1,
			durationSteps: 8, // 2.0s requested — longer than the bell's own 1.2s natural decay
			growth: 0.5,
			vibrancy: 0.7
		};
		q.reindex([bass, bell]);
		await q.play(); // schedules both notes at time 0.08 (both on ring 0 — a chord)

		// gains[0] is the shared mix bus; per-note gains follow in scheduling order.
		const bassGain = mock.gains[1];
		const bellGain = mock.gains[2];

		// Bass (gated): holds flat through the full 1.0s sustain, THEN releases over 0.2s.
		expect(bassGain.setValueAtTime).toHaveBeenCalledWith(expect.any(Number), 1.08);
		expect(bassGain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 1.28);
		expect(mock.sources[0].stop).toHaveBeenCalledWith(1.3);

		// Bell (natural-decay): its own 1.2s decay is what ends the note — the LONGER requested 2.0s
		// duration has no effect, per InstrumentLibrary's own sustainMode doc comment.
		expect(bellGain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 0.08 + 1.2);
		expect(mock.sources[1].stop).toHaveBeenCalledWith(0.08 + 1.2 + 0.02);

		// Neither note's own stop/release touched the OTHER voice — two overlapping sustained notes
		// never cut each other off.
		expect(mock.sources[0].stop).toHaveBeenCalledTimes(1);
		expect(mock.sources[1].stop).toHaveBeenCalledTimes(1);
		q.dispose();
	});
});
