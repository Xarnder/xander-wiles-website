

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.C3jC36eN.js","_app/immutable/chunks/DOCO80rQ.js","_app/immutable/chunks/70L5jeyE.js","_app/immutable/chunks/DvZ0o5m9.js"];
export const stylesheets = [];
export const fonts = [];
