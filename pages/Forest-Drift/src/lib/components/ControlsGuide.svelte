<script lang="ts">
	import { onMount } from 'svelte';
	import { labelForAction, labelsForAction } from '#lib/game/input/KeyInput';
	import { subscribeKeyBindings } from '#lib/game/input/KeyBindingsStore';
	import type { KeyActionId } from '#lib/game/input/keyActions';

	/** Bumped when the bindings change, so every key below is re-read. */
	let revision = $state(0);
	onMount(() => subscribeKeyBindings(() => revision++));

	/** The key players press for this action right now ("Unbound" when none). */
	const k = (id: KeyActionId) => labelForAction(id);
	/** Every key bound to the action, joined: "Delete / Backspace". */
	const keys = (id: KeyActionId) => labelsForAction(id).join(' / ') || 'Unbound';

	const buildGroups = () => [
		{
			title: 'Movement & camera',
			rows: [
				[
					`${k('move.forward')} / ${k('move.left')} / ${k('move.back')} / ${k('move.right')}`,
					'Walk forward, left, backward and right.'
				],
				['Mouse', 'Look around. Click into the world to capture the mouse.'],
				[
					`${k('camera.toggleView')} / touch View`,
					'Switch first-person and above-head third-person camera. Aim and build using the centre crosshair; the camera moves closer near walls.'
				],
				[k('move.run'), 'Hold to run while walking.'],
				[k('move.jump'), 'Jump.'],
				[
					`${k('camera.zoom')} (hold)`,
					`Zoom in. ${k('camera.zoom')} is reserved for zoom across all build tools.`
				],
				[
					k('flight.toggle'),
					`Toggle flight where available. ${k('move.forward')}/${k('move.back')} fly where you look, ${k('move.left')}/${k('move.right')} strafe, ${k('flight.up')} rises, ${k('flight.down')} descends, and the mouse wheel changes speed. With Place Object selected, ${k('placeObject.edit')} edits the aimed object instead.`
				],
				[
					k('interact.use'),
					'Open or close the door under the crosshair. Outside Build Mode, sit or lie at an authored Mini Build location; press again to stand up.'
				],
				[
					`${k('interact.use')} on a small creature`,
					`Pick up a small four-legged creature (the ones with a gold paw badge) and tuck it under your arm; press ${k('interact.use')} again to put it down. A door or seat under the crosshair comes first. Pause → Waypoints can point you to the nearest one.`
				],
				[
					`${k('interact.use')} on a two-legged creature`,
					`Ride it (the ones with a teal saddle badge): astride its neck if it is small, on its right shoulder if it is large. ${k('move.forward')}/${k('move.left')}/${k('move.back')}/${k('move.right')} steer where you look, ${k('move.run')} sprints, and bigger creatures run faster. ${k('move.jump')} makes it jump (bigger creatures jump higher). ${k('interact.use')} gets off onto the ground beside it. You can climb on while carrying a creature, and fire from the seat.`
				],
				[
					'Left click while carrying',
					"Fire a seed pellet from the creature's mouth. Hold to keep firing: 5 shots, one comes back every 1.5 s. Not while building, flying or under water."
				],
				[
					`${k('move.forward')}${k('move.left')}${k('move.back')}${k('move.right')} / ${k('move.jump')} while resting`,
					'Leave the seat or bed at a nearby clear standing position.'
				],
				[
					`${k('camera.restingView')} while resting`,
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
				[k('build.toggle'), 'Toggle Build Mode and its hotbar. Your selected tool is remembered.'],
				[
					`${k('build.slot1')} / ${k('build.slot2')} / ${k('build.slot3')}`,
					'Select Foundation / Walls / Openings.'
				],
				[
					(['build.slot4', 'build.slot5', 'build.slot6', 'build.slot7', 'build.slot8'] as const)
						.map(k)
						.join(' / '),
					'Select Slabs / Stairs / Floor Detailing / Shovel / Place Object.'
				],
				[
					`${k('build.slotPrevious')} / ${k('build.slotNext')}`,
					'Cycle tools within the selected slot. While shaping a roof, these adjust its rise instead.'
				],
				['Left click', 'Add a point, place an item or confirm the current preview.'],
				['Right click', 'Cancel placement or deselect the current tool.'],
				[
					k('build.customise'),
					'Customise the next piece; for floors, ceilings and completed roof footprints, adjust placement height.'
				],
				[
					k('build.undo'),
					'Undo a recent placement or complete shovel stroke; up to five actions are kept.'
				],
				[k('build.redo'), 'Redo an undone shovel stroke.'],
				[
					'Shovel: left / right mouse',
					'Raise / lower terrain. Hold to repeat; release to commit one stroke. Escape cancels unfinished digging.'
				],
				[
					`Shovel: ${k('build.customise')}`,
					'Choose brush radius, height step or single-point mode. On touch screens, tap Raise or Lower.'
				],
				[
					`${k('build.levelUp')} / ${k('build.levelDown')}`,
					'Move up or down a building storey. Page Up / Page Down and the on-screen floor selector also work.'
				],
				[
					k('tool.snap'),
					'Cycle drawing snap modes on supported tools: Off, Axis, Axis + Inline and Wall Corners.'
				],
				[
					`${k('tool.undoPoint')} / ${k('tool.finish')}`,
					'While drawing a path, remove its last point / finish an open continuous wall or fence. Click the first point again to close a loop.'
				]
			]
		},
		{
			title: 'Roofs, objects & finishing touches',
			rows: [
				[
					`Roof: ${k('roof.type')} / ${k('tool.rotate')}`,
					'After drawing the footprint, cycle roof shape / rotate the ridge or high edge.'
				],
				[
					`Roof: ${k('roof.riseUp')} / ${k('roof.riseDown')}`,
					'Raise or lower the roof rise. Hold Shift for finer adjustments.'
				],
				[
					`Roof: ${k('roof.footprint')}`,
					'While drawing, switch rectangle/polygon mode. After the footprint is complete, set eave height.'
				],
				[
					`Stairs: ${k('stairs.turnLeft')} / ${k('stairs.turnRight')}`,
					`Change the stair direction; ${k('tool.finish')} or left click confirms.`
				],
				[
					`Openings: ${k('tool.snap')}`,
					`Doors, windows and beams start with 12 internal snap lines (13 equal segments). Press ${k('tool.snap')} once to turn snapping off, then press again to cycle other modes.`
				],
				[
					`Beam: ${k('opening.beamOrientation')}`,
					'Switch the next beam between vertical and horizontal.'
				],
				[
					`Fence: ${k('barrier.copyStyle')} / ${k('barrier.restyle')}`,
					'Copy the aimed fence’s style / apply your current settings to it.'
				],
				[
					`Skirting: ${k('skirting.offsetMode')}`,
					'Switch between automatic and manual offset from the wall.'
				],
				[
					`Floor detail: ${k('floorDetail.cycle')}`,
					'Change plank direction, cycle tile patterns or toggle path framing.'
				],
				[`Path: ${k('floorDetail.pathMode')}`, 'Cycle Axis, Free and Bezier drawing modes.'],
				[
					`${k('build.slot8')}, then ${k('build.customise')}`,
					'Open the Object Library to choose a design or create a Mini Build.'
				],
				[
					`Place Object: ${k('tool.rotate')} / ${k('placeObject.copy')} / ${k('placeObject.edit')}`,
					'Rotate 90° / copy the aimed object’s design / edit the aimed object.'
				]
			]
		},
		{
			title: 'Move, paint & remove',
			rows: [
				[
					k('build.moveMode'),
					'Toggle Move Mode. Click an object to pick it up and click again to place it.'
				],
				[
					`Move: ${k('tool.rotate')} / ${k('build.customise')}`,
					'Rotate the held object / edit its properties. Right click or Esc cancels the move.'
				],
				[k('build.paintMode'), 'Toggle Paint Mode. Left click paints the highlighted surface.'],
				[
					`Paint: ${k('paint.palette')}`,
					`Open the colour palette. ${k('build.paintMode')}, right click or Esc exits Paint Mode.`
				],
				[
					k('build.removeMode'),
					'Toggle Remove Mode. Left click removes the highlighted building piece or music plant.'
				],
				[
					`Remove: ${keys('remove.deleteFoundation')}`,
					'Request deletion of the aimed foundation and its contents. A typed confirmation is required.'
				],
				[
					`Remove: ${k('build.removeMode')} / Right click / Esc`,
					'Exit Remove Mode and return to the previous tool.'
				]
			]
		},
		{
			title: 'Music garden',
			rows: [
				[
					k('build.musicMode'),
					'Enter or leave Compose Mode near a Music Tree. Rings show the timing positions in its loop.'
				],
				[
					'Aim + Left click',
					'Plant the preview on a snapped ring. Inner rings play earlier; outer rings play later.'
				],
				[
					`${k('music.instrument1')}–${k('music.instrument5')} / ${k('music.instrumentPrevious')} / ${k('music.instrumentNext')}`,
					'Choose or cycle instruments: Flower, Mushroom, Fern, Reed and Crystal.'
				],
				[
					`${k('music.pitchUp')} / ${k('music.pitchDown')}`,
					'Raise or lower the preview plant’s pitch before placing.'
				],
				[
					`${k('music.volumeDown')} / ${k('music.volumeUp')}`,
					'Lower or raise its volume; the plant becomes paler or more vivid.'
				],
				[`${k('music.shorter')} / ${k('music.longer')}`, 'Shorten or lengthen the note duration.'],
				[k('music.playLoop'), 'Play or pause the active Music Tree’s loop.'],
				[
					'Import MIDI',
					'Use the music HUD button to preview a MIDI file, then click open ground to place its garden.'
				],
				[
					'Right click / Esc',
					`Cancel the music placement preview. Use ${k('build.removeMode')} to remove an existing music plant.`
				]
			]
		},
		{
			title: 'Menus, saving & display',
			rows: [
				[k('ui.help'), 'Open or close the in-game controls guide.'],
				['Pause → Settings', 'Adjust audio, graphics and the current world’s settings.'],
				[k('world.save'), 'Save the world now. Worlds also autosave after building changes.'],
				[
					k('ui.graphicsQuality'),
					'Cycle Low, Medium, High and Ultra graphics quality. The preference is remembered.'
				],
				[k('ui.renderStats'), 'Show or hide render statistics.'],
				[
					k('tutorial.previous'),
					'Replay the previous tutorial instruction. Press again after a short pause to go back further.'
				],
				[k('tutorial.speechOptions'), 'Open speech options and narrator settings.'],
				[k('tutorial.autoStart'), 'Automatically prepare and start the narrated tutorial.'],
				[
					k('tutorial.next'),
					'Advance to the next tutorial instruction, stopping the current speech.'
				],
				[
					k('ui.screenshot'),
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
	const groups = $derived.by(() => (revision >= 0 ? buildGroups() : []));
</script>

<div class="controls-guide">
	<h4>Controls &amp; what they do</h4>
	<p>
		Choose a section below. Shortcuts act on your current tool or mode; the in-game hints show the
		actions available right now. These are your current keys.
	</p>
	<button
		type="button"
		class="change-keys"
		data-testid="help-change-keys"
		onclick={() => window.dispatchEvent(new Event('forest:open-key-bindings'))}>Change keys</button
	>
	{#each groups as group, index (group.title)}
		<details open={index === 0}>
			<summary>{group.title}</summary>
			<dl>
				{#each group.rows as [key, description] (description)}<div class="control-row">
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
	.change-keys {
		min-height: 44px;
		padding: 0 16px;
		border-radius: 10px;
		border: 1px solid #ac8242;
		background: #2a1f1288;
		color: #f4d18c;
		font:
			bold 14px system-ui,
			sans-serif;
		cursor: pointer;
	}
	.change-keys:focus-visible {
		outline: 2px solid #ffdb83;
		outline-offset: 2px;
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
