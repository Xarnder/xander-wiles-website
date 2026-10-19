/** A contextual touch control derived from the active tool's HUD hints. */
export interface TouchToolAction {
	id: string;
	label: string;
	aria: string;
	testId: string;
	/** `KeyboardEvent.code` dispatched to the active tool. */
	code: string;
	primary?: boolean;
}

function has(lines: readonly string[], fragment: string): boolean {
	return lines.some((line) => line.includes(fragment));
}

/**
 * Extra placement controls that the always-on Place / Cancel / Snap / Type / Rotate row does not
 * cover. Each one matches a line the tool already prints, so a new hint does not invent a new key.
 */
export function touchToolActions(
	hintLines: readonly string[],
	options: { canFinishOpenPath: boolean; toolId?: string }
): TouchToolAction[] {
	const actions: TouchToolAction[] = [];
	const add = (action: TouchToolAction) => actions.push(action);

	if (has(hintLines, 'Backspace: Undo')) {
		add({
			id: 'undo-pt',
			label: 'Undo Pt',
			aria: 'Undo last point',
			testId: 'touch-undo-pt',
			code: 'Backspace'
		});
	}
	if (has(hintLines, 'O: Auto')) {
		add({
			id: 'offset',
			label: 'Offset',
			aria: 'Toggle skirting offset',
			testId: 'touch-offset',
			code: 'KeyO'
		});
	}
	if (has(hintLines, 'Q: Copy')) {
		add({
			id: 'copy-style',
			label: 'Copy',
			aria: 'Copy fence style',
			testId: 'touch-copy-style',
			code: 'KeyQ'
		});
	}
	if (has(hintLines, 'R: Apply')) {
		add({
			id: 'apply-style',
			label: 'Apply',
			aria: 'Apply settings to this fence',
			testId: 'touch-apply-style',
			code: 'KeyR'
		});
	}
	if (has(hintLines, 'Change direction')) {
		add({
			id: 'dir-left',
			label: 'Dir −',
			aria: 'Turn stairs left',
			testId: 'touch-stair-left',
			code: 'ArrowLeft'
		});
		add({
			id: 'dir-right',
			label: 'Dir +',
			aria: 'Turn stairs right',
			testId: 'touch-stair-right',
			code: 'ArrowRight'
		});
	}
	if (has(hintLines, 'Snap angle')) {
		add({
			id: 'snap-angle',
			label: 'Angle',
			aria: 'Cycle rotation snap',
			testId: 'touch-snap-angle',
			code: 'KeyT'
		});
	}
	if (has(hintLines, 'C    Copy')) {
		add({
			id: 'copy-object',
			label: 'Copy',
			aria: 'Copy looked-at object',
			testId: 'touch-copy-object',
			code: 'KeyC'
		});
	}
	if (has(hintLines, 'F    Edit')) {
		add({
			id: 'edit-object',
			label: 'Edit',
			aria: 'Edit looked-at object',
			testId: 'touch-edit-object',
			code: 'KeyF'
		});
	}
	if (has(hintLines, 'Recent objects') || has(hintLines, 'Switch object')) {
		add({
			id: 'recent-prev',
			label: 'Obj ↓',
			aria: 'Previous recent object',
			testId: 'touch-recent-prev',
			code: 'ArrowDown'
		});
		add({
			id: 'recent-next',
			label: 'Obj ↑',
			aria: 'Next recent object',
			testId: 'touch-recent-next',
			code: 'ArrowUp'
		});
	}
	if (has(hintLines, '↑ ↓ Pitch')) {
		add({
			id: 'pitch-down',
			label: 'Pitch −',
			aria: 'Lower pitch',
			testId: 'touch-pitch-down',
			code: 'ArrowDown'
		});
		add({
			id: 'pitch-up',
			label: 'Pitch +',
			aria: 'Raise pitch',
			testId: 'touch-pitch-up',
			code: 'ArrowUp'
		});
		add({
			id: 'vol-down',
			label: 'Vol −',
			aria: 'Lower volume',
			testId: 'touch-volume-down',
			code: 'ArrowLeft'
		});
		add({
			id: 'vol-up',
			label: 'Vol +',
			aria: 'Raise volume',
			testId: 'touch-volume-up',
			code: 'ArrowRight'
		});
		add({
			id: 'len-down',
			label: 'Len −',
			aria: 'Shorter note',
			testId: 'touch-duration-down',
			code: 'Comma'
		});
		add({
			id: 'len-up',
			label: 'Len +',
			aria: 'Longer note',
			testId: 'touch-duration-up',
			code: 'Period'
		});
	}
	if (has(hintLines, 'J Play')) {
		add({
			id: 'play',
			label: 'Play',
			aria: 'Play or pause music',
			testId: 'touch-music-play',
			code: 'KeyJ'
		});
	}
	if (has(hintLines, 'Adjust rise')) {
		add({
			id: 'rise-down',
			label: 'Rise −',
			aria: 'Lower roof rise',
			testId: 'touch-rise-down',
			code: 'ArrowDown'
		});
		add({
			id: 'rise-up',
			label: 'Rise +',
			aria: 'Raise roof rise',
			testId: 'touch-rise-up',
			code: 'ArrowUp'
		});
	}
	if (options.canFinishOpenPath) {
		const fence = options.toolId === 'barrier';
		add({
			id: 'finish',
			label: fence ? 'Finish fence' : 'Finish',
			aria: fence ? 'Finish placing fence' : 'Finish open path',
			testId: 'touch-finish',
			code: 'Enter',
			primary: true
		});
	}
	return actions;
}

/** Openings and floor paths cycle with `C`. Every other draw tool uses `B`. */
export function snapKeyForHints(hintLines: readonly string[]): 'KeyC' | 'KeyB' {
	return has(hintLines, 'C cycle snap') || has(hintLines, 'C path mode') ? 'KeyC' : 'KeyB';
}

export function snapLabelForHints(hintLines: readonly string[]): string {
	return has(hintLines, 'B: Polygon mode')
		? 'Polygon'
		: has(hintLines, 'C path mode')
			? 'Mode'
			: 'Snap';
}

/** While a roof footprint is closed, Type cycles roof shape instead of leaving the tool. */
export function variantControl(hintLines: readonly string[]): {
	label: string;
	roofShape: boolean;
} {
	const roofShape = has(hintLines, 'V: Cycle type');
	return { label: roofShape ? 'Shape' : 'Type', roofShape };
}
