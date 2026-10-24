import { describe, expect, it } from 'vitest';
import {
	snapKeyForHints,
	snapLabelForHints,
	touchToolActions,
	variantControl
} from '../touchToolActions';

const ids = (lines: string[], canFinish = false, toolId?: string) =>
	touchToolActions(lines, { canFinishOpenPath: canFinish, toolId }).map((action) => action.id);

describe('touchToolActions', () => {
	it('shows roof rise while a sloped roof is being shaped, and Shape takes over Type', () => {
		const lines = [
			'Gable Roof',
			'Rise: 4.00m   Pitch: 30.0°',
			'V: Cycle type',
			'R: Rotate',
			'↑/↓: Adjust rise (Shift: fine)',
			'Click: Place roof'
		];
		expect(ids(lines)).toEqual(['rise-down', 'rise-up']);
		expect(variantControl(lines)).toEqual({ label: 'Shape', roofShape: true });
	});

	it('undoes a roof or slab point without offering rise before the footprint closes', () => {
		const lines = ['Roof', 'Click: Add point', 'Backspace: Undo point', 'B: Cycle snap'];
		expect(ids(lines)).toEqual(['undo-pt']);
		expect(variantControl(lines).roofShape).toBe(false);
	});

	it('turns stairs and finishes an open fence', () => {
		expect(ids(['← / → Change direction', 'Enter / Click: Build'])).toEqual([
			'dir-left',
			'dir-right'
		]);
		const finish = touchToolActions(['Enter: Finish', 'Backspace: Undo point'], {
			canFinishOpenPath: true,
			toolId: 'barrier'
		});
		expect(finish.map((action) => action.label)).toEqual(['Undo Pt', 'Finish fence']);
		expect(finish.at(-1)?.code).toBe('Enter');
	});

	it('covers skirting, fence copy, objects, and the music garden', () => {
		expect(ids(['O: Auto / manual offset'])).toEqual(['offset']);
		expect(ids(['R: Apply these settings to this fence', 'Q: Copy its style'])).toEqual([
			'copy-style',
			'apply-style'
		]);
		expect(
			ids([
				'R    Rotate (Shift: back)',
				'T    Snap angle (Shift: coarser)',
				'B    Copy Bench',
				'F    Edit Bench',
				'↑/↓  Recent objects'
			])
		).toEqual(['snap-angle', 'copy-object', 'edit-object', 'recent-prev', 'recent-next']);
		expect(
			ids(['↑ ↓ Pitch · ← → Vibrancy', '1–5 Instrument · Click: Plant · J Play/Pause'])
		).toEqual(['pitch-down', 'pitch-up', 'vol-down', 'vol-up', 'len-down', 'len-up', 'play']);
	});

	it('sends B for opening snap, path mode, and other build tools', () => {
		expect(snapKeyForHints(['B cycle snap'])).toBe('KeyB');
		expect(snapKeyForHints(['B path mode'])).toBe('KeyB');
		expect(snapLabelForHints(['B path mode'])).toBe('Mode');
		expect(snapKeyForHints(['B: Cycle snap'])).toBe('KeyB');
		expect(snapLabelForHints(['B: Cycle snap'])).toBe('Snap');
	});
});

describe('roof footprint touch controls', () => {
	it('labels the snap button Polygon before switching, then restores Snap for polygon drawing', () => {
		const hints = ['Roof', 'E: Polygon mode', 'B: Polygon mode (Snap)'];
		expect(snapKeyForHints(hints)).toBe('KeyB');
		expect(snapLabelForHints(hints)).toBe('Polygon');
		expect(snapLabelForHints(['Roof', 'B: Cycle snap'])).toBe('Snap');
	});
});
