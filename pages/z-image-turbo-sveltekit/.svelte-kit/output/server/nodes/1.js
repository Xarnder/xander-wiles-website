

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.BtjSGJ0E.js","_app/immutable/chunks/DOCO80rQ.js","_app/immutable/chunks/70L5jeyE.js","_app/immutable/chunks/CzxUj764.js"];
export const stylesheets = [];
export const fonts = [];
