export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([".DS_Store","onnx/ort-wasm-simd-threaded.asyncify.wasm","onnx/ort-wasm-simd-threaded.jsep.wasm","onnx/ort-wasm-simd-threaded.jspi.wasm","onnx/ort-wasm-simd-threaded.wasm"]),
	mimeTypes: {".wasm":"application/wasm"},
	_: {
		client: {start:"_app/immutable/entry/start.DRKqHcNZ.js",app:"_app/immutable/entry/app.9xmrHnNC.js",imports:["_app/immutable/entry/start.DRKqHcNZ.js","_app/immutable/chunks/Cm8VPbxA.js","_app/immutable/chunks/DOCO80rQ.js","_app/immutable/entry/app.9xmrHnNC.js","_app/immutable/chunks/DOCO80rQ.js","_app/immutable/chunks/70L5jeyE.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js'))
		],
		remotes: {
			
		},
		routes: [
			
		],
		prerendered_routes: new Set(["/"]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
