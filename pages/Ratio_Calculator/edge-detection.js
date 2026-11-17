/* Shared by the edge worker and Node regression tests. No external dependencies. */
(function (root) {
    function detectEdges(rgba, width, height, sensitivity = 50) {
        const size = width * height;
        const gray = new Float32Array(size);
        let total = 0, weight = 0;
        for (let i = 0; i < size; i++) {
            const a = rgba[i * 4 + 3] / 255;
            total += (rgba[i * 4] * .299 + rgba[i * 4 + 1] * .587 + rgba[i * 4 + 2] * .114) * a;
            weight += a;
        }
        // Contrast against transparent backgrounds for both white and black cutouts.
        const backdrop = weight && total / weight > 127 ? 0 : 255;
        for (let i = 0; i < size; i++) {
            const a = rgba[i * 4 + 3] / 255;
            gray[i] = (rgba[i * 4] * .299 + rgba[i * 4 + 1] * .587 + rgba[i * 4 + 2] * .114) * a + backdrop * (1 - a);
        }
        // Separable Gaussian blur, sigma approximately 1, clamped boundaries.
        const kernel = [1, 4, 6, 4, 1];
        const temp = new Float32Array(size), blur = new Float32Array(size);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            for (let k = -2; k <= 2; k++) temp[y * width + x] += gray[y * width + Math.max(0, Math.min(width - 1, x + k))] * kernel[k + 2] / 16;
        }
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            for (let k = -2; k <= 2; k++) blur[y * width + x] += temp[Math.max(0, Math.min(height - 1, y + k)) * width + x] * kernel[k + 2] / 16;
        }
        const magnitude = new Float32Array(size), direction = new Uint8Array(size);
        for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            const gx = -blur[i-width-1] + blur[i-width+1] - 2*blur[i-1] + 2*blur[i+1] - blur[i+width-1] + blur[i+width+1];
            const gy = -blur[i-width-1] - 2*blur[i-width] - blur[i-width+1] + blur[i+width-1] + 2*blur[i+width] + blur[i+width+1];
            magnitude[i] = Math.hypot(gx, gy);
            direction[i] = Math.round((Math.atan2(gy, gx) * 180 / Math.PI + 180) / 45) % 4;
        }
        const thin = new Float32Array(size), histogram = new Uint32Array(1444);
        const offsets = [1, width + 1, width, width - 1];
        let count = 0;
        for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
            const i = y * width + x, m = magnitude[i], d = offsets[direction[i]];
            // Break equal-strength plateaus consistently to keep contours thin.
            if (m > 1 && m >= magnitude[i - d] && m > magnitude[i + d]) {
                thin[i] = m;
                histogram[Math.min(1443, Math.floor(m))]++;
                count++;
            }
        }
        // Robust percentile threshold adapts to image contrast; sensitivity changes
        // both the percentile and threshold fraction without assuming a polarity.
        let accumulated = 0, percentile = 0;
        const target = count * (.92 - sensitivity * .003);
        for (; percentile < histogram.length - 1; percentile++) {
            accumulated += histogram[percentile];
            if (accumulated >= target) break;
        }
        const high = Math.max(5, percentile * (.9 - sensitivity * .006));
        const low = high * .4;
        const edges = new Uint8Array(size), queue = new Int32Array(size);
        let head = 0, tail = 0;
        for (let i = 0; i < size; i++) if (thin[i] >= high) { edges[i] = 1; queue[tail++] = i; }
        // Hysteresis retains weak contours only when connected to strong ones.
        while (head < tail) {
            const i = queue[head++], x = i % width, y = Math.floor(i / width);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
                const n = i + dy * width + dx;
                if (!edges[n] && thin[n] >= low) { edges[n] = 1; queue[tail++] = n; }
            }
        }
        return { edges, count: tail, high, low };
    }

    function snapPoint(point, start, axisEnabled, map, radius, imageWidth, imageHeight) {
        let result = { x: point.x, y: point.y }, axis = null;
        if (start && axisEnabled) {
            axis = Math.abs(point.x - start.x) >= Math.abs(point.y - start.y) ? 'horizontal' : 'vertical';
            if (axis === 'horizontal') result.y = start.y;
            else result.x = start.x;
        }
        if (!map) return { ...result, axis, edge: false };
        const sx = imageWidth / map.width, sy = imageHeight / map.height;
        const cx = result.x / sx - .5, cy = result.y / sy - .5;
        let best = radius * radius, found = false;
        const minX = Math.max(0, Math.floor(cx - radius / sx));
        const maxX = Math.min(map.width - 1, Math.ceil(cx + radius / sx));
        const minY = Math.max(0, Math.floor(cy - radius / sy));
        const maxY = Math.min(map.height - 1, Math.ceil(cy + radius / sy));
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
            if (!map.edges[y * map.width + x]) continue;
            const ex = (x + .5) * sx, ey = (y + .5) * sy;
            // Only use contour pixels intersecting the constrained axis.
            if (axis === 'horizontal' && Math.abs(ey - result.y) > sy * .51) continue;
            if (axis === 'vertical' && Math.abs(ex - result.x) > sx * .51) continue;
            const nx = axis === 'vertical' ? result.x : ex;
            const ny = axis === 'horizontal' ? result.y : ey;
            const distance = (nx - (axis === 'vertical' ? start.x : point.x)) ** 2 + (ny - (axis === 'horizontal' ? start.y : point.y)) ** 2;
            if (distance < best) { best = distance; result = { x: nx, y: ny }; found = true; }
        }
        return { ...result, axis, edge: found };
    }
    root.RatioEdges = { detectEdges, snapPoint };
    if (typeof module !== 'undefined') module.exports = root.RatioEdges;
})(typeof self !== 'undefined' ? self : globalThis);
