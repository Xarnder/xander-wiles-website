

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.9zYheCwh.js","_app/immutable/chunks/DOCO80rQ.js","_app/immutable/chunks/70L5jeyE.js","_app/immutable/chunks/C7_O9-5_.js"];
export const stylesheets = [];
export const fonts = [];
