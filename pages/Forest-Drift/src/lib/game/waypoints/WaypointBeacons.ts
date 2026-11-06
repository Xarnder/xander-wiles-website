import * as THREE from 'three';
import type { ActiveWaypoint, WaypointSystem } from './WaypointSystem';

/** Beam height, metres: tall enough to see over trees and hills. */
const BEAM_HEIGHT = 70;
const BEAM_RADIUS = 0.32;
/** The beam fades out within this many metres, so it never fills the screen when you reach it. */
const NEAR_FADE_START = 14;
const NEAR_FADE_END = 4;
/** The floating icon sits this high above the waypoint (above a creature's back). */
const ICON_HEIGHT = 2.4;
/** On-screen icon size (fraction of the view height). */
const ICON_SCREEN_SIZE = 0.045;
const MAX_BEACONS = 24;

interface Beacon {
	beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
	icon: THREE.Sprite;
	iconKey: string;
	used: boolean;
}

/**
 * In-world beacons for waypoints that are on (plan §3.4): a tall, soft, additive beam in the
 * waypoint's colour, plus a floating pin with its icon that shows through trees. Beams ignore fog so
 * a distant waypoint is still findable, and fade out as you arrive. Pooled: nothing is allocated
 * per frame once each waypoint has its beacon.
 */
export class WaypointBeacons {
	readonly group = new THREE.Group();
	private readonly beams: Beacon[] = [];
	private readonly geometry = new THREE.CylinderGeometry(
		BEAM_RADIUS * 0.45,
		BEAM_RADIUS,
		BEAM_HEIGHT,
		12,
		1,
		true
	);
	private readonly gradient: THREE.CanvasTexture;
	private readonly icons = new Map<string, THREE.CanvasTexture>();
	private readonly cameraPosition = new THREE.Vector3();
	private time = 0;
	visible = true;

	constructor() {
		this.group.name = 'waypoint-beacons';
		// The beam's base sits on the waypoint.
		this.geometry.translate(0, BEAM_HEIGHT / 2, 0);
		this.gradient = verticalGradient();
	}

	/** Draws a beacon for every active waypoint; hides the rest. */
	update(
		waypoints: WaypointSystem,
		camera: THREE.Camera,
		dt: number,
		reducedMotion: boolean
	): void {
		this.time += Math.min(dt, 0.1);
		camera.getWorldPosition(this.cameraPosition);
		for (const beacon of this.beams) beacon.used = false;
		let index = 0;
		if (this.visible)
			waypoints.forEachActive((waypoint) => {
				if (index >= MAX_BEACONS) return;
				const beacon = this.beams[index] ?? this.createBeacon();
				index++;
				this.place(beacon, waypoint, reducedMotion);
			});
		for (const beacon of this.beams) {
			beacon.beam.visible = beacon.used;
			beacon.icon.visible = beacon.used;
		}
	}

	private place(beacon: Beacon, waypoint: ActiveWaypoint, reducedMotion: boolean): void {
		beacon.used = true;
		const distance = Math.hypot(
			waypoint.x - this.cameraPosition.x,
			waypoint.z - this.cameraPosition.z
		);
		const near = Math.min(
			1,
			Math.max(0, (distance - NEAR_FADE_END) / (NEAR_FADE_START - NEAR_FADE_END))
		);
		const pulse = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(this.time * 2.4);
		beacon.beam.position.set(waypoint.x, waypoint.y, waypoint.z);
		beacon.beam.material.color.set(waypoint.colour);
		beacon.beam.material.opacity = 0.55 * near * pulse;
		const bob = reducedMotion ? 0 : Math.sin(this.time * 2) * 0.12;
		beacon.icon.position.set(waypoint.x, waypoint.y + ICON_HEIGHT + bob, waypoint.z);
		const key = `${waypoint.icon}|${waypoint.colour}`;
		if (beacon.iconKey !== key) {
			beacon.iconKey = key;
			beacon.icon.material.map = this.iconTexture(waypoint.icon, waypoint.colour);
			beacon.icon.material.needsUpdate = true;
		}
		// Right on top of it the pin would sit in your face: let it fade a little too.
		beacon.icon.material.opacity = 0.35 + 0.65 * near;
	}

	private createBeacon(): Beacon {
		const material = new THREE.MeshBasicMaterial({
			map: this.gradient,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide,
			fog: false,
			toneMapped: false
		});
		const beam = new THREE.Mesh(this.geometry, material);
		beam.name = 'waypoint-beam';
		beam.frustumCulled = false;
		beam.renderOrder = 5;
		const icon = new THREE.Sprite(
			new THREE.SpriteMaterial({
				transparent: true,
				depthTest: false,
				depthWrite: false,
				sizeAttenuation: false,
				fog: false,
				toneMapped: false
			})
		);
		icon.name = 'waypoint-icon';
		icon.center.set(0.5, 0);
		icon.scale.set(ICON_SCREEN_SIZE * 0.82, ICON_SCREEN_SIZE, 1);
		icon.renderOrder = 20;
		this.group.add(beam, icon);
		const beacon: Beacon = { beam, icon, iconKey: '', used: false };
		this.beams.push(beacon);
		return beacon;
	}

	/** A pin head in the waypoint's colour with its icon (cached per icon and colour). */
	private iconTexture(glyph: string, colour: string): THREE.CanvasTexture {
		const key = `${glyph}|${colour}`;
		let texture = this.icons.get(key);
		if (texture) return texture;
		const canvas = document.createElement('canvas');
		canvas.width = 82;
		canvas.height = 100;
		const ctx = canvas.getContext('2d')!;
		ctx.translate(41, 41);
		// Pin: a circle with a point underneath, dark rim for contrast on sky and snow alike.
		ctx.beginPath();
		ctx.arc(0, 0, 32, Math.PI * 0.8, Math.PI * 0.2);
		ctx.lineTo(0, 56);
		ctx.closePath();
		ctx.fillStyle = colour;
		ctx.fill();
		ctx.lineWidth = 5;
		ctx.strokeStyle = 'rgba(4, 18, 31, 0.85)';
		ctx.stroke();
		ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
		ctx.beginPath();
		ctx.arc(0, 0, 21, 0, Math.PI * 2);
		ctx.fill();
		ctx.font = '26px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#04121f';
		ctx.fillText(glyph, 0, 1);
		texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		this.icons.set(key, texture);
		return texture;
	}

	dispose(): void {
		for (const beacon of this.beams) {
			beacon.beam.material.dispose();
			beacon.icon.material.dispose();
		}
		for (const texture of this.icons.values()) texture.dispose();
		this.icons.clear();
		this.gradient.dispose();
		this.geometry.dispose();
		this.group.removeFromParent();
	}
}

/** Bright at the base, fading to nothing at the top. */
function verticalGradient(): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = 2;
	canvas.height = 64;
	const ctx = canvas.getContext('2d')!;
	const gradient = ctx.createLinearGradient(0, 64, 0, 0);
	gradient.addColorStop(0, 'rgba(255,255,255,1)');
	gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
	gradient.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 2, 64);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}
