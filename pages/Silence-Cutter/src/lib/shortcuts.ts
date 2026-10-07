/** Keyboard shortcuts — single source of truth for the handler and the help dialog. */
export interface Shortcut {
	keys: string[];
	action: string;
}

export const SHORTCUTS: Array<{ group: string; items: Shortcut[] }> = [
	{
		group: 'Playback',
		items: [
			{ keys: ['Space'], action: 'Play / pause' },
			{ keys: ['J'], action: 'Jump back (press again to jump further)' },
			{ keys: ['K'], action: 'Pause' },
			{ keys: ['L'], action: 'Play forward (press again to speed up)' },
			{ keys: ['Shift', 'Space'], action: 'Play selection (or 2 s around the playhead)' },
			{ keys: ['P'], action: 'Preview the selected / next cut (2 s either side, Edited mode)' },
			{ keys: ['E'], action: 'Toggle Original / Edited preview' },
			{ keys: ['Home / End'], action: 'Go to start / end' },
			{ keys: ['← / →'], action: 'Move playhead one frame' },
			{ keys: ['Shift', '←/→'], action: 'Move playhead one second' },
			{ keys: ['↑ / ↓'], action: 'Previous / next cut' }
		]
	},
	{
		group: 'Editing',
		items: [
			{ keys: ['Delete / Backspace / R / X'], action: 'Remove selection' },
			{ keys: ['U'], action: 'Keep / restore selection (or the cut under the playhead)' },
			{ keys: ['Shift', 'K'], action: 'Keep selection (K alone is pause)' },
			{ keys: ['S / C'], action: 'Cut (split) the segment at the playhead' },
			{ keys: ['I / O'], action: 'Set selection in / out at the playhead' },
			{ keys: ['[ / ]'], action: 'Select previous / next cut' },
			{ keys: ['{ / }'], action: 'Select previous / next segment' },
			{ keys: ['⌘/Ctrl', 'A'], action: 'Select all' },
			{ keys: ['Z'], action: 'Zoom to selection' },
			{ keys: ['V'], action: 'Select tool: click segments, drag to select ranges' },
			{ keys: ['B'], action: 'Trim tool: drag cut edges to move them (nothing else)' },
			{ keys: ['N'], action: 'Toggle snapping (hold Alt while dragging to bypass)' },
			{ keys: ['T'], action: 'Toggle the region under the playhead (cut ↔ keep)' },
			{ keys: ['M'], action: 'Merge regions in selection' },
			{ keys: ['Alt', '←/→'], action: 'Nudge selection 10 ms (Shift: 100 ms)' },
			{ keys: ['Esc'], action: 'Clear selection' },
			{ keys: ['⌘/Ctrl', 'Z'], action: 'Undo' },
			{ keys: ['⌘/Ctrl', 'Shift', 'Z'], action: 'Redo (also ⌘/Ctrl+Y)' }
		]
	},
	{
		group: 'Mouse (timeline)',
		items: [
			{
				keys: ['Click Segments track'],
				action: 'Select the whole segment (a cut is restored)'
			},
			{ keys: ['Click Detail track'], action: 'Select just that piece (nothing changes)' },
			{ keys: ['Double-click speech'], action: 'Remove that segment' },
			{ keys: ['Drag on waveform'], action: 'Select a range (snaps; hold Alt to bypass)' },
			{ keys: ['Drag a selection edge'], action: 'Adjust the selection (Select tool)' },
			{ keys: ['Drag a cut edge'], action: 'Move it (Trim tool, B)' },
			{ keys: ['Click / drag words'], action: 'Select words (here or in the transcript)' },
			{ keys: ['Shift', 'click'], action: 'Extend the selection' },
			{ keys: ['Right-click'], action: 'Edit menu' },
			{ keys: ['Zoom scrollbar'], action: 'Drag the middle to scroll, an end to zoom' }
		]
	},
	{
		group: 'View',
		items: [
			{ keys: ['+ / −'], action: 'Zoom timeline in / out' },
			{ keys: ['0'], action: 'Fit whole recording' },
			{ keys: ['⌘/Ctrl', 'scroll'], action: 'Zoom at the pointer (or pinch)' },
			{ keys: ['scroll'], action: 'Scroll timeline' },
			{ keys: ['?'], action: 'Show shortcuts' }
		]
	}
];
