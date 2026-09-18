/**
 * sample-generator.js
 * Generates procedural binary .splat buffers for instant demo scenes
 * without requiring any external network downloads.
 * 
 * Standard .splat format:
 * Exactly 32 bytes per splat:
 *   [0..11]   Float32 x, y, z (Position)
 *   [12..23]  Float32 sx, sy, sz (Scale)
 *   [24..27]  Uint8 r, g, b, a (Color & Opacity)
 *   [28..31]  Uint8 qw, qx, qy, qz (Rotation quaternion, normalized uint8: Math.round(q * 128 + 128))
 */

export function generateSplatBuffer(presetName = 'torus') {
    switch (presetName) {
        case 'bloom':
            return generateNeonBloom();
        case 'helix':
            return generateQuantumHelix();
        case 'torus':
        default:
            return generateCosmicTorus();
    }
}

/**
 * Creates a File object from an ArrayBuffer with the .splat extension
 */
export function createSampleSplatFile(presetName = 'torus') {
    const buffer = generateSplatBuffer(presetName);
    const names = {
        torus: 'cosmic-torus-demo.splat',
        bloom: 'neon-bloom-demo.splat',
        helix: 'quantum-helix-demo.splat'
    };
    const filename = names[presetName] || 'sample.splat';
    return new File([buffer], filename, { type: 'application/octet-stream' });
}

function generateCosmicTorus() {
    const N = 12000;
    const buf = new ArrayBuffer(N * 32);
    const f32 = new Float32Array(buf);
    const u8 = new Uint8Array(buf);

    const R = 2.0; // Major radius
    const r = 0.75; // Minor radius

    for (let i = 0; i < N; i++) {
        const fBase = (i * 32) / 4;
        const uBase = i * 32;

        // Torus angles
        const u = Math.random() * Math.PI * 2;
        const v = Math.random() * Math.PI * 2;
        const jitter = (Math.random() - 0.5) * 0.15;
        const currR = r + jitter;

        const x = (R + currR * Math.cos(v)) * Math.cos(u);
        const y = currR * Math.sin(v);
        const z = (R + currR * Math.cos(v)) * Math.sin(u);

        f32[fBase + 0] = x;
        f32[fBase + 1] = y;
        f32[fBase + 2] = z;

        // Splat scale (slightly anisotropic)
        const s = 0.085 + Math.random() * 0.065;
        f32[fBase + 3] = s * 1.4;
        f32[fBase + 4] = s * 0.85;
        f32[fBase + 5] = s;

        // Colors: rich chromatic cycling around torus
        const hue = (u / (Math.PI * 2) + v / (Math.PI * 4)) % 1;
        const rgb = hslToRgb(hue, 0.9, 0.62);
        u8[uBase + 24] = rgb[0];
        u8[uBase + 25] = rgb[1];
        u8[uBase + 26] = rgb[2];
        u8[uBase + 27] = Math.floor(180 + Math.random() * 65); // Alpha

        // Approximate rotation aligned with tangent
        const halfU = u * 0.5;
        const qw = Math.cos(halfU);
        const qy = Math.sin(halfU);
        u8[uBase + 28] = Math.max(0, Math.min(255, Math.round(qw * 128 + 128)));
        u8[uBase + 29] = 128;
        u8[uBase + 30] = Math.max(0, Math.min(255, Math.round(qy * 128 + 128)));
        u8[uBase + 31] = 128;
    }

    return buf;
}

function generateNeonBloom() {
    const N = 10000;
    const buf = new ArrayBuffer(N * 32);
    const f32 = new Float32Array(buf);
    const u8 = new Uint8Array(buf);

    const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5 deg

    for (let i = 0; i < N; i++) {
        const fBase = (i * 32) / 4;
        const uBase = i * 32;

        const theta = i * goldenAngle;
        const rad = Math.sqrt(i / N) * 2.2;
        
        // Petal height curve
        const petalDist = Math.sin(theta * 5) * 0.25;
        const y = Math.pow(rad / 2.2, 1.8) * 1.2 + petalDist + (Math.random() - 0.5) * 0.1;
        const x = rad * Math.cos(theta);
        const z = rad * Math.sin(theta);

        f32[fBase + 0] = x;
        f32[fBase + 1] = y - 0.6; // Center vertically
        f32[fBase + 2] = z;

        const s = 0.08 + (rad / 2.2) * 0.07;
        f32[fBase + 3] = s * 1.3;
        f32[fBase + 4] = s * 0.7;
        f32[fBase + 5] = s;

        // Color transition: golden core to magenta/violet outer petals
        const t = rad / 2.2;
        const hue = (0.12 - t * 0.45 + 1.0) % 1.0;
        const rgb = hslToRgb(hue, 0.95, 0.55 + t * 0.15);
        u8[uBase + 24] = rgb[0];
        u8[uBase + 25] = rgb[1];
        u8[uBase + 26] = rgb[2];
        u8[uBase + 27] = Math.floor(200 + Math.random() * 50);

        u8[uBase + 28] = 255;
        u8[uBase + 29] = 128;
        u8[uBase + 30] = 128;
        u8[uBase + 31] = 128;
    }

    return buf;
}

function generateQuantumHelix() {
    const N = 9000;
    const buf = new ArrayBuffer(N * 32);
    const f32 = new Float32Array(buf);
    const u8 = new Uint8Array(buf);

    for (let i = 0; i < N; i++) {
        const fBase = (i * 32) / 4;
        const uBase = i * 32;

        const strand = i % 2; // Strand 0 or 1
        const t = (i / N) * 6 * Math.PI; // 3 full turns
        const radius = 1.1 + Math.sin(t * 0.5) * 0.3;
        const phase = strand === 0 ? 0 : Math.PI;

        const x = radius * Math.cos(t + phase) + (Math.random() - 0.5) * 0.15;
        const y = ((i / N) - 0.5) * 3.8 + (Math.random() - 0.5) * 0.1;
        const z = radius * Math.sin(t + phase) + (Math.random() - 0.5) * 0.15;

        f32[fBase + 0] = x;
        f32[fBase + 1] = y;
        f32[fBase + 2] = z;

        const s = 0.08 + Math.random() * 0.055;
        f32[fBase + 3] = s;
        f32[fBase + 4] = s;
        f32[fBase + 5] = s;

        // Strand 0 = cyan to azure, Strand 1 = emerald to lime
        const hue = strand === 0 ? (0.55 + Math.sin(t) * 0.08) : (0.35 + Math.sin(t) * 0.08);
        const rgb = hslToRgb(hue, 0.95, 0.6);
        u8[uBase + 24] = rgb[0];
        u8[uBase + 25] = rgb[1];
        u8[uBase + 26] = rgb[2];
        u8[uBase + 27] = Math.floor(190 + Math.random() * 60);

        u8[uBase + 28] = 255;
        u8[uBase + 29] = 128;
        u8[uBase + 30] = 128;
        u8[uBase + 31] = 128;
    }

    return buf;
}

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
