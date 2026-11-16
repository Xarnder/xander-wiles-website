import type { BiomeMapClient, MapTileRef } from './BiomeMapClient';
import { MAP_LEVELS, metresPerPixel, TILE_PIXELS, tileMetres, tilesForView } from './biomeMapTiles';

/** How many coarser levels a missing tile may borrow from while it's being drawn (§4.3). */
const FALLBACK_LEVELS = 2;

/** A view of the map: centre (world metres), size (CSS px) and how many CSS px a map pixel takes. */
export interface MapViewport {
	level: number;
	centreX: number;
	centreZ: number;
	width: number;
	height: number;
	/** CSS pixels per map pixel (1 = native; up to 2 between zoom steps). */
	scale: number;
}

const metresAcross = (view: MapViewport) =>
	(Math.max(view.width, view.height) / view.scale) * metresPerPixel(view.level);

/**
 * The tiles a view wants, in request order. While any of the view's own tiles is missing, the next
 * coarser level's tiles come first: one coarse tile covers four, so the whole view fills quickly
 * and sharpens as the rest arrive. Once everything is there, nothing extra is asked for.
 */
export function wantedTiles(
	client: Pick<BiomeMapClient<unknown>, 'get'>,
	view: MapViewport
): MapTileRef[] {
	const across = metresAcross(view);
	const own = tilesForView(view.level, view.centreX, view.centreZ, across).map((t) => ({
		level: view.level,
		...t
	}));
	const missing = own.some(({ level, tx, tz }) => !client.get(level, tx, tz));
	if (!missing || view.level + 1 >= MAP_LEVELS) return own;
	const parents = tilesForView(view.level + 1, view.centreX, view.centreZ, across).map((t) => ({
		level: view.level + 1,
		...t
	}));
	return [...parents, ...own];
}

/** Anything with `drawImage` (a 2D canvas context, or a test double). */
export interface MapPainter<B> {
	drawImage(
		image: B,
		sx: number,
		sy: number,
		sw: number,
		sh: number,
		dx: number,
		dy: number,
		dw: number,
		dh: number
	): void;
}

/**
 * Paints a view from cached tiles. A missing tile borrows the matching part of a coarser cached
 * tile (scaled up) so the map is never blank. Returns how many tiles had nothing to show.
 */
export function paintView<B>(
	painter: MapPainter<B>,
	client: Pick<BiomeMapClient<B>, 'get'>,
	view: MapViewport
): number {
	const mpp = metresPerPixel(view.level);
	const cssPerMetre = view.scale / mpp;
	const across = metresAcross(view);
	let blank = 0;
	for (const { tx, tz } of tilesForView(view.level, view.centreX, view.centreZ, across)) {
		const size = tileMetres(view.level);
		// Whole pixels, each tile meeting the next exactly: no hairline seams between tiles.
		const left = Math.round((tx * size - view.centreX) * cssPerMetre + view.width / 2);
		const top = Math.round((tz * size - view.centreZ) * cssPerMetre + view.height / 2);
		const dx = left,
			dy = top;
		const dw = Math.round(((tx + 1) * size - view.centreX) * cssPerMetre + view.width / 2) - left;
		const dh = Math.round(((tz + 1) * size - view.centreZ) * cssPerMetre + view.height / 2) - top;
		const tile = client.get(view.level, tx, tz);
		if (tile) {
			painter.drawImage(tile.image, 0, 0, TILE_PIXELS, TILE_PIXELS, dx, dy, dw, dh);
			continue;
		}
		let drawn = false;
		for (let k = 1; k <= FALLBACK_LEVELS && view.level + k < MAP_LEVELS && !drawn; k++) {
			const f = 1 << k;
			const ptx = Math.floor(tx / f),
				ptz = Math.floor(tz / f);
			const parent = client.get(view.level + k, ptx, ptz);
			if (!parent) continue;
			const part = TILE_PIXELS / f;
			painter.drawImage(
				parent.image,
				(tx - ptx * f) * part,
				(tz - ptz * f) * part,
				part,
				part,
				dx,
				dy,
				dw,
				dh
			);
			drawn = true;
		}
		if (!drawn) blank++;
	}
	return blank;
}
