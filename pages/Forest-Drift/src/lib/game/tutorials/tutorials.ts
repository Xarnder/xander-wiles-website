import { NARRATOR, type SpeechRequest } from '../speech/types';
export const TUTORIAL_VERSION = 2;
export type TutorialAction = 'continue' | 'move' | 'build' | 'tool' | 'help';
export interface Lesson {
	id: string;
	text: string;
	action: TutorialAction;
}
/** Edit the spoken `text` below. Subtitles and cached speech use this same script.
 * Keep IDs stable; bump TUTORIAL_VERSION when changing the lesson sequence.
 * Building practice deliberately uses Continue/F9, not a claim that placement succeeded.
 */
export function lessons(touch: boolean): Lesson[] {
	const select = (number: string) => (touch ? `Tap hotbar slot ${number}.` : `Press ${number}.`);
	const place = touch ? 'Tap Place' : 'Left click';
	const customise = touch ? 'Tap Customise' : 'Press E';
	const variant = (name: string) =>
		touch
			? `Choose ${name} from the subtool panel.`
			: `Use the up and down arrows until ${name} is selected.`;
	const guide = (id: string, text: string): Lesson => ({ id, text, action: 'continue' });
	return [
		guide(
			'look',
			touch
				? 'Swipe on the right side to look around. Aim with the centre crosshair. Continue when you are ready.'
				: 'Click the world and move your mouse to look around. Aim with the centre crosshair. Press F9 when you are ready.'
		),
		{
			id: 'move',
			text: touch
				? 'Use the left joystick to walk a few steps.'
				: 'Use W, A, S, and D to walk forward, left, backward, and right. Walk a few steps.',
			action: 'move'
		},
		guide(
			'hotbar',
			`${touch ? 'Tap Build' : 'Press G'} if the building hotbar is hidden. Its eight numbered slots hold building tools. Select a slot to see its subtools. Your last subtool is remembered.`
		),
		guide(
			'practice',
			touch
				? 'Aim first, then tap Place to confirm. Cancel stops a preview. Try each instruction, then tap Continue. Previous replays the last instruction.'
				: 'Left click places or confirms. Right click cancels a preview. Try each instruction, then press F9. F7 goes back and replays. Press Escape to free the mouse for menus.'
		),
		guide(
			'foundation',
			`${select('one')} This is Foundation. Aim at open ground. ${place} to choose one corner, then aim at the opposite corner and confirm again. This creates the base for your building.`
		),
		guide(
			'foundation-settings',
			`${customise} before placing another foundation to change its settings. Watch the preview and on-screen hints. If placement is blocked, choose a clear area. Continue after trying your foundation.`
		),
		guide(
			'walls',
			`${select('two')} ${variant('Poly Wall')} Aim at your foundation. ${place} to add wall points. Select the first point again to close the outline.${touch ? '' : ' Enter finishes an open wall path.'}`
		),
		guide(
			'wall-segment',
			`${variant('Wall')} Use this for a single straight wall. Choose its start and end on the foundation. ${customise} to adjust the next wall before placing it.`
		),
		guide(
			'fence',
			`${variant('Fence or Rail')} Draw a boundary with points, like a wall path. ${customise} to choose its style. Use this for fences and railings around your build.`
		),
		guide(
			'skirting',
			`${variant('Skirting')} Aim along an existing wall to add trim. Follow the placement preview. ${customise} to adjust the trim.${touch ? '' : ' O switches automatic and manual wall offset.'}`
		),
		guide(
			'pillars',
			`${variant('Wooden Pillars')} Aim at your foundation or selected floor. The preview snaps to the building grid. ${place} to add a pillar. ${customise} to change its settings.`
		),
		guide(
			'doors',
			`${select('three')} ${variant('Door')} Aim at an existing wall. ${customise} to set the door dimensions. ${place} where the preview fits to create a doorway.${touch ? '' : ' Aim at a door and press K to open or close it.'}`
		),
		guide(
			'windows',
			`${variant('Window')} Aim at an existing wall where you want a window. ${customise} to adjust its dimensions. ${place} when the preview fits. Leave room between openings.`
		),
		guide(
			'beams',
			`${variant('Beam')} Beams decorate an existing wall without cutting an opening. ${touch ? 'Use the beam settings to choose its orientation.' : 'Press R to switch between vertical and horizontal.'} Aim at the wall and ${place.toLowerCase()} to place the beam.`
		),
		guide(
			'opening-snap',
			`Doors, windows, and beams snap along the wall to help alignment. ${touch ? 'Use the available snap control and placement settings to adjust the preview.' : 'Press B to change snapping. Press E to adjust the next piece.'} Watch the preview before confirming.`
		),
		guide(
			'ceiling',
			`${select('four')} ${variant('Ceiling')} Draw the ceiling footprint over your building. Follow the corner prompts. ${touch ? 'Use the height control' : 'Press E to adjust placement height'} before confirming.`
		),
		guide(
			'floor',
			`${variant('Floor')} Create a floor footprint on your selected building storey. ${touch ? 'Use the floor selector to change storey.' : 'Use the square bracket keys to change storey.'} Check the height and preview before confirming.`
		),
		guide(
			'roof',
			`${variant('Roof')} Draw the roof footprint first. ${touch ? 'Use the roof controls to change shape, direction, and rise.' : 'Then use V for shape, R for direction, and the up and down arrows for rise.'} Confirm when the roof fits your building.`
		),
		guide(
			'stairs',
			`${select('five')} This is Stairs. Choose the first and opposite corners of the stair footprint. ${touch ? 'Use the direction controls' : 'Use the left and right arrows'} to set direction, then confirm. Leave room for the stairs to fit.`
		),
		guide(
			'planks',
			`${select('six')} ${variant('Planks')} Add wooden floor detailing to your build. Follow the preview to select the area. ${customise} to change the next finish.${touch ? '' : ' R changes plank direction.'}`
		),
		guide(
			'tiles',
			`${variant('Tiles')} Add a tiled floor finish. Choose the area using the preview. ${customise} for settings.${touch ? '' : ' Press R to cycle tile patterns.'}`
		),
		guide(
			'carpet',
			`${variant('Carpet')} Add a carpeted finish. Select the area shown by the preview. ${customise} to adjust the next carpet before placing it.`
		),
		guide(
			'path',
			`${variant('Path')} Draw a path using points. Follow the preview to shape it.${touch ? '' : ' B cycles Axis, Free, and Bezier drawing modes. R changes path framing.'} Confirm when you are happy with the route.`
		),
		guide(
			'shovel',
			`${select('seven')} This is Shovel. ${touch ? 'Tap Raise or Lower to shape the terrain.' : 'Hold the left mouse button to raise terrain, or the right button to lower it. Release to finish a stroke.'} ${customise} to change the brush size and strength.`
		),
		guide(
			'objects',
			`${select('eight')} This is Place Object. ${customise} to open the Object Library. Choose a design or create a Mini Build. Aim at a clear spot and confirm the preview.${touch ? '' : ' R rotates the object.'}`
		),
		guide(
			'finishing',
			touch
				? 'The hotbar also has Move, Paint, and Remove buttons. Use these to reposition, recolour, or remove pieces. Cancel leaves the active editing mode.'
				: 'Use M to move pieces, P to paint, and X to remove. Click the highlighted piece to act. Right click cancels. Minus undoes a recent placement.'
		),
		guide(
			'help',
			touch
				? 'Open Help for the full controls. You can replay this guide from Tutorial at any time.'
				: 'Press H for the full controls. F6 opens speech options. F8 automatically starts the tutorial. F7 replays the previous instruction, and F9 advances.'
		),
		guide(
			'complete',
			'You are ready to build. Start small, try the subtools, and make the forest your own.'
		)
	];
}
export function lessonRequest(lesson: Lesson, session: string, touch: boolean): SpeechRequest {
	return {
		mode: 'scripted',
		id: `${session}:${lesson.id}`,
		session,
		contentId: `${lesson.id}:${touch ? 'touch' : 'keyboard'}`,
		version: TUTORIAL_VERSION,
		speaker: NARRATOR,
		text: lesson.text
	};
}
export interface TutorialSnapshot {
	x: number;
	z: number;
	build: boolean;
	slot: number;
	help: boolean;
}
export function completed(
	action: TutorialAction,
	start: TutorialSnapshot,
	now: TutorialSnapshot
): boolean {
	switch (action) {
		case 'move':
			return Math.hypot(now.x - start.x, now.z - start.z) >= 2;
		case 'build':
			return now.build;
		case 'tool':
			return now.build && now.slot === 2;
		case 'help':
			return now.help;
		default:
			return false;
	}
}
