import * as THREE from 'three';
import { gridToMeters } from './miniBuildGrid';
import type { MiniBuildInteractionLocation } from './MiniBuildTypes';

/** Editor/debug only. Runtime discovery uses records and cuboid math, never these meshes. */
export function interactionHelper(
	location: MiniBuildInteractionLocation,
	selected: boolean,
	color?: number
): THREE.Group {
	const group = new THREE.Group();
	group.userData.interactionId = location.id;
	const tint = color ?? (location.type === 'sit' ? 0x50dded : 0xc68bff);
	const size = location.collider.sizeGrid,
		offset = location.collider.centerOffsetGrid;
	const plane = new THREE.Mesh(
		new THREE.PlaneGeometry(gridToMeters(size.x), gridToMeters(size.z)),
		new THREE.MeshBasicMaterial({
			color: tint,
			transparent: true,
			opacity: location.enabled ? 0.3 : 0.1,
			side: THREE.DoubleSide,
			depthWrite: false
		})
	);
	plane.rotation.x = -Math.PI / 2;
	plane.position.set(gridToMeters(offset.x), 0.01, gridToMeters(offset.z));
	plane.userData.interactionId = location.id;
	group.add(plane);
	const arrow = new THREE.ArrowHelper(
		new THREE.Vector3(0, 0, -1),
		new THREE.Vector3(0, 0.03, 0),
		gridToMeters(size.z) / 2,
		tint,
		0.15,
		0.1
	);
	arrow.line.geometry = arrow.line.geometry.clone();
	arrow.cone.geometry = arrow.cone.geometry.clone();
	group.add(arrow);
	const dot = new THREE.Mesh(
		new THREE.SphereGeometry(0.045, 8, 6),
		new THREE.MeshBasicMaterial({ color: 0xffffff })
	);
	group.add(dot);
	if (selected) {
		const geometry = new THREE.BoxGeometry(
			gridToMeters(size.x),
			gridToMeters(size.y),
			gridToMeters(size.z)
		);
		const box = new THREE.LineSegments(
			new THREE.EdgesGeometry(geometry),
			new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.7 })
		);
		geometry.dispose();
		box.position.set(gridToMeters(offset.x), gridToMeters(offset.y), gridToMeters(offset.z));
		group.add(box);
	}
	group.position.set(
		gridToMeters(location.positionGrid.x),
		gridToMeters(location.positionGrid.y),
		gridToMeters(location.positionGrid.z)
	);
	group.rotation.y = (location.rotationY * Math.PI) / 180;
	return group;
}
export function disposeInteractionHelpers(group: THREE.Group): void {
	group.traverse((object) => {
		const mesh = object as THREE.Mesh;
		mesh.geometry?.dispose();
		const texture = (mesh.material as THREE.SpriteMaterial)?.map;
		texture?.dispose();
		if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
		else mesh.material?.dispose();
	});
	group.clear();
}

/** Small debug-only billboard. Created only when the inspected location changes. */
export function addInteractionDebugLabel(group: THREE.Group, text: string, color: number): void {
	const canvas = document.createElement('canvas');
	canvas.width = 768;
	canvas.height = 80;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	ctx.fillStyle = 'rgba(12,20,25,.85)';
	ctx.fillRect(0, 0, 768, 80);
	ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
	ctx.font = '24px sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText(text, 384, 49, 744);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const label = new THREE.Sprite(
		new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false })
	);
	label.scale.set(1.8, 0.19, 1);
	label.position.y = 0.3;
	group.add(label);
}
