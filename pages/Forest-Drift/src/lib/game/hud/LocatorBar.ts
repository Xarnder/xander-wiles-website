import * as THREE from 'three';
import { horizontalFov, locatorX, signedHorizontalAngle } from './locatorMath';

/** Within this angle of straight ahead, a marker shows its name and distance. */
const NAME_WITHIN_RADIANS = (4 * Math.PI) / 180;
/** Height difference (m) beyond which a marker points up or down. */
const ABOVE_BELOW_METRES = 3;
/** Markers shrink with distance down to this scale (at `SHRINK_DISTANCE` metres and beyond). */
const MIN_SCALE = 0.6;
const SHRINK_DISTANCE = 250;
/**
 * Another player has to be this much closer (m) to take over as "closest", so two people at about
 * the same distance don't make the highlight flicker between them.
 */
const CLOSEST_HYSTERESIS_METRES = 1.5;

interface Marker {
	root: HTMLDivElement;
	arrow: HTMLSpanElement;
	label: HTMLSpanElement;

	// This frame's numbers, gathered by `place` and drawn by `endFrame`.
	seen: boolean;
	angle: number;
	position: number | null;
	distance: number;
	heightDifference: number;
	colour: string;
	name: string;
	dim: boolean;

	// What the DOM currently shows, so it's only written when something actually changes.
	shown: boolean;
	x: number;
	scale: number;
	appliedColour: string;
	appliedDim: boolean;
	appliedClosest: boolean;
	appliedEdge: '' | 'left' | 'right';
	arrowText: string;
	labelText: string;
}

/**
 * The locator bar: a strip across the top of the screen with a dot, in each player's own colour,
 * at the direction they are in relative to where you're looking — like a compass that only shows
 * people. Straight ahead is the middle; the ends are the edges of the view. Others behind you or
 * outside the view are hidden.
 *
 * The **closest** player always shows a pill in their colour with their name and distance, so you
 * can pick them out and walk to them; if they're behind you or off to the side, their dot stays
 * pinned to that end of the bar with an arrow showing which way to turn.
 *
 * Per frame: `beginFrame`, one `place` per player (numbers only), `endFrame` (all DOM writes, in
 * one batch). Nothing is allocated in that loop, the bar's width is cached by a ResizeObserver
 * rather than read each frame, and each marker's DOM is written only when what it shows changes.
 */
export class LocatorBar {
	private element: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private width = 0;
	private readonly markers = new Map<string, Marker>();
	private readonly cameraPosition = new THREE.Vector3();
	private readonly forward = new THREE.Vector3();
	private viewAngle = 0;
	private localFeetY = 0;
	private active = false;
	private enabled = true;
	private barVisible: boolean | null = null;
	private closestId: string | null = null;

	/** The bar's element (from the HUD); null detaches. Markers are created inside it. */
	attach(element: HTMLElement | null): void {
		if (element === this.element) return;
		this.clearMarkers();
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.element = element;
		this.barVisible = null;
		if (!element) return;
		this.width = element.clientWidth;
		if (typeof ResizeObserver !== 'undefined') {
			this.resizeObserver = new ResizeObserver((entries) => {
				const entry = entries[0];
				if (entry) this.width = entry.contentRect.width;
				// Positions depend on the width: let the next frame rewrite them.
				for (const marker of this.markers.values()) marker.x = Number.NaN;
			});
			this.resizeObserver.observe(element);
		}
	}

	/** Settings → Graphics → Show locator bar. */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	beginFrame(camera: THREE.PerspectiveCamera, localFeetY: number): void {
		this.active = this.element !== null && this.enabled && this.width > 0;
		if (!this.active) {
			this.setBarVisible(false);
			return;
		}
		camera.getWorldPosition(this.cameraPosition);
		camera.getWorldDirection(this.forward);
		this.viewAngle = horizontalFov(camera.fov, camera.aspect, camera.zoom);
		this.localFeetY = localFeetY;
		for (const marker of this.markers.values()) marker.seen = false;
	}

	/** One player this frame: their feet position, colour and name. No DOM work happens here. */
	place(
		id: string,
		x: number,
		y: number,
		z: number,
		colour: string,
		name: string,
		dim: boolean
	): void {
		if (!this.active) return;
		let marker = this.markers.get(id);
		if (!marker) {
			marker = this.createMarker();
			this.markers.set(id, marker);
		}
		const dx = x - this.cameraPosition.x;
		const dz = z - this.cameraPosition.z;
		marker.seen = true;
		marker.angle = signedHorizontalAngle(this.forward.x, this.forward.z, dx, dz);
		marker.position = locatorX(marker.angle, this.viewAngle, this.width);
		marker.distance = Math.hypot(dx, dz);
		marker.heightDifference = y - this.localFeetY;
		marker.colour = colour;
		marker.name = name;
		marker.dim = dim;
	}

	/** Picks the closest player, then updates every marker's DOM in one go. */
	endFrame(): void {
		if (!this.active) return;
		let nearest: string | null = null;
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (const [id, marker] of this.markers) {
			if (!marker.seen) {
				marker.root.remove();
				this.markers.delete(id);
				continue;
			}
			if (marker.distance < nearestDistance) {
				nearest = id;
				nearestDistance = marker.distance;
			}
		}
		const current = this.closestId ? this.markers.get(this.closestId) : undefined;
		if (!current || current.distance > nearestDistance + CLOSEST_HYSTERESIS_METRES) {
			this.closestId = nearest;
		}
		for (const [id, marker] of this.markers) this.draw(marker, id === this.closestId);
		this.setBarVisible(this.markers.size > 0);
	}

	/** How many markers are on screen (for tests and diagnostics). */
	get visibleCount(): number {
		let count = 0;
		for (const marker of this.markers.values()) if (marker.shown) count++;
		return count;
	}

	/** The player currently highlighted as closest (for tests). */
	get closest(): string | null {
		return this.closestId;
	}

	dispose(): void {
		this.attach(null);
	}

	private draw(marker: Marker, closest: boolean): void {
		let position = marker.position;
		let edge: '' | 'left' | 'right' = '';
		// The closest player never disappears: out of view, they wait at the end of the bar on the
		// side to turn towards.
		if (position === null && closest && Number.isFinite(marker.angle)) {
			edge = marker.angle < 0 ? 'left' : 'right';
			position = edge === 'left' ? 0 : this.width;
		}
		const shown = position !== null;
		if (shown !== marker.shown) {
			marker.shown = shown;
			marker.root.style.display = shown ? '' : 'none';
		}
		if (position === null) return;

		const px = Math.round(position);
		const scale = closest
			? 1.15
			: Math.round(
					Math.max(MIN_SCALE, 1 - (marker.distance / SHRINK_DISTANCE) * (1 - MIN_SCALE)) * 20
				) / 20;
		if (px !== marker.x || scale !== marker.scale) {
			marker.x = px;
			marker.scale = scale;
			marker.root.style.transform = `translate3d(${px}px, 0, 0) scale(${scale})`;
		}
		if (marker.colour !== marker.appliedColour) {
			marker.appliedColour = marker.colour;
			marker.root.style.setProperty('--locator-colour', marker.colour);
			marker.root.style.setProperty('--locator-ink', inkFor(marker.colour));
		}
		if (marker.dim !== marker.appliedDim) {
			marker.appliedDim = marker.dim;
			marker.root.classList.toggle('dim', marker.dim);
		}
		if (closest !== marker.appliedClosest) {
			marker.appliedClosest = closest;
			marker.root.classList.toggle('closest', closest);
		}
		if (edge !== marker.appliedEdge) {
			marker.appliedEdge = edge;
			marker.root.classList.toggle('edge-left', edge === 'left');
			marker.root.classList.toggle('edge-right', edge === 'right');
		}

		const dy = marker.heightDifference;
		const arrow = dy > ABOVE_BELOW_METRES ? '▲' : dy < -ABOVE_BELOW_METRES ? '▼' : '';
		if (arrow !== marker.arrowText) {
			marker.arrowText = arrow;
			marker.arrow.textContent = arrow;
		}
		const metres = `${Math.max(1, Math.round(marker.distance))} m`;
		const label = closest
			? edge === 'left'
				? `◀ ${marker.name} · ${metres}`
				: edge === 'right'
					? `${marker.name} · ${metres} ▶`
					: `${marker.name} · ${metres}`
			: Math.abs(marker.angle) <= NAME_WITHIN_RADIANS
				? `${marker.name} · ${metres}`
				: '';
		if (label !== marker.labelText) {
			marker.labelText = label;
			marker.label.textContent = label;
		}
	}

	private createMarker(): Marker {
		const root = document.createElement('div');
		root.className = 'locator-marker';
		root.style.display = 'none';
		const dot = document.createElement('span');
		dot.className = 'locator-dot';
		const arrow = document.createElement('span');
		arrow.className = 'locator-arrow';
		const label = document.createElement('span');
		label.className = 'locator-label';
		root.append(arrow, dot, label);
		this.element?.append(root);
		return {
			root,
			arrow,
			label,
			seen: true,
			angle: Number.NaN,
			position: null,
			distance: Number.POSITIVE_INFINITY,
			heightDifference: 0,
			colour: '',
			name: '',
			dim: false,
			shown: false,
			x: Number.NaN,
			scale: Number.NaN,
			appliedColour: '',
			appliedDim: false,
			appliedClosest: false,
			appliedEdge: '',
			arrowText: '',
			labelText: ''
		};
	}

	private setBarVisible(visible: boolean): void {
		if (!this.element || visible === this.barVisible) return;
		this.barVisible = visible;
		this.element.style.visibility = visible ? 'visible' : 'hidden';
	}

	private clearMarkers(): void {
		for (const marker of this.markers.values()) marker.root.remove();
		this.markers.clear();
		this.closestId = null;
	}
}

const DARK_INK = '#04121f';
const LIGHT_INK = '#ffffff';

/** Whichever of dark or white text contrasts more with a player's colour (WCAG contrast ratio). */
export function inkFor(colour: string): string {
	const luminance = relativeLuminance(colour);
	if (luminance === null) return LIGHT_INK;
	const darkLuminance = relativeLuminance(DARK_INK)!;
	const againstWhite = 1.05 / (luminance + 0.05);
	const againstDark = (luminance + 0.05) / (darkLuminance + 0.05);
	return againstDark > againstWhite ? DARK_INK : LIGHT_INK;
}

function relativeLuminance(colour: string): number | null {
	const match = /^#([0-9a-f]{6})$/i.exec(colour);
	if (!match) return null;
	const value = Number.parseInt(match[1]!, 16);
	const channel = (shift: number) => {
		const c = ((value >> shift) & 0xff) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}
