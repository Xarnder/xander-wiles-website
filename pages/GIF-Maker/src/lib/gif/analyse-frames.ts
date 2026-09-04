export function luma(r: number, g: number, b: number): number {
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function motionFromFrames(frames: readonly Uint8ClampedArray[]): number {
	if (frames.length < 2) return 0;

	let total = 0;
	let comparisons = 0;

	for (let i = 1; i < frames.length; i += 1) {
		const prev = frames[i - 1];
		const next = frames[i];
		const length = Math.min(prev.length, next.length);
		let diff = 0;
		let pixels = 0;

		for (let p = 0; p < length; p += 16) {
			const a = luma(prev[p], prev[p + 1], prev[p + 2]);
			const b = luma(next[p], next[p + 1], next[p + 2]);
			diff += Math.abs(a - b);
			pixels += 1;
		}

		if (pixels > 0) {
			total += diff / pixels / 255;
			comparisons += 1;
		}
	}

	if (comparisons === 0) return 0;
	const mean = total / comparisons;
	return clamp01(Math.pow(mean * 2.4, 0.72));
}

export function detailFromFrame(frame: Uint8ClampedArray, width: number, height: number): number {
	if (width < 3 || height < 3) return 0;

	let edge = 0;
	let varianceAcc = 0;
	let samples = 0;
	let mean = 0;
	const stride = width * 4;

	for (let y = 1; y < height - 1; y += 2) {
		for (let x = 1; x < width - 1; x += 2) {
			const i = y * stride + x * 4;
			const center = luma(frame[i], frame[i + 1], frame[i + 2]);
			const right = luma(frame[i + 4], frame[i + 5], frame[i + 6]);
			const down = luma(frame[i + stride], frame[i + stride + 1], frame[i + stride + 2]);
			edge += Math.abs(center - right) + Math.abs(center - down);
			mean += center;
			samples += 1;
		}
	}

	if (samples === 0) return 0;
	mean /= samples;

	for (let y = 1; y < height - 1; y += 4) {
		for (let x = 1; x < width - 1; x += 4) {
			const i = y * stride + x * 4;
			const center = luma(frame[i], frame[i + 1], frame[i + 2]);
			varianceAcc += (center - mean) ** 2;
		}
	}

	const edgeNorm = edge / samples / 255;
	const varianceNorm = Math.sqrt(varianceAcc / Math.max(1, samples / 4)) / 255;
	return clamp01(edgeNorm * 1.35 + varianceNorm * 0.85);
}

export function colourDiversityFromFrame(frame: Uint8ClampedArray): number {
	const buckets = new Set<number>();
	for (let i = 0; i < frame.length; i += 16) {
		const r = frame[i] >> 4;
		const g = frame[i + 1] >> 4;
		const b = frame[i + 2] >> 4;
		buckets.add((r << 8) | (g << 4) | b);
	}
	return clamp01(buckets.size / 220);
}

export function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

export function motionLabel(motion: number): string {
	if (motion >= 0.66) return 'High motion';
	if (motion >= 0.33) return 'Medium motion';
	return 'Low motion';
}
