/** Canvas confetti for the finished-run summary. */

export type ConfettiKind = 'rect' | 'ribbon' | 'circle';

export type ConfettiPiece = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	w: number;
	h: number;
	rotation: number;
	vr: number;
	tilt: number;
	vt: number;
	color: string;
	kind: ConfettiKind;
	wobble: number;
	vw: number;
	born: number;
	life: number;
};

export type ConfettiBurstOptions = {
	width: number;
	height: number;
	colors: string[];
	now?: number;
	random?: () => number;
};

const GRAVITY = 1450;
const DRAG = 0.14;
const FESTIVE = ['#f4c95d', '#7eb6ff', '#f7efe3', '#ff9f43'];
const FALLBACK = ['#2bb39a', '#3ec9af', '#ff8b7e', ...FESTIVE];

export function confettiColorsFrom(el: Element): string[] {
	const styles = getComputedStyle(el);
	const themed = ['--accent', '--accent-strong', '--danger']
		.map((name) => styles.getPropertyValue(name).trim())
		.filter(Boolean);
	return [...themed, ...FESTIVE];
}

export function createConfettiBurst(options: ConfettiBurstOptions): ConfettiPiece[] {
	const random = options.random ?? Math.random;
	const now = options.now ?? 0;
	const colors = options.colors.length > 0 ? options.colors : FALLBACK;
	const pieces: ConfettiPiece[] = [];

	const cannon = (
		ox: number,
		oy: number,
		angle: number,
		spread: number,
		count: number,
		speedMin: number,
		speedMax: number,
		delay: number
	) => {
		for (let i = 0; i < count; i += 1) {
			const a = angle + (random() - 0.5) * spread;
			const speed = speedMin + random() * (speedMax - speedMin);
			const kindRoll = random();
			const kind: ConfettiKind = kindRoll < 0.18 ? 'circle' : kindRoll < 0.42 ? 'ribbon' : 'rect';
			const w =
				kind === 'circle'
					? 4 + random() * 5
					: kind === 'ribbon'
						? 10 + random() * 10
						: 6 + random() * 8;
			const h = kind === 'circle' ? w : kind === 'ribbon' ? 3 + random() * 2.5 : 8 + random() * 6;
			pieces.push({
				x: ox + (random() - 0.5) * 14,
				y: oy,
				vx: Math.cos(a) * speed,
				vy: Math.sin(a) * speed,
				w,
				h,
				rotation: random() * Math.PI * 2,
				vr: (random() - 0.5) * 16,
				tilt: random() * Math.PI * 2,
				vt: 6 + random() * 10,
				color: colors[Math.floor(random() * colors.length)] ?? FALLBACK[0],
				kind,
				wobble: random() * Math.PI * 2,
				vw: 8 + random() * 10,
				born: now + delay,
				life: 2200 + random() * 1300
			});
		}
	};

	cannon(options.width * 0.08, options.height + 6, -Math.PI * 0.62, 1.05, 52, 720, 1280, 0);
	cannon(options.width * 0.92, options.height + 6, -Math.PI * 0.38, 1.05, 52, 720, 1280, 0);
	cannon(options.width * 0.5, options.height * 0.2, -Math.PI / 2, 1.45, 36, 260, 620, 180);

	return pieces;
}

export function pieceOpacity(piece: ConfettiPiece, now: number): number {
	const age = now - piece.born;
	if (age < 0) return 0;
	const fadeAt = piece.life - 420;
	if (age < fadeAt) return 1;
	return Math.max(0, 1 - (age - fadeAt) / 420);
}

export function stepConfetti(
	pieces: ConfettiPiece[],
	dt: number,
	now: number,
	height: number
): ConfettiPiece[] {
	const next: ConfettiPiece[] = [];
	for (const piece of pieces) {
		if (now < piece.born) {
			next.push(piece);
			continue;
		}
		const age = now - piece.born;
		if (age > piece.life) continue;

		piece.vy += GRAVITY * dt;
		piece.vx *= 1 - DRAG * dt;
		piece.vy *= 1 - DRAG * 0.32 * dt;
		piece.wobble += piece.vw * dt;
		piece.x += piece.vx * dt + Math.sin(piece.wobble) * 28 * dt;
		piece.y += piece.vy * dt;
		piece.rotation += piece.vr * dt;
		piece.tilt += piece.vt * dt;

		if (piece.y < height + 48) next.push(piece);
	}
	return next;
}

export function drawConfetti(
	ctx: CanvasRenderingContext2D,
	pieces: ConfettiPiece[],
	now: number
): void {
	for (const piece of pieces) {
		const alpha = pieceOpacity(piece, now);
		if (alpha <= 0) continue;
		ctx.save();
		ctx.translate(piece.x, piece.y);
		ctx.rotate(piece.rotation);
		ctx.scale(Math.cos(piece.tilt), 1);
		ctx.globalAlpha = alpha;
		ctx.fillStyle = piece.color;
		if (piece.kind === 'circle') {
			ctx.beginPath();
			ctx.ellipse(0, 0, piece.w / 2, piece.h / 2, 0, 0, Math.PI * 2);
			ctx.fill();
		} else {
			ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
		}
		ctx.restore();
	}
}
