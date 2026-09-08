import { plantMetrics } from '../PlantVisualMetrics';
import type { MusicPlantDefinition } from '../MusicModel';
export function seeded(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export interface GardenLayoutStyle {
	cluster?: boolean;
	tight?: boolean;
}
/** Conservative radial clearance plus exact circular-footprint packing. Musical indices never change. */
export function layoutGarden(
	notes: MusicPlantDefinition[],
	multiplier: number,
	seed: number,
	existing: MusicPlantDefinition[] = [],
	minimum = { firstRingRadius: 3, ringSpacing: 0.5 },
	style: GardenLayoutStyle = {}
) {
	const radiusPad = style.tight ? 0.04 : 0.15,
		pairPad = style.tight ? 0.08 : 0.25,
		circumference = style.tight ? 1.08 : 1.4,
		minInner = style.tight ? 1.6 : 3;
	const rings = new Map<number, MusicPlantDefinition[]>();
	for (const p of [...existing, ...notes]) {
		const ring = rings.get(p.ringIndex) ?? [];
		ring.push(p);
		rings.set(p.ringIndex, ring);
	}
	const entries = [...rings].sort((a, b) => a[0] - b[0]);
	const metrics = new Map(
		[...existing, ...notes].map((p) => [p.id, plantMetrics(p).placementClearanceRadius])
	);
	let spacing = minimum.ringSpacing,
		first = minimum.firstRingRadius,
		previous: { ring: number; r: number } | undefined;
	for (const [ring, ps] of entries) {
		const r = Math.max(...ps.map((p) => metrics.get(p.id)!));
		if (previous) spacing = Math.max(spacing, (previous.r + r + pairPad) / (ring - previous.ring));
		previous = { ring, r };
	}
	spacing *= multiplier;
	for (const [ring, ps] of entries) {
		const radii = ps.map((p) => metrics.get(p.id)! + radiusPad),
			max = Math.max(...radii);
		let required = Math.max(
			max * 2,
			(radii.reduce((a, b) => a + 2 * b, 0) / (Math.PI * 2)) * circumference
		);
		while (radii.reduce((sum, r) => sum + Math.asin(Math.min(1, r / required)), 0) > Math.PI)
			required *= 1.1;
		first = Math.max(first, required - ring * spacing, minInner + max - ring * spacing);
	}
	first *= multiplier;
	// Existing notes retain exact angles. Expand enough to preserve their pairwise chord clearance.
	const existingIds = new Set(existing.map((p) => p.id));
	for (const [ring, ps] of entries) {
		const old = ps.filter((p) => existingIds.has(p.id)).sort((a, b) => a.angle - b.angle);
		for (let i = 0; i < old.length && old.length > 1; i++) {
			const a = old[i],
				b = old[(i + 1) % old.length];
			const chord = Math.abs(Math.sin((a.angle - b.angle) / 2)) * 2;
			if (chord < 1e-8)
				throw Error(
					'Existing plants share an identical anchor. Move or remove one before adding MIDI.'
				);
			first = Math.max(
				first,
				(metrics.get(a.id)! + metrics.get(b.id)! + pairPad) / chord - ring * spacing
			);
		}
	}
	const random = seeded(seed),
		speciesOrder = ['mushroom', 'fern', 'reed', 'flower', 'crystal'],
		heading = style.cluster ? random() * 2 * Math.PI : 0;
	for (const [ring, ps] of entries) {
		let radius = first + ring * spacing;
		const fixed = ps.filter((p) => existingIds.has(p.id));
		const incoming = ps
			.filter((p) => !existingIds.has(p.id))
			.sort(
				(a, b) =>
					speciesOrder.indexOf(a.speciesId) - speciesOrder.indexOf(b.speciesId) ||
					a.id.localeCompare(b.id)
			);
		if (!fixed.length) {
			const extents = incoming.map((p) => Math.asin((metrics.get(p.id)! + radiusPad) / radius));
			const free = style.cluster
				? 0
				: (2 * Math.PI - 2 * extents.reduce((a, b) => a + b, 0)) / Math.max(1, incoming.length);
			let angle = style.cluster ? heading + (random() - 0.5) * 0.35 : random() * 2 * Math.PI;
			for (let i = 0; i < incoming.length; i++) {
				angle += extents[i];
				incoming[i].angle = wrap(angle);
				angle += extents[i] + free;
			}
			continue;
		}
		// Open-gap circular packing for Add; no pairwise O(n²) relaxation. Retry at larger physical scale.
		let success = false;
		for (let attempt = 0; attempt < 20 && !success; attempt++) {
			radius = first + ring * spacing;
			const placed = fixed
				.map((p) => ({
					angle: (p.angle + Math.PI * 2) % (Math.PI * 2),
					radius: metrics.get(p.id)!
				}))
				.sort((a, b) => a.angle - b.angle);
			success = true;
			for (const p of incoming) {
				const r = metrics.get(p.id)!;
				let best: { angle: number; score: number; index: number } | undefined;
				const preferred = style.cluster
					? heading
					: speciesOrder.indexOf(p.speciesId) * 1.256637 + random() * 0.15;
				for (let i = 0; i < placed.length; i++) {
					const a = placed[i],
						b = placed[(i + 1) % placed.length];
					const end = b.angle + (i === placed.length - 1 ? 2 * Math.PI : 0);
					const left = 2 * Math.asin(Math.min(1, (a.radius + r + pairPad) / (2 * radius))),
						right = 2 * Math.asin(Math.min(1, (b.radius + r + pairPad) / (2 * radius)));
					if (end - a.angle >= left + right) {
						const angle = style.cluster ? a.angle + left : (a.angle + left + end - right) / 2;
						const score = Math.abs(wrap(angle - preferred));
						if (!best || score < best.score) best = { angle, score, index: i + 1 };
					}
				}
				if (!best) {
					success = false;
					break;
				}
				p.angle = wrap(best.angle);
				placed.push({ angle: (best.angle + Math.PI * 2) % (Math.PI * 2), radius: r });
				placed.sort((a, b) => a.angle - b.angle);
			}
			if (!success) first *= 1.5;
		}
		if (!success) throw Error('Could not fit the added notes safely around the existing plants.');
	}
	return { firstRingRadius: first, ringSpacing: spacing };
}
