import {
	BufferGeometry,
	Material,
	Object3D,
	Texture,
	WebGLRenderTarget,
	type IUniform
} from 'three';

function disposeUniformValue(value: unknown, visited: Set<Texture>): void {
	if (value instanceof Texture && !visited.has(value)) {
		visited.add(value);
		value.dispose();
		return;
	}
	if (Array.isArray(value)) {
		for (const child of value) disposeUniformValue(child, visited);
	}
}

export function disposeMaterial(material: Material, textures = new Set<Texture>()): void {
	const record = material as Material & {
		uniforms?: Record<string, IUniform<unknown>>;
	};
	for (const value of Object.values(record)) disposeUniformValue(value, textures);
	if (record.uniforms) {
		for (const uniform of Object.values(record.uniforms)) {
			disposeUniformValue(uniform.value, textures);
		}
	}
	material.dispose();
}

export function disposeObject3D(root: Object3D): void {
	const textures = new Set<Texture>();
	root.traverse((object) => {
		const resource = object as Object3D & {
			geometry?: BufferGeometry;
			material?: Material | Material[];
		};
		resource.geometry?.dispose();
		if (Array.isArray(resource.material)) {
			for (const material of resource.material) disposeMaterial(material, textures);
		} else if (resource.material) {
			disposeMaterial(resource.material, textures);
		}
	});
}

export function disposeRenderTarget(target: WebGLRenderTarget | null): void {
	target?.dispose();
}
