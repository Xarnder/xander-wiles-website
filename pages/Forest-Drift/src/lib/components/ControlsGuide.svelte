<script lang="ts">
	const groups = [
		{
			title: 'Movement & camera',
			rows: [
				['W / A / S / D', 'Walk forward, left, backward and right.'],
				['Mouse', 'Look around. Click into the world to capture the mouse.'],
				[
					'F5 / touch View',
					'Switch first-person and above-head third-person camera. Aim and build using the centre crosshair; the camera moves closer near walls.'
				],
				['Shift', 'Hold to run while walking.'],
				['Space', 'Jump.'],
				['C (hold)', 'Zoom in when the current tool is not using C for its own action.'],
				[
					'F',
					'Toggle flight where available. W/S fly where you look, A/D strafe, Space rises, Shift descends, and the mouse wheel changes speed. With Place Object selected, F edits the aimed object instead.'
				],
				[
					'K',
					'Open or close the door under the crosshair. Outside Build Mode, sit or lie at an authored Mini Build location; press again to stand up.'
				],
				[
					'WASD / Space while resting',
					'Leave the seat or bed at a nearby clear standing position.'
				],
				[
					'V while resting',
					'Switch between first-person and third-person views of the seated or lying pose.'
				],
				[
					'Esc',
					'Release the mouse; press again to open Pause. Also closes menus or cancels placement once the mouse is free.'
				]
			]
		},
		{
			title: 'Building basics',
			rows: [
				['G', 'Toggle Build Mode and its hotbar. Your selected tool is remembered.'],
				['1 / 2 / 3', 'Select Foundation / Walls / Openings.'],
				['4 / 5 / 6 / 7 / 8', 'Select Slabs / Stairs / Floor Detailing / Shovel / Place Object.'],
				[
					'↑ / ↓',
					'Cycle tools within the selected slot. While shaping a roof, these adjust its rise instead.'
				],
				['Left click', 'Add a point, place an item or confirm the current preview.'],
				['Right click', 'Cancel placement or deselect the current tool.'],
				[
					'E',
					'Customise the next piece; for floors, ceilings and completed roof footprints, adjust placement height.'
				],
				[
					'− (minus)',
					'Undo a recent placement or complete shovel stroke; up to five actions are kept.'
				],
				['+ / =', 'Redo an undone shovel stroke.'],
				[
					'Shovel: left / right mouse',
					'Raise / lower terrain. Hold to repeat; release to commit one stroke. Escape cancels unfinished digging.'
				],
				[
					'Shovel: E',
					'Choose brush radius, height step or single-point mode. On touch screens, tap Raise or Lower.'
				],
				[
					'] / [',
					'Move up or down a building storey. Page Up / Page Down and the on-screen floor selector also work.'
				],
				[
					'B',
					'Cycle drawing snap modes on supported tools: Off, Axis, Axis + Inline and Wall Corners.'
				],
				[
					'Backspace / Enter',
					'While drawing a path, remove its last point / finish an open continuous wall or fence. Click the first point again to close a loop.'
				]
			]
		},
		{
			title: 'Roofs, objects & finishing touches',
			rows: [
				[
					'Roof: V / R',
					'After drawing the footprint, cycle roof shape / rotate the ridge or high edge.'
				],
				['Roof: ↑ / ↓', 'Raise or lower the roof rise. Hold Shift for finer adjustments.'],
				[
					'Roof: E',
					'While drawing, switch rectangle/polygon mode. After the footprint is complete, set eave height.'
				],
				['Stairs: ← / →', 'Change the stair direction; Enter or left click confirms.'],
				[
					'Openings: C',
					'Cycle wall-division snapping to position doors, windows or beams at even intervals.'
				],
				['Beam: R', 'Switch the next beam between vertical and horizontal.'],
				['Fence: Q / R', 'Copy the aimed fence’s style / apply your current settings to it.'],
				['Skirting: O', 'Switch between automatic and manual offset from the wall.'],
				['Floor detail: R', 'Change plank direction, cycle tile patterns or toggle path framing.'],
				['Path: C', 'Cycle Axis, Free and Bezier drawing modes.'],
				['8, then E', 'Open the Object Library to choose a design or create a Mini Build.'],
				[
					'Place Object: R / C / F',
					'Rotate 90° / copy the aimed object’s design / edit the aimed object.'
				]
			]
		},
		{
			title: 'Move, paint & remove',
			rows: [
				['M', 'Toggle Move Mode. Click an object to pick it up and click again to place it.'],
				[
					'Move: R / E',
					'Rotate the held object / edit its properties. Right click or Esc cancels the move.'
				],
				['P', 'Toggle Paint Mode. Left click paints the highlighted surface.'],
				['Paint: C', 'Open the colour palette. P, right click or Esc exits Paint Mode.'],
				[
					'X',
					'Toggle Remove Mode. Left click removes the highlighted building piece or music plant.'
				],
				[
					'Remove: Delete / Backspace',
					'Request deletion of the aimed foundation and its contents. A typed confirmation is required.'
				],
				['Remove: X / Right click / Esc', 'Exit Remove Mode and return to the previous tool.']
			]
		},
		{
			title: 'Music garden',
			rows: [
				[
					'N',
					'Enter or leave Compose Mode near a Music Tree. Rings show the timing positions in its loop.'
				],
				[
					'Aim + Left click',
					'Plant the preview on a snapped ring. Inner rings play earlier; outer rings play later.'
				],
				['1–5 / Q / E', 'Choose or cycle instruments: Flower, Mushroom, Fern, Reed and Crystal.'],
				['↑ / ↓', 'Raise or lower the preview plant’s pitch before placing.'],
				['← / →', 'Lower or raise its volume; the plant becomes paler or more vivid.'],
				[', / .', 'Shorten or lengthen the note duration.'],
				['J', 'Play or pause the active Music Tree’s loop.'],
				[
					'Import MIDI',
					'Use the music HUD button to preview a MIDI file, then click open ground to place its garden.'
				],
				[
					'Right click / Esc',
					'Cancel the music placement preview. Use X to remove an existing music plant.'
				]
			]
		},
		{
			title: 'Menus, saving & display',
			rows: [
				['H', 'Open or close the in-game controls guide.'],
				['Pause → Settings', 'Adjust audio, graphics and the current world’s settings.'],
				['Ctrl / Cmd + S', 'Save the world now. Worlds also autosave after building changes.'],
				['L', 'Cycle Low, Medium, High and Ultra graphics quality. The preference is remembered.'],
				['F3', 'Show or hide render statistics.'],
				[
					'Backslash (\\)',
					'Capture a best-quality PNG: temporarily use Ultra, wait for loading, save the image and restore your graphics preference.'
				]
			]
		},
		{
			title: 'Touch, phones & tablets',
			rows: [
				[
					'Left joystick / right-side swipe',
					'Drag the joystick to walk; swipe on the right side to look around.'
				],
				['Run / Jump', 'Toggle sprint / jump over obstacles.'],
				[
					'Build / Music',
					'Toggle building tools / Music Garden mode. Tap hotbar slots to select a tool or instrument.'
				],
				['Place / Cancel', 'Confirm the current placement / cancel or deselect it.'],
				[
					'Type or Shape / Rotate / Snap',
					'Cycle tool variants or roof shapes, rotate supported pieces, or change drawing snap mode.'
				],
				['Edit / Undo', 'Customise the next piece or its height / undo the last placement.'],
				['Finish / Undo Pt', 'Finish an open drawn path / remove its last point.'],
				['Floor selector', 'Use the on-screen arrows to change the active storey.'],
				['Open Door', 'Open or close the door you are aiming at when the action appears.'],
				[
					'Tool actions',
					'Contextual buttons provide roof rise, stair direction, object copy/edit, music pitch, volume, note length and playback.'
				],
				[
					'Pause / Touch',
					'Open the pause menu / toggle the touch control overlay when the Touch button is available.'
				]
			]
		}
	];
</script>

<div class="controls-guide">
	<h4>Controls &amp; what they do</h4>
	<p>
		Choose a section below. Shortcuts act on your current tool or mode; the in-game hints show the
		actions available right now.
	</p>
	{#each groups as group, index (group.title)}
		<details open={index === 0}>
			<summary>{group.title}</summary>
			<dl>
				{#each group.rows as [key, description] (key)}<div class="control-row">
						<dt><kbd>{key}</kbd></dt>
						<dd>{description}</dd>
					</div>{/each}
			</dl>
		</details>
	{/each}
</div>

<style>
	.controls-guide {
		margin: 28px 0;
	}
	h4 {
		font-size: 22px;
		color: #e8bf70;
		margin: 0 0 12px;
	}
	p {
		color: #dfccaa;
		font-size: 14px;
	}
	details {
		border: 1px solid #ac824255;
		border-radius: 12px;
		background: #100c0855;
		margin: 10px 0;
	}
	summary {
		min-height: 48px;
		padding: 12px 16px;
		color: #f2d99e;
		cursor: pointer;
		font-weight: bold;
	}
	summary:focus-visible {
		outline: 2px solid #ffdb83;
		outline-offset: 2px;
		border-radius: 10px;
	}
	dl {
		padding: 0 16px 12px;
		margin: 0;
	}
	.control-row {
		display: grid;
		grid-template-columns: minmax(110px, 0.7fr) minmax(0, 1.5fr);
		gap: 16px;
		border-top: 1px solid #ac824233;
		padding: 14px 0;
	}
	kbd {
		font:
			13px/1.6 system-ui,
			sans-serif;
		color: #f4d18c;
		overflow-wrap: anywhere;
	}
	dd {
		margin: 0;
		color: #dfccaa;
		font-size: 14px;
		line-height: 1.65;
	}
	@media (max-width: 480px) {
		.control-row {
			grid-template-columns: minmax(0, 1fr);
			gap: 5px;
		}
	}
</style>
