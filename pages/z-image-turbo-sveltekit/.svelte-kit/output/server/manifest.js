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
		client: {start:"_app/immutable/entry/start.Cg1DGXu1.js",app:"_app/immutable/entry/app.Cy6fy1wb.js",imports:["_app/immutable/entry/start.Cg1DGXu1.js","_app/immutable/chunks/B9KdVksB.js","_app/immutable/chunks/DOCO80rQ.js","_app/immutable/entry/app.Cy6fy1wb.js","_app/immutable/chunks/DOCO80rQ.js","_app/immutable/chunks/70L5jeyE.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
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
