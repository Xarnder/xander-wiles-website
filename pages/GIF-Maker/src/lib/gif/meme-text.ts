export const MEME_TEXT_LIMIT = 180;
const FONT = 'Impact, "Arial Black", sans-serif';
type Measure = (text: string, size: number) => number;

/** Layout uses a fixed coordinate space so preview and every output size match. */
export function fitMemeText(text: string, aspectRatio: number, measure: Measure) {
	const width = 1000;
	const height = width / aspectRatio;
	const padding = 35;
	const available = width - padding * 2;
	const caption = text.slice(0, MEME_TEXT_LIMIT).trim().toUpperCase();
	if (!caption) return { lines: [], size: 0, padding, height };
	const wrap = (size: number) =>
		caption.split(/\r?\n/).flatMap((paragraph) => {
			const lines: string[] = [];
			let line = '';
			for (const word of paragraph.trim().split(/\s+/)) {
				const next = line ? `${line} ${word}` : word;
				if (measure(next, size) <= available) {
					line = next;
					continue;
				}
				if (line) lines.push(line);
				line = '';
				for (const character of word) {
					if (line && measure(line + character, size) > available) {
						lines.push(line);
						line = '';
					}
					line += character;
				}
			}
			lines.push(line);
			return lines;
		});
	for (let size = Math.floor(Math.min(90, height * 0.15)); size >= 1; size--) {
		const lines = wrap(size);
		if (lines.length * size * 1.15 <= height * 0.3) return { lines, size, padding, height };
	}
	return { lines: wrap(1), size: 1, padding, height };
}

export function drawMemeText(
	canvas: HTMLCanvasElement,
	text: string,
	width: number,
	height: number
) {
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is not available in this browser.');
	const layout = fitMemeText(text, width / height, (value, size) => {
		ctx.font = `900 ${size}px ${FONT}`;
		return ctx.measureText(value).width;
	});
	ctx.scale(width / 1000, height / layout.height);
	ctx.font = `900 ${layout.size}px ${FONT}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	ctx.fillStyle = 'white';
	ctx.strokeStyle = 'black';
	ctx.lineWidth = Math.max(1, layout.size * 0.09);
	ctx.lineJoin = 'round';
	layout.lines.forEach((line, index) => {
		const y = Math.min(layout.padding, layout.height * 0.04) + index * layout.size * 1.15;
		ctx.strokeText(line, 500, y);
		ctx.fillText(line, 500, y);
	});
}

export async function memeTextPng(
	text: string,
	width: number,
	height: number
): Promise<Uint8Array> {
	const canvas = document.createElement('canvas');
	drawMemeText(canvas, text, width, height);
	const blob = await new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(value) => (value ? resolve(value) : reject(new Error('Could not create meme text.'))),
			'image/png'
		)
	);
	return new Uint8Array(await blob.arrayBuffer());
}
