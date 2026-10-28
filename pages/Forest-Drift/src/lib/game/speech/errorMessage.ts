/** Player-facing guidance. Never display raw URLs, stack traces or model errors in subtitles. */
export function speechErrorMessage(
	error: unknown,
	context: { offline?: boolean; muted?: boolean } = {}
): string {
	const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
	if (context.muted)
		return 'The narrator is muted. Please press F6 to enable narrator sound. You can still read the instructions.';
	if (/NotAllowed|permission|gesture|autoplay/i.test(message))
		return 'Your browser could not enable sound. Please try again, or check this site’s sound permissions. F6 opens speech options.';
	if (/storage|indexeddb|quota|disk/i.test(message))
		return 'Saved speech could not be accessed. Please check available device storage or browser storage settings, then retry. You can continue with text.';
	if (/another tab|already running/i.test(message))
		return 'Another tab is preparing speech. Please wait for it to finish, then replay this instruction. Text is available meanwhile.';
	if (/timed out|timeout/i.test(message))
		return 'Speech preparation took too long. Please check your connection and try again. Previously saved speech may still work.';
	if (context.offline)
		return 'You appear to be offline, and this speech is not ready. Please reconnect and retry, or continue with text.';
	if (/network|fetch|download|load.*module/i.test(message))
		return 'The voice download was interrupted. Please check your connection and retry. You can continue with text while it is unavailable.';
	if (/memory|allocation|out of bounds/i.test(message))
		return 'Your device could not load the voice model. Please close unused tabs and retry, or choose Device voice or text in F6.';
	if (/unsupported|unavailable|could not start|webassembly|wasm|AudioContext/i.test(message))
		return 'This browser could not start the local voice. Please try Device voice or text in F6, or retry in an updated browser.';
	if (/cancelled|hidden|suspended/i.test(message))
		return 'Speech was interrupted. Please keep this tab open and replay the instruction when you are ready.';
	if (/playback/i.test(message))
		return 'Sorry, this instruction could not be played. Please try Replay, or press F6 to check sound options. You can still read it.';
	return 'Sorry, the narrator could not prepare this instruction. Please try Replay, or choose Device voice or text in F6.';
}
