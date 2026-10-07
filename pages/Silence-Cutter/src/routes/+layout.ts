// Fully client-side app: every page is prerendered as a static shell and all media/AI work
// happens in the browser. There is no server and no upload endpoint.
export const prerender = true;
export const ssr = false;
export const trailingSlash = 'always';
