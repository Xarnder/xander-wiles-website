export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["onnx/ort-wasm-simd-threaded.asyncify.wasm","onnx/ort-wasm-simd-threaded.jsep.wasm","onnx/ort-wasm-simd-threaded.jspi.wasm","onnx/ort-wasm-simd-threaded.wasm"]),
	mimeTypes: {".wasm":"application/wasm"},
	_: {
		client: {start:"_app/immutable/entry/start.CzSP3heo.js",app:"_app/immutable/entry/app.G4T9JABw.js",imports:["_app/immutable/entry/start.CzSP3heo.js","_app/immutable/chunks/q8DOOwVK.js","_app/immutable/chunks/DOCO80rQ.js","_app/immutable/entry/app.G4T9JABw.js","_app/immutable/chunks/DOCO80rQ.js","_app/immutable/chunks/70L5jeyE.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
